/**
 * comparador.js — Motor de Busca e Comparação de Preços por Produto e Código EAN
 * Busca Ofertas
 */

import { DBStorage } from './db_storage.js';
import { GamificationEngine } from './gamification.js';

export class ComparadorEngine {
    /**
     * Realiza uma busca por termo (nome do produto ou código de barras EAN)
     * Desconta as moedas da carteira do jogador
     */
    static async pesquisarPrecos(termo, cobrarMoedas = true) {
        if (!termo || termo.trim().length === 0) {
            return { sucesso: false, erro: 'Digite o nome do produto ou código de barras.', resultados: [] };
        }

        // Se cobrarMoedas for true, valida e desconta da carteira
        if (cobrarMoedas) {
            const debito = await GamificationEngine.cobrarBuscaDePreco();
            if (!debito.permitido) {
                return {
                    sucesso: false,
                    bloqueioMoedas: true,
                    mensagem: debito.mensagem,
                    saldoAtual: debito.saldoAtual,
                    custo: debito.custo,
                    resultados: []
                };
            }
        }

        const precosEncontrados = await DBStorage.buscarPrecosPorEanOuNome(termo);
        const analise = this._agruparEAnalisar(precosEncontrados);

        return {
            sucesso: true,
            totalResultados: precosEncontrados.length,
            produtosAgrupados: analise.produtos,
            resumoGeral: analise.resumo
        };
    }

    /**
     * Agrupa os registros por produto similar ou EAN e calcula estatísticas
     */
    static _agruparEAnalisar(listaPrecos) {
        const grupos = {};

        listaPrecos.forEach(item => {
            const chaveAgrupamento = (item.ean && item.ean.length >= 8) 
                ? `EAN_${item.ean}` 
                : item.descricao.trim().toUpperCase();

            if (!grupos[chaveAgrupamento]) {
                grupos[chaveAgrupamento] = {
                    identificador: chaveAgrupamento,
                    nome: item.descricao,
                    ean: item.ean || item.codigo || '',
                    unidade: item.unidade || 'UN',
                    registros: []
                };
            }

            grupos[chaveAgrupamento].registros.push({
                supermercado: item.supermercado || 'Supermercado',
                uf: item.uf || 'RJ',
                preco: parseFloat(item.valorUnitario) || parseFloat(item.valorTotal) || 0,
                data: item.data || 'Recente',
                isAchadinho: item.isAchadinho || false,
                chaveNfe: item.chaveNfe || ''
            });
        });

        // Processa estatísticas para cada grupo de produto
        const produtosFormatados = Object.values(grupos).map(prod => {
            // Ordena registros do menor para o maior preço
            prod.registros.sort((a, b) => a.preco - b.preco);

            const precos = prod.registros.map(r => r.preco);
            const menorPreco = precos[0];
            const maiorPreco = precos[precos.length - 1];
            const soma = precos.reduce((acc, p) => acc + p, 0);
            const precoMedio = soma / precos.length;
            const diferencaMax = maiorPreco - menorPreco;
            const economiaPct = maiorPreco > 0 ? Math.round((diferencaMax / maiorPreco) * 100) : 0;

            const melhorMercado = prod.registros[0];

            return {
                ...prod,
                menorPreco,
                maiorPreco,
                precoMedio: Math.round(precoMedio * 100) / 100,
                diferencaMax: Math.round(diferencaMax * 100) / 100,
                economiaPct,
                melhorMercado: melhorMercado.supermercado,
                melhorData: melhorMercado.data,
                totalLojas: new Set(prod.registros.map(r => r.supermercado)).size
            };
        });

        // Ordena produtos por maior economia potencial
        produtosFormatados.sort((a, b) => b.economiaPct - a.economiaPct);

        return {
            produtos: produtosFormatados,
            resumo: {
                totalProdutosDiferentes: produtosFormatados.length,
                totalOfertas: listaPrecos.length
            }
        };
    }

    /**
     * Otimizador de Lista de Compras: calcula em qual supermercado a cesta completa sai mais barata
     */
    static async calcularMelhorSupermercadoParaLista(itensLista) {
        if (!itensLista || itensLista.length === 0) return null;

        const todosPrecos = await DBStorage.listarTodosPrecos();
        const totaisPorMercado = {};

        itensLista.forEach(nomeItem => {
            const termo = nomeItem.trim().toLowerCase();
            const correspondentes = todosPrecos.filter(p => p.descricao && p.descricao.toLowerCase().includes(termo));

            correspondentes.forEach(c => {
                const mercado = c.supermercado || 'Supermercado';
                if (!totaisPorMercado[mercado]) {
                    totaisPorMercado[mercado] = { total: 0, itensEncontrados: 0, lista: [] };
                }

                // Considera o menor preço daquele item no mercado
                totaisPorMercado[mercado].total += parseFloat(c.valorUnitario) || 0;
                totaisPorMercado[mercado].itensEncontrados += 1;
                totaisPorMercado[mercado].lista.push({ item: c.descricao, preco: c.valorUnitario });
            });
        });

        const ranking = Object.keys(totaisPorMercado).map(mercado => ({
            supermercado: mercado,
            ...totaisPorMercado[mercado],
            total: Math.round(totaisPorMercado[mercado].total * 100) / 100
        }));

        ranking.sort((a, b) => a.total - b.total);
        return ranking;
    }
}
