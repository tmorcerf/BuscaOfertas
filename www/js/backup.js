/**
 * backup.js — Exportação e Importação de Dados (Backup JSON e CSV)
 * Busca Ofertas
 */

import { DBStorage } from './db_storage.js';

export class BackupManager {
    /**
     * Exporta todos os dados do banco para um arquivo JSON baixável
     */
    static async exportarBackupJson() {
        const precos = await DBStorage.listarTodosPrecos();
        const cupons = await DBStorage.listarTodosCupons();
        const gamificacao = await DBStorage.obterGamificacao();
        const feed = await DBStorage.listarFeed();

        const backupCompleto = {
            app: 'BuscaOfertas',
            versao: '1.0.0',
            dataExportacao: new Date().toISOString(),
            gamificacao,
            cupons,
            precos,
            feed
        };

        const jsonString = JSON.stringify(backupCompleto, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `busca_ofertas_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Exporta todos os preços para uma planilha CSV compatível com Excel
     */
    static async exportarPrecosCsv() {
        const precos = await DBStorage.listarTodosPrecos();
        if (precos.length === 0) {
            alert('Nenhum preço cadastrado para exportar.');
            return;
        }

        const cabecalho = ['EAN / Código', 'Descrição do Produto', 'Quantidade', 'Unidade', 'Preço Unitário (R$)', 'Preço Total (R$)', 'Supermercado', 'Data da Compra', 'UF'];
        const linhas = precos.map(p => [
            `"${p.ean || p.codigo || ''}"`,
            `"${(p.descricao || '').replace(/"/g, '""')}"`,
            p.quantidade || 1,
            `"${p.unidade || 'UN'}"`,
            (p.valorUnitario || 0).toFixed(2).replace('.', ','),
            (p.valorTotal || 0).toFixed(2).replace('.', ','),
            `"${(p.supermercado || '').replace(/"/g, '""')}"`,
            `"${p.data || ''}"`,
            `"${p.uf || ''}"`
        ]);

        const conteudoCsv = [cabecalho.join(';'), ...linhas.map(l => l.join(';'))].join('\r\n');
        const blob = new Blob(['\ufeff' + conteudoCsv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `precos_produtos_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Importa um arquivo JSON de backup
     */
    static async importarBackupJson(arquivoJson) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const dados = JSON.parse(e.target.result);
                    if (dados.app !== 'BuscaOfertas' && !dados.precos) {
                        throw new Error('Arquivo de backup inválido ou incompatível.');
                    }

                    if (dados.gamificacao) {
                        await DBStorage.salvarGamificacao(dados.gamificacao);
                    }

                    if (dados.cupons && Array.isArray(dados.cupons)) {
                        for (const c of dados.cupons) {
                            await DBStorage.salvarCupom(c);
                        }
                    }

                    if (dados.precos && Array.isArray(dados.precos)) {
                        for (const p of dados.precos) {
                            await DBStorage.salvarPreco(p);
                        }
                    }

                    if (dados.feed && Array.isArray(dados.feed)) {
                        for (const f of dados.feed) {
                            await DBStorage.adicionarItemFeed(f);
                        }
                    }

                    resolve({
                        sucesso: true,
                        totalCupons: dados.cupons?.length || 0,
                        totalPrecos: dados.precos?.length || 0
                    });
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('Erro ao ler arquivo.'));
            reader.readAsText(arquivoJson);
        });
    }
}
