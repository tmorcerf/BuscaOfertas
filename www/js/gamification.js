/**
 * gamification.js — Motor de Gamificação, Economia de Moedas e Detecção de "Achadinhos"
 * Busca Ofertas
 */

import { DBStorage } from './db_storage.js';

export class GamificationEngine {
    static CUSTO_BUSCA_PRECO = 2; // Custo de moedas para pesquisar preços
    static CUSTO_LISTA_COMPRAS = 5; // Custo para otimizar carrinho completo
    static RECOMPENSA_CUPOM_BASE = 15; // Moedas por cupom escaneado
    static RECOMPENSA_ITEM = 1; // Moeda por item cadastrado
    static RECOMPENSA_ACHADINHO = 30; // Bônus de moedas por encontrar uma pechincha
    static XP_POR_CUPOM = 50;
    static XP_POR_ACHADINHO = 100;
    static XP_POR_BUSCA = 10;

    static NIVEIS = [
        { nivel: 1, xpMin: 0, titulo: 'Caçador Novato', icone: '🥉' },
        { nivel: 2, xpMin: 150, titulo: 'Explorador de Preços', icone: '🥈' },
        { nivel: 3, xpMin: 400, titulo: 'Mestre das Promoções', icone: '🥇' },
        { nivel: 4, xpMin: 800, titulo: 'Radar de Ofertas', icone: '💎' },
        { nivel: 5, xpMin: 1500, titulo: 'Lenda dos Achadinhos', icone: '👑' }
    ];

    static CONQUISTAS_DISPONIVEIS = [
        { id: 'primeiro_login', nome: 'Bem-vindo ao Jogo', desc: 'Iniciou no Busca Ofertas', icone: '🎁' },
        { id: 'primeiro_cupom', nome: 'Primeira Mineração', desc: 'Escaneou seu 1º cupom fiscal', icone: '🧾' },
        { id: 'primeiro_achadinho', nome: 'Olho Clínico', desc: 'Encontrou seu 1º Achadinho com super desconto', icone: '🔥' },
        { id: 'caçador_cinco', nome: 'Colecionador de Cupons', desc: 'Escaneou 5 cupons fiscais', icone: '📦' },
        { id: 'explorador_precos', nome: 'Economizador Nato', desc: 'Fez 10 buscas de preços por código de barra', icone: '🔍' },
        { id: 'comunitario', nome: 'Amigo da Comunidade', desc: 'Curtiu 5 ofertas no feed social', icone: '❤️' }
    ];

    /**
     * Retorna o estado atual do jogador
     */
    static async obterEstado() {
        let estado = await DBStorage.obterGamificacao();
        if (!estado) {
            await DBStorage.verificarDadosIniciais();
            estado = await DBStorage.obterGamificacao();
        }
        return estado;
    }

    /**
     * Verifica bônus diário de acesso
     */
    static async checarBonusDiario() {
        const estado = await this.obterEstado();
        const hoje = new Date().toISOString().split('T')[0];

        if (estado.ultimoAcesso !== hoje) {
            const ontem = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            const manteveStreak = estado.ultimoAcesso === ontem;
            
            estado.streakDias = manteveStreak ? (estado.streakDias || 1) + 1 : 1;
            estado.ultimoAcesso = hoje;
            estado.moedas += 10; // +10 moedas de bônus diário
            estado.xp += 20;

            await this._recalcularNivel(estado);
            await DBStorage.salvarGamificacao(estado);

            return {
                bonusRecebido: true,
                moedasGanhas: 10,
                streak: estado.streakDias,
                mensagem: `🎁 Bônus Diário! Você ganhou +10 Moedas (Sequência: ${estado.streakDias} dias consecutivos).`
            };
        }

        return { bonusRecebido: false };
    }

    /**
     * Recompensa o usuário por escanear um cupom fiscal
     */
    static async processarRecompensaCupom(totalItens, achadinhosDetectados = []) {
        const estado = await this.obterEstado();

        const moedasItens = totalItens * this.RECOMPENSA_ITEM;
        const moedasAchadinhos = achadinhosDetectados.length * this.RECOMPENSA_ACHADINHO;
        const totalMoedas = this.RECOMPENSA_CUPOM_BASE + moedasItens + moedasAchadinhos;

        const totalXp = this.XP_POR_CUPOM + (achadinhosDetectados.length * this.XP_POR_ACHADINHO);

        estado.moedas += totalMoedas;
        estado.xp += totalXp;
        estado.cuponsEscaneados = (estado.cuponsEscaneados || 0) + 1;
        estado.achadinhosEncontrados = (estado.achadinhosEncontrados || 0) + achadinhosDetectados.length;

        // Checa conquistas
        const conquistasNovas = [];
        if (estado.cuponsEscaneados >= 1) {
            if (this._desbloquearConquista(estado, 'primeiro_cupom')) conquistasNovas.push('Primeira Mineração');
        }
        if (estado.cuponsEscaneados >= 5) {
            if (this._desbloquearConquista(estado, 'caçador_cinco')) conquistasNovas.push('Colecionador de Cupons');
        }
        if (achadinhosDetectados.length > 0) {
            if (this._desbloquearConquista(estado, 'primeiro_achadinho')) conquistasNovas.push('Olho Clínico');
        }

        const subiuNivel = await this._recalcularNivel(estado);
        await DBStorage.salvarGamificacao(estado);

        return {
            sucesso: true,
            moedasGanhas: totalMoedas,
            xpGanho: totalXp,
            novoSaldo: estado.moedas,
            nivelAtual: estado.nivel,
            tituloNivel: estado.titulo,
            subiuNivel,
            achadinhosCount: achadinhosDetectados.length,
            conquistasNovas
        };
    }

    /**
     * Verifica e desconta moedas para realizar busca de ofertas
     */
    static async cobrarBuscaDePreco() {
        const estado = await this.obterEstado();
        const custo = this.CUSTO_BUSCA_PRECO;

        if (estado.moedas < custo) {
            return {
                permitido: false,
                saldoAtual: estado.moedas,
                custo,
                mensagem: `🪙 Saldo insuficiente (${estado.moedas} moedas). Escaneie um novo cupom fiscal para ganhar mais moedas!`
            };
        }

        estado.moedas -= custo;
        estado.xp += this.XP_POR_BUSCA;

        await this._recalcularNivel(estado);
        await DBStorage.salvarGamificacao(estado);

        return {
            permitido: true,
            moedasRestantes: estado.moedas,
            custo
        };
    }

    /**
     * Avalia se um produto importado é considerado um "Achadinho" (pechincha histórica)
     */
    static async avaliarAchadinho(item, todosPrecos) {
        if (!item.valorUnitario || item.valorUnitario <= 0) return { isAchadinho: false };

        const ean = item.codigo || item.ean;
        const precosExistentes = todosPrecos.filter(p => {
            const mesmoEan = ean && (p.ean === ean || p.codigo === ean);
            const mesmoNome = p.descricao && p.descricao.toLowerCase() === item.descricao.toLowerCase();
            return (mesmoEan || mesmoNome) && p.valorUnitario > 0;
        });

        if (precosExistentes.length === 0) {
            return { isAchadinho: false };
        }

        // Calcula média de preço anterior
        const soma = precosExistentes.reduce((acc, p) => acc + (parseFloat(p.valorUnitario) || 0), 0);
        const media = soma / precosExistentes.length;

        // Se o preço atual for no mínimo 18% menor que a média histórica
        const descontoPct = Math.round(((media - item.valorUnitario) / media) * 100);

        if (descontoPct >= 18) {
            return {
                isAchadinho: true,
                precoAtual: item.valorUnitario,
                precoMedio: media,
                descontoPct
            };
        }

        return { isAchadinho: false };
    }

    /**
     * Recalcula o nível com base no XP
     */
    static async _recalcularNivel(estado) {
        const nivelAnterior = estado.nivel || 1;
        let novoNivel = 1;
        let titulo = this.NIVEIS[0].titulo;

        for (const n of this.NIVEIS) {
            if (estado.xp >= n.xpMin) {
                novoNivel = n.nivel;
                titulo = n.titulo;
            }
        }

        estado.nivel = novoNivel;
        estado.titulo = titulo;

        return novoNivel > nivelAnterior;
    }

    static _desbloquearConquista(estado, conquistaId) {
        if (!estado.conquistas) estado.conquistas = [];
        const jaTem = estado.conquistas.some(c => c.id === conquistaId);
        if (!jaTem) {
            const info = this.CONQUISTAS_DISPONIVEIS.find(c => c.id === conquistaId);
            if (info) {
                estado.conquistas.push({
                    id: info.id,
                    nome: info.nome,
                    icone: info.icone,
                    desbloqueada: true,
                    data: new Date().toISOString()
                });
                return true;
            }
        }
        return false;
    }
}
