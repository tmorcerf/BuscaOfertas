/**
 * community_feed.js — Gerenciador do Feed Social Comunitário de Achadinhos e Ofertas
 * Busca Ofertas
 */

import { DBStorage } from './db_storage.js';

export class CommunityFeed {
    /**
     * Renderiza o feed social na tela
     */
    static async carregarFeed(containerId, filtroCategoria = 'todos') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const posts = await DBStorage.listarFeed();

        if (posts.length === 0) {
            container.innerHTML = `
                <div class="feed-empty-state">
                    <div style="font-size:3rem; margin-bottom:10px;">🛒</div>
                    <h3>Nenhum achadinho ainda</h3>
                    <p>Seja o primeiro a escanear um cupom fiscal e compartilhar pechinchas com a comunidade!</p>
                </div>
            `;
            return;
        }

        let filtrados = posts;
        if (filtroCategoria !== 'todos') {
            filtrados = posts.filter(p => (p.categoria || '').toLowerCase() === filtroCategoria.toLowerCase());
        }

        container.innerHTML = filtrados.map(post => this._renderCardPost(post)).join('');

        // Vincula eventos de curtida e compartilhamento
        this._bindEventosFeed(container);
    }

    static _renderCardPost(post) {
        const economiaBadge = post.economiaPct ? `
            <div class="badge-economia">
                🔥 -${post.economiaPct}% OFF
            </div>
        ` : '';

        const achadinhoTag = post.isAchadinho ? `
            <span class="badge-pill achadinho">
                <i class="fas fa-bolt"></i> SUPER ACHADINHO
            </span>
        ` : '';

        const tempoFormatado = this._formatarTempoRelativo(post.criadoEm);

        return `
            <div class="feed-card" data-id="${post.id}">
                <div class="feed-card-header">
                    <div class="feed-user-info">
                        <div class="feed-user-avatar">${post.autorAvatar || '👤'}</div>
                        <div>
                            <div class="feed-user-name">${post.autor || 'Usuário'}</div>
                            <div class="feed-user-level"><i class="fas fa-medal"></i> ${post.nivelAutor || 'Caçador de Ofertas'} • ${tempoFormatado}</div>
                        </div>
                    </div>
                    ${achadinhoTag}
                </div>

                <div class="feed-card-body">
                    <div class="feed-produto-nome">${post.produto}</div>
                    
                    <div class="feed-store-row">
                        <i class="fas fa-store" style="color:var(--color-accent);"></i>
                        <span>${post.supermercado}</span>
                        ${post.bairro ? `<span class="badge-pill store">${post.bairro}</span>` : ''}
                    </div>

                    <div class="feed-price-box">
                        <div>
                            <div style="font-size:0.75rem; color:rgba(255,255,255,0.6); text-transform:uppercase; font-weight:600;">Preço Encontrado</div>
                            <div class="feed-preco-destaque">R$ ${(parseFloat(post.preco) || 0).toFixed(2).replace('.', ',')}</div>
                        </div>
                        ${post.precoMedio ? `
                            <div style="text-align:right;">
                                <div style="font-size:0.75rem; color:rgba(255,255,255,0.4); text-decoration:line-through;">Média: R$ ${(parseFloat(post.precoMedio) || 0).toFixed(2).replace('.', ',')}</div>
                                ${economiaBadge}
                            </div>
                        ` : ''}
                    </div>
                </div>

                <div class="feed-card-footer">
                    <button class="btn-feed-action btn-curtir ${post.usuarioCurtiu ? 'curtido' : ''}" data-id="${post.id}">
                        <i class="${post.usuarioCurtiu ? 'fas fa-heart' : 'far fa-heart'}"></i>
                        <span class="curtidas-count">${post.curtidas || 0}</span> ${post.curtidas === 1 ? 'curtida' : 'curtidas'}
                    </button>

                    <button class="btn-feed-action btn-compartilhar" data-titulo="${post.produto}" data-texto="Achei ${post.produto} por R$ ${post.preco} no ${post.supermercado}!">
                        <i class="fas fa-share-alt"></i> Compartilhar
                    </button>
                </div>
            </div>
        `;
    }

    static _bindEventosFeed(container) {
        // Evento de Curtir
        container.querySelectorAll('.btn-curtir').forEach(btn => {
            btn.onclick = async () => {
                const id = parseInt(btn.getAttribute('data-id'), 10);
                const postAtualizado = await DBStorage.curtirPostFeed(id);
                if (postAtualizado) {
                    btn.classList.toggle('curtido', postAtualizado.usuarioCurtiu);
                    const icon = btn.querySelector('i');
                    if (icon) {
                        icon.className = postAtualizado.usuarioCurtiu ? 'fas fa-heart' : 'far fa-heart';
                    }
                    const count = btn.querySelector('.curtidas-count');
                    if (count) count.textContent = postAtualizado.curtidas || 0;
                }
            };
        });

        // Evento de Compartilhar
        container.querySelectorAll('.btn-compartilhar').forEach(btn => {
            btn.onclick = async () => {
                const titulo = btn.getAttribute('data-titulo') || 'Oferta Imperdível';
                const texto = btn.getAttribute('data-texto') || 'Veja esse preço no Busca Ofertas!';

                if (navigator.share) {
                    try {
                        await navigator.share({
                            title: titulo,
                            text: texto,
                            url: window.location.href
                        });
                    } catch (e) {}
                } else {
                    try {
                        await navigator.clipboard.writeText(`${texto} — Confira no Busca Ofertas: ${window.location.href}`);
                        alert('Link copiado para a área de transferência!');
                    } catch (e) {}
                }
            };
        });
    }

    static _formatarTempoRelativo(timestamp) {
        if (!timestamp) return 'Hoje';
        const diffMs = Date.now() - timestamp;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHoras = Math.floor(diffMin / 60);
        const diffDias = Math.floor(diffHoras / 24);

        if (diffMin < 1) return 'Agora mesmo';
        if (diffMin < 60) return `Há ${diffMin} min`;
        if (diffHoras < 24) return `Há ${diffHoras}h`;
        if (diffDias === 1) return 'Ontem';
        return `Há ${diffDias} dias`;
    }

    /**
     * Cria uma publicação no Feed a partir de uma nota fiscal escaneada
     */
    static async publicarAchadinhosDaNota(nota, achadinhos, perfilUsuario) {
        if (!achadinhos || achadinhos.length === 0) return;

        for (const item of achadinhos) {
            await DBStorage.adicionarItemFeed({
                autor: perfilUsuario.nome || 'Você',
                autorAvatar: '🧑‍🚀',
                nivelAutor: perfilUsuario.titulo || 'Caçador de Ofertas',
                supermercado: nota.estabelecimento.nome || 'Supermercado',
                bairro: nota.uf?.nome || '',
                uf: nota.uf?.sigla || 'RJ',
                produto: item.descricao,
                ean: item.ean || item.codigo,
                preco: item.valorUnitario,
                precoMedio: item.precoMedio,
                economiaPct: item.descontoPct,
                isAchadinho: true,
                curtidas: 1,
                usuarioCurtiu: true,
                criadoEm: Date.now()
            });
        }
    }
}
