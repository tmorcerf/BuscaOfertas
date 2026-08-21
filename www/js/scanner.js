/**
 * scanner.js — Controlador de Câmera Dual (QR Code de Cupons & Códigos de Barras EAN de Produtos)
 * Busca Ofertas
 */

export class ScannerController {
    constructor() {
        this.html5QrCode = null;
        this.isScanning = false;
        this.currentMode = 'qrcode'; // 'qrcode' | 'barcode'
        this.elementId = null;
        this.onScanCallback = null;
        this.cameras = [];
        this.currentCameraIndex = 0;
        this.audioCtx = null;
    }

    /**
     * Toca um bipe de confirmação tipo scanner de supermercado via Web Audio API
     */
    tocarBipeSucesso() {
        try {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(1760, this.audioCtx.currentTime); // Tom agudo agradável (Nota A6)
            gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.12);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.start();
            osc.stop(this.audioCtx.currentTime + 0.12);
        } catch (e) {
            // Falha silenciosa de áudio
        }

        // Vibração física no smartphone
        if ('vibrate' in navigator) {
            try {
                navigator.vibrate(100);
            } catch (e) {}
        }
    }

    async listarCameras() {
        try {
            if (typeof Html5Qrcode === 'undefined') return [];
            this.cameras = await Html5Qrcode.getCameras();
            return this.cameras;
        } catch (err) {
            console.warn('[Scanner] Erro ao listar câmeras:', err);
            return [];
        }
    }

    /**
     * Inicia a câmera no modo desejado ('qrcode' para cupom fiscal ou 'barcode' para código de barra EAN)
     */
    async iniciar(elementId, mode = 'qrcode', onScanCallback) {
        if (this.isScanning) {
            await this.parar();
        }

        this.elementId = elementId;
        this.currentMode = mode;
        this.onScanCallback = onScanCallback;

        if (typeof Html5Qrcode === 'undefined') {
            throw new Error('Biblioteca html5-qrcode não carregada.');
        }

        this.html5QrCode = new Html5Qrcode(elementId);
        await this.listarCameras();

        // Configuração do leitor conforme o modo
        const isBarcode = mode === 'barcode';
        const config = {
            fps: 15,
            qrbox: (w, h) => {
                const min = Math.min(w, h);
                if (isBarcode) {
                    // Retângulo horizontal para código de barra EAN
                    return { width: Math.floor(w * 0.85), height: Math.floor(h * 0.35) };
                } else {
                    // Quadrado para QR Code
                    const size = Math.floor(min * 0.75);
                    return { width: size, height: size };
                }
            },
            aspectRatio: 1.0,
            formatsToSupport: isBarcode 
                ? [
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E
                  ]
                : [
                    Html5QrcodeSupportedFormats.QR_CODE
                  ]
        };

        this.processandoLeitura = false;
        this.cameraConfig = { facingMode: 'environment' };

        try {
            await this.html5QrCode.start(
                this.cameraConfig,
                config,
                async (decodedText, result) => {
                    // Evita disparos múltiplos e loops contínuos
                    if (this.processandoLeitura) return;
                    this.processandoLeitura = true;

                    this.tocarBipeSucesso();

                    // Pausa temporariamente a câmera enquanto processa a leitura
                    try {
                        if (this.html5QrCode && this.html5QrCode.pause) {
                            this.html5QrCode.pause();
                        }
                    } catch (e) {}

                    if (this.onScanCallback) {
                        try {
                            await this.onScanCallback(decodedText, this.currentMode, result);
                        } finally {
                            // Libera após 2.5 segundos para nova leitura caso não tenha aberto modal
                            setTimeout(() => {
                                this.processandoLeitura = false;
                                try {
                                    if (this.html5QrCode && this.html5QrCode.resume && this.isScanning) {
                                        this.html5QrCode.resume();
                                    }
                                } catch (e) {}
                            }, 2500);
                        }
                    }
                },
                () => {} // Frame sem detecção
            );

            this.isScanning = true;
            return true;
        } catch (err) {
            console.warn('[Scanner] Falha com facingMode environment, tentando por ID de câmera...', err);
            
            if (this.cameras.length > 0) {
                const cameraId = this.cameras[this.currentCameraIndex].id;
                await this.html5QrCode.start(
                    cameraId,
                    config,
                    async (decodedText, result) => {
                        if (this.processandoLeitura) return;
                        this.processandoLeitura = true;

                        this.tocarBipeSucesso();
                        try {
                            if (this.html5QrCode && this.html5QrCode.pause) {
                                this.html5QrCode.pause();
                            }
                        } catch (e) {}

                        if (this.onScanCallback) {
                            try {
                                await this.onScanCallback(decodedText, this.currentMode, result);
                            } finally {
                                setTimeout(() => {
                                    this.processandoLeitura = false;
                                    try {
                                        if (this.html5QrCode && this.html5QrCode.resume && this.isScanning) {
                                            this.html5QrCode.resume();
                                        }
                                    } catch (e) {}
                                }, 2500);
                            }
                        }
                    },
                    () => {}
                );
                this.isScanning = true;
                return true;
            }
            throw err;
        }
    }

    async alternarModo(novoModo) {
        if (this.currentMode === novoModo && this.isScanning) return;
        const callback = this.onScanCallback;
        const elId = this.elementId;
        await this.parar();
        if (elId) {
            await this.iniciar(elId, novoModo, callback);
        }
    }

    async alternarCamera() {
        if (!this.isScanning || this.cameras.length < 2) return false;

        this.currentCameraIndex = (this.currentCameraIndex + 1) % this.cameras.length;
        const nextCameraId = this.cameras[this.currentCameraIndex].id;

        const mode = this.currentMode;
        const callback = this.onScanCallback;
        const elId = this.elementId;

        await this.parar();
        this.html5QrCode = new Html5Qrcode(elId);

        await this.html5QrCode.start(
            nextCameraId,
            { fps: 15, qrbox: 250 },
            (decodedText, result) => {
                this.tocarBipeSucesso();
                if (callback) callback(decodedText, mode, result);
            },
            () => {}
        );

        this.isScanning = true;
        return true;
    }

    async parar() {
        if (this.html5QrCode && this.isScanning) {
            try {
                await this.html5QrCode.stop();
                this.html5QrCode.clear();
            } catch (err) {
                console.warn('[Scanner] Erro ao parar câmera:', err);
            }
        }
        this.isScanning = false;
    }
}
