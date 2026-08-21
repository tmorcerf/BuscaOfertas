/**
 * sefaz_scripts.js — Scripts de extração e parsing determinístico de notas fiscais SEFAZ (Sem IA)
 * Módulo: Corta Gastos - Importação de Notas Fiscais
 */

export class SefazScripts {
    /**
     * Parser puro de texto copiado ou extraído do DOM da SEFAZ
     */
    static extrairTexto(fullText, uf = 'generico') {
        if (!fullText || typeof fullText !== 'string') {
            return { itens: [], valorTotal: 0, metodo: 'vazio' };
        }

        const sigla = (uf || 'generico').toUpperCase();
        if (sigla === 'RJ') {
            const resRJ = this._extrairRJ(fullText);
            if (resRJ.itens.length > 0) return resRJ;
        }

        return this._extrairGenerico(fullText);
    }

    /**
     * Extração específica para padrão SEFAZ RJ
     */
    static _extrairRJ(fullText) {
        const resultado = { itens: [], valorTotal: 0, metodo: 'RJ', estabelecimento: {} };
        const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            const codMatch = line.match(/\(C[oó]d(?:igo)?:\s*(\d+)\s*\)/i);
            if (codMatch) {
                const item = {
                    codigo: codMatch[1],
                    descricao: line.replace(/\s*\(C[oó]d(?:igo)?:.*?\)\s*/i, '').replace(/\s*\(Tara\s+\d+g\)/i, '').trim(),
                    quantidade: 1,
                    unidade: 'UN',
                    valorUnitario: 0,
                    valorTotal: 0
                };

                if (i + 1 < lines.length) {
                    const infoLine = lines[i + 1];
                    const qtdM = infoLine.match(/Qtde?\.?:\s*([\d.,]+)/i);
                    if (qtdM) item.quantidade = parseFloat(qtdM[1].replace(',', '.'));
                    const unM = infoLine.match(/UN:\s*(\w+)/i);
                    if (unM) item.unidade = unM[1].toUpperCase();
                    const vuM = infoLine.match(/Vl\.?\s*Unit\.?[:\s]+([\d.,]+)/i);
                    if (vuM) item.valorUnitario = parseFloat(vuM[1].replace(/\./g, '').replace(',', '.'));
                }

                if (i + 2 < lines.length) {
                    const vtLine = lines[i + 2];
                    const vtClean = vtLine.replace(/[^\d,.-]/g, '');
                    if (/^\d+[,.]\d{2}$/.test(vtClean)) {
                        item.valorTotal = parseFloat(vtClean.replace(/\./g, '').replace(',', '.'));
                        i += 3;
                    } else {
                        const vtInline = lines[i + 1].match(/Vl\.?\s*Total[:\s]*([\d.,]+)/i);
                        if (vtInline) {
                            item.valorTotal = parseFloat(vtInline[1].replace(/\./g, '').replace(',', '.'));
                        } else {
                            item.valorTotal = item.valorUnitario * item.quantidade;
                        }
                        i += 2;
                    }
                } else {
                    item.valorTotal = item.valorUnitario * item.quantidade;
                    i += 2;
                }

                item.valorTotal = Math.round(item.valorTotal * 100) / 100;
                if (item.descricao && item.descricao.length > 1) {
                    resultado.itens.push(item);
                }
                continue;
            }
            i++;
        }

        // Regex Fallback ignorando quebras de linha
        if (resultado.itens.length === 0) {
            const itemPattern = /([^\n]+?)\s*\(C[oó]d(?:igo)?:\s*(\d+)\s*\)\s*Qtde?\.?:\s*([\d,.]+)\s*UN:\s*(\w+)\s*Vl\.?\s*Unit\.?:\s*([\d,.]+)(?:\s*Vl\.?\s*Total)?\s*([\d,.]+)/gi;
            let m;
            while ((m = itemPattern.exec(fullText)) !== null) {
                const it = {
                    codigo: m[2],
                    descricao: m[1].trim(),
                    quantidade: parseFloat(m[3].replace(',', '.')),
                    unidade: m[4].toUpperCase(),
                    valorUnitario: parseFloat(m[5].replace(/\./g, '').replace(',', '.')),
                    valorTotal: parseFloat(m[6].replace(/\./g, '').replace(',', '.'))
                };
                const lastCodeIdx = it.descricao.lastIndexOf('Vl. Total');
                if (lastCodeIdx > -1) it.descricao = it.descricao.substring(lastCodeIdx + 9).trim();
                if (it.descricao) resultado.itens.push(it);
            }
        }

        // Valor Total
        const totalMatch = fullText.match(/Valor\s*a\s*pagar\s*R\$\s*:?\s*([\d.,]+)/i) ||
                           fullText.match(/Valor\s*total\s*R\$\s*:?\s*([\d.,]+)/i) ||
                           fullText.match(/TOTAL\s*R\$\s*:?\s*([\d.,]+)/i);
        if (totalMatch) {
            resultado.valorTotal = parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.'));
        } else if (resultado.itens.length > 0) {
            resultado.valorTotal = Math.round(resultado.itens.reduce((acc, it) => acc + it.valorTotal, 0) * 100) / 100;
        }

        // CNPJ & Razão Social
        const cnpjMatch = fullText.match(/CNPJ:\s*([\d.\/\-]+)/i);
        if (cnpjMatch) resultado.estabelecimento.cnpj = cnpjMatch[1].trim();

        const razaoMatch = fullText.match(/ELETR[OÔ]NICA\s*\n\s*(.+?)\s*\n/i) || fullText.match(/DANFE\s*NFC-e\s*\n\s*(.+?)\s*\n/i);
        if (razaoMatch) resultado.estabelecimento.nome = razaoMatch[1].trim();

        return resultado;
    }

    /**
     * Extração genérica para outros estados e tabelas SVRS / SP
     */
    static _extrairGenerico(fullText) {
        const resultado = { itens: [], valorTotal: 0, metodo: 'generico', estabelecimento: {} };
        const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            const codMatch = line.match(/\(C[oó]d(?:igo)?:\s*(\d+)\s*\)/i);
            if (codMatch) {
                const item = {
                    codigo: codMatch[1],
                    descricao: line.replace(/\s*\(C[oó]d(?:igo)?:.*?\)\s*/i, '').trim(),
                    quantidade: 1,
                    unidade: 'UN',
                    valorUnitario: 0,
                    valorTotal: 0
                };

                if (i + 1 < lines.length) {
                    const nl = lines[i + 1];
                    const qm = nl.match(/Qtde?\.?:\s*([\d.,]+)/i);
                    if (qm) item.quantidade = parseFloat(qm[1].replace(',', '.'));
                    const um = nl.match(/UN:\s*(\w+)/i);
                    if (um) item.unidade = um[1].toUpperCase();
                    const vm = nl.match(/Vl\.?\s*Unit\.?[:\s]+([\d.,]+)/i);
                    if (vm) item.valorUnitario = parseFloat(vm[1].replace(/\./g, '').replace(',', '.'));
                }

                if (i + 2 < lines.length && /^[\d.,]+$/.test(lines[i + 2].replace(/[^\d,.]/g, ''))) {
                    item.valorTotal = parseFloat(lines[i + 2].replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.'));
                    i += 3;
                } else {
                    item.valorTotal = item.valorUnitario * item.quantidade;
                    i += 2;
                }

                if (item.descricao) resultado.itens.push(item);
                continue;
            }
            i++;
        }

        const totalMatch = fullText.match(/Valor\s*a\s*pagar\s*R\$\s*:?\s*([\d.,]+)/i) ||
                           fullText.match(/Valor\s*total[^\d]*([\d.,]+)/i) ||
                           fullText.match(/TOTAL[^\d]*R\$\s*([\d.,]+)/i);
        if (totalMatch) {
            resultado.valorTotal = parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.'));
        } else if (resultado.itens.length > 0) {
            resultado.valorTotal = Math.round(resultado.itens.reduce((acc, it) => acc + it.valorTotal, 0) * 100) / 100;
        }

        const cnpjMatch = fullText.match(/CNPJ:\s*([\d.\/\-]+)/i);
        if (cnpjMatch) resultado.estabelecimento.cnpj = cnpjMatch[1].trim();

        return resultado;
    }

    /**
     * Script de polling para injeção em WebView (InAppBrowser)
     */
    static getScript(uf = 'generico') {
        return `
        (function() {
            function enviar(data) {
                var msg = JSON.stringify(data);
                if (window.mobileApp && window.mobileApp.postMessage) {
                    window.mobileApp.postMessage(msg);
                } else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.cordova_iab) {
                    window.webkit.messageHandlers.cordova_iab.postMessage(msg);
                }
            }

            var body = document.body;
            if (!body) return;
            var fullText = body.innerText || body.textContent || '';
            
            // Invoca extração
            var linhas = fullText.split('\\n');
            if (linhas.length > 5) {
                enviar({ sucesso: true, fullText: fullText });
            }
        })();
        `;
    }
}
