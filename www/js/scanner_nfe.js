/**
 * scanner_nfe.js — Controlador principal da tela de Importação de NF-e / NFC-e
 * Módulo: Corta Gastos
 */

import { auth, db } from '../../../js/firebase_config.js';
import { SessionManager } from '../../../js/session.js';
import { SyncEngine } from '../../../js/sync_engine.js';
import { ChaveParser } from './chave_parser.js';
import { ScannerController } from './scanner.js';
import { NfeGeminiService } from './nfe_gemini.js';
import { NfeSyncEngine } from './nfe_sync.js';

class ScannerNfePage {
    constructor() {
        this.groupId = null;
        this.scanner = new ScannerController();
        this.contas = [];
        this.categorias = {};
        this.notaProcessada = null;
        this.lancamentosCandidatos = [];
        this.tipoVinculoSelecionado = 'novo';
        this.lancamentoVinculadoId = null;

        this.init();
    }

    async init() {
        console.log('[ScannerNfePage] Inicializando...');
        this.groupId = await SessionManager.getGroupId();

        if (!this.groupId) {
            console.warn('[ScannerNfePage] groupId não encontrado.');
            return;
        }

        // Carrega Contas e Categorias
        await this.carregarContas();
        await this.carregarCategorias();

        this.bindEvents();
        this.detectarDispositivoELayout();
    }

    async carregarContas() {
        try {
            this.contas = await SyncEngine.getContas(this.groupId);
            const selectConta = document.getElementById('select-conta-nfe');
            if (selectConta) {
                selectConta.innerHTML = '<option value="" disabled selected>Selecione a conta de pagamento...</option>';
                this.contas.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.nome || c.id;
                    opt.textContent = `${c.nome} (${c.banco || c.tipo || 'Conta'})`;
                    selectConta.appendChild(opt);
                });
                if (this.contas.length > 0) selectConta.selectedIndex = 1;
            }
        } catch (e) {
            console.error('[ScannerNfePage] Erro ao carregar contas:', e);
        }
    }

    async carregarCategorias() {
        try {
            this.categorias = await SyncEngine.getCategorias(this.groupId);
        } catch (e) {
            console.error('[ScannerNfePage] Erro ao carregar categorias:', e);
        }
    }

    detectarDispositivoELayout() {
        const isMobile = window.innerWidth <= 900;
        const sectionCamera = document.getElementById('section-camera-scanner');
        const inputChave = document.getElementById('input-chave-acesso');

        if (isMobile) {
            // Em celular, abre a câmera automaticamente para escanear QR Code na hora
            this.iniciarCamera();
        } else {
            // Em desktop / widescreen, foca no input de chave
            if (inputChave) inputChave.focus();
        }
    }

    bindEvents() {
        // Formatação dinâmica de 44 dígitos no input
        const inputChave = document.getElementById('input-chave-acesso');
        if (inputChave) {
            inputChave.addEventListener('input', (e) => {
                const limpo = e.target.value.replace(/\D/g, '').substring(0, 44);
                e.target.value = ChaveParser.formatarChave(limpo);
                this.atualizarStatusValidadeChave(limpo);
            });

            inputChave.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.processarChaveManual();
                }
            });
        }

        // Botão Colar da Área de Transferência
        const btnColar = document.getElementById('btn-colar-chave');
        if (btnColar) {
            btnColar.onclick = async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    if (text && inputChave) {
                        const parsed = ChaveParser.extrairChave(text);
                        if (parsed) {
                            inputChave.value = ChaveParser.formatarChave(parsed.chave);
                            this.atualizarStatusValidadeChave(parsed.chave);
                            this.processarEntrada(parsed.chave);
                        } else {
                            this.mostrarFeedback('Nenhuma chave de 44 dígitos válida encontrada na área de transferência.', 'warning');
                        }
                    }
                } catch (err) {
                    this.mostrarFeedback('Não foi possível acessar a área de transferência. Cole manualmente.', 'warning');
                }
            };
        }

        // Botão Consultar Chave
        const btnProcessar = document.getElementById('btn-processar-chave');
        if (btnProcessar) {
            btnProcessar.onclick = () => this.processarChaveManual();
        }

        // Botão Alternar Câmera
        const btnToggleCam = document.getElementById('btn-toggle-camera');
        if (btnToggleCam) {
            btnToggleCam.onclick = () => {
                const wrapper = document.getElementById('section-camera-scanner');
                if (this.scanner.isScanning) {
                    this.scanner.parar();
                    if (wrapper) wrapper.style.display = 'none';
                } else {
                    if (wrapper) wrapper.style.display = 'block';
                    this.iniciarCamera();
                }
            };
        }

        // Botão Flip Câmera (Frontal / Traseira)
        const btnFlipCam = document.getElementById('btn-flip-cam');
        if (btnFlipCam) {
            btnFlipCam.onclick = () => this.scanner.alternarCamera();
        }

        // Modal de Colar Texto SEFAZ
        const btnAbrirModalSefaz = document.getElementById('btn-abrir-modal-texto-sefaz');
        const modalSefaz = document.getElementById('modal-colar-sefaz');
        const btnFecharModalSefaz = document.getElementById('btn-fechar-modal-sefaz');
        const btnCancelarModalSefaz = document.getElementById('btn-cancelar-modal-sefaz');
        const btnExtrairTextoSefaz = document.getElementById('btn-extrair-texto-sefaz');

        if (btnAbrirModalSefaz && modalSefaz) {
            btnAbrirModalSefaz.onclick = async () => {
                // 1. Tenta ler direto da área de transferência
                try {
                    const clipText = await navigator.clipboard.readText();
                    if (clipText && clipText.length > 20) {
                        const uf = this.notaProcessada?.uf?.sigla || 'RJ';
                        const resExtracao = SefazScripts.extrairTexto(clipText, uf);
                        if (resExtracao.itens && resExtracao.itens.length > 0) {
                            this.notaProcessada.itens = resExtracao.itens;
                            this.notaProcessada.valorTotal = resExtracao.valorTotal || this.notaProcessada.valorTotal;
                            if (resExtracao.estabelecimento?.nome && (!this.notaProcessada.estabelecimento.nome || this.notaProcessada.estabelecimento.nome.includes('('))) {
                                this.notaProcessada.estabelecimento.nome = resExtracao.estabelecimento.nome;
                            }
                            this.renderizarConferencia();
                            this.mostrarFeedback(`✓ ${resExtracao.itens.length} produtos e valor total de R$ ${(this.notaProcessada.valorTotal || 0).toFixed(2).replace('.', ',')} extraídos da área de transferência!`, 'success');
                            return;
                        }
                    }
                } catch (e) {
                    console.log('Clipboard direto bloqueado, abrindo modal...');
                }

                // 2. Se não conseguiu ler direto, abre o modal
                modalSefaz.style.display = 'flex';
                const ta = document.getElementById('textarea-texto-sefaz');
                if (ta) {
                    ta.value = '';
                    ta.focus();
                }
            };
        }

        const fecharModalSefaz = () => {
            if (modalSefaz) modalSefaz.style.display = 'none';
        };

        if (btnFecharModalSefaz) btnFecharModalSefaz.onclick = fecharModalSefaz;
        if (btnCancelarModalSefaz) btnCancelarModalSefaz.onclick = fecharModalSefaz;

        if (btnExtrairTextoSefaz) {
            btnExtrairTextoSefaz.onclick = () => {
                const ta = document.getElementById('textarea-texto-sefaz');
                const texto = ta ? ta.value.trim() : '';
                if (!texto) {
                    this.mostrarFeedback('Cole o texto copiado da página da SEFAZ.', 'warning');
                    return;
                }

                const uf = this.notaProcessada?.uf?.sigla || 'RJ';
                const resExtracao = SefazScripts.extrairTexto(texto, uf);

                if (resExtracao.itens && resExtracao.itens.length > 0) {
                    this.notaProcessada.itens = resExtracao.itens;
                    this.notaProcessada.valorTotal = resExtracao.valorTotal || this.notaProcessada.valorTotal;

                    if (resExtracao.estabelecimento?.nome && (!this.notaProcessada.estabelecimento.nome || this.notaProcessada.estabelecimento.nome.includes('('))) {
                        this.notaProcessada.estabelecimento.nome = resExtracao.estabelecimento.nome;
                    }

                    fecharModalSefaz();
                    this.renderizarConferencia();
                    this.mostrarFeedback(`✓ ${resExtracao.itens.length} produtos e valor total de R$ ${(this.notaProcessada.valorTotal || 0).toFixed(2).replace('.', ',')} extraídos com sucesso!`, 'success');
                } else if (resExtracao.valorTotal > 0) {
                    this.notaProcessada.valorTotal = resExtracao.valorTotal;
                    fecharModalSefaz();
                    this.renderizarConferencia();
                    this.mostrarFeedback(`✓ Valor total de R$ ${this.notaProcessada.valorTotal.toFixed(2).replace('.', ',')} extraído!`, 'success');
                } else {
                    this.mostrarFeedback('Não foi possível identificar o padrão de produtos no texto colado. Verifique se copiou a tabela de itens da SEFAZ.', 'warning');
                }
            };
        }

        // Adicionar Item Manual
        const btnAddItem = document.getElementById('btn-adicionar-item-manual');
        if (btnAddItem) {
            btnAddItem.onclick = () => this.adicionarItemManual();
        }

        // Botões de Confirmação e Descarte
        const btnSalvar = document.getElementById('btn-salvar-nota');
        if (btnSalvar) {
            btnSalvar.onclick = () => this.salvarNotaFinal();
        }

        const btnDescartar = document.getElementById('btn-descartar-nota');
        if (btnDescartar) {
            btnDescartar.onclick = () => this.resetarParaNovaLeitura();
        }
    }

    atualizarStatusValidadeChave(chaveLimpa) {
        const badge = document.getElementById('chave-validade-badge');
        if (!badge) return;

        if (chaveLimpa.length === 0) {
            badge.style.display = 'none';
            return;
        }

        badge.style.display = 'inline-flex';
        if (chaveLimpa.length < 44) {
            badge.className = 'badge-pill warning';
            badge.textContent = `${chaveLimpa.length}/44 dígitos`;
        } else {
            const dvOk = ChaveParser.validarDV(chaveLimpa);
            if (dvOk) {
                badge.className = 'badge-pill accent';
                badge.textContent = '✓ Chave Válida (Módulo 11 OK)';
            } else {
                badge.className = 'badge-pill warning';
                badge.textContent = '❌ Dígito Verificador Inválido';
            }
        }
    }

    async iniciarCamera() {
        const wrapper = document.getElementById('section-camera-scanner');
        if (wrapper) wrapper.style.display = 'block';

        try {
            await this.scanner.iniciar('qr-reader-viewfinder', (decodedText) => {
                console.log('[ScannerNfePage] QR Code detectado:', decodedText);
                this.processarEntrada(decodedText);
            });
        } catch (err) {
            console.warn('[ScannerNfePage] Não foi possível iniciar câmera:', err);
            this.mostrarFeedback('Não foi possível acessar a câmera. Você pode digitar ou colar a chave de acesso.', 'warning');
        }
    }

    async processarChaveManual() {
        const inputChave = document.getElementById('input-chave-acesso');
        if (!inputChave) return;
        const raw = inputChave.value.trim();
        if (!raw) {
            this.mostrarFeedback('Por favor, digite ou cole a chave de acesso de 44 dígitos.', 'warning');
            return;
        }
        await this.processarEntrada(raw);
    }

    async processarEntrada(rawInput) {
        this.setCarregando(true, 'Processando dados da nota fiscal...');

        // 1. Tenta extrair produtos caso o usuário tenha colado texto direto da página da SEFAZ
        let extracaoTextoPrevia = null;
        if (rawInput.length > 50 && rawInput.includes('\n')) {
            extracaoTextoPrevia = SefazScripts.extrairTexto(rawInput, 'RJ');
        }

        const res = ChaveParser.processar(rawInput);
        if (!res.sucesso) {
            this.setCarregando(false);
            this.mostrarFeedback(res.erro, 'error');
            return;
        }

        const dadosChave = res.dados;
        console.log('[ScannerNfePage] Chave parseada com sucesso:', dadosChave);

        // 2. Verifica duplicidade no Firestore
        this.setCarregando(true, 'Verificando duplicidade no histórico...');
        const dup = await NfeSyncEngine.verificarNotaExistente(this.groupId, dadosChave.chave);
        if (dup.existe) {
            this.setCarregando(false);
            this.mostrarFeedback(`⚠️ Esta nota fiscal já foi importada anteriormente em ${new Date(dup.nota.criadoEm).toLocaleDateString('pt-BR')}.`, 'warning');
            return;
        }

        const dataFormatada = `${dadosChave.emissao.ano}-${dadosChave.emissao.mes}-01`;

        this.notaProcessada = {
            chave: dadosChave.chave,
            chaveFormatada: dadosChave.chaveFormatada,
            uf: dadosChave.uf,
            cnpj: dadosChave.cnpj.formatado,
            data: dataFormatada,
            emissao: dadosChave.emissao,
            modelo: dadosChave.modelo,
            numeroNota: dadosChave.numeroNota,
            serie: dadosChave.serie,
            isContingencia: dadosChave.isContingencia,
            estabelecimento: {
                nome: extracaoTextoPrevia?.estabelecimento?.nome || `Estabelecimento (${dadosChave.cnpj.formatado})`,
                cnpj: dadosChave.cnpj.formatado,
                categoria: 'Compras'
            },
            valorTotal: extracaoTextoPrevia?.valorTotal || 0,
            itens: extracaoTextoPrevia?.itens || []
        };

        // 3. Busca lançamentos candidatos para vínculo
        this.lancamentosCandidatos = await NfeSyncEngine.buscarLancamentosCandidatos(
            this.groupId,
            dataFormatada,
            this.notaProcessada.valorTotal
        );

        this.setCarregando(false);
        this.renderizarConferencia();
    }

    async processarUploadImagem(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        this.setCarregando(true, 'Lendo cupom fiscal via Gemini Vision...');

        try {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64WithHeader = reader.result;
                const base64 = base64WithHeader.split(',')[1];
                const mimeType = file.type || 'image/jpeg';

                const categoriasStr = JSON.stringify(this.categorias || {});
                const resVision = await NfeGeminiService.extrairNotaDeImagem(base64, mimeType, categoriasStr);

                console.log('[ScannerNfePage] Resultado Gemini Vision:', resVision);

                const dataHoje = new Date().toISOString().split('T')[0];
                const chaveAleatoria = 'IMG_' + Date.now();

                this.notaProcessada = {
                    chave: chaveAleatoria,
                    chaveFormatada: 'Importação via Foto',
                    uf: { sigla: 'XX', nome: 'Brasil' },
                    cnpj: resVision.estabelecimento?.cnpj || 'Não identificado',
                    data: resVision.data || dataHoje,
                    emissao: { mesAno: 'Foto' },
                    modelo: { nome: 'Cupom Físico' },
                    numeroNota: '',
                    serie: '',
                    isContingencia: false,
                    estabelecimento: {
                        nome: resVision.estabelecimento?.nome || 'Estabelecimento Comercial',
                        cnpj: resVision.estabelecimento?.cnpj || '',
                        categoria: 'Alimentação'
                    },
                    valorTotal: parseFloat(resVision.valorTotal) || 0,
                    itens: resVision.itens || []
                };

                this.lancamentosCandidatos = await NfeSyncEngine.buscarLancamentosCandidatos(
                    this.groupId,
                    this.notaProcessada.data,
                    this.notaProcessada.valorTotal
                );

                this.setCarregando(false);
                this.renderizarConferencia();
            };
            reader.readAsDataURL(file);
        } catch (e) {
            console.error('[ScannerNfePage] Erro no upload:', e);
            this.setCarregando(false);
            this.mostrarFeedback('Erro ao analisar imagem da nota fiscal com IA.', 'error');
        }
    }

    renderizarConferencia() {
        const wrapper = document.getElementById('card-conferencia-wrapper');
        const inputSection = document.getElementById('section-input-area');
        if (!wrapper) return;

        if (inputSection) inputSection.style.display = 'none';
        wrapper.style.display = 'block';

        const nota = this.notaProcessada;

        document.getElementById('conf-estab-nome').textContent = nota.estabelecimento.nome;
        document.getElementById('conf-estab-cnpj').textContent = `CNPJ: ${nota.cnpj}`;
        document.getElementById('conf-estab-uf').textContent = `📍 ${nota.uf.nome || 'Brasil'} (${nota.uf.sigla || 'BR'})`;
        document.getElementById('conf-estab-modelo').textContent = `📄 ${nota.modelo.nome || 'NFC-e'}`;
        document.getElementById('conf-estab-data').textContent = `📅 ${nota.emissao.mesAno || ''}`;

        // Link de consulta oficial na SEFAZ
        const btnSefaz = document.getElementById('conf-btn-sefaz-link');
        if (btnSefaz) {
            let urlSefaz = `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=completa&nfe=${nota.chave}`;
            if (nota.uf?.sigla === 'RJ') urlSefaz = `http://www4.fazenda.rj.gov.br/consultaNFCe/qrcode?p=${nota.chave}|2|1|1`;
            if (nota.uf?.sigla === 'SP') urlSefaz = `https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=${nota.chave}|2|1|1`;
            if (nota.uf?.sigla === 'MG') urlSefaz = `https://nfce.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=${nota.chave}`;
            btnSefaz.href = urlSefaz;
        }

        // Valor Total Editável
        const inputValorTotal = document.getElementById('input-conf-valor-total');
        if (inputValorTotal) {
            inputValorTotal.value = (parseFloat(nota.valorTotal) || 0).toFixed(2);
            inputValorTotal.oninput = async (e) => {
                const novoVal = parseFloat(e.target.value) || 0;
                this.notaProcessada.valorTotal = novoVal;
                this.lancamentosCandidatos = await NfeSyncEngine.buscarLancamentosCandidatos(
                    this.groupId,
                    this.notaProcessada.data,
                    novoVal
                );
                this.renderizarOpcoesVinculo();
            };
        }

        // Alerta de contingência se aplicável
        const alertaContingencia = document.getElementById('conf-alerta-contingencia');
        if (alertaContingencia) {
            alertaContingencia.style.display = nota.isContingencia ? 'block' : 'none';
        }

        // Tabela de Itens
        this.renderizarTabelaItens();

        // Renderiza opções de Vínculo de Lançamento
        this.renderizarOpcoesVinculo();
    }

    renderizarTabelaItens() {
        const tbody = document.getElementById('conf-itens-tbody');
        if (!tbody) return;

        const itens = this.notaProcessada.itens || [];

        if (itens.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:rgba(255,255,255,0.4);">Nenhum item discriminado. Digite o valor total pago acima ou adicione itens manualmente.</td></tr>`;
            return;
        }

        tbody.innerHTML = itens.map((it, idx) => `
            <tr>
                <td style="color:rgba(255,255,255,0.5);">${idx + 1}</td>
                <td><strong>${it.descricao}</strong></td>
                <td>${it.quantidade} ${it.unidade || 'UN'}</td>
                <td style="text-align:right;">R$ ${(parseFloat(it.valorUnitario) || 0).toFixed(2).replace('.', ',')}</td>
                <td style="text-align:right; font-weight:700; color:var(--color-accent);">R$ ${(parseFloat(it.valorTotal) || 0).toFixed(2).replace('.', ',')}</td>
                <td style="text-align:center;">
                    <button type="button" class="btn-remover-item" data-index="${idx}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.9rem;" title="Remover item">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        // Bind delete buttons
        tbody.querySelectorAll('.btn-remover-item').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                this.removerItem(idx);
            };
        });
    }

    adicionarItemManual() {
        const desc = prompt('Nome do produto:');
        if (!desc) return;
        const valStr = prompt('Valor total do item (R$):', '10.00');
        const val = parseFloat(valStr?.replace(',', '.')) || 0;
        if (val <= 0) return;

        if (!this.notaProcessada.itens) this.notaProcessada.itens = [];
        this.notaProcessada.itens.push({
            codigo: '',
            descricao: desc,
            quantidade: 1,
            unidade: 'UN',
            valorUnitario: val,
            valorTotal: val,
            categoria: 'Alimentação',
            subcategoria: 'Supermercado'
        });

        // Recalcula total da nota
        const somaItens = this.notaProcessada.itens.reduce((acc, it) => acc + (parseFloat(it.valorTotal) || 0), 0);
        this.notaProcessada.valorTotal = somaItens;

        const inputValorTotal = document.getElementById('input-conf-valor-total');
        if (inputValorTotal) inputValorTotal.value = somaItens.toFixed(2);

        this.renderizarTabelaItens();
    }

    removerItem(index) {
        if (!this.notaProcessada.itens) return;
        this.notaProcessada.itens.splice(index, 1);

        const somaItens = this.notaProcessada.itens.reduce((acc, it) => acc + (parseFloat(it.valorTotal) || 0), 0);
        this.notaProcessada.valorTotal = somaItens;

        const inputValorTotal = document.getElementById('input-conf-valor-total');
        if (inputValorTotal) inputValorTotal.value = somaItens.toFixed(2);

        this.renderizarTabelaItens();
    }

    renderizarOpcoesVinculo() {
        const box = document.getElementById('conf-vinculo-container');
        if (!box) return;

        const candidatos = this.lancamentosCandidatos || [];

        let html = `
            <h4 style="margin: 0 0 10px 0; font-size: 1rem; color: #fff; display:flex; align-items:center; gap:8px;">
                <i class="fas fa-link" style="color:var(--color-blue);"></i> Destino Financeiro do Gasto
            </h4>
            <div class="vinculo-options-row">
                <label class="vinculo-radio-card ${this.tipoVinculoSelecionado === 'novo' ? 'selected' : ''}" id="card-opt-novo">
                    <input type="radio" name="tipo_vinculo" value="novo" ${this.tipoVinculoSelecionado === 'novo' ? 'checked' : ''} style="accent-color:var(--color-accent);">
                    <div>
                        <strong>➕ Criar Novo Lançamento</strong>
                        <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">Registrar compra na conta selecionada (Ideal para notas lidas na hora pelo celular)</div>
                    </div>
                </label>
        `;

        if (candidatos.length > 0) {
            html += `
                <label class="vinculo-radio-card ${this.tipoVinculoSelecionado === 'vincular' ? 'selected' : ''}" id="card-opt-vincular">
                    <input type="radio" name="tipo_vinculo" value="vincular" ${this.tipoVinculoSelecionado === 'vincular' ? 'checked' : ''} style="accent-color:var(--color-accent);">
                    <div>
                        <strong>🔗 Vincular ao Extrato Existente</strong>
                        <div style="font-size: 0.8rem; color: var(--color-accent);">Evita duplicidade! Converte categoria do extrato para "Compras".</div>
                    </div>
                </label>
            `;
        }

        html += `</div>`;

        // Se houver candidatos e selecionou vincular, exibe lista
        if (candidatos.length > 0) {
            html += `
                <div id="wrapper-select-lancamento" style="margin-top: 10px; display: ${this.tipoVinculoSelecionado === 'vincular' ? 'block' : 'none'};">
                    <label style="font-size: 0.85rem; color: rgba(255,255,255,0.7); margin-bottom: 5px; display: block;">Selecione o lançamento do extrato correspondente:</label>
                    <select id="select-lancamento-vinculo" class="chave-input-large" style="font-size: 0.9rem; padding: 8px 12px; font-family:'Outfit',sans-serif;">
                        ${candidatos.map(c => `
                            <option value="${c.id}">📅 ${c.data} • ${c.descricao} • R$ ${(Math.abs(c.valor) || 0).toFixed(2).replace('.', ',')} (${c.conta || 'Conta'})</option>
                        `).join('')}
                    </select>
                </div>
            `;
        }

        box.innerHTML = html;

        // Eventos de clique nas opções
        const optNovo = document.getElementById('card-opt-novo');
        const optVinc = document.getElementById('card-opt-vincular');
        const selectContaWrapper = document.getElementById('wrapper-select-conta');

        if (optNovo) {
            optNovo.onclick = () => {
                this.tipoVinculoSelecionado = 'novo';
                this.renderizarOpcoesVinculo();
                if (selectContaWrapper) selectContaWrapper.style.display = 'block';
            };
        }

        if (optVinc) {
            optVinc.onclick = () => {
                this.tipoVinculoSelecionado = 'vincular';
                this.renderizarOpcoesVinculo();
                if (selectContaWrapper) selectContaWrapper.style.display = 'none';
            };
        }
    }

    async salvarNotaFinal() {
        if (!this.notaProcessada) return;

        const inputValor = document.getElementById('input-conf-valor-total');
        if (inputValor) {
            const parsedVal = parseFloat(inputValor.value) || 0;
            this.notaProcessada.valorTotal = parsedVal;
        }

        if (this.notaProcessada.valorTotal <= 0) {
            this.mostrarFeedback('Por favor, informe o valor total da compra antes de salvar.', 'warning');
            if (inputValor) inputValor.focus();
            return;
        }

        const selectConta = document.getElementById('select-conta-nfe');
        const contaSelecionada = selectConta ? selectConta.value : 'Geral';

        let lancamentoIdVinculado = null;
        if (this.tipoVinculoSelecionado === 'vincular') {
            const selectLanc = document.getElementById('select-lancamento-vinculo');
            lancamentoIdVinculado = selectLanc ? selectLanc.value : null;
        }

        this.setCarregando(true, 'Gravando nota, atualizando extrato e registrando histórico de preços...');

        try {
            const res = await NfeSyncEngine.salvarNotaCompleta({
                groupId: this.groupId,
                notaDados: this.notaProcessada,
                tipoVinculo: this.tipoVinculoSelecionado,
                lancamentoIdVinculado: lancamentoIdVinculado,
                contaSelecionada: contaSelecionada
            });

            this.setCarregando(false);
            this.mostrarFeedback(`🎉 Nota importada com sucesso! ${res.totalItens} produtos salvos na base histórica de preços.`, 'success');

            // Notifica Eduardo lateral
            this.notificarEduardoSucesso(this.notaProcessada, res.totalItens);

            setTimeout(() => {
                this.resetarParaNovaLeitura();
            }, 2500);
        } catch (e) {
            console.error('[ScannerNfePage] Erro ao salvar nota:', e);
            this.setCarregando(false);
            this.mostrarFeedback('Erro ao salvar nota fiscal no Firestore.', 'error');
        }
    }

    notificarEduardoSucesso(nota, totalItens) {
        const feed = document.getElementById('eduardo-feed');
        if (!feed) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'msg eduardo';
        msgDiv.style.cssText = 'background: rgba(24, 28, 48, 0.85); border: 1px solid rgba(0, 255, 170, 0.2); border-radius: 14px; padding: 12px 16px; margin-bottom: 12px; color: #fff; font-size: 0.9rem;';
        msgDiv.innerHTML = `
            <strong><i class="fas fa-check-circle" style="color:var(--color-accent);"></i> Nota Fiscal Importada!</strong><br>
            Estabelecimento: <strong>${nota.estabelecimento.nome}</strong><br>
            ${totalItens > 0 ? `📦 ${totalItens} itens adicionados ao seu histórico de preços.` : 'Lançamento financeiro sincronizado.'}
        `;
        feed.appendChild(msgDiv);
        feed.scrollTop = feed.scrollHeight;
    }

    resetarParaNovaLeitura() {
        this.notaProcessada = null;
        this.lancamentosCandidatos = [];
        this.tipoVinculoSelecionado = 'novo';

        const wrapper = document.getElementById('card-conferencia-wrapper');
        const inputSection = document.getElementById('section-input-area');
        const inputChave = document.getElementById('input-chave-acesso');

        if (wrapper) wrapper.style.display = 'none';
        if (inputSection) inputSection.style.display = 'block';
        if (inputChave) {
            inputChave.value = '';
            this.atualizarStatusValidadeChave('');
            inputChave.focus();
        }
    }

    setCarregando(ativo, texto = 'Carregando...') {
        const loader = document.getElementById('nfe-global-loader');
        const label = document.getElementById('nfe-loader-label');
        if (loader) loader.style.display = ativo ? 'flex' : 'none';
        if (label) label.textContent = texto;
    }

    mostrarFeedback(mensagem, tipo = 'info') {
        const toast = document.getElementById('nfe-toast');
        if (!toast) return;

        const icones = {
            success: '✅',
            warning: '⚠️',
            error: '❌',
            info: 'ℹ️'
        };

        toast.innerHTML = `${icones[tipo] || ''} ${mensagem}`;
        toast.className = `toast-notif ${tipo}`;
        toast.style.display = 'block';

        setTimeout(() => {
            toast.style.display = 'none';
        }, 4000);
    }
}

// Inicializa a página
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.ScannerNfeInstance = new ScannerNfePage();
    });
} else {
    window.ScannerNfeInstance = new ScannerNfePage();
}
