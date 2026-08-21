/**
 * nfe_sync.js — Persistência no Firestore de Notas Fiscais, Vínculo de Lançamentos e Base de Preços
 * Módulo: Corta Gastos - Importação de Notas Fiscais
 */

import { db } from '../../../js/firebase_config.js';
import { SyncEngine } from '../../../js/sync_engine.js';

export class NfeSyncEngine {
    /**
     * Verifica se uma nota com esta chave já foi importada no grupo
     */
    static async verificarNotaExistente(groupId, chave) {
        if (!groupId || !chave) return { existe: false, nota: null };

        try {
            const snap = await db.collection('NotasFiscais')
                .where('groupId', '==', groupId)
                .where('chave', '==', chave)
                .limit(1)
                .get();

            if (!snap.empty) {
                const doc = snap.docs[0];
                return { existe: true, id: doc.id, nota: doc.data() };
            }
        } catch (e) {
            console.error('[NfeSync] Erro ao verificar nota existente:', e);
        }

        return { existe: false, nota: null };
    }

    /**
     * Busca lançamentos candidatos para vincular com a nota (evitando duplicidade de gasto)
     */
    static async buscarLancamentosCandidatos(groupId, dataStr, valorTotal) {
        if (!groupId || !valorTotal) return [];

        try {
            const lancamentos = await SyncEngine.getLancamentos(groupId);
            if (!lancamentos || lancamentos.length === 0) return [];

            const valorAlvo = Math.abs(parseFloat(valorTotal));

            // Filtra despesas com valor idêntico ou muito próximo (diferença de centavos por troco/arredondamento)
            const candidatos = lancamentos.filter(l => {
                const valL = Math.abs(parseFloat(l.valor) || 0);
                const difValor = Math.abs(valL - valorAlvo);

                // Diferença máxima de 1 real ou valor exato
                const valorCompativeis = difValor <= 0.05 || difValor < 1.00;

                // Não pode já estar vinculado a outra nota diferente
                const semOutroVinculo = !l.nfe_id;

                return valorCompativeis && semOutroVinculo && l.valor < 0;
            });

            return candidatos.slice(0, 5);
        } catch (e) {
            console.error('[NfeSync] Erro ao buscar lançamentos candidatos:', e);
            return [];
        }
    }

    /**
     * Salva a Nota Fiscal completa, vincula ou cria o Lançamento financeiro e grava os itens na Base de Preços
     */
    static async salvarNotaCompleta({
        groupId,
        notaDados,
        tipoVinculo = 'novo', // 'novo' | 'vincular'
        lancamentoIdVinculado = null,
        contaSelecionada = 'Geral'
    }) {
        if (!groupId || !notaDados || !notaDados.chave) {
            throw new Error("Dados da nota incompletos para gravação.");
        }

        const batch = db.batch();

        // 1. Grava documento na coleção 'NotasFiscais'
        const nfeRef = db.collection('NotasFiscais').doc();
        const nfeId = nfeRef.id;

        const docNota = {
            groupId: groupId,
            chave: notaDados.chave,
            chaveFormatada: notaDados.chaveFormatada || '',
            estabelecimento: notaDados.estabelecimento || { nome: 'Estabelecimento', cnpj: '' },
            uf: notaDados.uf || { sigla: 'XX', nome: 'Brasil' },
            data: notaDados.data || '',
            emissao: notaDados.emissao || {},
            valorTotal: parseFloat(notaDados.valorTotal) || 0,
            descontos: parseFloat(notaDados.descontos) || 0,
            modelo: notaDados.modelo || { codigo: '65', nome: 'NFC-e' },
            numeroNota: notaDados.numeroNota || '',
            serie: notaDados.serie || '',
            quantidadeItens: (notaDados.itens || []).length,
            criadoEm: new Date().toISOString(),
            tipoVinculo: tipoVinculo,
            lancamentoId: (tipoVinculo === 'vincular') ? lancamentoIdVinculado : null
        };

        batch.set(nfeRef, docNota);

        // 2. Tratamento do Lançamento Financeiro
        let lancamentoIdFinal = null;

        if (tipoVinculo === 'vincular' && lancamentoIdVinculado) {
            // Vínculo a lançamento existente no extrato: atualiza para categoria de sistema "Compras"
            const lancRef = db.collection('Lancamentos').doc(lancamentoIdVinculado);
            batch.update(lancRef, {
                categoria: 'Compras',
                subcategoria: 'Nota Fiscal',
                chave_nfe: notaDados.chave,
                nfe_id: nfeId
            });

            lancamentoIdFinal = lancamentoIdVinculado;
        } else {
            // Cria um novo lançamento financeiro
            const lancRef = db.collection('Lancamentos').doc();
            lancamentoIdFinal = lancRef.id;

            const novoLancamento = {
                groupId: groupId,
                cod: `NFE_${notaDados.chave}`,
                data: notaDados.data,
                vencimento: notaDados.data,
                descricao: `${notaDados.estabelecimento.nome || 'Compra'} (NFC-e)`,
                valor: -Math.abs(notaDados.valorTotal),
                conta: contaSelecionada,
                categoria: 'Compras',
                subcategoria: 'Nota Fiscal',
                chave_nfe: notaDados.chave,
                nfe_id: nfeId,
                conciliado: false,
                status_conciliacao: 'aguardando_extrato',
                criado_em: new Date().toISOString()
            };

            batch.set(lancRef, novoLancamento);
            SyncEngine.upsertLancamento({ ...novoLancamento, id: lancamentoIdFinal });
        }

        // 3. Grava cada item na Base Histórica de Preços ('Precos')
        if (notaDados.itens && notaDados.itens.length > 0) {
            notaDados.itens.forEach(it => {
                const itemRef = db.collection('Precos').doc();
                const docPreco = {
                    groupId: groupId,
                    nfeId: nfeId,
                    chave: notaDados.chave,
                    data: notaDados.data,
                    estabelecimento: {
                        nome: notaDados.estabelecimento.nome || '',
                        cnpj: notaDados.estabelecimento.cnpj || '',
                        uf: notaDados.uf?.sigla || 'XX'
                    },
                    codigo: it.codigo || '',
                    descricao: it.descricao || 'Produto',
                    quantidade: parseFloat(it.quantidade) || 1,
                    unidade: it.unidade || 'UN',
                    valorUnitario: parseFloat(it.valorUnitario) || parseFloat(it.valorTotal) || 0,
                    valorTotal: parseFloat(it.valorTotal) || 0,
                    categoria: it.categoria || 'Alimentação',
                    subcategoria: it.subcategoria || '',
                    criadoEm: new Date().toISOString()
                };

                batch.set(itemRef, docPreco);
            });
        }

        // Executa gravação atômica
        await batch.commit();

        return {
            sucesso: true,
            nfeId,
            lancamentoId: lancamentoIdFinal,
            totalItens: (notaDados.itens || []).length
        };
    }
}
