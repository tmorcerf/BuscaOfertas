# 🛒 Busca Ofertas — Scanner de Cupons e Notas Fiscais (NFC-e / NF-e)

> **Projeto:** Aplicativo Móvel para Digitalização de Cupons Fiscais via QR Code e Comparação de Preços  
> **Destinado a:** Próximo Modelo de IA / Desenvolvedor que dará continuidade a este projeto.

---

## 🎯 1. Objetivo Central do Projeto
Criar um **aplicativo de celular (Mobile App via Capacitor / Android / iOS / PWA)** cuja principal função é:
1. **Ler o QR Code impresso no cupom fiscal (NFC-e / NF-e)** através da câmera do celular.
2. **Extrair todos os produtos discriminados na nota** (código, descrição/nome, quantidade, unidade, valor unitário e valor total) de forma 100% automatizada e determinística (sem digitação manual).
3. **Salvar os itens em uma tabela / banco de dados de preços** para permitir a comparação histórica de ofertas e valores entre estabelecimentos e supermercados da região.

---

## ⚖️ 2. Regra Técnica Crucial da Legislação Fiscal (Por que apenas QR Code?)

* **Consulta via QR Code (Livre de CAPTCHA):**  
  Conforme o *Manual de Padrões Técnicos do DANFE NFC-e e QR Code (ENCAT)*, a URL contida no QR Code é autenticada com parâmetros de segurança da empresa emitente (`p=CHAVE|2|1|1|CSC|HASH`). **Por essa razão, a SEFAZ estadual entrega a página de detalhes da compra diretamente ao consumidor final, sem exigir CAPTCHA.**
* **Consulta Manual por Chave de 44 Dígitos (Com CAPTCHA):**  
  Apenas a sequência de 44 dígitos digitada manualmente nos portais dos governos estaduais exige reCAPTCHA/hCaptcha para barrar robôs. Portanto, o foco do aplicativo é **exclusivamente a leitura da câmera no QR Code**.

---

## 📂 3. Estrutura dos Arquivos Deste Diretório

| Arquivo / Pasta | Finalidade |
| :--- | :--- |
| **`scanner_nfe.html`** | Estrutura visual da interface do scanner com suporte a tela de conferência e tabela de itens. |
| **`scanner_nfe.css`** | Estilos visuais Dark Glassmorphism, animações de mira e laser de escaneamento. |
| **`js/scanner.js`** | Módulo de acionamento da câmera usando a biblioteca `html5-qrcode` com suporte a alternância de câmeras traseira/frontal. |
| **`js/sefaz_extractor.js`** | Controlador de extração: no celular nativo, aciona o plugin `@capgo/capacitor-inappbrowser` para abrir a URL do QR Code e injetar os scripts no DOM. |
| **`js/sefaz_scripts.js`** | Motor determinístico com scripts de parsing e extração para RJ, SP, RS, MG e padrão SVRS (tabelas e blocos de produtos). |
| **`js/chave_parser.js`** | Validador e parser da chave de 44 dígitos via algoritmo Módulo 11 (extrai UF, CNPJ, Data, Série, Número). |
| **`js/nfe_sync.js`** | Módulo de persistência para salvar as notas e alimentar a tabela de preços. |
| **`js/scanner_nfe.js`** | Orquestrador principal da página e eventos de interação. |
| **`ManualImportacaoNfe.md`** | Manual técnico detalhado com as fórmulas matemáticas e regras fiscais. |

---

## 🚀 4. Próximos Passos para o Próximo Modelo

1. **Configuração Mobile (Capacitor / Cordova):**
   - Inicializar o projeto com Capacitor (`npm init @capacitor/app`).
   - Adicionar o plugin `@capgo/capacitor-inappbrowser` e `@capacitor/camera` para execução nativa no Android.
2. **Fluxo de Extração Nativa:**
   - Câmera lê QR Code -> InAppBrowser abre a URL em segundo plano -> `SefazScripts` extrai o DOM -> Retorna JSON para o aplicativo via `postMessage`.
3. **Módulo de Comparador de Ofertas:**
   - Criar tela de consulta que agrupa itens pelo nome ou código EAN e exibe em qual estabelecimento o produto está mais barato.

---
*Arquivos migrados com sucesso para `C:\APLICATIVOS\BUSCA OFERTAS`.*
