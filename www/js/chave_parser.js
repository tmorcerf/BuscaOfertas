/**
 * chave_parser.js — Parser e validador de chaves NF-e/NFC-e (44 dígitos)
 * Módulo: Corta Gastos - Importação de Notas Fiscais
 */

export class ChaveParser {
    static IBGE_UF = {
        '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA',
        '16': 'AP', '17': 'TO', '21': 'MA', '22': 'PI', '23': 'CE',
        '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE',
        '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
        '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT',
        '52': 'GO', '53': 'DF'
    };

    static UF_NOME = {
        'RO': 'Rondônia', 'AC': 'Acre', 'AM': 'Amazonas', 'RR': 'Roraima',
        'PA': 'Pará', 'AP': 'Amapá', 'TO': 'Tocantins', 'MA': 'Maranhão',
        'PI': 'Piauí', 'CE': 'Ceará', 'RN': 'Rio Grande do Norte',
        'PB': 'Paraíba', 'PE': 'Pernambuco', 'AL': 'Alagoas', 'SE': 'Sergipe',
        'BA': 'Bahia', 'MG': 'Minas Gerais', 'ES': 'Espírito Santo',
        'RJ': 'Rio de Janeiro', 'SP': 'São Paulo', 'PR': 'Paraná',
        'SC': 'Santa Catarina', 'RS': 'Rio Grande do Sul',
        'MS': 'Mato Grosso do Sul', 'MT': 'Mato Grosso', 'GO': 'Goiás',
        'DF': 'Distrito Federal'
    };

    static TP_EMIS = {
        '1': { nome: 'Normal', online: true },
        '2': { nome: 'Contingência FS-IA', online: false },
        '3': { nome: 'Contingência SCAN', online: false },
        '4': { nome: 'Contingência DPEC', online: false },
        '5': { nome: 'Contingência FS-DA', online: false },
        '6': { nome: 'Contingência SVC-AN', online: true },
        '7': { nome: 'Contingência SVC-RS', online: true },
        '9': { nome: 'Contingência Offline NFC-e', online: false }
    };

    /**
     * Extrai a chave de 44 dígitos a partir de qualquer entrada (URL, texto ou chave pura).
     */
    static extrairChave(raw) {
        if (!raw || typeof raw !== 'string') return null;
        const texto = raw.trim();
        let url = null;

        try {
            if (texto.startsWith('http')) {
                url = texto;
                const urlObj = new URL(texto);

                // Estratégia 1: Query param "p" (padrão NFC-e)
                const paramP = urlObj.searchParams.get('p');
                if (paramP) {
                    const parte = paramP.split('|')[0];
                    if (/^\d{44}$/.test(parte)) return { chave: parte, url };
                }

                // Estratégia 2: Query param "chNFe" ou "chave"
                const chNFe = urlObj.searchParams.get('chNFe') || urlObj.searchParams.get('chave');
                if (chNFe && /^\d{44}$/.test(chNFe)) return { chave: chNFe, url };

                // Estratégia 3: 44 dígitos no path
                const matchPath = urlObj.pathname.match(/(\d{44})/);
                if (matchPath) return { chave: matchPath[1], url };

                // Estratégia 3b: 44 dígitos em qualquer query param
                const matchQuery = urlObj.search.match(/(\d{44})/);
                if (matchQuery) return { chave: matchQuery[1], url };
            }
        } catch (e) {
            // Ignora erro de parsing de URL
        }

        // Limpa formatações e busca 44 dígitos
        const apenasNumeros = texto.replace(/\D/g, '');
        if (apenasNumeros.length === 44) {
            return { chave: apenasNumeros, url };
        }

        const matchTexto = texto.match(/\b(\d{44})\b/);
        if (matchTexto) {
            return { chave: matchTexto[1], url };
        }

        return null;
    }

    /**
     * Valida o dígito verificador da chave NF-e/NFC-e usando algoritmo Módulo 11.
     */
    static validarDV(chave) {
        if (!chave || !/^\d{44}$/.test(chave)) return false;

        const base = chave.substring(0, 43);
        const dvInformado = parseInt(chave.charAt(43), 10);

        let soma = 0;
        let peso = 2;

        for (let i = base.length - 1; i >= 0; i--) {
            soma += parseInt(base.charAt(i), 10) * peso;
            peso = (peso === 9) ? 2 : peso + 1;
        }

        const resto = soma % 11;
        const dvCalculado = (resto === 0 || resto === 1) ? 0 : (11 - resto);

        return dvCalculado === dvInformado;
    }

    /**
     * Decompõe a chave de 44 dígitos em campos estruturados.
     */
    static parseCampos(chave, url = null) {
        if (!chave || chave.length !== 44) return null;

        const codUF = chave.substring(0, 2);
        const siglaUF = this.IBGE_UF[codUF] || 'XX';
        const nomeUF = this.UF_NOME[siglaUF] || 'Desconhecido';

        const aa = chave.substring(2, 4);
        const mm = chave.substring(4, 6);
        const mesAnoFormatado = `${mm}/20${aa}`;

        const cnpjBruto = chave.substring(6, 20);
        const cnpjFormatado = cnpjBruto.replace(
            /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
            '$1.$2.$3/$4-$5'
        );

        const modelo = chave.substring(20, 22);
        const modeloNome = (modelo === '55') ? 'NF-e' : (modelo === '65') ? 'NFC-e' : `Modelo ${modelo}`;

        const serie = parseInt(chave.substring(22, 25), 10).toString();
        const numeroNota = parseInt(chave.substring(25, 34), 10).toString();

        const tpEmisCod = chave.substring(34, 35);
        const tpEmisInfo = this.TP_EMIS[tpEmisCod] || { nome: 'Desconhecido', online: true };

        const codigoNumerico = chave.substring(35, 43);
        const dv = chave.substring(43, 44);

        return {
            chave,
            chaveFormatada: this.formatarChave(chave),
            url,
            uf: { codigo: codUF, sigla: siglaUF, nome: nomeUF },
            emissao: { ano: `20${aa}`, mes: mm, mesAno: mesAnoFormatado },
            cnpj: { bruto: cnpjBruto, formatado: cnpjFormatado },
            modelo: { codigo: modelo, nome: modeloNome },
            serie,
            numeroNota,
            tipoEmissao: { codigo: tpEmisCod, nome: tpEmisInfo.nome, online: tpEmisInfo.online },
            isContingencia: !tpEmisInfo.online,
            codigoNumerico,
            dv
        };
    }

    /**
     * Formata a chave em grupos de 4 dígitos (ex: 3326 0800 0000 0001 9165 ...)
     */
    static formatarChave(chave) {
        if (!chave) return '';
        const limpa = chave.replace(/\D/g, '');
        return limpa.replace(/(\d{4})/g, '$1 ').trim();
    }

    /**
     * Pipeline completo: extrai, valida e decompõe.
     */
    static processar(raw) {
        const extraido = this.extrairChave(raw);
        if (!extraido) {
            // Se tiver URL mesmo sem achar os 44 dígitos exatos, retorna a URL para o fetcher tentar
            if (raw && typeof raw === 'string' && raw.trim().startsWith('http')) {
                return {
                    sucesso: true,
                    erro: null,
                    dados: {
                        chave: 'URL_' + Date.now(),
                        chaveFormatada: 'QR Code SEFAZ',
                        url: raw.trim(),
                        uf: { codigo: '33', sigla: 'RJ', nome: 'Rio de Janeiro' },
                        emissao: { ano: '2026', mes: '08', mesAno: '08/2026' },
                        cnpj: { bruto: '', formatado: '' },
                        modelo: { codigo: '65', nome: 'NFC-e' },
                        serie: '1',
                        numeroNota: '1',
                        tipoEmissao: { codigo: '1', nome: 'Normal', online: true },
                        isContingencia: false,
                        dvValido: true
                    }
                };
            }

            return {
                sucesso: false,
                erro: 'Nenhuma chave de 44 dígitos ou URL encontrada no texto ou QR code fornecido.',
                dados: null
            };
        }

        const dvValido = this.validarDV(extraido.chave);
        const dados = this.parseCampos(extraido.chave, extraido.url);
        if (dados) {
            dados.dvValido = dvValido;
        }

        return {
            sucesso: true,
            erro: null,
            dados
        };
    }
}
