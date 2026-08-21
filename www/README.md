# 🛒 Busca Ofertas — Scanner de Cupons & Comparador Gamificado de Preços

Aplicativo Web Mobile (PWA) de digitalização determinística de cupons fiscais (**NFC-e via QR Code**), leitura de código de barras (**EAN-13** de produtos na prateleira) e **rede social gamificada de achadinhos**.

---

## 🎮 Funcionalidades Principais

1. **📷 Scanner Dual de Câmera (Mobile-First):**
   - **Modo Cupom (QR Code):** Lê o QR Code do cupom fiscal impresso, baixa o HTML da SEFAZ via Multi-Proxy silencioso, extrai todos os itens e preços automaticamente.
   - **Modo Produto (Código de Barras EAN):** Aponte para a lata, caixa ou pacote no supermercado para consultar instantaneamente onde aquele produto está mais barato!
   - Bipe sonoro de confirmação e vibração háptica no celular.

2. **🪙 Economia Gamificada (OfertaCoins):**
   - **Minere moedas:** Ganhe `+15 Moedas` por cupom fiscal escaneado + `+1 Moeda` por produto.
   - **Bônus de Achadinho 🔥:** Se um produto comprado estiver significativamente abaixo do preço de mercado, ganhe `+30 Moedas` bônus e publique a oferta para a comunidade.
   - **Gaste moedas:** Realize buscas de preços por produto/EAN gastando `2 Moedas` por consulta.
   - **Níveis e Conquistas:** Evolua de *Caçador Novato* a *Lenda dos Achadinhos* com medalhas desbloqueáveis.

3. **🔥 Feed Social da Comunidade (Radar de Achadinhos):**
   - Linha do tempo em tempo real com as melhores pechinchas compartilhadas pelos usuários.
   - Sistema de curtidas 👍 e compartilhamento direto no WhatsApp.

4. **🔍 Comparador de Preços por Supermercado:**
   - Lista os estabelecimentos ordenados do menor para o maior preço.
   - Destaque com selo de **"Menor Preço"** e percentual de economia.

5. **💾 100% Offline & Armazenamento Local (IndexedDB):**
   - Todos os dados ficam salvos na memória do seu celular sem necessidade de servidor pago.
   - Suporte a exportação de dados para planilha Excel (**CSV**) e backup em **JSON**.

---

## 🌐 Como Publicar no GitHub Pages Gratuitamente

Para rodar no seu celular através da internet:

1. **Crie um repositório no seu GitHub** (ex: `busca-ofertas`).
2. **No terminal do seu computador**, envie os arquivos:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/busca-ofertas.git
   git branch -M main
   git push -u origin main
   ```
3. **No GitHub**, acesse:  
   `Settings` ➔ `Pages` ➔ Em *Branch*, selecione `main` (pasta `/root`) e clique em **Save**.
4. Em 1 minuto seu aplicativo estará no ar no link:  
   `https://SEU_USUARIO.github.io/busca-ofertas/`
5. **No seu celular (Chrome ou Safari):**
   Abra o link e clique em **"Adicionar à Tela Inicial"** para usá-lo como um aplicativo nativo instalado!

---

## 🏗️ Estrutura Técnica

- **Frontend:** HTML5 Semântico, CSS3 Vanilla Glassmorphism Dark, JavaScript Moderno ES Modules.
- **Scanner:** `html5-qrcode` com suporte a `QR_CODE`, `EAN_13`, `EAN_8`, `CODE_128`.
- **Efeitos de Gamificação:** `canvas-confetti` e Web Audio API.
- **Banco de Dados:** IndexedDB nativo (`BuscaOfertasDB`).
- **PWA:** `manifest.json` e `service-worker.js`.
