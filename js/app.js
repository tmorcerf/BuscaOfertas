/**
 * app.js — Controlador Central do Busca Ofertas
 * Orquestra as abas, scanner de câmera, gamificação, comparação de preços e feed social
 */

import { DBStorage } from './db_storage.js';
import { GamificationEngine } from './gamification.js';
import { ScannerController } from './scanner.js';
import { ChaveParser } from './chave_parser.js';
import { SefazFetcher } from './sefaz_fetcher.js';
import { SefazParser } from './sefaz_parser.js';
import { ComparadorEngine } from './comparador.js';
import { CommunityFeed } from './community_feed.js';
import { BackupManager } from './backup.js';

class BuscaOfertasApp {
    constructor() {
        this.scanner = new ScannerController();
        this.scannerMode = 'qrcode'; // 'qrcode' | 'barcode'
        this.cameraAtiva = false;
        this.notaPendente = null;
        this.currentTab = 'tab-scanner';

        this.init();
    }

    async init() {
        console.log('[BuscaOfertas] Inicializando aplicativo...');
        
        // 1. Inicializa banco e verifica bônus diário
        await DBStorage.getDB();
        const bonusInfo = await GamificationEngine.checarBonusDiario();
        if (bonusInfo.bonusRecebido) {
            this.mostrarToast(bonusInfo.mensagem, 'success');
        }

        // 2. Atualiza UI de moedas e perfil
        await this.atualizarCarteiraUI();

        // 3. Vincula eventos de navegação e botões
        this.bindEventosNavegacao();
        this.bindEventosScanner();
        this.bindEventosComparador();
        this.bindEventosPerfilEBackup();
        this.bindEventosModais();

        // 4. Inicia a câmera no celular automaticamente na aba Scanner
        this.iniciarCameraScanner();
    }

    // =========================================================================
    // NAVEGAÇÃO ENTRE ABAS
    // =========================================================================

    bindEventosNavegacao() {
        const navItems = document.querySelectorAll('.bottom-nav .nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const targetTab = item.getAttribute('data-tab');
                if (targetTab) {
                    this.alternarAba(targetTab);
                }
            });
        });

        // Clique no saldo de moedas do topo leva ao perfil
        const btnWallet = document.getElementById('btn-topbar-wallet');
        if (btnWallet) {
            btnWallet.addEventListener('click', () => this.alternarAba('tab-perfil'));
        }

        const logoBtn = document.getElementById('logo-home-btn');
        if (logoBtn) {
            logoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.alternarAba('tab-scanner');
            });
        }
    }

    async alternarAba(tabId) {
        this.currentTab = tabId;

        // Atualiza classes ativas na barra inferior
        document.querySelectorAll('.bottom-nav .nav-item').forEach(nav => {
            nav.classList.toggle('active', nav.getAttribute('data-tab') === tabId);
        });

        // Alterna containers de conteúdo
        document.querySelectorAll('.tab-content').forEach(section => {
            section.classList.toggle('active', section.id === tabId);
        });

        // Controle da câmera (pausa se sair da aba scanner para economizar bateria)
        if (tabId === 'tab-scanner') {
            if (!this.cameraAtiva) this.iniciarCameraScanner();
        } else {
            if (this.cameraAtiva) {
                await this.scanner.parar();
                this.cameraAtiva = false;
                this.atualizarBotaoPowerCamera(false);
            }
        }

        // Carregamentos específicos por aba
        if (tabId === 'tab-feed') {
            await CommunityFeed.carregarFeed('container-feed-social');
        } else if (tabId === 'tab-cupons') {
            await this.carregarListaCupons();
        } else if (tabId === 'tab-perfil') {
            await this.carregarPerfilEConquistas();
        }
    }

    // =========================================================================
    // SCANNER & PROCESSAMENTO DE CUPOM / CÓDIGO DE BARRAS
    // =========================================================================

    bindEventosScanner() {
        const btnModeQr = document.getElementById('btn-mode-qr');
        const btnModeBar = document.getElementById('btn-mode-bar');
        const reticle = document.getElementById('reticle-frame');
        const instructionText = document.getElementById('scanner-instruction-text');

        if (btnModeQr && btnModeBar) {
            btnModeQr.onclick = async () => {
                this.scannerMode = 'qrcode';
                btnModeQr.className = 'btn-mode-toggle active qr-active';
                btnModeBar.className = 'btn-mode-toggle';
                if (reticle) reticle.className = 'reticle-frame';
                if (instructionText) instructionText.innerHTML = '📸 Aponte para o <strong>QR Code</strong> do cupom fiscal';
                await this.scanner.alternarModo('qrcode');
            };

            btnModeBar.onclick = async () => {
                this.scannerMode = 'barcode';
                btnModeBar.className = 'btn-mode-toggle active bar-active';
                btnModeQr.className = 'btn-mode-toggle';
                if (reticle) reticle.className = 'reticle-frame barcode-mode';
                if (instructionText) instructionText.innerHTML = '🏷️ Aponte para o <strong>Código de Barras</strong> do produto';
                await this.scanner.alternarModo('barcode');
            };
        }

        const btnFlip = document.getElementById('btn-flip-camera');
        if (btnFlip) {
            btnFlip.onclick = () => this.scanner.alternarCamera();
        }

        const btnPower = document.getElementById('btn-toggle-cam-power');
        if (btnPower) {
            btnPower.onclick = async () => {
                if (this.cameraAtiva) {
                    await this.scanner.parar();
                    this.cameraAtiva = false;
                    this.atualizarBotaoPowerCamera(false);
                } else {
                    await this.iniciarCameraScanner();
                }
            };
        }

        // Ações da Conferência de Cupom
        const btnCancelarConf = document.getElementById('btn-cancelar-conferencia');
        if (btnCancelarConf) {
            btnCancelarConf.onclick = () => this.cancelarConferencia();
        }

        const btnSalvarCupom = document.getElementById('btn-salvar-cupom-final');
        if (btnSalvarCupom) {
            btnSalvarCupom.onclick = () => this.salvarCupomFinalEPremiar();
        }
    }

    async iniciarCameraScanner() {
        try {
            this.atualizarBotaoPowerCamera(true);
            await this.scanner.iniciar('scanner-video-target', this.scannerMode, (decodedText) => {
                this.aoDetectarLeitura(decodedText);
            });
            this.cameraAtiva = true;
        } catch (e) {
            console.warn('[App] Não foi possível abrir câmera automaticamente:', e);
            this.cameraAtiva = false;
            this.atualizarBotaoPowerCamera(false);
        }
    }

    atualizarBotaoPowerCamera(ativa) {
        const label = document.getElementById('label-cam-power');
        const btn = document.getElementById('btn-toggle-cam-power');
        if (label) label.textContent = ativa ? 'Pausar Câmera' : 'Ligar Câmera';
        if (btn) btn.style.borderColor = ativa ? 'rgba(0,255,170,0.3)' : 'rgba(255,255,255,0.1)';
    }

    /**
     * Ponto central quando a câmera lê um QR Code ou Código de Barras
     */
    async aoDetectarLeitura(decodedText) {
        console.log(`[App] Leitura detectada (${this.scannerMode}):`, decodedText);

        if (this.scannerMode === 'barcode') {
            // Modo Produto: vai para a aba de busca e pesquisa o EAN lido
            this.mostrarToast(`🔍 Código de barras ${decodedText} lido! Buscando melhores preços...`, 'info');
            this.alternarAba('tab-comparar');
            const inputBusca = document.getElementById('input-busca-produto');
            if (inputBusca) inputBusca.value = decodedText;
            await this.executarBuscaPrecos(decodedText);
            return;
        }

        // Modo Cupom Fiscal (QR Code):
        this.processarEntradaCupom(decodedText);
    }

    async processarEntradaCupom(rawInput) {
        this.mostrarToast('⚙️ Analisando QR Code e consultando SEFAZ...', 'info');

        // 1. Extrai dados da chave e URL da SEFAZ
        const resChave = ChaveParser.processar(rawInput);
        if (!resChave.sucesso && !rawInput.includes('http') && rawInput.length < 44) {
            this.mostrarToast('QR Code não reconhecido como cupom fiscal NFC-e válido.', 'warning');
            return;
        }

        const dadosChave = resChave.dados;
        const chaveAcesso = dadosChave?.chave || 'CHAVE_' + Date.now();

        // 2. Checa se o cupom já foi escaneado anteriormente
        const cupomExistente = await DBStorage.obterCupomPorChave(chaveAcesso);
        if (cupomExistente) {
            this.mostrarToast(`⚠️ Este cupom fiscal já foi escaneado em ${cupomExistente.data}.`, 'warning');
            return;
        }

        // 3. Tenta baixar o HTML da SEFAZ via Multi-Proxy
        let resultadoExtracao = null;

        if (dadosChave?.url) {
            const fetchResult = await SefazFetcher.baixarHtmlSefaz(dadosChave.url, (msg) => {
                this.mostrarToast(msg, 'info');
            });

            if (fetchResult.sucesso && fetchResult.html) {
                resultadoExtracao = SefazParser.processar(fetchResult.html, dadosChave.uf?.sigla || 'RJ');
            }
        }

        // Se o download falhou ou a entrada é texto puro colado
        if (!resultadoExtracao || !resultadoExtracao.sucesso) {
            if (rawInput.includes('\n') || rawInput.includes('<')) {
                resultadoExtracao = SefazParser.processar(rawInput, dadosChave?.uf?.sigla || 'RJ');
            }
        }

        // 4. Monta objeto da nota processada
        const dataEmissao = dadosChave?.emissao ? `${dadosChave.emissao.ano}-${dadosChave.emissao.mes}-01` : (resultadoExtracao?.data || new Date().toISOString().split('T')[0]);

        this.notaPendente = {
            chave: chaveAcesso,
            chaveFormatada: dadosChave?.chaveFormatada || ChaveParser.formatarChave(chaveAcesso),
            estabelecimento: {
                nome: resultadoExtracao?.estabelecimento?.nome || `Supermercado (${dadosChave?.cnpj?.formatado || 'NFC-e'})`,
                cnpj: resultadoExtracao?.estabelecimento?.cnpj || dadosChave?.cnpj?.formatado || '',
                endereco: resultadoExtracao?.estabelecimento?.endereco || ''
            },
            uf: dadosChave?.uf || { sigla: 'RJ', nome: 'Rio de Janeiro' },
            data: dataEmissao,
            valorTotal: resultadoExtracao?.valorTotal || 0,
            itens: resultadoExtracao?.itens || []
        };

        // 5. Exibe card de conferência
        this.renderizarCardConferencia();
    }

    renderizarCardConferencia() {
        const card = document.getElementById('card-conferencia-cupom');
        if (!card || !this.notaPendente) return;

        const nota = this.notaPendente;
        document.getElementById('conf-mercado-nome').textContent = nota.estabelecimento.nome;
        document.getElementById('conf-mercado-cnpj').textContent = `CNPJ: ${nota.estabelecimento.cnpj || '--'} • ${nota.uf?.sigla || 'BR'}`;
        document.getElementById('conf-data-cupom').textContent = nota.data;
        document.getElementById('conf-valor-total-nota').textContent = `R$ ${(nota.valorTotal || 0).toFixed(2).replace('.', ',')}`;
        document.getElementById('conf-qtd-itens').textContent = (nota.itens || []).length;

        const tbody = document.getElementById('conf-itens-tbody');
        if (tbody) {
            if (nota.itens.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:1rem; color:var(--color-text-muted);">Itens não discriminados. O total da compra de R$ ${(nota.valorTotal || 0).toFixed(2)} será registrado.</td></tr>`;
            } else {
                tbody.innerHTML = nota.itens.map((it, idx) => `
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                        <td style="padding:6px 10px;">
                            <strong>${it.descricao}</strong>
                            ${it.ean ? `<div style="font-size:0.7rem; color:var(--color-blue);"><i class="fas fa-barcode"></i> ${it.ean}</div>` : ''}
                        </td>
                        <td style="padding:6px 10px; text-align:center; color:var(--color-text-muted);">${it.quantidade} ${it.unidade || 'UN'}</td>
                        <td style="padding:6px 10px; text-align:right; font-weight:700; color:var(--color-accent);">R$ ${(it.valorTotal || 0).toFixed(2).replace('.', ',')}</td>
                    </tr>
                `).join('');
            }
        }

        card.style.display = 'block';
        card.scrollIntoView({ behavior: 'smooth' });
    }

    cancelarConferencia() {
        this.notaPendente = null;
        const card = document.getElementById('card-conferencia-cupom');
        if (card) card.style.display = 'none';
        this.mostrarToast('Leitura descartada.', 'info');
    }

    /**
     * Salva a nota no IndexedDB, grava itens na base de preços, detecta achadinhos e premia o jogador
     */
    async salvarCupomFinalEPremiar() {
        if (!this.notaPendente) return;

        const nota = this.notaPendente;
        const todosPrecosExistentes = await DBStorage.listarTodosPrecos();
        const achadinhosDetectados = [];

        // 1. Grava cada item no banco de preços e avalia se é Achadinho
        for (const item of nota.itens) {
            const avaliacao = await GamificationEngine.avaliarAchadinho(item, todosPrecosExistentes);
            const isAchadinho = avaliacao.isAchadinho;

            if (isAchadinho) {
                achadinhosDetectados.push({
                    ...item,
                    precoMedio: avaliacao.precoMedio,
                    descontoPct: avaliacao.descontoPct
                });
            }

            await DBStorage.salvarPreco({
                ean: item.ean || item.codigo || '',
                codigo: item.codigo || item.ean || '',
                descricao: item.descricao,
                quantidade: item.quantidade || 1,
                unidade: item.unidade || 'UN',
                valorUnitario: item.valorUnitario || item.valorTotal || 0,
                valorTotal: item.valorTotal || 0,
                supermercado: nota.estabelecimento.nome,
                cnpj: nota.estabelecimento.cnpj,
                uf: nota.uf?.sigla || 'RJ',
                data: nota.data,
                chaveNfe: nota.chave,
                isAchadinho: isAchadinho
            });
        }

        // 2. Grava o Cupom Fiscal na tabela de cupons
        await DBStorage.salvarCupom({
            chave: nota.chave,
            chaveFormatada: nota.chaveFormatada,
            supermercado: nota.estabelecimento.nome,
            cnpj: nota.estabelecimento.cnpj,
            data: nota.data,
            valorTotal: nota.valorTotal,
            quantidadeItens: nota.itens.length,
            achadinhosCount: achadinhosDetectados.length,
            criadoEm: new Date().toISOString()
        });

        // 3. Processa Recompensa de Gamificação (Moedas + XP + Nível + Conquistas)
        const recompensa = await GamificationEngine.processarRecompensaCupom(nota.itens.length, achadinhosDetectados);

        // 4. Publica no Feed Comunitário se houver Achadinhos
        const perfil = await GamificationEngine.obterEstado();
        if (achadinhosDetectados.length > 0) {
            await CommunityFeed.publicarAchadinhosDaNota(nota, achadinhosDetectados, perfil);
        }

        // 5. Atualiza contador de moedas na barra superior
        await this.atualizarCarteiraUI();

        // 6. Fecha card de conferência
        this.cancelarConferencia();

        // 7. Dispara Celebração com Confetti & Modal de Recompensa
        this.dispararModalCelebracao(recompensa, achadinhosDetectados);
    }

    dispararModalCelebracao(recompensa, achadinhos) {
        // Dispara confetes se biblioteca estiver disponível
        if (typeof confetti === 'function') {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
        }

        const modal = document.getElementById('modal-recompensa-celebracao');
        const icon = document.getElementById('celebration-icon');
        const title = document.getElementById('celebration-title');
        const amount = document.getElementById('celebration-amount');
        const subtitle = document.getElementById('celebration-subtitle');

        if (achadinhos.length > 0) {
            if (icon) icon.textContent = '🔥';
            if (title) title.textContent = 'SUPER ACHADINHO ENCONTRADO!';
            if (amount) amount.textContent = `+${recompensa.moedasGanhas} Moedas 🪙`;
            if (subtitle) subtitle.textContent = `Incrível! Você encontrou ${achadinhos.length} pechincha(s) e compartilhou com a comunidade!`;
        } else {
            if (icon) icon.textContent = '🪙';
            if (title) title.textContent = 'Mineração Concluída!';
            if (amount) amount.textContent = `+${recompensa.moedasGanhas} Moedas 🪙`;
            if (subtitle) subtitle.textContent = `Você cadastrou seus produtos e ganhou +${recompensa.xpGanho} XP!`;
        }

        if (modal) modal.style.display = 'flex';
    }

    // =========================================================================
    // COMPARADOR DE PREÇOS
    // =========================================================================

    bindEventosComparador() {
        const btnBusca = document.getElementById('btn-executar-busca');
        const inputBusca = document.getElementById('input-busca-produto');

        if (btnBusca && inputBusca) {
            btnBusca.onclick = () => this.executarBuscaPrecos(inputBusca.value.trim());
            inputBusca.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.executarBuscaPrecos(inputBusca.value.trim());
                }
            });
        }
    }

    async executarBuscaPrecos(termo) {
        if (!termo) {
            this.mostrarToast('Digite o nome do produto ou código de barras.', 'warning');
            return;
        }

        const container = document.getElementById('container-resultados-busca');
        if (!container) return;

        container.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--color-accent);"><i class="fas fa-spinner fa-spin fa-2x"></i><p style="margin-top:8px;">Consultando histórico de preços da comunidade...</p></div>`;

        const resultado = await ComparadorEngine.pesquisarPrecos(termo, true);

        // Atualiza carteira pois a busca consome moedas
        await this.atualizarCarteiraUI();

        if (!resultado.sucesso) {
            if (resultado.bloqueioMoedas) {
                container.innerHTML = `
                    <div class="glass-card highlight" style="text-align:center; padding:2rem;">
                        <div style="font-size:3rem; margin-bottom:10px;">🪙</div>
                        <h3 style="color:var(--color-gold); margin-bottom:8px;">Moedas Insuficientes</h3>
                        <p style="font-size:0.88rem; color:var(--color-text-muted); margin-bottom:15px;">
                            Você precisa de <strong>${resultado.custo} Moedas</strong> para pesquisar preços.<br>
                            Seu saldo atual: <strong>${resultado.saldoAtual} Moedas</strong>.
                        </p>
                        <button id="btn-ir-scanner-moedas" class="btn-primary">
                            <i class="fas fa-camera"></i> Escanear Cupom para Ganhar Moedas
                        </button>
                    </div>
                `;
                const btnIr = document.getElementById('btn-ir-scanner-moedas');
                if (btnIr) btnIr.onclick = () => this.alternarAba('tab-scanner');
                return;
            }

            container.innerHTML = `<div class="feed-empty-state"><p>${resultado.erro || 'Erro na pesquisa.'}</p></div>`;
            return;
        }

        if (resultado.produtosAgrupados.length === 0) {
            container.innerHTML = `
                <div class="feed-empty-state" style="padding:2rem; text-align:center;">
                    <div style="font-size:3rem; margin-bottom:10px;">📦</div>
                    <h3>Nenhum preço encontrado</h3>
                    <p style="font-size:0.85rem; color:var(--color-text-muted);">
                        Nenhum supermercado cadastrou preços para "<strong>${termo}</strong>" ainda.<br>
                        Escaneie os cupons das suas últimas compras para alimentar a base!
                    </p>
                </div>
            `;
            return;
        }

        // Renderiza lista de produtos comparados
        container.innerHTML = resultado.produtosAgrupados.map(prod => `
            <div class="glass-card highlight">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                    <div>
                        <h3 style="font-size:1.15rem; color:#fff; margin-bottom:4px;">${prod.nome}</h3>
                        ${prod.ean ? `<span style="font-size:0.75rem; color:var(--color-blue);"><i class="fas fa-barcode"></i> EAN: ${prod.ean}</span>` : ''}
                    </div>
                    ${prod.economiaPct > 0 ? `<span class="badge-economia">Até ${prod.economiaPct}% Mais Barato</span>` : ''}
                </div>

                <!-- Comparação de Preços por Supermercado -->
                <div class="price-ranking-list">
                    ${prod.registros.map((reg, idx) => `
                        <div class="price-ranking-item ${idx === 0 ? 'best-deal' : ''}">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <div class="price-ranking-pos">${idx === 0 ? '⭐' : `#${idx + 1}`}</div>
                                <div>
                                    <div style="font-weight:700; color:#fff; font-size:0.95rem;">${reg.supermercado}</div>
                                    <div style="font-size:0.75rem; color:var(--color-text-muted);">${reg.data} • ${reg.uf}</div>
                                </div>
                            </div>
                            <div style="text-align:right;">
                                <div style="font-family:'Outfit',sans-serif; font-size:1.25rem; font-weight:800; color:${idx === 0 ? 'var(--color-accent)' : '#fff'};">
                                    R$ ${(reg.preco || 0).toFixed(2).replace('.', ',')}
                                </div>
                                ${idx === 0 ? '<span style="font-size:0.7rem; color:var(--color-accent); font-weight:700;">MENOR PREÇO</span>' : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }

    // =========================================================================
    // HISTÓRICO DE CUPONS FISCAIS
    // =========================================================================

    async carregarListaCupons() {
        const container = document.getElementById('container-lista-cupons');
        const badgeTotal = document.getElementById('badge-total-cupons-count');
        if (!container) return;

        const cupons = await DBStorage.listarTodosCupons();
        if (badgeTotal) badgeTotal.textContent = `${cupons.length} nota(s)`;

        if (cupons.length === 0) {
            container.innerHTML = `
                <div class="feed-empty-state" style="padding:2rem; text-align:center;">
                    <div style="font-size:3rem; margin-bottom:10px;">🧾</div>
                    <h3>Nenhum cupom salvo</h3>
                    <p style="font-size:0.85rem; color:var(--color-text-muted);">
                        Use o leitor de QR Code para digitalizar suas notas fiscais de supermercado e padaria.
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = cupons.map(c => `
            <div class="glass-card" style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div style="font-weight:700; color:#fff; font-size:1.05rem;">${c.supermercado}</div>
                    <span class="badge-pill store">${c.data}</span>
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; color:var(--color-text-muted);">
                    <div>📦 ${c.quantidadeItens} produtos</div>
                    <div style="font-family:'Outfit',sans-serif; font-size:1.2rem; font-weight:800; color:var(--color-accent);">
                        R$ ${(parseFloat(c.valorTotal) || 0).toFixed(2).replace('.', ',')}
                    </div>
                </div>

                ${c.achadinhosCount > 0 ? `
                    <div style="margin-top:8px; font-size:0.75rem; color:var(--color-orange);">
                        <i class="fas fa-fire"></i> Contém ${c.achadinhosCount} super achadinho(s) compartilhado(s)!
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    // =========================================================================
    // PERFIL, CONQUISTAS & BACKUP
    // =========================================================================

    async carregarPerfilEConquistas() {
        const perfil = await GamificationEngine.obterEstado();
        if (!perfil) return;

        const tituloNivel = document.getElementById('perfil-titulo-nivel');
        const tagNivel = document.getElementById('perfil-tag-nivel');
        const saldoMoedas = document.getElementById('perfil-saldo-moedas');
        const xpTotal = document.getElementById('perfil-xp-total');
        const barraXp = document.getElementById('barra-progresso-xp');
        const labelXp = document.getElementById('label-progresso-xp');
        const gridConquistas = document.getElementById('container-conquistas-grid');

        if (tituloNivel) tituloNivel.textContent = perfil.titulo || 'Caçador Novato';
        if (tagNivel) tagNivel.textContent = `Nível ${perfil.nivel || 1}`;
        if (saldoMoedas) saldoMoedas.textContent = `${perfil.moedas || 0} 🪙`;
        if (xpTotal) xpTotal.textContent = `${perfil.xp || 0} XP`;

        // Cálculo de progresso para o próximo nível
        const xpPorNivel = 150;
        const xpNoNivelAtual = (perfil.xp || 0) % xpPorNivel;
        const pctProgresso = Math.min(100, Math.round((xpNoNivelAtual / xpPorNivel) * 100));

        if (barraXp) barraXp.style.width = `${pctProgresso}%`;
        if (labelXp) labelXp.textContent = `${pctProgresso}% (${xpNoNivelAtual}/${xpPorNivel} XP)`;

        // Renderiza Grid de Conquistas
        if (gridConquistas) {
            const todas = GamificationEngine.CONQUISTAS_DISPONIVEIS;
            const desbloqueadasIds = new Set((perfil.conquistas || []).map(c => c.id));

            gridConquistas.innerHTML = todas.map(c => {
                const obtida = desbloqueadasIds.has(c.id);
                return `
                    <div style="background:rgba(10,14,28,0.7); border:1px solid ${obtida ? 'var(--border-gold)' : 'var(--border-color)'}; border-radius:var(--radius-md); padding:10px; display:flex; align-items:center; gap:8px; opacity:${obtida ? '1' : '0.4'};">
                        <div style="font-size:1.8rem;">${c.icone}</div>
                        <div>
                            <div style="font-weight:700; font-size:0.82rem; color:${obtida ? 'var(--color-gold-light)' : '#fff'};">${c.nome}</div>
                            <div style="font-size:0.7rem; color:var(--color-text-muted);">${c.desc}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    bindEventosPerfilEBackup() {
        const btnCsv = document.getElementById('btn-exportar-csv');
        if (btnCsv) {
            btnCsv.onclick = () => BackupManager.exportarPrecosCsv();
        }

        const btnJson = document.getElementById('btn-exportar-json');
        if (btnJson) {
            btnJson.onclick = () => BackupManager.exportarBackupJson();
        }

        const inputImportar = document.getElementById('input-importar-json');
        if (inputImportar) {
            inputImportar.onchange = async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                    const res = await BackupManager.importarBackupJson(file);
                    this.mostrarToast(`✓ Backup restaurado com sucesso! ${res.totalPrecos} preços e ${res.totalCupons} cupons importados.`, 'success');
                    await this.atualizarCarteiraUI();
                    await this.carregarPerfilEConquistas();
                } catch (err) {
                    this.mostrarToast('Erro ao importar arquivo de backup.', 'warning');
                }
            };
        }
    }

    // =========================================================================
    // MODAIS & UTILITÁRIOS
    // =========================================================================

    bindEventosModais() {
        const btnCloseCeleb = document.getElementById('btn-fechar-celebracao');
        const modalCeleb = document.getElementById('modal-recompensa-celebracao');
        if (btnCloseCeleb && modalCeleb) {
            btnCloseCeleb.onclick = () => {
                modalCeleb.style.display = 'none';
            };
        }

        // Modal de Colar Chave/Texto SEFAZ
        const btnOpenPaste = document.getElementById('btn-open-paste-modal');
        const modalPaste = document.getElementById('modal-paste-sefaz');
        const btnClosePaste = document.getElementById('btn-fechar-modal-paste');
        const btnCancelPaste = document.getElementById('btn-cancelar-modal-paste');
        const btnProcessPaste = document.getElementById('btn-processar-manual-input');
        const textareaPaste = document.getElementById('textarea-manual-input');

        if (btnOpenPaste && modalPaste) {
            btnOpenPaste.onclick = () => {
                modalPaste.style.display = 'flex';
                if (textareaPaste) {
                    textareaPaste.value = '';
                    textareaPaste.focus();
                }
            };
        }

        const fecharPasteModal = () => {
            if (modalPaste) modalPaste.style.display = 'none';
        };

        if (btnClosePaste) btnClosePaste.onclick = fecharPasteModal;
        if (btnCancelPaste) btnCancelPaste.onclick = fecharPasteModal;

        if (btnProcessPaste) {
            btnProcessPaste.onclick = async () => {
                const texto = textareaPaste ? textareaPaste.value.trim() : '';
                if (!texto) {
                    this.mostrarToast('Por favor, cole a chave de 44 dígitos ou texto da SEFAZ.', 'warning');
                    return;
                }
                fecharPasteModal();
                await this.processarEntradaCupom(texto);
            };
        }
    }

    async atualizarCarteiraUI() {
        const estado = await GamificationEngine.obterEstado();
        const topbarCoins = document.getElementById('topbar-coins-count');
        if (topbarCoins && estado) {
            topbarCoins.textContent = estado.moedas || 0;
        }
    }

    mostrarToast(mensagem, tipo = 'info') {
        const toast = document.getElementById('app-toast');
        if (!toast) return;

        const icones = {
            success: '✅',
            warning: '⚠️',
            info: 'ℹ️'
        };

        toast.innerHTML = `${icones[tipo] || ''} ${mensagem}`;
        toast.style.display = 'block';

        setTimeout(() => {
            toast.style.display = 'none';
        }, 3500);
    }
}

// Inicialização após o DOM estar pronto
document.addEventListener('DOMContentLoaded', () => {
    window.BuscaOfertasInstance = new BuscaOfertasApp();

    // Registro do Service Worker para suporte PWA no celular
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(() => console.log('[PWA] Service Worker registrado com sucesso.'))
            .catch(err => console.warn('[PWA] Falha ao registrar Service Worker:', err));
    }
});
