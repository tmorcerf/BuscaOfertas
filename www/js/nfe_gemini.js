/**
 * nfe_gemini.js — Inteligência Artificial Gemini para identificação de CNPJ, categorização de itens e OCR de cupons fiscais
 * Módulo: Corta Gastos - Importação de Notas Fiscais
 */

import { db } from '../../../js/firebase_config.js';

export class NfeGeminiService {
    static async getApiKey() {
        try {
            const snap = await db.collection('AppConfig').doc('gemini').get();
            if (snap.exists && snap.data().apiKey) {
                return snap.data().apiKey;
            }
        } catch (e) {
            console.error('[NfeGemini] Erro ao buscar chave Gemini no Firestore:', e);
        }
        return null;
    }

    static async chamarGemini(systemInstruction, userContent, returnJson = true, inlineData = null) {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            throw new Error("Chave da API Gemini não encontrada em AppConfig/gemini.");
        }

        const parts = [];
        if (inlineData) {
            parts.push({
                inlineData: {
                    mimeType: inlineData.mimeType,
                    data: inlineData.base64
                }
            });
        }
        parts.push({ text: userContent });

        const payload = {
            contents: [{ role: 'user', parts: parts }],
            systemInstruction: { parts: [{ text: systemInstruction }] }
        };

        if (returnJson) {
            payload.generationConfig = { responseMimeType: 'application/json' };
        }

        const models = ['gemini-3.5-flash', 'gemini-3.1-pro', 'gemini-3.6-flash'];
        let lastError = null;

        for (const model of models) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errText = await response.text();
                    console.warn(`[Gemini ${model}] Erro ${response.status}: ${errText}. Tentando próximo modelo...`);
                    lastError = new Error(`HTTP ${response.status}: ${errText}`);
                    continue;
                }

                const data = await response.json();
                const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!rawText) throw new Error("Resposta vazia da API Gemini.");

                if (returnJson) {
                    const cleanJsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
                    return JSON.parse(cleanJsonText);
                }

                return rawText;
            } catch (err) {
                console.warn(`[Gemini ${model}] Falha:`, err);
                lastError = err;
            }
        }

        throw lastError || new Error("Todos os modelos Gemini falharam.");
    }

    /**
     * Identifica o Nome Fantasia e Categoria do Estabelecimento pelo CNPJ + UF
     */
    static async identificarEstabelecimento(cnpj, siglaUF, nomeUF) {
        const systemInstruction = `Você é um especialista em estabelecimentos comerciais brasileiros. Identifique o nome comercial (Nome Fantasia) e a Categoria do estabelecimento com base no CNPJ e localização. Responda ESTRITAMENTE em formato JSON.`;

        const userPrompt = `Identifique o estabelecimento comercial com CNPJ ${cnpj} no estado de ${nomeUF} (${siglaUF}).
Retorne JSON com o formato:
{
  "nomeFantasia": "Nome Comercial Claro do Estabelecimento",
  "razaoSocial": "Razão Social aproximada se conhecida",
  "categoria": "Supermercado, Farmácia, Posto de Combustível, Restaurante, Vestuário, Pet Shop, Padaria ou Outros",
  "confianca": "alta"
}`;

        try {
            const parsed = await this.chamarGemini(systemInstruction, userPrompt, true);
            return {
                nomeFantasia: parsed.nomeFantasia || 'Estabelecimento Comercial',
                razaoSocial: parsed.razaoSocial || '',
                categoria: parsed.categoria || 'Alimentação',
                confianca: parsed.confianca || 'media'
            };
        } catch (err) {
            console.error('[NfeGemini] Erro ao identificar estabelecimento:', err);
            return {
                nomeFantasia: `Estabelecimento (${cnpj})`,
                razaoSocial: '',
                categoria: 'Alimentação',
                confianca: 'baixa'
            };
        }
    }

    /**
     * Classifica cada item da nota fiscal dentro da árvore oficial de categorias do usuário
     */
    static async categorizarItensNota(itens, categoriasStr = '') {
        if (!itens || itens.length === 0) return [];

        const systemInstruction = `Você é o classificador financeiro do Corta Gastos. Analise os produtos comprados e classifique cada item com a Categoria e Subcategoria mais adequada da árvore fornecida.
ÁRVORE DE CATEGORIAS DISPONÍVEIS:
${categoriasStr || 'Alimentação (Supermercado, Lanches, Restaurante, Padaria), Moradia (Limpeza, Manutenção), Saúde (Farmácia, Higiene), Transporte (Combustível), Pets (Ração, Pet Shop), Vestuário, Lazer, Outros'}

Responda ESTRITAMENTE em formato JSON:
{
  "itensClassificados": [
    {
      "index": 0,
      "categoria": "Categoria Oficial",
      "subcategoria": "Subcategoria Oficial"
    }
  ]
}`;

        const userPrompt = JSON.stringify(itens.map((it, idx) => ({
            index: idx,
            descricao: it.descricao,
            valorTotal: it.valorTotal
        })));

        try {
            const res = await this.chamarGemini(systemInstruction, userPrompt, true);
            if (res && res.itensClassificados) {
                res.itensClassificados.forEach(ic => {
                    if (itens[ic.index]) {
                        itens[ic.index].categoria = ic.categoria || 'Alimentação';
                        itens[ic.index].subcategoria = ic.subcategoria || '';
                    }
                });
            }
        } catch (e) {
            console.warn('[NfeGemini] Erro ao categorizar itens:', e);
            itens.forEach(it => {
                it.categoria = it.categoria || 'Alimentação';
                it.subcategoria = it.subcategoria || 'Supermercado';
            });
        }

        return itens;
    }

    /**
     * Extrai itens e dados de um cupom a partir de foto/imagem via Gemini Vision
     */
    static async extrairNotaDeImagem(base64Image, mimeType = 'image/jpeg', categoriasStr = '') {
        const systemInstruction = `Você é um extrator de alta precisão de dados de cupons e notas fiscais brasileiras (NFC-e / Cupom Fiscal).
Analise a imagem da nota fiscal e extraia:
1. Nome do Estabelecimento e CNPJ
2. Data da compra (DD/MM/YYYY)
3. Valor Total da Nota
4. Todos os itens/produtos comprados (descrição, código EAN se legível, quantidade, unidade, valor unitário e valor total).

ÁRVORE DE CATEGORIAS DISPONÍVEIS:
${categoriasStr || 'Alimentação (Supermercado, Padaria), Moradia (Limpeza), Saúde (Farmácia), Outros'}

Responda APENAS em JSON:
{
  "estabelecimento": {
    "nome": "Nome Fantasia Comercial",
    "cnpj": "XX.XXX.XXX/XXXX-XX"
  },
  "data": "DD/MM/YYYY",
  "valorTotal": 0.00,
  "itens": [
    {
      "codigo": "7891000000000",
      "descricao": "NOME DO PRODUTO",
      "quantidade": 1.0,
      "unidade": "UN",
      "valorUnitario": 0.00,
      "valorTotal": 0.00,
      "categoria": "Categoria",
      "subcategoria": "Subcategoria"
    }
  ]
}`;

        const userPrompt = "Extraia todos os dados e itens desta nota fiscal em JSON estruturado.";
        const inlineData = { mimeType, base64: base64Image };

        return await this.chamarGemini(systemInstruction, userPrompt, true, inlineData);
    }
}
