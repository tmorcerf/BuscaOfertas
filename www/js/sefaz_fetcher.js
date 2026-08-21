/**
 * sefaz_fetcher.js — Motor Multi-Proxy para Download Silencioso do HTML da SEFAZ
 * Supera a limitação de CORS em navegadores Web / Mobile (GitHub Pages)
 */

export class SefazFetcher {
    // Lista de proxies CORS públicos e estáveis com rotação automática
    static PROXIES = [
        {
            name: 'AllOrigins',
            format: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
            timeout: 8000
        },
        {
            name: 'CorsProxyIO',
            format: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
            timeout: 8000
        },
        {
            name: 'CodeTabs',
            format: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
            timeout: 8000
        }
    ];

    /**
     * Tenta baixar o HTML da SEFAZ rotacionando entre os proxies CORS
     */
    static async baixarHtmlSefaz(sefazUrl, onProgress = null) {
        if (!sefazUrl || !sefazUrl.startsWith('http')) {
            return { sucesso: false, erro: 'URL da SEFAZ inválida.' };
        }

        // Tenta cada proxy sequencialmente com timeout
        for (let i = 0; i < this.PROXIES.length; i++) {
            const proxy = this.PROXIES[i];
            const targetUrl = proxy.format(sefazUrl);

            if (onProgress) {
                onProgress(`Consultando SEFAZ (Rota ${i + 1}/${this.PROXIES.length})...`);
            }

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), proxy.timeout);

                const response = await fetch(targetUrl, {
                    method: 'GET',
                    signal: controller.signal,
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    const html = await response.text();
                    
                    // Valida se o conteúdo retornado parece ser uma página da SEFAZ
                    if (html && (html.includes('NFC-e') || html.includes('DANFE') || html.includes('CNPJ') || html.includes('tabResult') || html.length > 500)) {
                        console.log(`[SefazFetcher] Sucesso via proxy ${proxy.name}!`);
                        return {
                            sucesso: true,
                            html: html,
                            proxyUsado: proxy.name,
                            urlOriginal: sefazUrl
                        };
                    }
                }
            } catch (err) {
                console.warn(`[SefazFetcher] Proxy ${proxy.name} falhou:`, err.message || err);
            }
        }

        return {
            sucesso: false,
            erro: 'Não foi possível acessar a SEFAZ automaticamente pelos servidores intermediários.',
            podeColarManual: true,
            urlOriginal: sefazUrl
        };
    }
}
