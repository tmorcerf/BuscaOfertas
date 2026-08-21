/**
 * db_storage.js — Banco de Dados Local IndexedDB para o Busca Ofertas
 * Armazena localmente produtos, preços históricos, códigos EAN, cupons fiscais e estado de gamificação.
 */

export class DBStorage {
    static DB_NAME = 'BuscaOfertasDB';
    static DB_VERSION = 1;
    static dbInstance = null;

    /**
     * Inicializa a conexão com o IndexedDB e cria as tabelas se necessário
     */
    static async getDB() {
        if (this.dbInstance) return this.dbInstance;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Tabela de Produtos e Preços
                if (!db.objectStoreNames.contains('produtos_precos')) {
                    const storePrecos = db.createObjectStore('produtos_precos', { keyPath: 'id', autoIncrement: true });
                    storePrecos.createIndex('ean', 'ean', { unique: false });
                    storePrecos.createIndex('descricao', 'descricao', { unique: false });
                    storePrecos.createIndex('supermercado', 'supermercado', { unique: false });
                    storePrecos.createIndex('data', 'data', { unique: false });
                    storePrecos.createIndex('chaveNfe', 'chaveNfe', { unique: false });
                }

                // Tabela de Cupons Fiscais
                if (!db.objectStoreNames.contains('cupons_fiscais')) {
                    const storeCupons = db.createObjectStore('cupons_fiscais', { keyPath: 'chave' });
                    storeCupons.createIndex('data', 'data', { unique: false });
                    storeCupons.createIndex('supermercado', 'supermercado', { unique: false });
                }

                // Tabela de Gamificação / Carteira
                if (!db.objectStoreNames.contains('gamificacao')) {
                    db.createObjectStore('gamificacao', { keyPath: 'id' });
                }

                // Tabela de Feed Comunitário (Posts & Achadinhos)
                if (!db.objectStoreNames.contains('feed_achadinhos')) {
                    const storeFeed = db.createObjectStore('feed_achadinhos', { keyPath: 'id', autoIncrement: true });
                    storeFeed.createIndex('criadoEm', 'criadoEm', { unique: false });
                    storeFeed.createIndex('isAchadinho', 'isAchadinho', { unique: false });
                }
            };

            request.onsuccess = async (event) => {
                this.dbInstance = event.target.result;
                await this.verificarDadosIniciais();
                resolve(this.dbInstance);
            };

            request.onerror = (event) => {
                console.error('[DBStorage] Erro ao abrir IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Insere dados iniciais de demonstração caso o banco esteja vazio
     */
    static async verificarDadosIniciais() {
        const gamificacao = await this.obterGamificacao();
        if (!gamificacao) {
            await this.salvarGamificacao({
                id: 'usuario_atual',
                nome: 'Caçador de Ofertas',
                moedas: 50, // Saldo inicial de boas-vindas
                xp: 0,
                nivel: 1,
                titulo: 'Caçador Novato',
                cuponsEscaneados: 0,
                achadinhosEncontrados: 0,
                totalEconomizado: 0.00,
                streakDias: 1,
                ultimoAcesso: new Date().toISOString().split('T')[0],
                conquistas: [
                    { id: 'primeiro_login', nome: 'Bem-vindo ao Jogo', icone: '🎁', desbloqueada: true, data: new Date().toISOString() }
                ]
            });

            // Adiciona alguns achadinhos iniciais no Feed Comunitário para experiência rica
            await this.popularFeedInicial();
        }
    }

    static async popularFeedInicial() {
        const demoFeed = [
            {
                autor: 'Mariana Silva',
                autorAvatar: '👩‍🦰',
                nivelAutor: 'Mestre dos Achadinhos',
                supermercado: 'Supermercado Guanabara - Barra',
                bairro: 'Barra da Tijuca',
                uf: 'RJ',
                produto: 'Café Melitta Tradicional 500g',
                ean: '7891025111231',
                preco: 14.89,
                precoMedio: 22.90,
                economiaPct: 35,
                isAchadinho: true,
                curtidas: 28,
                usuarioCurtiu: false,
                dataRelativa: 'Há 20 minutos',
                criadoEm: Date.now() - 20 * 60 * 1000
            },
            {
                autor: 'Carlos Eduardo',
                autorAvatar: '👨‍💼',
                nivelAutor: 'Caçador de Ofertas',
                supermercado: 'Assaí Atacadista',
                bairro: 'Tijuca',
                uf: 'RJ',
                produto: 'Leite Condensado Moça 395g',
                ean: '7891000100103',
                preco: 5.49,
                precoMedio: 8.50,
                economiaPct: 35,
                isAchadinho: true,
                curtidas: 42,
                usuarioCurtiu: false,
                dataRelativa: 'Há 1 hora',
                criadoEm: Date.now() - 60 * 60 * 1000
            },
            {
                autor: 'Lucas Mendes',
                autorAvatar: '🧑',
                nivelAutor: 'Explorador',
                supermercado: 'Prezunic',
                bairro: 'Botafogo',
                uf: 'RJ',
                produto: 'Arroz Branco Camil Tipo 1 5kg',
                ean: '7896006711116',
                preco: 23.90,
                precoMedio: 31.90,
                economiaPct: 25,
                isAchadinho: true,
                curtidas: 19,
                usuarioCurtiu: false,
                dataRelativa: 'Há 3 horas',
                criadoEm: Date.now() - 3 * 3600 * 1000
            }
        ];

        for (const item of demoFeed) {
            await this.adicionarItemFeed(item);
            // Salva também no banco de preços
            await this.salvarPreco({
                ean: item.ean,
                codigo: item.ean,
                descricao: item.produto,
                quantidade: 1,
                unidade: 'UN',
                valorUnitario: item.preco,
                valorTotal: item.preco,
                supermercado: item.supermercado,
                cnpj: '00.000.000/0001-00',
                uf: item.uf,
                data: new Date().toISOString().split('T')[0],
                chaveNfe: 'DEMO_' + Date.now() + Math.random(),
                isAchadinho: true
            });
        }
    }

    // ==========================================
    // MÉTODOS DE GAMIFICAÇÃO & CARTEIRA
    // ==========================================

    static async obterGamificacao() {
        const db = await this.getDB();
        return new Promise((resolve) => {
            const tx = db.transaction('gamificacao', 'readonly');
            const store = tx.objectStore('gamificacao');
            const req = store.get('usuario_atual');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    static async salvarGamificacao(dados) {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('gamificacao', 'readwrite');
            const store = tx.objectStore('gamificacao');
            const req = store.put({ ...dados, id: 'usuario_atual' });
            req.onsuccess = () => resolve(true);
            req.onerror = (e) => reject(e);
        });
    }

    // ==========================================
    // MÉTODOS DE CUPONS FISCAIS
    // ==========================================

    static async salvarCupom(cupom) {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('cupons_fiscais', 'readwrite');
            const store = tx.objectStore('cupons_fiscais');
            const req = store.put(cupom);
            req.onsuccess = () => resolve(true);
            req.onerror = (e) => reject(e);
        });
    }

    static async obterCupomPorChave(chave) {
        const db = await this.getDB();
        return new Promise((resolve) => {
            const tx = db.transaction('cupons_fiscais', 'readonly');
            const store = tx.objectStore('cupons_fiscais');
            const req = store.get(chave);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    static async listarTodosCupons() {
        const db = await this.getDB();
        return new Promise((resolve) => {
            const tx = db.transaction('cupons_fiscais', 'readonly');
            const store = tx.objectStore('cupons_fiscais');
            const req = store.getAll();
            req.onsuccess = () => {
                const lista = req.result || [];
                lista.sort((a, b) => new Date(b.criadoEm || b.data) - new Date(a.criadoEm || a.data));
                resolve(lista);
            };
            req.onerror = () => resolve([]);
        });
    }

    // ==========================================
    // MÉTODOS DE PRODUTOS & PREÇOS
    // ==========================================

    static async salvarPreco(item) {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('produtos_precos', 'readwrite');
            const store = tx.objectStore('produtos_precos');
            const req = store.add(item);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e);
        });
    }

    static async buscarPrecosPorEanOuNome(termo) {
        if (!termo) return [];
        const db = await this.getDB();
        const busca = termo.trim().toLowerCase();
        const apenasNumeros = termo.replace(/\D/g, '');

        return new Promise((resolve) => {
            const tx = db.transaction('produtos_precos', 'readonly');
            const store = tx.objectStore('produtos_precos');
            const req = store.getAll();

            req.onsuccess = () => {
                const todos = req.result || [];
                const filtrados = todos.filter(item => {
                    // Match por código EAN
                    if (apenasNumeros && item.ean && item.ean.includes(apenasNumeros)) return true;
                    if (apenasNumeros && item.codigo && item.codigo.includes(apenasNumeros)) return true;
                    // Match por Descrição do Produto
                    if (item.descricao && item.descricao.toLowerCase().includes(busca)) return true;
                    return false;
                });

                // Ordena pelo menor preço unitário
                filtrados.sort((a, b) => (parseFloat(a.valorUnitario) || 0) - (parseFloat(b.valorUnitario) || 0));
                resolve(filtrados);
            };

            req.onerror = () => resolve([]);
        });
    }

    static async listarTodosPrecos() {
        const db = await this.getDB();
        return new Promise((resolve) => {
            const tx = db.transaction('produtos_precos', 'readonly');
            const store = tx.objectStore('produtos_precos');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    // ==========================================
    // MÉTODOS DO FEED COMUNITÁRIO
    // ==========================================

    static async adicionarItemFeed(post) {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('feed_achadinhos', 'readwrite');
            const store = tx.objectStore('feed_achadinhos');
            const req = store.add(post);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e);
        });
    }

    static async listarFeed() {
        const db = await this.getDB();
        return new Promise((resolve) => {
            const tx = db.transaction('feed_achadinhos', 'readonly');
            const store = tx.objectStore('feed_achadinhos');
            const req = store.getAll();
            req.onsuccess = () => {
                const posts = req.result || [];
                posts.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
                resolve(posts);
            };
            req.onerror = () => resolve([]);
        });
    }

    static async curtirPostFeed(id) {
        const db = await this.getDB();
        return new Promise((resolve) => {
            const tx = db.transaction('feed_achadinhos', 'readwrite');
            const store = tx.objectStore('feed_achadinhos');
            const req = store.get(id);

            req.onsuccess = () => {
                const post = req.result;
                if (!post) return resolve(false);

                if (post.usuarioCurtiu) {
                    post.curtidas = Math.max(0, (post.curtidas || 1) - 1);
                    post.usuarioCurtiu = false;
                } else {
                    post.curtidas = (post.curtidas || 0) + 1;
                    post.usuarioCurtiu = true;
                }

                store.put(post);
                resolve(post);
            };

            req.onerror = () => resolve(false);
        });
    }
}
