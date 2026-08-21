/**
 * sefaz_extractor.js — Módulo de extração determinística da SEFAZ (Web & InAppBrowser)
 * Módulo: Corta Gastos - Importação de Notas Fiscais
 */

import { SefazScripts } from './sefaz_scripts.js';

export class SefazExtractor {
    static async extrairDeTexto(textoBruto, uf = 'RJ') {
        if (!textoBruto) return { sucesso: false, itens: [], valorTotal: 0 };
        const res = SefazScripts.extrairTexto(textoBruto, uf);
        return {
            sucesso: res.itens.length > 0 || res.valorTotal > 0,
            dados: res,
            metodo: res.metodo || 'texto_sefaz'
        };
    }

    static async extrair(url, uf = 'RJ') {
        if (!url) {
            return { sucesso: false, dados: null, erro: 'URL não fornecida.' };
        }

        // Se estiver rodando com Capacitor nativo no Android/iOS
        if (window.Capacitor && window.Capacitor.Plugins && (window.Capacitor.Plugins.CapgoInAppBrowser || window.Capacitor.Plugins.InAppBrowser)) {
            const InAppBrowser = window.Capacitor.Plugins.CapgoInAppBrowser || window.Capacitor.Plugins.InAppBrowser;
            return new Promise(async (resolve) => {
                try {
                    await InAppBrowser.openWebView({
                        url: url,
                        title: 'Consultando SEFAZ...',
                        toolbarColor: '#0f172a',
                        closeButtonColor: '#ffffff',
                        showArrow: true,
                        isPresentAfterPageLoad: true
                    });

                    let extraido = false;

                    await InAppBrowser.addListener('browserPageLoaded', async () => {
                        if (extraido) return;
                        setTimeout(async () => {
                            const code = SefazScripts.getScript(uf);
                            await InAppBrowser.executeScript({ code });
                        }, 2000);
                    });

                    await InAppBrowser.addListener('messageFromWebview', async (event) => {
                        if (extraido) return;
                        const raw = event.data?.message || event.message || event.data || '{}';
                        const dados = typeof raw === 'string' ? JSON.parse(raw) : raw;

                        if (dados && dados.fullText) {
                            const parsed = SefazScripts.extrairTexto(dados.fullText, uf);
                            if (parsed.itens.length > 0 || parsed.valorTotal > 0) {
                                extraido = true;
                                await InAppBrowser.close();
                                resolve({ sucesso: true, dados: parsed, metodo: 'inappbrowser' });
                            }
                        }
                    });

                    setTimeout(() => {
                        if (!extraido) {
                            resolve({ sucesso: false, dados: null, erro: 'Timeout ao consultar SEFAZ no WebView.' });
                        }
                    }, 40000);

                } catch (e) {
                    resolve({ sucesso: false, dados: null, erro: e.message });
                }
            });
        }

        return {
            sucesso: false,
            dados: null,
            metodo: 'web_manual',
            url: url,
            erro: 'Ambiente Web navegador. Utilize a opção de colar texto da página ou abrir a SEFAZ.'
        };
    }
}
