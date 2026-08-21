/**
 * sefaz_parser.js — Motor Determinístico de Extração de Dados e Itens da SEFAZ
 * Processa o HTML dos portais fiscais (RJ, SP, RS, MG, PR, BA e SVRS) e extrai EAN, preços e produtos.
 */

export class SefazParser {
    /**
     * Ponto de entrada principal: processa HTML ou texto da SEFAZ
     */
    static processar(htmlOuTexto, siglaUF = 'RJ') {
        if (!htmlOuTexto || typeof htmlOuTexto !== 'string') {
            return { sucesso: false, erro: 'Conteúdo vazio para extração.', itens: [], valorTotal: 0 };
        }

        const isHtml = htmlOuTexto.includes('<') && htmlOuTexto.includes('>');
        if (isHtml) {
            return this._processarHtml(htmlOuTexto, siglaUF);
        } else {
            return this._processarTextoPuro(htmlOuTexto, siglaUF);
        }
    }

    /**
     * Processa o documento DOM a partir da string HTML
     */
    static _processarHtml(htmlString, siglaUF) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, 'text/html');

            const resultado = {
                sucesso: false,
                estabelecimento: this._extrairEstabelecimentoHtml(doc),
                itens: [],
                valorTotal: 0,
                data: this._extrairDataHtml(doc),
                metodo: 'html_dom'
            };

            // 1. Estratégia Tabela Padrão ENCAT / SVRS / RJ / RS (#tabResult)
            const linhasTabResult = doc.querySelectorAll('#tabResult tr, table.table-striped tr, table.table tr');
            if (linhasTabResult.length > 0) {
                linhasTabResult.forEach(tr => {
                    const item = this._extrairItemLinhaTr(tr);
                    if (item && item.descricao && item.valorTotal > 0) {
                        resultado.itens.push(item);
                    }
                });
            }

            // 2. Estratégia SP / MG / Layouts de Cards
            if (resultado.itens.length === 0) {
                const blocosCard = doc.querySelectorAll('.item-nfe, .panel-body, div[id^="Item"], .ui-datatable-data tr');
                blocosCard.forEach(bloco => {
                    const item = this._extrairItemBlocoCard(bloco);
                    if (item && item.descricao) {
                        resultado.itens.push(item);
                    }
                });
            }

            // 3. Estratégia de Fallback: Parsing sobre o innerText do body
            if (resultado.itens.length === 0) {
                const textFallback = doc.body ? (doc.body.innerText || doc.body.textContent) : htmlString;
                const resTexto = this._processarTextoPuro(textFallback, siglaUF);
                if (resTexto.itens.length > 0) {
                    resultado.itens = resTexto.itens;
                    resultado.valorTotal = resTexto.valorTotal || resultado.valorTotal;
                    if (!resultado.estabelecimento.nome && resTexto.estabelecimento?.nome) {
                        resultado.estabelecimento = resTexto.estabelecimento;
                    }
                }
            }

            // Valor Total
            resultado.valorTotal = this._extrairValorTotalHtml(doc, resultado.itens);
            resultado.sucesso = resultado.itens.length > 0 || resultado.valorTotal > 0;

            return resultado;
        } catch (e) {
            console.error('[SefazParser] Erro ao parsear HTML:', e);
            return this._processarTextoPuro(htmlString, siglaUF);
        }
    }

    static _extrairItemLinhaTr(tr) {
        const text = tr.innerText || tr.textContent || '';
        if (!text || text.length < 5) return null;

        // Descrição e Código/EAN
        const titElem = tr.querySelector('.txtTit, .txtTit2, .descricao, strong, b');
        let descricao = titElem ? titElem.innerText.trim() : '';
        
        // Código EAN / Código do produto
        let codigo = '';
        let ean = '';
        const codElem = tr.querySelector('.RCod, .codigo, span[class*="cod"]');
        if (codElem) {
            const rawCod = codElem.innerText.replace(/\D/g, '');
            codigo = rawCod;
            if (rawCod.length >= 8 && rawCod.length <= 14) ean = rawCod;
        }

        if (!codigo) {
            const codMatch = text.match(/\(C[oó]d(?:igo)?:\s*(\d+)\s*\)/i) || text.match(/C[oó]d(?:igo)?:\s*(\d+)/i);
            if (codMatch) {
                codigo = codMatch[1];
                if (codigo.length >= 8 && codigo.length <= 14) ean = codigo;
            }
        }

        if (!descricao) {
            // Tenta pegar a primeira linha de texto
            const linhas = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (linhas.length > 0) descricao = linhas[0].replace(/\(C[oó]d.*?/i, '').trim();
        }

        // Quantidade
        let quantidade = 1;
        const qtdElem = tr.querySelector('.RQUANT, .qtd');
        if (qtdElem) {
            quantidade = parseFloat(qtdElem.innerText.replace(/\D/g, '')) || 1;
        } else {
            const qtdMatch = text.match(/Qtde?\.?:\s*([\d.,]+)/i) || text.match(/Qtd:\s*([\d.,]+)/i);
            if (qtdMatch) quantidade = parseFloat(qtdMatch[1].replace(',', '.'));
        }

        // Unidade
        let unidade = 'UN';
        const unElem = tr.querySelector('.RUN, .un');
        if (unElem) {
            unidade = unElem.innerText.trim().toUpperCase();
        } else {
            const unMatch = text.match(/UN:\s*([A-Za-z]+)/i);
            if (unMatch) unidade = unMatch[1].toUpperCase();
        }

        // Preço Unitário
        let valorUnitario = 0;
        const vuElem = tr.querySelector('.RVAL_UNIT, .vlUnit');
        if (vuElem) {
            valorUnitario = parseFloat(vuElem.innerText.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
        } else {
            const vuMatch = text.match(/Vl\.?\s*Unit\.?[:\s]+([\d.,]+)/i);
            if (vuMatch) valorUnitario = parseFloat(vuMatch[1].replace(/\./g, '').replace(',', '.'));
        }

        // Preço Total do Item
        let valorTotal = 0;
        const vtElem = tr.querySelector('.valor, .total, .RVAL_TOTAL');
        if (vtElem) {
            valorTotal = parseFloat(vtElem.innerText.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
        } else {
            const vtMatch = text.match(/Vl\.?\s*Total[:\s]*([\d.,]+)/i);
            if (vtMatch) {
                valorTotal = parseFloat(vtMatch[1].replace(/\./g, '').replace(',', '.'));
            } else if (valorUnitario > 0) {
                valorTotal = Math.round(valorUnitario * quantidade * 100) / 100;
            }
        }

        // Limpeza final da descrição
        descricao = descricao.replace(/\(C[oó]d(?:igo)?:.*?\)/gi, '')
                             .replace(/Qtde?:.*$/gi, '')
                             .replace(/Vl\..*$/gi, '')
                             .trim();

        if (!descricao || valorTotal <= 0) return null;

        return {
            codigo: codigo || ean || '',
            ean: ean || codigo || '',
            descricao: descricao,
            quantidade: quantidade || 1,
            unidade: unidade || 'UN',
            valorUnitario: valorUnitario || valorTotal,
            valorTotal: Math.round(valorTotal * 100) / 100
        };
    }

    static _extrairItemBlocoCard(bloco) {
        const text = bloco.innerText || bloco.textContent || '';
        const tit = bloco.querySelector('.txtTit, h4, h5, strong');
        const desc = tit ? tit.innerText.trim() : '';
        if (!desc) return null;

        const vuMatch = text.match(/Vl\.?\s*Unit\.?[:\s]+([\d.,]+)/i);
        const vtMatch = text.match(/Vl\.?\s*Total[:\s]*([\d.,]+)/i) || text.match(/R\$\s*([\d.,]+)/i);
        const qtdMatch = text.match(/Qtde?\.?:\s*([\d.,]+)/i);
        const codMatch = text.match(/C[oó]d(?:igo)?:\s*(\d+)/i);

        const qtd = qtdMatch ? parseFloat(qtdMatch[1].replace(',', '.')) : 1;
        const vu = vuMatch ? parseFloat(vuMatch[1].replace(/\./g, '').replace(',', '.')) : 0;
        const vt = vtMatch ? parseFloat(vtMatch[1].replace(/\./g, '').replace(',', '.')) : (vu * qtd);

        return {
            codigo: codMatch ? codMatch[1] : '',
            ean: (codMatch && codMatch[1].length >= 8) ? codMatch[1] : '',
            descricao: desc,
            quantidade: qtd,
            unidade: 'UN',
            valorUnitario: vu || vt,
            valorTotal: Math.round(vt * 100) / 100
        };
    }

    static _extrairEstabelecimentoHtml(doc) {
        const estab = { nome: '', cnpj: '', endereco: '' };
        
        const nomeElem = doc.querySelector('#u20, .txtTopo, .txtCenter .txtTit, .nome-empresa, #lblNomeFantasia, .ui-outputlabel-bold');
        if (nomeElem) estab.nome = nomeElem.innerText.trim();

        const fullText = doc.body ? doc.body.innerText : '';
        const cnpjMatch = fullText.match(/CNPJ:\s*([\d.\/\-]+)/i);
        if (cnpjMatch) estab.cnpj = cnpjMatch[1].trim();

        const endElem = doc.querySelector('.txtEndereco, .endereco, #lblEndereco');
        if (endElem) estab.endereco = endElem.innerText.trim();

        return estab;
    }

    static _extrairDataHtml(doc) {
        const fullText = doc.body ? doc.body.innerText : '';
        const dataMatch = fullText.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (dataMatch) {
            const [d, m, y] = dataMatch[1].split('/');
            return `${y}-${m}-${d}`;
        }
        return new Date().toISOString().split('T')[0];
    }

    static _extrairValorTotalHtml(doc, itens) {
        const totalElem = doc.querySelector('#totalNota, .totalNfe, span.total, #lblValorTotal, .txtValorTotal');
        if (totalElem) {
            const val = parseFloat(totalElem.innerText.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
            if (val > 0) return val;
        }

        const fullText = doc.body ? doc.body.innerText : '';
        const totalMatch = fullText.match(/Valor\s*a\s*pagar\s*R\$\s*:?\s*([\d.,]+)/i) ||
                           fullText.match(/Valor\s*total\s*R\$\s*:?\s*([\d.,]+)/i) ||
                           fullText.match(/TOTAL\s*R\$\s*:?\s*([\d.,]+)/i);
        if (totalMatch) {
            return parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.'));
        }

        if (itens.length > 0) {
            return Math.round(itens.reduce((acc, it) => acc + (it.valorTotal || 0), 0) * 100) / 100;
        }

        return 0;
    }

    /**
     * Extração de texto puro (quando o usuário cola o texto ou em caso de fallback)
     */
    static _processarTextoPuro(fullText, siglaUF = 'RJ') {
        const resultado = {
            sucesso: false,
            estabelecimento: { nome: '', cnpj: '' },
            itens: [],
            valorTotal: 0,
            data: new Date().toISOString().split('T')[0],
            metodo: 'texto_puro'
        };

        const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];
            const codMatch = line.match(/\(C[oó]d(?:igo)?:\s*(\d+)\s*\)/i);
            
            if (codMatch) {
                const cod = codMatch[1];
                const item = {
                    codigo: cod,
                    ean: (cod.length >= 8 && cod.length <= 14) ? cod : '',
                    descricao: line.replace(/\s*\(C[oó]d(?:igo)?:.*?\)\s*/i, '').trim(),
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

        // CNPJ e Estabelecimento
        const cnpjMatch = fullText.match(/CNPJ:\s*([\d.\/\-]+)/i);
        if (cnpjMatch) resultado.estabelecimento.cnpj = cnpjMatch[1].trim();

        const razaoMatch = fullText.match(/ELETR[OÔ]NICA\s*\n\s*(.+?)\s*\n/i) || fullText.match(/DANFE\s*NFC-e\s*\n\s*(.+?)\s*\n/i);
        if (razaoMatch) resultado.estabelecimento.nome = razaoMatch[1].trim();

        // Total
        const totalMatch = fullText.match(/Valor\s*a\s*pagar\s*R\$\s*:?\s*([\d.,]+)/i) ||
                           fullText.match(/Valor\s*total\s*R\$\s*:?\s*([\d.,]+)/i) ||
                           fullText.match(/TOTAL\s*R\$\s*:?\s*([\d.,]+)/i);
        if (totalMatch) {
            resultado.valorTotal = parseFloat(totalMatch[1].replace(/\./g, '').replace(',', '.'));
        } else if (resultado.itens.length > 0) {
            resultado.valorTotal = Math.round(resultado.itens.reduce((acc, it) => acc + it.valorTotal, 0) * 100) / 100;
        }

        resultado.sucesso = resultado.itens.length > 0 || resultado.valorTotal > 0;
        return resultado;
    }
}
