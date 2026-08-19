const axios  = require('axios');
const path   = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

// ── Estado del cliente Pixiv (singleton) ─────────────────────────────────
let pixivClient  = null;
let tokenExpiraEn = 0;

async function obtenerCliente() {
    const token = process.env.PIXIV_REFRESH_TOKEN;
    if (!token) return null;

    try {
        const PixivApi = require('pixiv-api-client');
        const ahora = Date.now();

        // Reutilizar cliente si el access token sigue vigente (margen de 2 min)
        if (pixivClient && ahora < tokenExpiraEn - 120_000) return pixivClient;

        const cliente = new PixivApi();
        const res = await cliente.refreshAccessToken(token);
        // El access_token expira en 3600s según la API
        const expira = (res?.expires_in || 3600) * 1000;
        tokenExpiraEn = ahora + expira;
        pixivClient = cliente;
        return cliente;
    } catch (err) {
        console.error('[Pixiv] Error autenticando con refresh_token:', err.message);
        return null;
    }
}

// ── Extraer ID de ilustración desde un enlace de Pixiv ───────────────────
function extraerIdPixiv(texto) {
    // Soporta:
    //   https://www.pixiv.net/en/artworks/12345678
    //   https://www.pixiv.net/artworks/12345678
    //   https://pixiv.net/i/12345678
    //   id numérico directo
    const patrones = [
        /pixiv\.net\/(?:en\/)?artworks\/(\d+)/,
        /pixiv\.net\/i\/(\d+)/,
        /illust_id=(\d+)/,
        /^(\d{6,10})$/,
    ];
    for (const re of patrones) {
        const m = texto.match(re);
        if (m) return m[1];
    }
    return null;
}

function esUrl(texto) {
    return texto.startsWith('http://') || texto.startsWith('https://') || /^\d{6,10}$/.test(texto.trim());
}

// ── Descargar imagen como Buffer pasando el Referer de Pixiv ─────────────
async function descargarImagenPixiv(url) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30_000,
        headers: {
            'User-Agent': UA,
            'Referer': 'https://www.pixiv.net/',
        },
    });
    return Buffer.from(res.data);
}

// ── Fallback: phixiv (sin token, solo por link) ───────────────────────────
async function obtenerInfoPhixiv(illustId) {
    try {
        const res = await axios.get(`https://www.phixiv.net/api/info?id=${illustId}`, {
            timeout: 15_000,
            headers: { 'User-Agent': UA },
        });
        return res.data || null;
    } catch {
        return null;
    }
}

// ── Construir caption con info de la ilustración ─────────────────────────
function construirCaption(illust) {
    const titulo  = illust.title || 'Sin título';
    const autor   = illust.user?.name || illust.author || 'Desconocido';
    const tags    = (illust.tags?.slice?.(0, 6) || [])
        .map(t => (typeof t === 'string' ? t : t.name))
        .filter(Boolean)
        .map(t => `#${t}`)
        .join(' ');
    const vistas  = illust.total_view  ? `👁️ ${illust.total_view.toLocaleString()}` : '';
    const likes   = illust.total_bookmarks ? `❤️ ${illust.total_bookmarks.toLocaleString()}` : '';
    const paginas = illust.page_count > 1 ? `📄 ${illust.page_count} páginas` : '';
    const id      = illust.id || '';
    const link    = id ? `🔗 https://www.pixiv.net/artworks/${id}` : '';

    return [
        `🎨 *${titulo}*`,
        `✏️ ${autor}`,
        vistas && likes ? `${vistas}  ${likes}` : (vistas || likes),
        paginas,
        tags,
        link,
    ].filter(Boolean).join('\n');
}

// ════════════════════════════════════════════════════════════════════════════
//  COMANDO PRINCIPAL: #pixiv / #px
// ════════════════════════════════════════════════════════════════════════════
async function cmdPixiv(sock, jid, args) {
    if (!args.length) {
        await sock.sendMessage(jid, {
            text: [
                '🎨 *#pixiv — Pixiv para WhatsApp*',
                '',
                '• *#pixiv <link>*  → descarga la ilustración',
                '• *#pixiv <nombre>* → busca ilustraciones',
                '',
                '_Ejemplos:_',
                '#pixiv https://www.pixiv.net/artworks/12345678',
                '#pixiv hatsune miku',
            ].join('\n'),
        });
        return;
    }

    const entrada = args.join(' ').trim();
    const illustId = extraerIdPixiv(entrada);

    if (illustId || esUrl(entrada)) {
        await manejarDescargaPixiv(sock, jid, illustId || entrada);
    } else {
        await manejarBusquedaPixiv(sock, jid, entrada);
    }
}

// ── Descarga por link / ID ────────────────────────────────────────────────
async function manejarDescargaPixiv(sock, jid, illustId) {
    await sock.sendMessage(jid, { text: `🔍 Obteniendo ilustración *${illustId}*...` });

    const cliente = await obtenerCliente();

    // ── Intento 1: API oficial con token ──────────────────────────────────
    if (cliente) {
        try {
            const detalle = await cliente.illustDetail(illustId);
            const illust  = detalle?.illust;
            if (!illust) throw new Error('Sin datos de ilustración');

            // Verificar acceso
            if (illust.restrict !== 0 && illust.x_restrict > 0) {
                // Contenido adulto — se intenta igual (depende de la cuenta)
            }

            const caption = construirCaption(illust);
            const paginas = illust.page_count || 1;
            const MAX_PAGINAS = 5;

            if (paginas === 1) {
                // Ilustración de una sola página
                const url = illust.meta_single_page?.original_image_url
                    || illust.image_urls?.large
                    || illust.image_urls?.medium;
                if (!url) throw new Error('Sin URL de imagen');
                const buf = await descargarImagenPixiv(url);
                await sock.sendMessage(jid, { image: buf, caption });
            } else {
                // Ilustración multi-página
                const enviando = Math.min(paginas, MAX_PAGINAS);
                await sock.sendMessage(jid, {
                    text: `📚 Esta ilustración tiene *${paginas} páginas*. Enviando las primeras ${enviando}...\n\n${caption}`,
                });
                const pages = illust.meta_pages?.slice(0, MAX_PAGINAS) || [];
                for (let i = 0; i < pages.length; i++) {
                    const url = pages[i].image_urls?.original
                        || pages[i].image_urls?.large
                        || pages[i].image_urls?.medium;
                    if (!url) continue;
                    try {
                        const buf = await descargarImagenPixiv(url);
                        await sock.sendMessage(jid, {
                            image: buf,
                            caption: `Página ${i + 1}/${enviando}`,
                        });
                        // Pequeño delay entre páginas para no saturar
                        if (i < pages.length - 1) await new Promise(r => setTimeout(r, 800));
                    } catch (e) {
                        console.error(`[Pixiv] Error descargando página ${i + 1}:`, e.message);
                    }
                }
                if (paginas > MAX_PAGINAS) {
                    await sock.sendMessage(jid, {
                        text: `_(Solo se envían las primeras ${MAX_PAGINAS} páginas. Ve el resto en: https://www.pixiv.net/artworks/${illustId})_`,
                    });
                }
            }
            return;
        } catch (err) {
            const txt = String(err.message || '').toLowerCase();
            if (txt.includes('not found') || txt.includes('deleted') || txt.includes('404')) {
                await sock.sendMessage(jid, { text: '❌ Esa ilustración no existe o fue eliminada.' });
                return;
            }
            if (txt.includes('auth') || txt.includes('token') || txt.includes('401') || txt.includes('403')) {
                await sock.sendMessage(jid, { text: '⚠️ Error de autenticación con Pixiv. Intenta con otro enlace o contacta al owner.' });
                return;
            }
            // Otro error → intentar fallback con phixiv
            console.error('[Pixiv] Error con API oficial, intentando phixiv fallback:', err.message);
        }
    }

    // ── Fallback: phixiv (sin token o si falló la API) ────────────────────
    await sock.sendMessage(jid, { text: '🔄 Usando método alternativo...' });
    try {
        const info = await obtenerInfoPhixiv(illustId);
        if (!info) throw new Error('Sin respuesta de phixiv');

        const urls = info.image_urls || info.images || [];
        if (!urls.length) throw new Error('Sin imágenes en respuesta phixiv');

        const captionFallback = [
            `🎨 *${info.title || 'Ilustración de Pixiv'}*`,
            `✏️ ${info.author_name || info.author || 'Desconocido'}`,
            `🔗 https://www.pixiv.net/artworks/${illustId}`,
        ].join('\n');

        const enviando = Math.min(urls.length, 5);
        if (urls.length > 1) {
            await sock.sendMessage(jid, {
                text: `📚 ${urls.length} páginas encontradas. Enviando las primeras ${enviando}...\n\n${captionFallback}`,
            });
        }
        for (let i = 0; i < enviando; i++) {
            try {
                const buf = await descargarImagenPixiv(urls[i]);
                await sock.sendMessage(jid, {
                    image: buf,
                    caption: urls.length > 1
                        ? `Página ${i + 1}/${enviando}`
                        : captionFallback,
                });
                if (i < enviando - 1) await new Promise(r => setTimeout(r, 800));
            } catch (e) {
                console.error(`[Pixiv/phixiv] Error descargando imagen ${i + 1}:`, e.message);
            }
        }
    } catch (err) {
        console.error('[Pixiv/phixiv] Error fallback:', err.message);
        await sock.sendMessage(jid, {
            text: [
                '❌ No se pudo obtener la ilustración.',
                '',
                'Posibles causas:',
                '• La ilustración fue eliminada',
                '• Es contenido privado o solo para miembros',
                '• Error temporal del servicio',
                '',
                `🔗 Intenta verla directamente: https://www.pixiv.net/artworks/${illustId}`,
            ].join('\n'),
        });
    }
}

// ── Búsqueda por nombre ───────────────────────────────────────────────────
async function manejarBusquedaPixiv(sock, jid, query) {
    const cliente = await obtenerCliente();

    if (!cliente) {
        await sock.sendMessage(jid, {
            text: [
                '⚠️ La búsqueda por nombre requiere autenticación con Pixiv.',
                '',
                'Si eres el owner, configura el secreto *PIXIV_REFRESH_TOKEN*.',
                'Si tienes un link directo úsalo: *#pixiv https://www.pixiv.net/artworks/ID*',
            ].join('\n'),
        });
        return;
    }

    await sock.sendMessage(jid, { text: `🔍 Buscando en Pixiv: *${query}*...` });

    try {
        const res = await cliente.searchIllust(query, {
            search_target: 'partial_match_for_tags',
            sort: 'popular_desc',
        });

        const ilustraciones = res?.illusts?.filter(i => i.type === 'illust' || i.type === 'manga') || [];

        if (!ilustraciones.length) {
            await sock.sendMessage(jid, { text: `❌ No encontré ilustraciones para: *${query}*` });
            return;
        }

        const top = ilustraciones.slice(0, 6);
        const tieneToken = !!process.env.PIXIV_REFRESH_TOKEN;

        const lista = top.map((il, i) => {
            const tags = (il.tags || [])
                .slice(0, 3)
                .map(t => (typeof t === 'string' ? t : t.name))
                .filter(Boolean)
                .join(', ');
            return [
                `*${i + 1}. ${il.title}*`,
                `   ✏️ ${il.user?.name || 'Desconocido'}`,
                `   ❤️ ${(il.total_bookmarks || 0).toLocaleString()}  📄 ${il.page_count || 1} pág.`,
                tags ? `   🏷️ ${tags}` : '',
                `   🔗 #pixiv ${il.id}`,
            ].filter(Boolean).join('\n');
        }).join('\n\n');

        await sock.sendMessage(jid, {
            text: [
                `🎨 *Resultados de Pixiv para: ${query}*`,
                `_(${ilustraciones.length} encontradas, mostrando top ${top.length})_`,
                '',
                lista,
                '',
                '_Usa *#pixiv <ID o link>* para descargar una ilustración específica._',
            ].join('\n'),
        });

        // Enviar thumbnail de la primera ilustración como preview
        try {
            const primera = top[0];
            const thumbUrl = primera.image_urls?.medium || primera.image_urls?.square_medium;
            if (thumbUrl) {
                const buf = await descargarImagenPixiv(thumbUrl);
                await sock.sendMessage(jid, {
                    image: buf,
                    caption: `🎨 Preview: *${primera.title}* por ${primera.user?.name || 'Desconocido'}\n👆 Usa #pixiv ${primera.id} para descargar en alta calidad`,
                });
            }
        } catch { /* preview opcional, no es crítico */ }

    } catch (err) {
        console.error('[Pixiv] Error en búsqueda:', err.message);
        await sock.sendMessage(jid, {
            text: '❌ Error al buscar en Pixiv. Intenta de nuevo en unos segundos.',
        });
    }
}

module.exports = { cmdPixiv, obtenerCliente, descargarImagenPixiv };
