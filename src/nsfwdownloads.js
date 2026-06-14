const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const YTDLP = 'yt-dlp';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const HUMAN_HEADERS = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/'
};
const axiosOpts = { timeout: 25000, headers: HUMAN_HEADERS };

function logRequestError(contexto, err) {
    const txt = String(err?.message || err?.response?.data || '').toLowerCase();
    if (err?.response?.status === 429 || txt.includes('rate-overlimit') || txt.includes('too many requests') || txt.includes('overlimit')) return;
    console.error('ERROR:', contexto, err.response?.status || '', err.message);
}

function ytdlpHeadersArgs() {
    return [
        '--add-header', `User-Agent:${UA}`,
        '--add-header', 'Accept-Language:en-US,en;q=0.9'
    ];
}

function extraerErrorYtdlp(err) {
    const txt = (err.stderr || err.stdout || err.message || '').toString();
    const linea = txt.split('\n').find(l => l.includes('ERROR:'));
    if (linea) return linea.replace('ERROR:', '').replace(/\[.*?\]/g, '').trim();
    return 'No se pudo descargar el contenido.';
}

async function ytdlpEjecutar(args, timeout = 180000) {
    return execFileAsync(YTDLP, args, { timeout, maxBuffer: 400 * 1024 * 1024 });
}

async function ytdlpDescargarVideo(url, prefijo) {
    const tmpBase = path.join(os.tmpdir(), `${prefijo}_${Date.now()}`);
    const tmpOut = `${tmpBase}.mp4`;
    await ytdlpEjecutar([
        url,
        '-f', 'mp4/best',
        '--merge-output-format', 'mp4',
        '-o', `${tmpBase}.%(ext)s`,
        '--no-playlist', '--quiet', '--no-warnings',
        ...ytdlpHeadersArgs()
    ]);
    let archivo = tmpOut;
    if (!await fs.pathExists(archivo)) {
        // yt-dlp pudo haber elegido otra extensión
        const dir = path.dirname(tmpBase);
        const base = path.basename(tmpBase);
        const candidatos = (await fs.readdir(dir)).filter(f => f.startsWith(base));
        if (candidatos.length) archivo = path.join(dir, candidatos[0]);
    }
    const buffer = await fs.readFile(archivo);
    await fs.remove(archivo).catch(() => {});
    return buffer;
}

async function ytdlpInfo(url) {
    try {
        const { stdout } = await ytdlpEjecutar([
            url, '--dump-single-json', '--no-warnings', '--quiet',
            '--no-playlist', ...ytdlpHeadersArgs()
        ], 60000);
        return JSON.parse(stdout);
    } catch { return {}; }
}

// ════════════════════════════════════════════════════
//  NHENTAI
// ════════════════════════════════════════════════════
const NH_EXT_MAP = { j: 'jpg', p: 'png', g: 'gif', w: 'webp' };

// ── Construye el header Cookie a partir de los env vars disponibles ───────
function nhBuildHeaders(withCF = true) {
    const AT = process.env.NH_ACCESS_TOKEN;
    const RT = process.env.NH_REFRESH_TOKEN;
    const CF = process.env.NH_CF_CLEARANCE;
    const cookies = [];
    if (AT) cookies.push(`access_token=${AT}`);
    if (RT) cookies.push(`refresh_token=${RT}`);
    if (CF && withCF) cookies.push(`cf_clearance=${CF}`);
    const headers = {
        ...HUMAN_HEADERS,
        'Referer': 'https://nhentai.net/',
        'Origin': 'https://nhentai.net',
    };
    if (cookies.length) headers['Cookie'] = cookies.join('; ');
    if (AT) headers['Authorization'] = `Bearer ${AT}`;
    return headers;
}

async function nhentaiObtenerGaleria(id) {
    const AT = process.env.NH_ACCESS_TOKEN;

    const intentos = [
        // 1. nhentai.net con tokens OAuth + cf_clearance
        async () => {
            if (!AT) return null;
            const res = await axios.get(`https://nhentai.net/api/gallery/${id}`,
                { ...axiosOpts, headers: nhBuildHeaders(true) });
            const g = res.data;
            if (!g?.media_id || !g?.images?.pages) return null;
            const titulo = g.title?.pretty || g.title?.english || g.title?.japanese || `Doujin ${id}`;
            const paginas = g.images.pages.map((p, i) => {
                const ext = NH_EXT_MAP[p.t] || 'jpg';
                return `https://i.nhentai.net/galleries/${g.media_id}/${i + 1}.${ext}`;
            });
            return { titulo, paginas, fuente: 'nhentai.net', referer: 'https://nhentai.net/' };
        },
        // 2. nhentai.net solo con Bearer (sin cf_clearance, por si el API route no necesita CF)
        async () => {
            if (!AT) return null;
            const res = await axios.get(`https://nhentai.net/api/gallery/${id}`,
                { ...axiosOpts, headers: nhBuildHeaders(false) });
            const g = res.data;
            if (!g?.media_id || !g?.images?.pages) return null;
            const titulo = g.title?.pretty || g.title?.english || g.title?.japanese || `Doujin ${id}`;
            const paginas = g.images.pages.map((p, i) => {
                const ext = NH_EXT_MAP[p.t] || 'jpg';
                return `https://i.nhentai.net/galleries/${g.media_id}/${i + 1}.${ext}`;
            });
            return { titulo, paginas, fuente: 'nhentai.net (bearer)', referer: 'https://nhentai.net/' };
        },
        // 3. nhentai.xxx API (mirror sin CloudFlare)
        async () => {
            const headers = { ...HUMAN_HEADERS, Referer: 'https://nhentai.xxx/', Origin: 'https://nhentai.xxx' };
            const res = await axios.get(`https://nhentai.xxx/api/gallery/${id}`, { ...axiosOpts, headers });
            const g = res.data;
            if (!g?.media_id || !g?.images?.pages) return null;
            const titulo = g.title?.pretty || g.title?.english || g.title?.japanese || `Doujin ${id}`;
            const paginas = g.images.pages.map((p, i) => {
                const ext = NH_EXT_MAP[p.t] || 'jpg';
                return `https://i.nhentai.xxx/galleries/${g.media_id}/${i + 1}.${ext}`;
            });
            return { titulo, paginas, fuente: 'nhentai.xxx', referer: 'https://nhentai.xxx/' };
        },
        // 4. nhentai.xxx scraping HTML (cuando la API falla)
        async () => {
            const headers = { ...HUMAN_HEADERS, Referer: 'https://nhentai.xxx/' };
            const res = await axios.get(`https://nhentai.xxx/g/${id}/`, { ...axiosOpts, headers });
            const html = res.data;
            const mediaMatch = html.match(/\/galleries\/(\d+)\/cover\./i)
                || html.match(/\/galleries\/(\d+)\/1\./i)
                || html.match(/"media_id"\s*:\s*"?(\d+)"?/);
            if (!mediaMatch) return null;
            const mediaId = mediaMatch[1];
            const pagesMatch = html.match(/"num_pages"\s*:\s*(\d+)/) || html.match(/(\d+)\s+page/i);
            const numPages = parseInt(pagesMatch?.[1] || '0');
            if (!numPages || numPages > 500) return null;
            const extMatch = html.match(/\/galleries\/\d+\/1\.(jpg|png|webp)/i);
            const ext = extMatch?.[1] || 'jpg';
            const titulo = (html.match(/<title>([^<|]+)/i) || [])[1]?.trim() || `Doujin ${id}`;
            const paginas = Array.from({ length: numPages }, (_, i) =>
                `https://i.nhentai.xxx/galleries/${mediaId}/${i + 1}.${ext}`
            );
            return { titulo, paginas, fuente: 'nhentai.xxx (html)', referer: 'https://nhentai.xxx/' };
        },
    ];
    for (const fn of intentos) {
        try { const g = await fn(); if (g) return g; }
        catch (e) { logRequestError('nhentai api', e); }
    }
    return null;
}

async function descargarPaginas(urls, max = 60, refererOverride = null) {
    const lista = urls.slice(0, max);
    const buffers = [];
    for (const u of lista) {
        try {
            const referer = refererOverride || (new URL(u).origin + '/');
            const res = await axios.get(u, {
                responseType: 'arraybuffer',
                timeout: 25000,
                headers: { ...HUMAN_HEADERS, Referer: referer }
            });
            buffers.push({ url: u, data: Buffer.from(res.data) });
        } catch (e) { logRequestError('descargar pag', e); }
    }
    return buffers;
}

function empaquetarZip(paginas, nombre) {
    const zip = new AdmZip();
    paginas.forEach((p, i) => {
        const ext = (p.url.match(/\.([a-z0-9]+)(?:\?|$)/i)?.[1] || 'jpg').toLowerCase();
        const num = String(i + 1).padStart(3, '0');
        zip.addFile(`${num}.${ext}`, p.data);
    });
    return zip.toBuffer();
}

async function nhentaiSearch(query) {
    const intentos = [
        async () => {
            const res = await axios.get(
                `https://nhentai.xxx/api/galleries/search?query=${encodeURIComponent(query)}&page=1`,
                axiosOpts
            );
            const resultados = res.data?.result || res.data?.results || [];
            if (!Array.isArray(resultados) || !resultados.length) return null;
            return resultados.slice(0, 6).map(d => ({
                id: String(d.id),
                titulo: d.title?.pretty || d.title?.english || d.title?.japanese || `#${d.id}`,
                paginas: d.num_pages || d.pages || '?',
                tags: (d.tags || []).slice(0, 4).map(t => t.name || t).filter(Boolean).join(', '),
                portada: d.images?.cover ? (() => {
                    const ext = NH_EXT_MAP[d.images.cover.t] || 'jpg';
                    return `https://t.nhentai.xxx/galleries/${d.media_id}/${d.id}.${ext}`;
                })() : null,
                mediaId: d.media_id
            }));
        },
        async () => {
            const res = await axios.get(
                `https://api.siputzx.my.id/api/s/nhentai?query=${encodeURIComponent(query)}`,
                axiosOpts
            );
            const resultados = res.data?.data || res.data?.result || [];
            if (!Array.isArray(resultados) || !resultados.length) return null;
            return resultados.slice(0, 6).map(d => ({
                id: String(d.id),
                titulo: d.title || `#${d.id}`,
                paginas: d.num_pages || '?',
                tags: (d.tags || []).slice(0, 4).join(', '),
                portada: null,
                mediaId: null
            }));
        }
    ];
    for (const fn of intentos) {
        try { const r = await fn(); if (r) return r; }
        catch (e) { logRequestError('nhentai search', e); }
    }
    return null;
}

async function _nhentaiDescargar(sock, jid, id) {
    await sock.sendMessage(jid, { text: `🔞 Descargando doujin *#${id}* de nhentai... ⏳` });
    const gal = await nhentaiObtenerGaleria(id);
    if (!gal) {
        await sock.sendMessage(jid, { text: `❌ No pude obtener el doujin *#${id}*. Puede no existir o las APIs estar caídas.` });
        return;
    }
    await sock.sendMessage(jid, { text: `📚 *${gal.titulo}*\n📄 ${gal.paginas.length} páginas — descargando...` });
    const buffers = await descargarPaginas(gal.paginas, 80, gal.referer || null);
    if (!buffers.length) {
        await sock.sendMessage(jid, { text: '❌ No pude bajar las imágenes del doujin (puede haber bloqueo de IP).' });
        return;
    }
    try {
        const zipBuf = empaquetarZip(buffers, `${id}`);
        const limpioTitulo = gal.titulo.replace(/[^\w\s\-]/g, '').slice(0, 60).trim() || `nhentai_${id}`;
        await sock.sendMessage(jid, {
            document: zipBuf,
            fileName: `${limpioTitulo}_${id}.zip`,
            mimetype: 'application/zip',
            caption: `🔞 *nhentai #${id}*\n📚 ${gal.titulo}\n📄 ${buffers.length}/${gal.paginas.length} páginas\n🌐 ${gal.fuente}`
        });
    } catch (e) {
        logRequestError('nhentai zip', e);
        await sock.sendMessage(jid, { text: `❌ Error empaquetando el doujin: ${e.message}` });
    }
}

async function cmdNhentai(sock, jid, args) {
    const entrada = args.join(' ').trim();

    if (!entrada) {
        await sock.sendMessage(jid, {
            text: [
                '📖 *#nhentai — NHentai para WhatsApp*',
                '',
                '• *#nh <ID>*     → descarga el doujin completo (.zip)',
                '• *#nh <texto>*  → busca doujins por título o tag',
                '',
                '_Ejemplos:_',
                '#nh 177013',
                '#nh touhou full color',
                '#nhentai https://nhentai.net/g/177013/',
            ].join('\n')
        });
        return;
    }

    // Detectar ID: número directo, link nhentai, o link nhentai.xxx
    const idDesdeLink = (entrada.match(/nhentai(?:\.net|\.xxx)\/g\/(\d+)/i) || [])[1];
    const idDirecto = /^\d{3,8}$/.test(entrada.trim()) ? entrada.trim() : null;
    const id = idDesdeLink || idDirecto;

    if (id) {
        await _nhentaiDescargar(sock, jid, id);
    } else {
        // Búsqueda por texto
        await sock.sendMessage(jid, { text: `🔍 Buscando en NHentai: *${entrada}*...` });
        const resultados = await nhentaiSearch(entrada);
        if (!resultados || !resultados.length) {
            await sock.sendMessage(jid, { text: `❌ No encontré doujins para: *${entrada}*` });
            return;
        }
        const lista = resultados.map((d, i) => [
            `*${i + 1}. ${d.titulo}*`,
            `   📄 ${d.paginas} páginas`,
            d.tags ? `   🏷️ ${d.tags}` : '',
            `   🔗 #nh ${d.id}`,
        ].filter(Boolean).join('\n')).join('\n\n');

        await sock.sendMessage(jid, {
            text: [
                `📖 *Resultados de NHentai para: ${entrada}*`,
                `_(${resultados.length} encontrados)_`,
                '',
                lista,
                '',
                '_Usa *#nh <ID>* para descargar el doujin completo._',
            ].join('\n')
        });

        // Preview: portada del primer resultado
        const primero = resultados[0];
        if (primero.portada) {
            try {
                const res = await axios.get(primero.portada, {
                    responseType: 'arraybuffer', timeout: 15_000,
                    headers: { ...HUMAN_HEADERS, Referer: 'https://nhentai.xxx/' }
                });
                await sock.sendMessage(jid, {
                    image: Buffer.from(res.data),
                    caption: `📖 Preview: *${primero.titulo}*\n👆 Usa #nh ${primero.id} para descargar`
                });
            } catch { /* preview opcional */ }
        }
    }
}

// ════════════════════════════════════════════════════
//  HITOMI.LA
// ════════════════════════════════════════════════════
async function hitomiObtenerGaleria(input) {
    const id = (input.match(/(\d{5,})/) || [])[1];
    if (!id) return null;
    const intentos = [
        async () => {
            const res = await axios.get(`https://api.siputzx.my.id/api/d/hitomi?id=${id}`, axiosOpts);
            const d = res.data?.data || res.data?.result || res.data;
            const paginas = d?.images || d?.pages || d?.urls || [];
            if (!paginas?.length) return null;
            return { titulo: d.title || `Hitomi ${id}`, paginas, fuente: 'siputzx' };
        },
        async () => {
            // dorratz — solo si SSL está operativo
            const res = await axios.get(`https://api.dorratz.com/hitomi?id=${id}`, { ...axiosOpts, timeout: 15000 });
            const d = res.data?.data || res.data?.result || res.data;
            const paginas = d?.images || d?.pages || d?.urls || [];
            if (!paginas?.length) return null;
            return { titulo: d.title || `Hitomi ${id}`, paginas, fuente: 'dorratz' };
        },
        // Nota: ltn.hitomi.la está bloqueado a nivel DNS en Replit — no se intenta
    ];
    for (const fn of intentos) {
        try { const g = await fn(); if (g) return g; }
        catch (e) { logRequestError('hitomi api', e); }
    }
    return null;
}

async function hitomiSearch(query) {
    const intentos = [
        async () => {
            const res = await axios.get(
                `https://api.siputzx.my.id/api/s/hitomila?q=${encodeURIComponent(query)}`,
                axiosOpts
            );
            const resultados = res.data?.data || res.data?.result || res.data?.results || [];
            if (!Array.isArray(resultados) || !resultados.length) return null;
            return resultados.slice(0, 6).map(d => ({
                id: String(d.id || d.galleryid || ''),
                titulo: d.title || d.name || `Hitomi ${d.id || '?'}`,
                tipo: d.type || '',
                artistas: (d.artists || []).map(a => a.artist || a.name || a).filter(Boolean).join(', '),
                tags: (d.tags || []).slice(0, 4).map(t => t.tag || t.name || t).filter(Boolean).join(', '),
            })).filter(d => d.id);
        },
        async () => {
            const res = await axios.get(
                `https://api.dorratz.com/hitomi/search?query=${encodeURIComponent(query)}`,
                axiosOpts
            );
            const resultados = res.data?.data || res.data?.result || res.data?.results || [];
            if (!Array.isArray(resultados) || !resultados.length) return null;
            return resultados.slice(0, 6).map(d => ({
                id: String(d.id || d.galleryid || ''),
                titulo: d.title || `Hitomi ${d.id || '?'}`,
                tipo: d.type || '',
                artistas: (d.artists || []).map(a => a.artist || a.name || a).filter(Boolean).join(', '),
                tags: (d.tags || []).slice(0, 4).map(t => t.tag || t.name || t).filter(Boolean).join(', '),
            })).filter(d => d.id);
        }
    ];
    for (const fn of intentos) {
        try { const r = await fn(); if (r && r.length) return r; }
        catch (e) { logRequestError('hitomi search', e); }
    }
    return null;
}

function esEntradaHitomiId(entrada) {
    // ID numérico directo (5-8 dígitos) o link de hitomi.la
    return /^\d{5,8}$/.test(entrada.trim()) || /hitomi\.la/.test(entrada);
}

async function cmdHitomi(sock, jid, args) {
    const entrada = args.join(' ').trim();

    if (!entrada) {
        await sock.sendMessage(jid, {
            text: [
                '📚 *#hitomila — Hitomi.la para WhatsApp*',
                '',
                '• *#hitomi <ID>*     → descarga la galería completa (.zip)',
                '• *#hitomi <link>*   → descarga por URL de hitomi.la',
                '• *#hitomi <texto>*  → busca galerías por título, artista o tag',
                '',
                '_Ejemplos:_',
                '#hitomi 1234567',
                '#hitomila https://hitomi.la/galleries/1234567.html',
                '#hitomi naruto full color',
            ].join('\n')
        });
        return;
    }

    if (esEntradaHitomiId(entrada)) {
        // Descarga directa por ID o link
        await sock.sendMessage(jid, { text: '🔞 Obteniendo galería de *Hitomi.la*... ⏳' });
        const gal = await hitomiObtenerGaleria(entrada);
        if (!gal) {
            await sock.sendMessage(jid, {
                text: [
                    '❌ No pude obtener esa galería de Hitomi.',
                    '',
                    'Posibles causas:',
                    '• La galería fue eliminada o no existe',
                    '• Las APIs públicas están caídas',
                    '• Hitomi bloquea el hosting de Replit',
                ].join('\n')
            });
            return;
        }
        await sock.sendMessage(jid, { text: `📚 *${gal.titulo}*\n📄 ${gal.paginas.length} páginas — descargando...` });
        const buffers = await descargarPaginas(gal.paginas, 60);
        if (!buffers.length) {
            await sock.sendMessage(jid, { text: '❌ No pude descargar las imágenes (Hitomi tiene anti-hotlinking fuerte).' });
            return;
        }
        const zipBuf = empaquetarZip(buffers, 'hitomi');
        const titulo = gal.titulo.replace(/[^\w\s\-]/g, '').slice(0, 60).trim() || 'hitomi';
        await sock.sendMessage(jid, {
            document: zipBuf,
            fileName: `${titulo}.zip`,
            mimetype: 'application/zip',
            caption: `🔞 *Hitomi.la*\n📚 ${gal.titulo}\n📄 ${buffers.length}/${gal.paginas.length} páginas\n🌐 ${gal.fuente}`
        });
    } else {
        // Búsqueda por texto
        await sock.sendMessage(jid, { text: `🔍 Buscando en Hitomi.la: *${entrada}*...` });
        const resultados = await hitomiSearch(entrada);
        if (!resultados || !resultados.length) {
            await sock.sendMessage(jid, {
                text: [
                    `❌ No encontré galerías para: *${entrada}*`,
                    '',
                    '_Tip: Hitomi.la tiene mejor cobertura buscando en inglés o japonés._',
                    '_Si tienes el ID úsalo directo: *#hitomi <ID>*_',
                ].join('\n')
            });
            return;
        }
        const lista = resultados.map((d, i) => {
            const lineas = [`*${i + 1}. ${d.titulo}*`];
            if (d.artistas) lineas.push(`   ✏️ ${d.artistas}`);
            if (d.tipo) lineas.push(`   📂 ${d.tipo}`);
            if (d.tags) lineas.push(`   🏷️ ${d.tags}`);
            if (d.id) lineas.push(`   🔗 #hitomi ${d.id}`);
            return lineas.join('\n');
        }).join('\n\n');

        await sock.sendMessage(jid, {
            text: [
                `📚 *Resultados de Hitomi.la para: ${entrada}*`,
                `_(${resultados.length} encontrados)_`,
                '',
                lista,
                '',
                '_Usa *#hitomi <ID>* para descargar la galería completa._',
            ].join('\n')
        });
    }
}

// ════════════════════════════════════════════════════
//  VERMANGASPORNO
// ════════════════════════════════════════════════════
async function vmpObtenerGaleria(input) {
    const url = input.startsWith('http') ? input : `https://vermangasporno.com/${input}`;
    const intentos = [
        async () => {
            const res = await axios.get(`https://api.siputzx.my.id/api/d/vermangasporno?url=${encodeURIComponent(url)}`, axiosOpts);
            const d = res.data?.data || res.data?.result || res.data;
            const paginas = d?.images || d?.pages || d?.urls || [];
            if (!paginas?.length) return null;
            return { titulo: d.title || 'VerMangasPorno', paginas, fuente: 'siputzx' };
        },
        async () => {
            const res = await axios.get(`https://api.dorratz.com/vermangasporno?url=${encodeURIComponent(url)}`, axiosOpts);
            const d = res.data?.data || res.data?.result || res.data;
            const paginas = d?.images || d?.pages || d?.urls || [];
            if (!paginas?.length) return null;
            return { titulo: d.title || 'VerMangasPorno', paginas, fuente: 'dorratz' };
        },
        async () => {
            // Scraping directo: vermangasporno usa <img class="img-responsive"... data-src="...">
            const res = await axios.get(url, axiosOpts);
            const html = res.data;
            const titulo = (html.match(/<title>([^<]+)<\/title>/) || [])[1]?.trim() || 'VerMangasPorno';
            const regex = /(?:data-src|src)="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
            const paginas = [...html.matchAll(regex)].map(m => m[1])
                .filter(u => /vermangasporno|wp-content|uploads|cdn/i.test(u));
            if (!paginas.length) return null;
            return { titulo: titulo.replace(/\s*-\s*Ver Mangas Porno.*$/i, ''), paginas, fuente: 'scrape' };
        }
    ];
    for (const fn of intentos) {
        try { const g = await fn(); if (g) return g; }
        catch (e) { logRequestError('vmp api', e); }
    }
    return null;
}

async function cmdVermangasporno(sock, jid, args) {
    const input = (args[0] || '').trim();
    if (!input) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#vmp <URL del manga>*\nEjemplo: *#vermangasporno https://vermangasporno.com/manga-xx*' });
        return;
    }
    await sock.sendMessage(jid, { text: '🔞 Procesando manga de *VerMangasPorno*... ⏳' });
    const gal = await vmpObtenerGaleria(input);
    if (!gal) {
        await sock.sendMessage(jid, { text: '❌ No pude obtener el manga (las APIs/sitio pueden estar caídos).' });
        return;
    }
    await sock.sendMessage(jid, { text: `📚 *${gal.titulo}*\n📄 ${gal.paginas.length} páginas — descargando...` });
    const buffers = await descargarPaginas(gal.paginas, 80);
    if (!buffers.length) {
        await sock.sendMessage(jid, { text: '❌ No pude descargar las imágenes.' });
        return;
    }
    const zipBuf = empaquetarZip(buffers, 'vmp');
    const titulo = gal.titulo.replace(/[^\w\s\-]/g, '').slice(0, 60).trim() || 'vermangasporno';
    await sock.sendMessage(jid, {
        document: zipBuf,
        fileName: `${titulo}.zip`,
        mimetype: 'application/zip',
        caption: `🔞 *VerMangasPorno*\n📚 ${gal.titulo}\n📄 ${buffers.length}/${gal.paginas.length} páginas\n🌐 ${gal.fuente}`
    });
}

// ════════════════════════════════════════════════════
//  XNXX
// ════════════════════════════════════════════════════
async function cmdXnxx(sock, jid, args) {
    const url = (args[0] || '').trim();
    if (!url || !/xnxx\.com/.test(url)) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#xnxx <link>*\nEjemplo: *#xnxx https://www.xnxx.com/video-xxxxxxx/...*' });
        return;
    }
    await sock.sendMessage(jid, { text: '🔞 Descargando vídeo de *XNXX*... ⏳' });
    try {
        const info = await ytdlpInfo(url);
        const buffer = await ytdlpDescargarVideo(url, 'xnxx');
        const titulo = info.title ? `🔞 *XNXX*\n🎬 ${info.title}` : '🔞 *XNXX*';
        await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', caption: titulo });
    } catch (err) {
        logRequestError('cmdXnxx', err);
        await sock.sendMessage(jid, { text: `❌ Error XNXX: ${extraerErrorYtdlp(err)}` });
    }
}

// ════════════════════════════════════════════════════
//  PORNHUB
// ════════════════════════════════════════════════════
async function cmdPornhub(sock, jid, args) {
    const url = (args[0] || '').trim();
    if (!url || !/pornhub\.com/.test(url)) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#pornhub <link>*\nEjemplo: *#ph https://www.pornhub.com/view_video.php?viewkey=xxxxx*' });
        return;
    }
    await sock.sendMessage(jid, { text: '🔞 Descargando vídeo de *Pornhub*... ⏳' });
    try {
        const info = await ytdlpInfo(url);
        const buffer = await ytdlpDescargarVideo(url, 'ph');
        const titulo = info.title ? `🔞 *Pornhub*\n🎬 ${info.title}` : '🔞 *Pornhub*';
        await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', caption: titulo });
    } catch (err) {
        logRequestError('cmdPornhub', err);
        await sock.sendMessage(jid, { text: `❌ Error Pornhub: ${extraerErrorYtdlp(err)}` });
    }
}

const TODO_NSFW_DOWNLOADS = ['hitomila', 'hitomi', 'nhentai', 'nh', 'nhdl', 'vermangasporno', 'vmp', 'xnxx', 'pornhub', 'ph'];

module.exports = {
    cmdHitomi, cmdNhentai, cmdVermangasporno, cmdXnxx, cmdPornhub,
    TODO_NSFW_DOWNLOADS
};
