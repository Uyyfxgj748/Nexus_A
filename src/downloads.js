const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const followRedirects = require('follow-redirects');

const execFileAsync = promisify(execFile);
const YTDLP = path.join(__dirname, '..', 'yt-dlp');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const HUMAN_HEADERS = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/'
};
const axiosOpts = { timeout: 25000, headers: HUMAN_HEADERS };
axios.defaults.headers.common = { ...axios.defaults.headers.common, ...HUMAN_HEADERS };

function logRequestError(contexto, err) {
    const txt = String(err?.message || err?.response?.data || '').toLowerCase();
    if (err?.response?.status === 429 || txt.includes('rate-overlimit') || txt.includes('too many requests') || txt.includes('overlimit')) return;
    console.error('ERROR:', contexto, err.response?.data || err.message);
}

// ── Retry para APIs externas inestables (punto 4) ────────────────────────
async function conReintentos(fn, intentos = 2, delayMs = 1000) {
    let ultimoErr;
    for (let i = 0; i < intentos; i++) {
        try { return await fn(); } catch (e) {
            ultimoErr = e;
            const txt = String(e?.message || '').toLowerCase();
            if (txt.includes('rate-overlimit') || txt.includes('429') || txt.includes('too many requests')) throw e;
            if (i < intentos - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        }
    }
    throw ultimoErr;
}

// ── Mensajes de error amigables para descargas (punto 10) ────────────────
function mensajeErrorDescarga(err, plataforma = '') {
    const txt = String(err?.stderr || err?.message || err?.response?.data || '').toLowerCase();
    if (txt.includes('sign in') || txt.includes('age') || txt.includes('login')) {
        return `! ${plataforma} requiere inicio de sesion para ese contenido. Configura las cookies del bot.`;
    }
    if (txt.includes('private') || txt.includes('privad')) {
        return `! Ese contenido es privado y no se puede descargar.`;
    }
    if (txt.includes('not available') || txt.includes('unavailable') || txt.includes('no disponible')) {
        return `! ${plataforma ? plataforma + ': ' : ''}Ese contenido no esta disponible en esta region o fue eliminado.`;
    }
    if (txt.includes('timeout') || txt.includes('econnreset') || txt.includes('econnrefused') || txt.includes('enotfound')) {
        return `! No se pudo conectar al servicio. Intenta de nuevo en unos segundos.`;
    }
    if (txt.includes('too long') || txt.includes('demasiado largo') || txt.includes('duration')) {
        return `! El video es demasiado largo (max 20 min).`;
    }
    const ytdlpMsg = extraerErrorYtdlp(err);
    if (ytdlpMsg && ytdlpMsg !== 'No se pudo descargar el video.') return `✘ ${ytdlpMsg}`;
    return `✘ No se pudo descargar el contenido de ${plataforma || 'esa plataforma'}. Intenta mas tarde.`;
}

async function descargarBuffer(url, headers = {}) {
    const res = await axios.get(url, {
        headers: { ...axiosOpts.headers, ...headers },
        responseType: 'arraybuffer',
        timeout: 60000,
        maxRedirects: 10
    });
    return Buffer.from(res.data);
}

// yt_dlp_ejs (Python, ya incluido como librería opcional) resuelve el EJS/n-challenge
// automáticamente cuando no se fuerza un JS runtime. No se necesitan flags manuales:
// --js-runtimes node:... bloqueaba yt_dlp_ejs porque yt-dlp prefiere JS sobre Python.
const YT_EJS_FLAGS = [];

async function ytdlpEjecutar(args, timeout = 60000) {
    return execFileAsync(YTDLP, [...YT_EJS_FLAGS, ...args], { timeout, maxBuffer: 400 * 1024 * 1024 });
}

// Barra de progreso visual sin emojis
function _barraProgreso(pct, total = 10) {
    pct = Math.max(0, Math.min(100, pct || 0));
    const llenos = Math.round((pct / 100) * total);
    return '▰'.repeat(llenos) + '▱'.repeat(total - llenos) + ` ${Math.round(pct)}%`;
}

// Version de ytdlpEjecutar con soporte de progreso en tiempo real via spawn
async function ytdlpEjecutarConProgreso(args, { timeout = 150000, onProgress } = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(YTDLP, [...YT_EJS_FLAGS, '--progress', '--newline', ...args]);
        let stderr = '', stdout = '', lastUpdate = 0;

        proc.stdout.on('data', d => { stdout += d.toString(); });
        proc.stderr.on('data', d => {
            const chunk = d.toString();
            stderr += chunk;
            if (!onProgress) return;
            const now = Date.now();
            if (now - lastUpdate < 1800) return;
            const m = chunk.match(/\[download\]\s+([\d.]+)%\s+of[\s\S]*?at\s+([\S]+)\s+ETA\s+([\S]+)/);
            if (m) {
                lastUpdate = now;
                onProgress({ pct: parseFloat(m[1]), speed: m[2], eta: m[3] }).catch(() => {});
            }
        });

        const timer = timeout ? setTimeout(() => {
            try { proc.kill('SIGTERM'); } catch {}
            const e = new Error('Timeout'); e.stderr = stderr; reject(e);
        }, timeout) : null;

        proc.on('close', code => {
            if (timer) clearTimeout(timer);
            if (code === 0) resolve({ stdout, stderr });
            else { const e = new Error(`yt-dlp exit ${code}`); e.stderr = stderr; e.stdout = stdout; reject(e); }
        });
        proc.on('error', e => { if (timer) clearTimeout(timer); reject(e); });
    });
}

function ytdlpHeadersArgs(referer = 'https://www.google.com/') {
    return [
        '--add-header', `User-Agent:${UA}`,
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--no-cache-dir'
    ];
}

// ── Carpeta de cookies ─────────────────────────────────────────────────────
// Todos los archivos de cookies viven en /cookies/ para tenerlos centralizados.
// La carpeta se crea automáticamente si no existe.
const COOKIES_DIR            = path.join(__dirname, '..', 'cookies');
fs.mkdirSync(COOKIES_DIR, { recursive: true });

const YT_COOKIES_PATH        = path.join(COOKIES_DIR, 'youtube.txt');
const TIKTOK_COOKIES_PATH    = path.join(COOKIES_DIR, 'tiktok.txt');
const FB_COOKIES_PATH        = path.join(COOKIES_DIR, 'facebook.txt');
const PINTEREST_COOKIES_PATH = path.join(COOKIES_DIR, 'pinterest.txt');
const SPOTIFY_COOKIES_PATH   = path.join(COOKIES_DIR, 'spotify.txt');
const MEDIAFIRE_COOKIES_PATH = path.join(COOKIES_DIR, 'mediafire.txt');

function tieneCookiesValidas(cookiePath) {
    try {
        if (!fs.existsSync(cookiePath)) return false;
        const contenido = fs.readFileSync(cookiePath, 'utf8');
        return contenido.split('\n').some(l => l.trim() && !l.startsWith('#'));
    } catch { return false; }
}

// Convierte un archivo de cookies Netscape a string "Cookie:" para usar en headers HTTP
function parsearCookiesHeader(cookiePath) {
    try {
        if (!tieneCookiesValidas(cookiePath)) return null;
        const contenido = fs.readFileSync(cookiePath, 'utf8');
        const pares = [];
        for (const linea of contenido.split('\n')) {
            if (!linea.trim() || linea.startsWith('#')) continue;
            const partes = linea.split('\t');
            if (partes.length >= 7) {
                pares.push(`${partes[5]}=${partes[6].trim()}`);
            }
        }
        return pares.length > 0 ? pares.join('; ') : null;
    } catch { return null; }
}

function tieneCookiesReales() {
    return tieneCookiesValidas(YT_COOKIES_PATH);
}

// Args para video/búsquedas generales.
// android_vr,android: NO necesitan EJS ni PO token y funcionan en IPs de servidor.
// android,web_safari requería EJS (no disponible en Replit) → reemplazado.
// NOTA: NO incluir --concurrent-fragments aquí; estas funciones se usan también para
// metadatos/búsqueda (--print, ytsearch) donde ese flag rompe la selección de formato.
// Los flags de descarga paralela se añaden en ytdlpDescargarBuffer y cmdYoutubeAudio.
function ytYoutubeArgs() {
    return [
        '--extractor-args', 'youtube:player_client=android_vr,android',
        '--add-header', `User-Agent:${UA}`,
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--no-cache-dir'
    ];
}

// Args optimizados para audio: mweb + android tienen mayor compatibilidad que android_vr
// para descargar audio — android_vr marca ciertos videos como "not available" aunque existan.
function ytYoutubeArgsAudio() {
    return [
        '--extractor-args', 'youtube:player_client=mweb,android',
        '--add-header', `User-Agent:${UA}`,
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--no-cache-dir'
    ];
}

// Args con android_vr como segundo intento para audio (algunos videos solo funcionan así)
function ytYoutubeArgsAudioVr() {
    return [
        '--extractor-args', 'youtube:player_client=android_vr,android',
        '--add-header', `User-Agent:${UA}`,
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--no-cache-dir'
    ];
}

// Args alternativos con cookies vía cliente web — usar solo como fallback para contenido con edad restringida
function ytYoutubeArgsCookies() {
    const hayCookies = tieneCookiesReales();
    const args = [
        '--extractor-args', 'youtube:player_client=web_safari',
        '--add-header', `User-Agent:${UA}`,
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--no-cache-dir'
    ];
    if (hayCookies) {
        args.push('--cookies', YT_COOKIES_PATH);
    }
    return args;
}

// Flags que solo aplican durante descargas reales (no para búsqueda/metadatos)
const YT_DOWNLOAD_SPEED_FLAGS = ['--concurrent-fragments', '4', '--buffer-size', '16K'];

function extraerErrorYtdlp(err) {
    const txt = (err.stderr || err.stdout || err.message || '').toString();
    const linea = txt.split('\n').find(l => l.includes('ERROR:'));
    if (linea) return linea.replace('ERROR:', '').replace(/\[.*?\]/g, '').trim();
    return 'No se pudo descargar el video.';
}

function esUrlYoutube(t) {
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/.test(t);
}

function formatearSegundos(seg) {
    if (!seg || isNaN(seg)) return null;
    const m = Math.floor(seg / 60), s = Math.floor(seg % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatearBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return null;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}

function formatearVistas(n) {
    if (!n || isNaN(n)) return null;
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(n);
}

function extraerUrlsMedia(obj) {
    const urls = [];
    const visitar = (valor) => {
        if (!valor) return;
        if (typeof valor === 'string') {
            if (/^https?:\/\/.+\.(mp4|jpg|jpeg|png|webp)(\?|$)/i.test(valor)) urls.push(valor);
            return;
        }
        if (Array.isArray(valor)) {
            valor.forEach(visitar);
            return;
        }
        if (typeof valor === 'object') {
            Object.values(valor).forEach(visitar);
        }
    };
    visitar(obj);
    return [...new Set(urls)];
}

function construirCaption(plataforma, titulo, duracion, tamano, extras = {}) {
    let cap = `*${titulo || plataforma}*\n`;
    const lineas = [];
    if (duracion) lineas.push(`✘ Duracion: ${duracion}`);
    if (tamano) lineas.push(`▣ Tamano: ${tamano}`);
    if (extras.canal) lineas.push(`☰ Canal: ${extras.canal}`);
    if (extras.vistas) lineas.push(`◎ Vistas: ${extras.vistas}`);
    if (extras.autor) lineas.push(`✒ Autor: ${extras.autor}`);
    lineas.push(`† Fuente: ${plataforma}`);
    return cap + '\n' + lineas.join('\n');
}

// ── Obtener info completa del video ───────────────────────────────────────
async function ytdlpInfo(url) {
    const isYT = esUrlYoutube(url);
    const parseSalida = (stdout) => {
        const [titulo, durStr, sizeStr, autor, viewsStr, thumbnail] = stdout.trim().split('\t');
        return {
            titulo:    titulo    && titulo    !== 'NA' && titulo    !== 'None' ? titulo    : null,
            duracion:  parseInt(durStr) || 0,
            tamano:    formatearBytes(parseInt(sizeStr)),
            autor:     autor     && autor     !== 'NA' && autor     !== 'None' ? autor     : null,
            vistas:    viewsStr  && viewsStr  !== 'NA' && viewsStr  !== 'None' ? formatearVistas(parseInt(viewsStr)) : null,
            thumbnail: thumbnail && thumbnail !== 'NA' && thumbnail !== 'None' ? thumbnail.trim() : null
        };
    };
    // -f bestaudio/best/mhtml: evita "Requested format is not available" cuando el IP
    // está bloqueado por YouTube y solo hay storyboards disponibles (sin EJS funcional).
    const printArgs = ['-f', 'bestaudio/best/mhtml', '--print', '%(title)s\t%(duration)s\t%(filesize_approx)s\t%(uploader)s\t%(view_count)s\t%(thumbnail)s', '--no-playlist', '--no-warnings', '--quiet'];
    try {
        const baseYtArgs = isYT ? ytYoutubeArgs() : ytdlpHeadersArgs();
        // Si hay cookies, se agregan al primer intento para evitar bot-check en IPs bloqueadas
        const cookiesExtra = (isYT && tieneCookiesReales()) ? ['--cookies', YT_COOKIES_PATH] : [];
        const { stdout } = await ytdlpEjecutar([url, ...printArgs, ...baseYtArgs, ...cookiesExtra], 30000);
        return parseSalida(stdout);
    } catch (err) {
        // Fallback con cookies+web para contenido con restricción de edad
        if (isYT && tieneCookiesReales()) {
            const txt = String(err?.stderr || err?.message || '').toLowerCase();
            if (txt.includes('sign in') || txt.includes('age') || txt.includes('login') || txt.includes('unavailable') || txt.includes('bot') || txt.includes('format')) {
                try {
                    const { stdout } = await ytdlpEjecutar([url, ...printArgs, ...ytYoutubeArgsCookies()], 30000);
                    return parseSalida(stdout);
                } catch { }
            }
        }
        logRequestError('ytdlpInfo', err);
        return { titulo: null, duracion: 0, tamano: null, autor: null, vistas: null, thumbnail: null };
    }
}

// ── Enviar tarjeta de info del video como mensaje NUEVO (msg 2 del flujo 3-mensajes) ──
async function enviarInfoCard(sock, jid, info, url, tipo = 'video') {
    const durStr = formatearSegundos(info.duracion);
    const accion = tipo === 'audio' ? '_[ Descargando audio... ]_' : '_[ Descargando video... ]_';

    const captionCard = [
        info.titulo ? `*${info.titulo}*` : '*Sin titulo*',
        '',
        durStr      ? `✘ Duracion: ${durStr}` : null,
        info.autor  ? `☰ Canal: ${info.autor}` : null,
        info.vistas ? `◎ Vistas: ${info.vistas}` : null,
        url         ? `↗ ${url}` : null,
        '',
        accion
    ].filter(l => l !== null).join('\n');

    try {
        if (info.thumbnail) {
            await sock.sendMessage(jid, { image: { url: info.thumbnail }, caption: captionCard });
            return;
        }
    } catch { }

    await sock.sendMessage(jid, { text: captionCard });
}

// ── CORE: descargar con yt-dlp ────────────────────────────────────────────
// onProgress: async ({ pct, speed, eta }) => { ... } — se llama cada ~1.8s durante descarga
async function ytdlpDescargarBuffer(url, { formato = null, merge = false, cookiesPath = null, ytArgs = null, onProgress = null } = {}) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tmpBase = path.join(os.tmpdir(), `ytdlp_${id}`);
    const outputTemplate = `${tmpBase}.%(ext)s`;
    const isYT = esUrlYoutube(url);

    const construirArgs = (extraYtArgs) => {
        const a = [
            url,
            '-o', outputTemplate,
            '--no-playlist',
            '--no-part',
            '--no-check-certificates',
            ...(extraYtArgs || (isYT ? ytYoutubeArgs() : ytdlpHeadersArgs())),
            ...(isYT ? YT_DOWNLOAD_SPEED_FLAGS : [])
        ];
        if (cookiesPath && fs.existsSync(cookiesPath)) a.push('--cookies', cookiesPath);
        if (formato) a.push('-f', formato);
        else a.push('-f', 'bv*+ba/b');
        if (merge) a.push('--merge-output-format', 'mp4');
        return a;
    };

    const leerArchivo = async () => {
        const tmpDir = os.tmpdir();
        const baseNombre = path.basename(tmpBase);
        const archivos = fs.readdirSync(tmpDir)
            .filter(f => f.startsWith(baseNombre) && !f.endsWith('.part') && !f.endsWith('.ytdl'));
        if (!archivos.length) throw new Error('No se genero ningun archivo de video.');
        const archivoFinal = path.join(tmpDir, archivos[0]);
        const stat = await fs.stat(archivoFinal);
        const buffer = await fs.readFile(archivoFinal);
        await fs.remove(archivoFinal).catch(() => {});
        return { buffer, tamano: formatearBytes(stat.size) };
    };

    const limpiarTmp = async () => {
        try {
            const base = path.basename(tmpBase);
            const archivos = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(base));
            await Promise.all(archivos.map(f => fs.remove(path.join(os.tmpdir(), f)).catch(() => {})));
        } catch { }
    };

    // Para YouTube: primero android_vr,android sin cookies (funciona en IPs de servidor).
    // Fallback: web_safari+cookies para contenido con restricción de edad.
    // android_vr/android NO aceptan cookies — pasarlas los descarta y deja solo web_safari+EJS roto.
    const ytArgsPrimary = ytArgs || (isYT ? ytYoutubeArgs() : null);

    try {
        if (onProgress) {
            await ytdlpEjecutarConProgreso(construirArgs(ytArgsPrimary), { timeout: 150000, onProgress });
        } else {
            await ytdlpEjecutar(construirArgs(ytArgsPrimary), 150000);
        }
        return await leerArchivo();
    } catch (err) {
        // Fallback con cookies (web_safari) para contenido con restricción de edad
        if (isYT && !ytArgs && tieneCookiesReales()) {
            try {
                if (onProgress) {
                    await ytdlpEjecutarConProgreso(construirArgs(ytYoutubeArgsCookies()), { timeout: 150000, onProgress });
                } else {
                    await ytdlpEjecutar(construirArgs(ytYoutubeArgsCookies()), 150000);
                }
                return await leerArchivo();
            } catch (err2) {
                await limpiarTmp();
                throw err2;
            }
        }
        await limpiarTmp();
        throw err;
    }
}

async function ytdlpDirectMedia(url, formato = 'best[ext=mp4][height<=720]/best[height<=720]/best') {
    const isYT = esUrlYoutube(url);
    const { stdout } = await ytdlpEjecutar([
        url,
        '-J',
        '-f', formato,
        '--no-playlist',
        '--no-warnings',
        '--quiet',
        ...(isYT ? ytYoutubeArgs() : ytdlpHeadersArgs())
    ], 60000);
    const info = JSON.parse(stdout);
    const formatos = Array.isArray(info.formats) ? info.formats : [];
    const conVideo = formatos
        .filter(f => f.url && f.vcodec !== 'none' && /\.(mp4|m3u8|webm)(\?|$)/i.test(f.url))
        .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.tbr || 0) - (a.tbr || 0));
    const elegido = conVideo[0] || formatos.find(f => f.url && f.vcodec !== 'none') || (info.url ? info : null);
    if (!elegido?.url) throw new Error('No se encontró enlace directo de video.');
    return {
        url: elegido.url,
        titulo: info.title,
        duracion: info.duration,
        autor: info.uploader,
        vistas: formatearVistas(info.view_count),
        thumbnail: info.thumbnail
    };
}

async function descargarDirectoConYtdlp(url, plataforma) {
    const info = await ytdlpDirectMedia(url);
    const buffer = await descargarBuffer(info.url);
    return {
        buffer,
        tamano: formatearBytes(buffer.length),
        info
    };
}

// ── Resolver URL final (sigue redirects, útil para URLs cortas) ───────────
function resolverUrlFinal(url) {
    return new Promise((resolve) => {
        try {
            const lib = url.startsWith('https') ? followRedirects.https : followRedirects.http;
            const req = lib.get(url, {
                headers: { ...HUMAN_HEADERS, Accept: 'text/html,*/*' },
                timeout: { connect: 6000, socket: 6000, response: 6000 },
                maxRedirects: 10
            }, (res) => {
                resolve(res.responseUrl || url);
                res.resume();
                res.destroy();
            });
            req.on('error', () => resolve(url));
        } catch { resolve(url); }
    });
}

// ── TikTok via tikmate.app ─────────────────────────────────────────────────
async function tiktokTikmate(url) {
    const res = await axios.post(
        'https://api.tikmate.app/api/lookup',
        new URLSearchParams({ url }).toString(),
        {
            headers: {
                ...HUMAN_HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://tikmate.app/',
                'Origin': 'https://tikmate.app'
            },
            timeout: 25000
        }
    );
    const { token, id, success } = res.data || {};
    if (!success || !token || !id) throw new Error(`tikmate: ${res.data?.message || 'sin token'}`);
    const videoUrl = `https://tikmate.app/download/${token}/${id}/0.mp4`;
    const buffer = await descargarBuffer(videoUrl, { Referer: 'https://tikmate.app/' });
    if (buffer.length < 5000) throw new Error('tikmate: buffer vacío');
    return {
        buffer,
        tamano: formatearBytes(buffer.length),
        info: {
            titulo: res.data?.desc || 'Video de TikTok',
            duracion: res.data?.duration || 0,
            autor: res.data?.username || null
        }
    };
}

// ── Facebook via fdown.net / getfvid.com ──────────────────────────────────
async function facebookApiDescargar(url) {
    // 1. fdown.net
    try {
        const res = await axios.post(
            'https://fdown.net/download.php',
            new URLSearchParams({ URLz: url }).toString(),
            {
                headers: {
                    ...HUMAN_HEADERS,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': 'https://fdown.net/',
                    'Origin': 'https://fdown.net'
                },
                timeout: 25000
            }
        );
        const hdMatch = res.data?.match(/href="(https?:\/\/video[^"]+\.mp4[^"]*)"/i);
        if (hdMatch) return hdMatch[1].replace(/&amp;/g, '&');
        const sdMatch = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i);
        if (sdMatch) return sdMatch[1].replace(/&amp;/g, '&');
    } catch (e) { logRequestError('facebook fdown', e); }

    // 2. getfvid.com
    try {
        const res = await axios.post(
            'https://www.getfvid.com/downloader',
            new URLSearchParams({ url }).toString(),
            {
                headers: {
                    ...HUMAN_HEADERS,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': 'https://www.getfvid.com/',
                    'Origin': 'https://www.getfvid.com'
                },
                timeout: 25000
            }
        );
        const match = res.data?.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i);
        if (match) return match[1].replace(/&amp;/g, '&');
        const anyMp4 = res.data?.match(/(https?:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?)/i);
        if (anyMp4) return anyMp4[1];
    } catch (e) { logRequestError('facebook getfvid', e); }

    return null;
}

// ── Instagram via snapinsta.app ────────────────────────────────────────────
async function instagramSnapinsta(url) {
    const res = await axios.post(
        'https://api.snapinsta.app/v1/media',
        new URLSearchParams({ url }).toString(),
        {
            headers: {
                ...HUMAN_HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://snapinsta.app/',
                'Origin': 'https://snapinsta.app'
            },
            timeout: 25000
        }
    );
    const data = res.data?.data;
    if (!Array.isArray(data) || !data.length) throw new Error('snapinsta: sin datos');
    const video = data.find(d => d.type === 'video') || data[0];
    if (!video?.url) throw new Error('snapinsta: sin URL');
    return video.url;
}

async function tiktokFallbackTikwm(url) {
    const res = await axios.post(
        'https://www.tikwm.com/api/',
        new URLSearchParams({ url, hd: '1' }).toString(),
        {
            headers: {
                ...HUMAN_HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://www.tikwm.com/'
            },
            timeout: 25000
        }
    );
    const data = res.data?.data;

    // Slideshow / carrusel de fotos — TikWM devuelve data.images[] en estos casos
    if (Array.isArray(data?.images) && data.images.length > 0) {
        return {
            isSlideshow: true,
            imageUrls: data.images,
            musicUrl:  data.music || null,          // MP3 del audio de fondo
            info: {
                titulo:    data.title || 'Fotos de TikTok',
                autor:     data.author?.nickname || data.author?.unique_id || null,
                thumbnail: data.origin_cover || data.cover || null,
                musica:    data.music_info?.title  || null,
                musicaAutor: data.music_info?.author || null
            }
        };
    }

    const videoUrl = data?.hdplay || data?.play || data?.wmplay;
    if (!videoUrl) throw new Error(res.data?.msg || 'TikWM no devolvió video.');
    const buffer = await descargarBuffer(videoUrl, { Referer: 'https://www.tikwm.com/' });
    return {
        buffer,
        tamano: formatearBytes(buffer.length),
        info: {
            titulo: data.title || 'Video de TikTok',
            duracion: data.duration || 0,
            autor: data.author?.nickname || data.author?.unique_id || null
        }
    };
}

// ── Buscar video en YouTube ───────────────────────────────────────────────
async function ytdlpBuscarUrl(query) {
    // -f bestaudio/best/mhtml: permite que --print funcione incluso cuando YouTube
    // solo devuelve storyboards (por IP bloqueada sin EJS funcional). Sin este flag,
    // el selector de formato por defecto falla con "Requested format is not available".
    const baseArgs = [
        `ytsearch1:${query}`,
        '-f', 'bestaudio/best/mhtml',
        '--print', '%(webpage_url)s\t%(title)s\t%(duration)s',
        '--no-playlist', '--quiet', '--no-warnings',
    ];
    const hayCookies = tieneCookiesReales();
    // android_vr,android: primario siempre — no necesita cookies ni EJS, funciona en IPs de servidor.
    // web_safari+cookies: fallback para contenido con restricción de edad (requiere cookies).
    // mweb,android: último recurso (requiere PO token en algunos videos).
    const intentos = [
        { args: ytYoutubeArgs(),        addCookies: false },  // android_vr,android — no cookies
        ...(hayCookies ? [{ args: ytYoutubeArgsCookies(), addCookies: false }] : []),  // web_safari+cookies
        { args: ytYoutubeArgsAudio(),   addCookies: false },  // mweb,android — último recurso
    ];
    let ultimoError;
    for (const intento of intentos) {
        try {
            const ytArgs = intento.addCookies
                ? [...intento.args, '--cookies', YT_COOKIES_PATH]
                : intento.args;
            const { stdout } = await ytdlpEjecutar([...baseArgs, ...ytArgs], 30000);
            const linea = stdout.trim().split('\n')[0];
            if (!linea) throw new Error('No se encontraron resultados.');
            const [url, titulo, duracion] = linea.split('\t');
            return { url, titulo: titulo || 'Sin título', duracion: parseInt(duracion) || 0 };
        } catch (err) {
            ultimoError = err;
            const txt = String(err?.stderr || err?.message || '').toLowerCase();
            // Solo reintenta si el error es de autenticación/bot — otros errores los lanza directo
            if (!txt.includes('sign in') && !txt.includes('login') && !txt.includes('bot') && !txt.includes('confirm')) throw err;
        }
    }
    throw ultimoError;
}

// ════════════════════════════════════════════════════
//  YOUTUBE - VIDEO (link directo)
// ════════════════════════════════════════════════════
async function cmdYoutube(sock, jid, args) {
    const url = args[0];
    if (!url || !esUrlYoutube(url)) {
        await sock.sendMessage(jid, { text: '✘ Ingresa un link valido de YouTube.\n† Uso: *#yt <link>*' });
        return;
    }
    const sent = await sock.sendMessage(jid, { text: '*[ YOUTUBE ]* _Obteniendo informacion..._' });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };
    try {
        const info = await ytdlpInfo(url);
        if (info.duracion > 1200) {
            await editar('*[ YOUTUBE ]*\n\n✘ El video es muy largo. Maximo 20 minutos.\nUsa *#ytv <nombre>* para buscar.');
            return;
        }
        // Msg 2: info card — mensaje nuevo
        await enviarInfoCard(sock, jid, info, url, 'video');
        // Msg 1 editado: progreso inicial
        await editar(`*[ YOUTUBE ]* _Descargando video..._\n\n${_barraProgreso(0)}`);
        const formato = 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[ext=mp4][height<=1080]/best[height<=1080]/best';
        const onProgress = async ({ pct, speed, eta }) => {
            await editar(`*[ YOUTUBE ]* _Descargando video..._\n\n${_barraProgreso(pct)}\n_Vel: ${speed} — ETA: ${eta}_`);
        };
        const { buffer, tamano } = await ytdlpDescargarBuffer(url, { formato, merge: true, onProgress });
        const caption = construirCaption('YouTube', info.titulo || 'Video de YouTube', formatearSegundos(info.duracion), info.tamano || tamano, { canal: info.autor, vistas: info.vistas });
        // Msg 3: video — mensaje nuevo
        await sock.sendMessage(jid, { video: buffer, caption });
        await editar('*[ YOUTUBE ]*\n\n★ _Video enviado._');
    } catch (err) {
        logRequestError('cmdYoutube', err);
        await editar(`*[ YOUTUBE ]*\n\n✘ ${mensajeErrorDescarga(err, 'YouTube')}`);
    }
}

// ════════════════════════════════════════════════════
//  YOUTUBE - AUDIO (#play)
// ════════════════════════════════════════════════════
async function cmdYoutubeAudio(sock, jid, args) {
    let consulta = args.join(' ');
    if (!consulta) {
        await sock.sendMessage(jid, { text: '✘ Uso: *#play <link o cancion>*' });
        return;
    }

    const sent = await sock.sendMessage(jid, {
        text: esUrlYoutube(consulta) ? '*[ YOUTUBE ]* _Obteniendo informacion..._' : `*[ BUSCANDO ]* _${consulta}_`
    });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };

    let urlFinal = consulta, infoFinal = null;

    if (!esUrlYoutube(consulta)) {
        try {
            const r = await ytdlpBuscarUrl(consulta);
            urlFinal = r.url;
        } catch (err) {
            logRequestError('cmdYoutubeAudio search', err);
            await editar(`*[ YOUTUBE ]*\n\n✘ No encontre resultados para: *${consulta}*`);
            return;
        }
    }

    infoFinal = await ytdlpInfo(urlFinal);
    // Msg 2: info card — mensaje nuevo
    await enviarInfoCard(sock, jid, infoFinal, urlFinal, 'audio');
    // Msg 1 editado: progreso inicial
    await editar(`*[ YOUTUBE ]* _Descargando audio..._\n\n${_barraProgreso(0)}`);

    const tmpBase = path.join(os.tmpdir(), `yta_${Date.now()}`);
    const tmpMp3 = `${tmpBase}.mp3`;
    const onProgress = async ({ pct, speed, eta }) => {
        await editar(`*[ YOUTUBE ]* _Descargando audio..._\n\n${_barraProgreso(pct)}\n_Vel: ${speed} — ETA: ${eta}_`);
    };
    const mkAudioArgs = (ytArgs) => [
        urlFinal, '-x', '--audio-format', 'mp3', '--audio-quality', '5',
        '-o', `${tmpBase}.%(ext)s`, '--no-playlist', '--quiet', '--no-warnings',
        ...ytArgs,
        ...YT_DOWNLOAD_SPEED_FLAGS
    ];
    const intentos = [
        { args: ytYoutubeArgsAudio(),   label: 'mweb,android' },
        { args: ytYoutubeArgsAudioVr(), label: 'android_vr,android' },
        ...(tieneCookiesReales() ? [{ args: ytYoutubeArgsCookies(), label: 'web+cookies' }] : []),
    ];
    let ultimoError = null;
    try {
        let descargado = false;
        for (const intento of intentos) {
            try {
                await ytdlpEjecutarConProgreso(mkAudioArgs(intento.args), { timeout: 120000, onProgress });
                descargado = true;
                break;
            } catch (err) {
                ultimoError = err;
                const txt = String(err?.stderr || err?.message || '').toLowerCase();
                if (txt.includes('too large') || txt.includes('format not available')) throw err;
            }
        }
        if (!descargado) throw ultimoError;
        const buffer = await fs.readFile(tmpMp3);
        // Msg 3: audio — mensaje nuevo
        await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg', ptt: false });
        await fs.remove(tmpMp3).catch(() => {});
        await editar('*[ YOUTUBE ]*\n\n★ _Audio enviado._');
    } catch (err) {
        logRequestError('cmdYoutubeAudio', ultimoError || err);
        await fs.remove(tmpMp3).catch(() => {});
        await editar(`*[ YOUTUBE ]*\n\n✘ ${mensajeErrorDescarga(ultimoError || err, 'YouTube Audio')}`);
    }
}

// ════════════════════════════════════════════════════
//  YOUTUBE - BUSCAR
// ════════════════════════════════════════════════════
async function cmdYoutubeSearch(sock, jid, args) {
    const query = args.join(' ');
    if (!query) { await sock.sendMessage(jid, { text: '✘ Uso: *#ytsearch <busqueda>*' }); return; }
    const sent = await sock.sendMessage(jid, { text: `*[ BUSCANDO ]* _${query}_` });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };
    try {
        const { stdout } = await ytdlpEjecutar([
            `ytsearch5:${query}`, '--print', '%(webpage_url)s\t%(title)s\t%(duration_string)s',
            '--no-playlist', '--quiet', '--no-warnings',
            ...ytYoutubeArgs()
        ], 30000);
        const lineas = stdout.trim().split('\n').filter(Boolean);
        if (!lineas.length) { await editar('*[ YOUTUBE ]*\n\n✘ No se encontraron resultados.'); return; }
        let texto = `*[ YOUTUBE ]* _Resultados: ${query}_\n\n`;
        lineas.forEach((linea, i) => {
            const [url, titulo, dur] = linea.split('\t');
            texto += `*${i + 1}.* ${titulo || 'Sin titulo'} _(${dur || ''})_\n↗ ${url}\n\n`;
        });
        texto += '† Video: *#yt <link>* | Audio: *#play <link>*';
        await editar(texto);
    } catch (err) {
        logRequestError('cmdYoutubeSearch', err);
        await editar(`*[ YOUTUBE ]*\n\n✘ ${mensajeErrorDescarga(err, 'YouTube Busqueda')}`);
    }
}

// ════════════════════════════════════════════════════
//  YOUTUBE - BUSCAR Y DESCARGAR VIDEO (#ytv)
// ════════════════════════════════════════════════════
async function cmdYoutubeVideoSearch(sock, jid, args) {
    const query = args.join(' ');
    if (!query) { await sock.sendMessage(jid, { text: '✘ Uso: *#ytv <nombre del video>*' }); return; }
    const sent = await sock.sendMessage(jid, { text: `*[ BUSCANDO ]* _${query}_` });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };
    try {
        const resultado = await ytdlpBuscarUrl(query);
        if (resultado.duracion > 1200) {
            await editar(`*[ YOUTUBE ]*\n\n✘ El video _${resultado.titulo}_ supera los 20 minutos.\n_Intenta buscar un video mas corto._`);
            return;
        }
        const info = await ytdlpInfo(resultado.url);
        // Msg 2: info card — mensaje nuevo
        await enviarInfoCard(sock, jid, { ...info, titulo: resultado.titulo }, resultado.url, 'video');
        // Msg 1 editado: progreso inicial
        await editar(`*[ YOUTUBE ]* _Descargando video..._\n\n${_barraProgreso(0)}`);
        const formato = 'bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4][height<=720]/best[height<=720]/best[ext=mp4]/best';
        const onProgress = async ({ pct, speed, eta }) => {
            await editar(`*[ YOUTUBE ]* _Descargando video..._\n\n${_barraProgreso(pct)}\n_Vel: ${speed} — ETA: ${eta}_`);
        };
        const { buffer, tamano } = await ytdlpDescargarBuffer(resultado.url, { formato, merge: true, onProgress });
        const caption = construirCaption('YouTube', resultado.titulo, formatearSegundos(resultado.duracion), tamano, { canal: info.autor, vistas: info.vistas });
        // Msg 3: video — mensaje nuevo
        await sock.sendMessage(jid, { video: buffer, caption });
        await editar('*[ YOUTUBE ]*\n\n★ _Video enviado._');
    } catch (err) {
        logRequestError('cmdYoutubeVideoSearch', err);
        await editar(`*[ YOUTUBE ]*\n\n✘ ${mensajeErrorDescarga(err, 'YouTube')}`);
    }
}

// ════════════════════════════════════════════════════
//  UTILIDAD — Resolver URLs cortas (vt.tiktok.com, etc.)
// ════════════════════════════════════════════════════
async function resolverUrlCorta(url) {
    try {
        // Seguimos los redirects y devolvemos la URL final
        const resp = await axios.get(url, {
            maxRedirects: 10,
            timeout: 10000,
            validateStatus: () => true,
            headers: { 'User-Agent': UA }
        });
        // axios/node guarda la URL final en responseUrl
        const final = resp.request?.res?.responseUrl || resp.config?.url || url;
        return final;
    } catch {
        return url;
    }
}

// ════════════════════════════════════════════════════
//  TIKTOK - VIDEO
// ════════════════════════════════════════════════════
function esTiktokUrl(url) {
    if (!url) return false;
    return /tiktok\.com|vt\.tiktok|vm\.tiktok|m\.tiktok\.com|www\.tiktok\.com|t\.tiktok\.com/.test(url);
}

// Detecta si un buffer es audio (MP3/AAC/OGG) en lugar de video
function esBufferAudio(buffer) {
    if (!buffer || buffer.length < 4) return false;
    // ID3 (MP3 con etiqueta)
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return true;
    // MP3 sin etiqueta (sync word)
    if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) return true;
    // OGG
    if (buffer[0] === 0x4F && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) return true;
    return false;
}

async function cmdTiktok(sock, jid, args) {
    const url = args[0];
    if (!url || !esTiktokUrl(url)) {
        await sock.sendMessage(jid, { text: '✘ Ingresa un link valido de TikTok.\n† Uso: *#tt <link>*\n_Para solo audio usa *#ttplay <link>*\n_Acepta links cortos y largos_' });
        return;
    }
    const sent = await sock.sendMessage(jid, { text: '*[ TIKTOK ]* _Descargando video..._' });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };
    try {
        let buffer, tamano, info = { titulo: 'Video de TikTok', duracion: 0, autor: null };

        const esCorta = /vt\.tiktok|vm\.tiktok|t\.tiktok/.test(url);
        const urlFinal = esCorta ? await resolverUrlCorta(url) : url;

        // 1. TikWM
        try {
            const tw = await tiktokFallbackTikwm(urlFinal);
            // TikWM detectó un slideshow — redirigir al usuario
            if (tw.isSlideshow) {
                await editar(`*[ TIKTOK ]*\n\n! Este TikTok es un carrusel de fotos, no un video.\n_Usa *#ttfotos ${url}* para obtener las imágenes y el audio._`);
                return;
            }
            buffer = tw.buffer; tamano = tw.tamano; info = tw.info;
        } catch (twErr) {
            logRequestError('tiktok tikwm', twErr);

            // 2. Tikmate
            try {
                const tm = await tiktokTikmate(urlFinal);
                buffer = tm.buffer; tamano = tm.tamano; info = tm.info;
            } catch (tmErr) {
                logRequestError('tiktok tikmate', tmErr);

                // 3. yt-dlp
                const cookiesArgs = tieneCookiesValidas(TIKTOK_COOKIES_PATH) ? { cookiesPath: TIKTOK_COOKIES_PATH } : {};
                if (!tieneCookiesValidas(TIKTOK_COOKIES_PATH)) {
                    await editar(
                        `*[ TIKTOK ]*\n\n✘ *TikTok bloquea descargas desde la IP del servidor.*\n\n` +
                        `*Solucion — configura tus cookies de TikTok:*\n` +
                        `1. Instala la extension _"Get cookies.txt LOCALLY"_ en Chrome/Firefox\n` +
                        `2. Visita *tiktok.com* con tu cuenta\n` +
                        `3. Haz clic en la extension y exporta las cookies\n` +
                        `4. Guarda el archivo como *cookies/tiktok.txt* en la carpeta del bot\n\n` +
                        `_Solo hay que hacerlo una vez._`
                    );
                    return;
                }
                const dl = await ytdlpDescargarBuffer(url, {
                    ...cookiesArgs,
                    formato: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                    merge: true
                });
                buffer = dl.buffer; tamano = dl.tamano;
            }
        }

        if (esBufferAudio(buffer)) {
            await editar(`*[ TIKTOK ]*\n\n! Este TikTok es de solo audio o slideshow, no contiene video.\n_Usa *#ttplay ${url}* para obtener el audio._`);
            return;
        }

        const caption = construirCaption('TikTok', info.titulo || 'Video de TikTok', formatearSegundos(info.duracion), tamano, { autor: info.autor });
        // Msg 2: info card — mensaje nuevo
        await enviarInfoCard(sock, jid, info, url, 'video');
        // Msg 3: video — mensaje nuevo
        await sock.sendMessage(jid, { video: buffer, caption, mimetype: 'video/mp4' });
        await editar('*[ TIKTOK ]*\n\n★ _Video enviado._');
    } catch (err) {
        logRequestError('cmdTiktok', err);
        await editar(`*[ TIKTOK ]*\n\n✘ ${mensajeErrorDescarga(err, 'TikTok')}`);
    }
}

// ════════════════════════════════════════════════════
//  TIKTOK - AUDIO
// ════════════════════════════════════════════════════
async function cmdTiktokAudio(sock, jid, args) {
    const url = args[0];
    if (!url || !esTiktokUrl(url)) {
        await sock.sendMessage(jid, { text: '✘ Ingresa un link valido de TikTok.\n† Uso: *#ttplay <link>*' });
        return;
    }
    const sent = await sock.sendMessage(jid, { text: '*[ TIKTOK ]* _Extrayendo audio..._' });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };
    const tmpBase = path.join(os.tmpdir(), `ttaudio_${Date.now()}`);
    const tmpMp3 = `${tmpBase}.mp3`;
    const hasCookies = tieneCookiesValidas(TIKTOK_COOKIES_PATH);
    const cookiesArgs = hasCookies ? ['--cookies', TIKTOK_COOKIES_PATH] : [];
    try {
        await ytdlpEjecutar([
            url, '-x', '--audio-format', 'mp3', '--audio-quality', '5',
            '-o', `${tmpBase}.%(ext)s`, '--no-playlist', '--no-part',
            '--no-check-certificates',
            ...ytdlpHeadersArgs(),
            ...cookiesArgs
        ], 90000);
        const buffer = await fs.readFile(tmpMp3);
        // Msg 3: audio — mensaje nuevo
        await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg', ptt: false });
        await fs.remove(tmpMp3).catch(() => {});
        await editar('*[ TIKTOK ]*\n\n★ _Audio enviado._');
    } catch (err) {
        logRequestError('cmdTiktokAudio', err);
        await fs.remove(tmpMp3).catch(() => {});
        const bloqueado = (err.stderr || err.message || '').includes('blocked');
        if (bloqueado && !hasCookies) {
            await editar(
                `*[ TIKTOK ]*\n\n✘ *TikTok bloquea el acceso desde la IP del servidor.*\n` +
                `Configura *cookies/tiktok.txt* para que funcione.\n` +
                `_(usa el comando #ttplay para ver las instrucciones)_`
            );
        } else {
            await editar(`*[ TIKTOK ]*\n\n✘ ${mensajeErrorDescarga(err, 'TikTok Audio')}`);
        }
    }
}

// ════════════════════════════════════════════════════
//  TIKTOK - FOTOS / SLIDESHOW
// ════════════════════════════════════════════════════
async function cmdTiktokFotos(sock, jid, args) {
    const url = args[0];
    if (!url || !esTiktokUrl(url)) {
        await sock.sendMessage(jid, { text: '✘ Ingresa un link valido de TikTok.\n† Uso: *#ttfotos <link>*\n_Solo funciona con TikToks hechos con imágenes (carrusel/slideshow)._' });
        return;
    }

    const sent = await sock.sendMessage(jid, { text: '*[ TIKTOK ]* _Descargando slideshow..._' });
    const editKey = sent?.key;

    // Construye el bloque de info + línea de estado al pie
    const tarjeta = (info, imageUrls, estado) => [
        info.titulo   ? `*${info.titulo}*`                                  : null,
        '',
        info.autor    ? `☰ ${info.autor}`                                   : null,
        info.musica   ? `♪ ${info.musica}${info.musicaAutor ? ` — ${info.musicaAutor}` : ''}` : null,
        imageUrls     ? `◎ ${imageUrls} foto(s)`                            : null,
        `↗ ${url}`,
        '',
        estado
    ].filter(l => l !== null).join('\n');

    const editar = async (estado, info = {}, n = null) => {
        try {
            if (editKey) await sock.sendMessage(jid, { text: tarjeta(info, n, estado), edit: editKey });
        } catch {}
    };

    try {
        const esCorta = /vt\.tiktok|vm\.tiktok|t\.tiktok/.test(url);
        const urlFinal = esCorta ? await resolverUrlCorta(url) : url;

        let resultado;
        try {
            resultado = await tiktokFallbackTikwm(urlFinal);
        } catch (err) {
            logRequestError('ttfotos tikwm', err);
            await sock.sendMessage(jid, { text: `*[ TIKTOK ]*\n\n✘ No se pudo obtener las fotos.\n_Verifica que el link sea un carrusel de imágenes._`, edit: editKey });
            return;
        }

        if (!resultado.isSlideshow) {
            await sock.sendMessage(jid, { text: `*[ TIKTOK ]*\n\n! Este TikTok es un *video*, no un carrusel.\n_Usa *#tt ${url}* para descargarlo._`, edit: editKey });
            return;
        }

        const { musicUrl, info } = resultado;
        const imageUrls = resultado.imageUrls
            .map(u => (typeof u === 'string' ? u : u?.url || u?.download_url || null))
            .filter(u => typeof u === 'string' && u.startsWith('http'));

        if (imageUrls.length === 0) {
            await sock.sendMessage(jid, { text: `*[ TIKTOK ]*\n\n✘ TikWM no devolvió imágenes válidas.`, edit: editKey });
            return;
        }

        // ── Audio ─────────────────────────────────────────────────────────────
        if (musicUrl) {
            await editar('_[ Enviando audio... ]_', info, imageUrls.length);
            try {
                const audioBuf = await descargarBuffer(musicUrl, { Referer: 'https://www.tikwm.com/' });
                await sock.sendMessage(jid, { audio: audioBuf, mimetype: 'audio/mpeg', ptt: false });
            } catch (audioErr) {
                logRequestError('ttfotos audio', audioErr);
            }
        }

        // ── Fotos (sin caption para verse como galería) ───────────────────────
        let enviadas = 0;
        for (let i = 0; i < imageUrls.length; i++) {
            await editar(`_[ Enviando foto ${i + 1}/${imageUrls.length}... ]_`, info, imageUrls.length);
            try {
                const buf = await descargarBuffer(imageUrls[i], { Referer: 'https://www.tikwm.com/' });
                await sock.sendMessage(jid, { image: buf });
                enviadas++;
            } catch (imgErr) {
                logRequestError(`ttfotos imagen ${i + 1}`, imgErr);
            }
        }

        const resumen = enviadas === imageUrls.length
            ? `★ _${enviadas > 1 ? `${enviadas} fotos enviadas` : 'Foto enviada'}._`
            : `★ _${enviadas}/${imageUrls.length} fotos enviadas._`;
        await editar(resumen, info, imageUrls.length);

    } catch (err) {
        logRequestError('cmdTiktokFotos', err);
        await sock.sendMessage(jid, { text: `*[ TIKTOK ]*\n\n✘ ${mensajeErrorDescarga(err, 'TikTok Fotos')}`, edit: editKey });
    }
}

// ════════════════════════════════════════════════════
//  TIKTOK - STICKER (animado y estático)
// ════════════════════════════════════════════════════
async function cmdTiktokSticker(sock, jid, args, pushName) {
    const url = args[0];
    if (!url || !esTiktokUrl(url)) {
        await sock.sendMessage(jid, {
            text: '✘ Ingresa un link válido de TikTok.\n† Uso: *#tts <link>*\n_Videos → sticker animado | Carrusel → sticker de la 1ª foto_'
        });
        return;
    }

    const { videoAWebpAnimado, imagenAWebpFull, inyectarExif } = require('./sticker');

    const sent = await sock.sendMessage(jid, { text: '*[ TIKTOK STICKER ]* _Descargando..._' });
    const editKey = sent?.key;
    const editar = async (txt) => {
        try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {}
    };

    try {
        const urlFinal = /vt\.tiktok|vm\.tiktok|t\.tiktok/.test(url)
            ? await resolverUrlCorta(url)
            : url;

        let stickerBuffer;
        let tipo = 'animado';

        // ── Intentar con TikWM primero ────────────────────────────────────────
        let resultado = null;
        try {
            resultado = await tiktokFallbackTikwm(urlFinal);
        } catch (e) {
            logRequestError('tts tikwm', e);
        }

        if (resultado?.isSlideshow) {
            // ── Carrusel: convertir primera imagen en sticker estático ─────────
            tipo = 'estático';
            await editar('*[ TIKTOK STICKER ]* _Convirtiendo imagen..._');

            const imageUrls = resultado.imageUrls
                .map(u => (typeof u === 'string' ? u : u?.url || u?.download_url || null))
                .filter(u => typeof u === 'string' && u.startsWith('http'));

            if (!imageUrls.length) throw new Error('No se encontraron imágenes en el carrusel.');

            const imgBuf = await descargarBuffer(imageUrls[0], { Referer: 'https://www.tikwm.com/' });
            const webp = await imagenAWebpFull(imgBuf);
            stickerBuffer = await inyectarExif(webp, pushName);

        } else if (resultado?.buffer) {
            // ── Video de TikWM: convertir a sticker animado ───────────────────
            await editar('*[ TIKTOK STICKER ]* _Convirtiendo video..._');
            const webp = await videoAWebpAnimado(resultado.buffer, 'mp4');
            stickerBuffer = await inyectarExif(webp, pushName);

        } else {
            // ── Fallback: Tikmate ─────────────────────────────────────────────
            try {
                await editar('*[ TIKTOK STICKER ]* _Intentando fuente alternativa..._');
                const tm = await tiktokTikmate(urlFinal);
                if (!tm?.buffer) throw new Error('Tikmate no devolvió video.');
                await editar('*[ TIKTOK STICKER ]* _Convirtiendo video..._');
                const webp = await videoAWebpAnimado(tm.buffer, 'mp4');
                stickerBuffer = await inyectarExif(webp, pushName);
            } catch (tmErr) {
                logRequestError('tts tikmate', tmErr);
                throw new Error('No se pudo descargar el TikTok. Intenta con cookies de TikTok configuradas.');
            }
        }

        await sock.sendMessage(jid, { sticker: stickerBuffer });
        await editar(`*[ TIKTOK STICKER ]*\n\n★ _Sticker ${tipo} enviado._`);

    } catch (err) {
        logRequestError('cmdTiktokSticker', err);
        await editar(`*[ TIKTOK STICKER ]*\n\n✘ ${err.message || 'No se pudo crear el sticker.'}`);
    }
}

// ════════════════════════════════════════════════════
//  FACEBOOK - VIDEO
// ════════════════════════════════════════════════════
async function cmdFacebook(sock, jid, args) {
    const url = args[0];
    if (!url || (!url.includes('facebook.com') && !url.includes('fb.watch') && !url.includes('fb.com'))) {
        await sock.sendMessage(jid, { text: '✘ Ingresa un link valido de Facebook.\n† Uso: *#facebook <link>*\n_El video debe ser publico_' });
        return;
    }
    const sent = await sock.sendMessage(jid, { text: '*[ FACEBOOK ]* _Descargando video..._' });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };
    try {
        let buffer, tamano;

        const mediaUrl = await facebookApiDescargar(url);
        if (mediaUrl) {
            buffer = await descargarBuffer(mediaUrl, { Referer: 'https://fdown.net/' });
            tamano = formatearBytes(buffer.length);
        } else {
            if (tieneCookiesValidas(FB_COOKIES_PATH)) {
                const dl = await ytdlpDescargarBuffer(url, {
                    formato: 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio/best[ext=mp4]/best',
                    merge: true,
                    cookiesPath: FB_COOKIES_PATH
                });
                buffer = dl.buffer;
                tamano = dl.tamano;
            } else {
                try {
                    const dl = await ytdlpDescargarBuffer(url, {
                        formato: 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio/best[ext=mp4]/best',
                        merge: true
                    });
                    buffer = dl.buffer;
                    tamano = dl.tamano;
                } catch {
                    await editar(
                        `*[ FACEBOOK ]*\n\n✘ *No se pudo descargar este video.*\n\n` +
                        `Las URLs tipo \`facebook.com/share/r/\` requieren cookies.\n\n` +
                        `*Solucion:*\n` +
                        `1. Instala _"Get cookies.txt LOCALLY"_ en Chrome/Firefox\n` +
                        `2. Visita *facebook.com* con tu cuenta\n` +
                        `3. Exporta las cookies con la extension\n` +
                        `4. Guarda el archivo como *cookies/facebook.txt* en la carpeta del bot`
                    );
                    return;
                }
            }
        }

        const caption = construirCaption('Facebook', 'Video de Facebook', null, tamano);
        // Msg 3: video — mensaje nuevo
        await sock.sendMessage(jid, { video: buffer, caption });
        await editar('*[ FACEBOOK ]*\n\n★ _Video enviado._');
    } catch (err) {
        logRequestError('cmdFacebook', err);
        await editar(`*[ FACEBOOK ]*\n\n✘ No pude descargar este video.\n_Verifica que el link sea valido o configura cookies/facebook.txt_`);
    }
}

// ════════════════════════════════════════════════════
//  TWITTER/X - VIDEO
// ════════════════════════════════════════════════════
async function twitterObtenerMedia(url) {
    const tweetId = url.match(/status\/(\d+)/)?.[1];
    if (!tweetId) throw new Error('URL inválida de Twitter/X.');

    // vxtwitter — detecta video, gif Y fotos
    try {
        const res = await axios.get(`https://api.vxtwitter.com/Twitter/status/${tweetId}`, { ...axiosOpts, timeout: 15000 });
        const media = res.data?.media_extended;
        if (media?.length) {
            // GIF de Twitter (almacenado como MP4)
            const gif = media.find(m => m.type === 'gif');
            if (gif?.url) return { url: gif.url, isGif: true };

            // Variantes de video — ordenar por bitrate descendente para obtener HD
            for (const m of media) {
                if (m.type === 'video' && m.variants?.length) {
                    const best = [...m.variants].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
                    if (best?.url) return { url: best.url, isGif: false };
                }
            }
            // Fallback: URL directa del video si no hay variants
            const video = media.find(m => m.type === 'video');
            if (video?.url) return { url: video.url, isGif: false };

            // Fotos — recoger todas las URLs de imagen del tweet
            const photos = media.filter(m => m.type === 'photo' && m.url);
            if (photos.length) return { urls: photos.map(m => m.url), isPhoto: true };
        }
        // mediaURLs plano (vxtwitter legacy) — detectar si son imágenes por extensión
        if (res.data?.mediaURLs?.length) {
            const urls = res.data.mediaURLs;
            const sonImagenes = urls.every(u => /\.(jpg|jpeg|png|webp)(\?|$)/i.test(u));
            if (sonImagenes) return { urls, isPhoto: true };
            return { url: urls[0], isGif: false };
        }
    } catch (err) { logRequestError('twitter vxtwitter', err); }

    // fxtwitter — fallback, también detecta fotos
    try {
        const res = await axios.get(`https://api.fxtwitter.com/i/status/${tweetId}`, { ...axiosOpts, timeout: 15000 });
        const allMedia = res.data?.tweet?.media?.all || [];
        const gif = allMedia.find(m => m.type === 'gif' && m.url);
        if (gif) return { url: gif.url, isGif: true };
        // Videos con variants — elegir mayor bitrate
        for (const m of allMedia) {
            if (m.type === 'video' && m.variants?.length) {
                const best = [...m.variants].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
                if (best?.url) return { url: best.url, isGif: false };
            }
        }
        const v = res.data?.tweet?.media?.videos?.[0];
        if (v?.url) return { url: v.url, isGif: false };
        const anyVideo = allMedia.find(m => m.type === 'video' && m.url);
        if (anyVideo) return { url: anyVideo.url, isGif: false };
        // Fotos
        const photos = allMedia.filter(m => m.type === 'photo' && m.url);
        if (photos.length) return { urls: photos.map(m => m.url), isPhoto: true };
        // photos array dedicado de fxtwitter
        const fxPhotos = res.data?.tweet?.media?.photos || [];
        if (fxPhotos.length) return { urls: fxPhotos.map(m => m.url).filter(Boolean), isPhoto: true };
    } catch (err) { logRequestError('twitter fxtwitter', err); }

    return null;
}

async function cmdTwitter(sock, jid, args) {
    const url = args[0];
    if (!url || (!url.includes('twitter.com') && !url.includes('x.com'))) {
        await sock.sendMessage(jid, { text: '✘ Ingresa un link valido de Twitter/X.\n† Uso: *#x <link>*' });
        return;
    }
    const sent = await sock.sendMessage(jid, { text: '*[ TWITTER/X ]* _Descargando..._' });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };
    try {
        const mediaInfo = await twitterObtenerMedia(url);

        // ── Foto(s) ──────────────────────────────────────────────────────────
        if (mediaInfo?.isPhoto && mediaInfo?.urls?.length) {
            const photoUrls = mediaInfo.urls;
            for (let i = 0; i < photoUrls.length; i++) {
                const buf = await descargarBuffer(photoUrls[i], { Referer: 'https://twitter.com/' });
                const caption = construirCaption('Twitter/X', `Foto${photoUrls.length > 1 ? ` ${i + 1}/${photoUrls.length}` : ''} de Twitter/X`, null, formatearBytes(buf.length));
                await sock.sendMessage(jid, { image: buf, caption });
            }
            await editar(`*[ TWITTER/X ]*\n\n★ _${photoUrls.length > 1 ? `${photoUrls.length} fotos enviadas` : 'Foto enviada'}._`);
            return;
        }

        // ── Video / GIF ───────────────────────────────────────────────────────
        let buffer, tamano, isGif = false;

        if (mediaInfo?.url) {
            buffer = await descargarBuffer(mediaInfo.url, { Referer: 'https://twitter.com/' });
            tamano = formatearBytes(buffer.length);
            isGif = mediaInfo.isGif;
        } else {
            // Fallback: cobalt → yt-dlp
            try {
                const mediaUrl = await cobaltDescargar(url);
                buffer = await descargarBuffer(mediaUrl);
                tamano = formatearBytes(buffer.length);
            } catch (cobaltErr) {
                logRequestError('twitter cobalt', cobaltErr);
                const dl = await ytdlpDescargarBuffer(url);
                buffer = dl.buffer;
                tamano = dl.tamano;
            }
        }

        // Detectar si el fallback devolvió una imagen en vez de video
        if (esBufferImagen(buffer)) {
            const caption = construirCaption('Twitter/X', 'Foto de Twitter/X', null, tamano);
            await sock.sendMessage(jid, { image: buffer, caption });
            await editar('*[ TWITTER/X ]*\n\n★ _Foto enviada._');
            return;
        }

        const caption = construirCaption('Twitter/X', isGif ? 'GIF de Twitter/X' : 'Video de Twitter/X', null, tamano);
        await sock.sendMessage(jid, { video: buffer, caption, mimetype: 'video/mp4' });
        await editar(`*[ TWITTER/X ]*\n\n★ _${isGif ? 'GIF' : 'Video'} enviado._`);
    } catch (err) {
        logRequestError('cmdTwitter', err);
        await editar(`*[ TWITTER/X ]*\n\n✘ ${mensajeErrorDescarga(err, 'Twitter/X')}`);
    }
}

// ════════════════════════════════════════════════════
//  INSTAGRAM - VIDEO/REEL
// ════════════════════════════════════════════════════

// Detecta si un buffer es realmente un video MP4 por sus magic bytes
// MP4/MOV tienen la caja 'ftyp' en los primeros 12 bytes
function esBufferMp4(buffer) {
    if (!buffer || buffer.length < 12) return false;
    // Buscar 'ftyp' en offset 4 (standard) o en los primeros 20 bytes
    for (let i = 0; i <= Math.min(buffer.length - 8, 20); i++) {
        if (buffer[i] === 0x66 && buffer[i+1] === 0x74 && buffer[i+2] === 0x79 && buffer[i+3] === 0x70) {
            return true; // 'ftyp' encontrado → es MP4/MOV
        }
    }
    return false;
}

// Detecta si un buffer es imagen JPEG/PNG/WEBP
function esBufferImagen(buffer) {
    if (!buffer || buffer.length < 4) return false;
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
    // WEBP: RIFF....WEBP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;
    return false;
}

async function instagramObtenerUrl(url) {
    // snapinsta GET
    try {
        const res = await axios.get(`https://api.snapinsta.app/v1/media?url=${encodeURIComponent(url)}`, { ...axiosOpts, timeout: 20000 });
        const item = res.data?.data?.find(d => d.type === 'video') || res.data?.data?.[0];
        if (item?.url) return item.url;
    } catch (err) { logRequestError('instagram snapinsta-get', err); }

    // saveinsta.app scraper
    try {
        const res = await axios.post('https://www.saveinsta.app/action.php',
            new URLSearchParams({ url }).toString(),
            { headers: { ...HUMAN_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 }
        );
        const match = res.data?.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/);
        if (match) return match[0];
    } catch (err) { logRequestError('instagram saveinsta', err); }

    // APIs alternativas
    const apis = [
        `https://api.vreden.my.id/api/download/ig?url=${encodeURIComponent(url)}`,
        `https://api.agatz.xyz/api/instagram?url=${encodeURIComponent(url)}`,
        `https://api.agatz.xyz/api/igdl?url=${encodeURIComponent(url)}`
    ];
    for (const apiUrl of apis) {
        try {
            const res = await axios.get(apiUrl, { ...axiosOpts, timeout: 20000, validateStatus: () => true });
            const urls = extraerUrlsMedia(res.data);
            const video = urls.find(u => /\.mp4/i.test(u));
            if (video || urls[0]) return video || urls[0];
        } catch (err) { logRequestError('instagram api fallback', err); }
    }

    return null;
}

async function cmdInstagram(sock, jid, args) {
    const url = args[0];
    if (!url || (!url.includes('instagram.com') && !url.includes('instagr.am'))) {
        await sock.sendMessage(jid, { text: '✘ Ingresa un link valido de Instagram.\n† Uso: *#ig <link>*\n_El contenido debe ser publico_' });
        return;
    }
    const sent = await sock.sendMessage(jid, { text: '*[ INSTAGRAM ]* _Descargando..._' });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };
    try {
        // ── MÉTODO 1: yt-dlp descarga directa (más confiable para Reels) ─────
        try {
            const dl = await ytdlpDescargarBuffer(url, {
                formato: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]/best[ext=mp4]/best',
                merge: true
            });
            if (dl.buffer && esBufferMp4(dl.buffer)) {
                const caption = construirCaption('Instagram', 'Reel / Video de Instagram', null, dl.tamano);
                // Msg 3: video — mensaje nuevo
                await sock.sendMessage(jid, { video: dl.buffer, caption, mimetype: 'video/mp4' });
                await editar('*[ INSTAGRAM ]*\n\n★ _Video enviado._');
                return;
            }
        } catch (e) { logRequestError('instagram ytdlp buffer', e); }

        // ── MÉTODO 2: snapinsta.app POST ─────────────────────────────────────
        let mediaUrl = null;
        try {
            mediaUrl = await instagramSnapinsta(url);
        } catch (e) { logRequestError('instagram snapinsta-post', e); }

        // ── MÉTODO 3: APIs alternativas ───────────────────────────────────────
        if (!mediaUrl) mediaUrl = await instagramObtenerUrl(url);

        if (!mediaUrl) {
            await editar(
                '*[ INSTAGRAM ]*\n\n✘ No pude descargar este post.\n' +
                '_El contenido debe ser publico. Si es un Reel reciente intenta de nuevo en unos segundos._'
            );
            return;
        }

        const buffer = await descargarBuffer(mediaUrl, {
            'Referer': 'https://www.instagram.com/',
            'Origin':  'https://www.instagram.com/'
        });
        const tamano = formatearBytes(buffer.length);

        if (esBufferMp4(buffer)) {
            const caption = construirCaption('Instagram', 'Reel / Video de Instagram', null, tamano);
            await sock.sendMessage(jid, { video: buffer, caption, mimetype: 'video/mp4' });
            await editar('*[ INSTAGRAM ]*\n\n★ _Video enviado._');
        } else if (esBufferImagen(buffer)) {
            const caption = construirCaption('Instagram', 'Imagen de Instagram', null, tamano);
            await sock.sendMessage(jid, { image: buffer, caption });
            await editar('*[ INSTAGRAM ]*\n\n★ _Imagen enviada._');
        } else if (buffer.length > 100 * 1024) {
            const caption = construirCaption('Instagram', 'Video de Instagram', null, tamano);
            await sock.sendMessage(jid, { video: buffer, caption, mimetype: 'video/mp4' });
            await editar('*[ INSTAGRAM ]*\n\n★ _Video enviado._');
        } else {
            await editar('*[ INSTAGRAM ]*\n\n✘ No pude identificar el contenido.\n_El link puede estar caducado o ser contenido privado._');
        }
    } catch (err) {
        logRequestError('cmdInstagram', err);
        await editar(`*[ INSTAGRAM ]*\n\n✘ ${mensajeErrorDescarga(err, 'Instagram')}`);
    }
}

// ════════════════════════════════════════════════════
//  PINTEREST — lógica movida a src/pinterest.js
// ════════════════════════════════════════════════════
const { buscarImagenPinterest } = require('./pinterest');

// ════════════════════════════════════════════════════
//  IMAGEN GENERAL — multi-fuente sin API keys
// ════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════
//  #img — Buscador multi-fuente
//  1. Danbooru   → arte anime/manga (excluye fotos reales y cosplay)
//  2. Safebooru  → respaldo anime 100% SFW
//  3. Flickr     → fotos reales: comidas, lugares, objetos, personas
//  4. Wikimedia  → arte famoso, enciclopédico
// ════════════════════════════════════════════════════════════════════════

// Palabras genéricas que no son tags válidos en Danbooru
const PALABRAS_GENÉRICAS = new Set([
    'anime', 'manga', 'waifu', 'kawaii', 'cute', 'hd', 'image', 'art',
    'drawing', 'illustration', 'fanart', 'sexy', 'hot', 'beautiful',
    'cool', 'awesome', 'best', 'top', 'good', 'nice', 'pretty',
]);

// Dado un texto, separa: [tag_del_personaje, ...tags_descriptores]
// Ej: "Zero Two maid"  → ["zero_two", "maid"]
// Ej: "Megumin explosion anime" → ["megumin", "explosion"]   (anime filtrado)
// Ej: "Rem"            → ["rem"]
function descomponerQuery(query) {
    const palabras = query
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .filter(w => !PALABRAS_GENÉRICAS.has(w));

    if (!palabras.length) return { charTag: '', descriptores: [] };

    // Heurística: si la primera palabra es corta (≤3 chars) y hay más palabras,
    // es probable que el nombre del personaje use las primeras 2 palabras
    // (ej: "Re Zero" → no es un personaje, pero "Zero Two" sí).
    // Usamos 2 palabras como nombre si hay ≥3 palabras en total; si no, 1.
    const usarDosPalabras = palabras.length >= 3;
    const charWords   = usarDosPalabras ? palabras.slice(0, 2) : palabras.slice(0, 1);
    const descWords   = usarDosPalabras ? palabras.slice(2)    : palabras.slice(1);

    return {
        charTag: charWords.join('_'),
        descriptores: descWords,
    };
}

async function fetchDanbooru(tags) {
    const FILTROS = 'rating:general -photo_(medium) -realistic';
    const res = await axios.get('https://danbooru.donmai.us/posts.json', {
        timeout: 12000,
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        params: { tags: `${tags} ${FILTROS}`, limit: 20, random: true },
    });
    const posts = Array.isArray(res.data) ? res.data : [];
    return posts
        .filter(p => p.file_url && !p.is_deleted && /\.(jpg|jpeg|png|webp)/i.test(p.file_url))
        .map(p => p.large_file_url || p.file_url);
}

// ── Danbooru (arte anime, excluye cosplay y fotos reales) ────────────────
// Búsqueda en 2 pasadas:
//   1ª) personaje + descriptores separados  →  "zero_two maid"
//   2ª) solo el personaje                   →  "zero_two"
// Devuelve la unión, priorizando resultados específicos
async function buscarDanbooru(query) {
    const { charTag, descriptores } = descomponerQuery(query);
    if (!charTag) return [];

    const tagEspecifico = descriptores.length
        ? `${charTag} ${descriptores.join(' ')}`
        : charTag;

    // Ambas pasadas en paralelo si hay descriptores
    const [especifico, general] = await Promise.allSettled([
        fetchDanbooru(tagEspecifico),
        descriptores.length ? fetchDanbooru(charTag) : Promise.resolve([]),
    ]);

    const resEsp = especifico.status === 'fulfilled' ? especifico.value : [];
    const resGen = general.status    === 'fulfilled' ? general.value    : [];

    console.log(`[Danbooru] "${tagEspecifico}" → ${resEsp.length} | "${charTag}" → ${resGen.length}`);

    // Mezclar: primero los específicos, luego los generales (sin repetir)
    const vistos = new Set(resEsp);
    const extras = resGen.filter(u => !vistos.has(u));
    return [...resEsp, ...extras];
}

// ── Safebooru (respaldo anime 100% SFW, sin fotos reales) ────────────────
async function buscarSafebooru(query) {
    const { charTag, descriptores } = descomponerQuery(query);
    if (!charTag) return [];

    // Safebooru usa la misma lógica pero solo una pasada con descriptores si los hay
    const tag = descriptores.length ? `${charTag} ${descriptores.join(' ')}` : charTag;

    const res = await axios.get('https://safebooru.org/index.php', {
        timeout: 12000,
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        params: {
            page: 'dapi',
            s: 'post',
            q: 'index',
            tags: tag,
            json: 1,
            limit: 20,
        },
    });
    const posts = Array.isArray(res.data) ? res.data : [];
    return posts
        .filter(p => p.directory && p.image)
        .map(p => `https://safebooru.org/images/${p.directory}/${p.image}`);
}

// ── Flickr (fotos reales: comidas, objetos, lugares, personas) ───────────
async function buscarFlickr(query) {
    const res = await axios.get('https://api.flickr.com/services/feeds/photos_public.gne', {
        timeout: 12000,
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        params: {
            tags: query,
            format: 'json',
            nojsoncallback: 1,
            safe_search: 1,
            lang: 'es-us,en-us',
        },
    });
    const items = res.data?.items ?? [];
    return items
        .map(it => {
            // Reemplazar _m (thumbnail) por _b (grande ~1024px)
            const url = it.media?.m || '';
            return url.replace(/_m\.([a-z]+)$/, '_b.$1');
        })
        .filter(u => u && /^https?:\/\//i.test(u));
}

// ── Wikimedia Commons (arte famoso, enciclopédico) ───────────────────────
async function buscarWikimedia(query) {
    const res = await axios.get('https://commons.wikimedia.org/w/api.php', {
        timeout: 12000,
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        params: {
            action: 'query',
            generator: 'search',
            gsrsearch: query,
            gsrnamespace: 6,
            gsrlimit: 15,
            prop: 'imageinfo',
            iiprop: 'url',
            iiurlwidth: 800,
            format: 'json',
        },
    });
    const pages = Object.values(res.data?.query?.pages ?? {});
    return pages
        .map(p => p.imageinfo?.[0]?.url || p.imageinfo?.[0]?.thumburl)
        .filter(u => u && /^https?:\/\//i.test(u) && /\.(jpg|jpeg|png|webp)/i.test(u));
}

async function cmdImagen(sock, jid, args) {
    const query = args.join(' ').trim();
    if (!query) {
        await sock.sendMessage(jid, {
            text: '❌ Uso: *#img <búsqueda>*\n\nEjemplos:\n• #img Megumin\n• #img Mona Lisa\n• #img arroz con huevo\n• #img wojak triste',
        });
        return;
    }

    await sock.sendMessage(jid, { text: `🔍 Buscando: *${query}*...` });

    // Lanzar todas las fuentes en paralelo
    const [resDanbooru, resSafebooru, resFlickr, resWikimedia] = await Promise.allSettled([
        buscarDanbooru(query),
        buscarSafebooru(query),
        buscarFlickr(query),
        buscarWikimedia(query),
    ]);

    const danbooru  = resDanbooru.status  === 'fulfilled' ? resDanbooru.value  : [];
    const safebooru = resSafebooru.status === 'fulfilled' ? resSafebooru.value : [];
    const flickr    = resFlickr.status    === 'fulfilled' ? resFlickr.value    : [];
    const wikimedia = resWikimedia.status === 'fulfilled' ? resWikimedia.value : [];

    if (resDanbooru.status  === 'rejected') logRequestError('cmdImagen:Danbooru',  resDanbooru.reason);
    if (resSafebooru.status === 'rejected') logRequestError('cmdImagen:Safebooru', resSafebooru.reason);
    if (resFlickr.status    === 'rejected') logRequestError('cmdImagen:Flickr',    resFlickr.reason);
    if (resWikimedia.status === 'rejected') logRequestError('cmdImagen:Wikimedia', resWikimedia.reason);

    console.log(`[#img] "${query}" → danbooru:${danbooru.length} safebooru:${safebooru.length} flickr:${flickr.length} wikimedia:${wikimedia.length}`);

    // Prioridad: anime primero → real world segundo
    let pool = [];
    const animePool   = [...danbooru, ...safebooru];
    const realPool    = [...flickr, ...wikimedia];

    if (animePool.length >= 3) {
        pool = animePool;
    } else if (realPool.length >= 3) {
        pool = realPool;
    } else {
        pool = [...animePool, ...realPool];
    }

    if (!pool.length) {
        await sock.sendMessage(jid, { text: '❌ No encontré imágenes para esa búsqueda. Intenta con otras palabras.' });
        return;
    }

    // Mezclar aleatoriamente y probar hasta 8 URLs
    const orden = pool.slice(0, 20).sort(() => Math.random() - 0.5);
    let enviado = false;
    for (const url of orden.slice(0, 8)) {
        try {
            await sock.sendMessage(jid, { image: { url }, caption: `🖼️ *${query}*` });
            enviado = true;
            break;
        } catch { /* URL rota → siguiente */ }
    }

    if (!enviado) {
        await sock.sendMessage(jid, { text: '❌ Encontré resultados pero no pude enviar la imagen. Intenta de nuevo.' });
    }
}

async function cmdDiagnosticoDescargas(sock, jid) {
    const pruebas = [
        ['YouTube', 'https://www.youtube.com/'],
        ['TikTok', 'https://www.tiktok.com/'],
        ['Facebook', 'https://www.facebook.com/'],
        ['Instagram', 'https://www.instagram.com/'],
        ['Rule34', 'https://rule34.xxx/']
    ];
    const resultados = [];
    for (const [nombre, url] of pruebas) {
        try {
            const res = await axios.get(url, { ...axiosOpts, timeout: 10000, validateStatus: () => true });
            resultados.push(`${nombre}: ${res.status}`);
        } catch (err) {
            logRequestError(`diag ${nombre}`, err);
            resultados.push(`${nombre}: ERROR ${err.response?.status || err.message}`);
        }
    }
    await sock.sendMessage(jid, {
        text: `🧪 *Diagnóstico de descargas desde Replit*\n\n${resultados.join('\n')}\n\nSi aquí marca 403/429 y en PC/Termux funciona, el bloqueo probablemente es por IP/hosting.`
    });
}

// ════════════════════════════════════════════════════
//  MEDIAFIRE
// ════════════════════════════════════════════════════
async function cmdMediafire(sock, jid, args) {
    const url = args[0];
    if (!url || !url.includes('mediafire.com')) {
        await sock.sendMessage(jid, { text: '✘ Uso: *#mediafire <link>*\nEjemplo: #mediafire https://www.mediafire.com/file/...' });
        return;
    }
    const sent = await sock.sendMessage(jid, { text: '*[ MEDIAFIRE ]* _Procesando link..._' });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };

    const cookieHeader = parsearCookiesHeader(MEDIAFIRE_COOKIES_PATH);
    const mfHeaders = cookieHeader ? { ...HUMAN_HEADERS, Cookie: cookieHeader } : HUMAN_HEADERS;

    try {
        const res = await axios.get(url, { headers: mfHeaders, timeout: 20000 });
        const html = res.data || '';
        const match = html.match(/href="(https:\/\/download\d*\.mediafire\.com\/[^"]+)"/);
        if (match) {
            const link = match[1];
            const nombreMatch = html.match(/<div class="dl-btn-label"[^>]*>([^<]+)<\/div>/) ||
                                html.match(/filename['":\s]+['"]([^'"]+)['"]/);
            const nombre = nombreMatch ? nombreMatch[1].trim() : 'archivo';
            try {
                await sock.sendMessage(jid, { document: { url: link }, fileName: nombre, mimetype: 'application/octet-stream' });
                await editar(`*[ MEDIAFIRE ]*\n\n▣ _${nombre}_\n\n★ _Archivo enviado._`);
            } catch (e) {
                logRequestError('mediafire direct send', e);
                await editar(`*[ MEDIAFIRE ]*\n\n▣ _${nombre}_\n↗ ${link}`);
            }
            return;
        }
    } catch (e) { logRequestError('mediafire direct scrape', e); }

    const apis = [
        () => axios.get(`https://api.dorratz.com/mediafire?url=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
        () => axios.get(`https://api.siputzx.my.id/api/d/mediafire?url=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
        () => axios.get(`https://api.agatz.xyz/api/mediafire?url=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
    ];
    for (const fn of apis) {
        try {
            const data = await fn();
            const link = data?.url || data?.download || data?.data?.url || data?.data?.download || data?.result?.download || data?.result?.url;
            const nombre = data?.filename || data?.name || data?.data?.filename || data?.result?.filename || 'archivo';
            const tamano = data?.size || data?.data?.size || data?.result?.size || '';
            if (link) {
                try {
                    await sock.sendMessage(jid, { document: { url: link }, fileName: nombre, mimetype: 'application/octet-stream' });
                    await editar(`*[ MEDIAFIRE ]*\n\n▣ _${nombre}_${tamano ? `\n▣ Tamano: ${tamano}` : ''}\n\n★ _Archivo enviado._`);
                } catch (e) {
                    logRequestError('mediafire send', e);
                    await editar(`*[ MEDIAFIRE ]*\n\n▣ _${nombre}_${tamano ? `\n▣ Tamano: ${tamano}` : ''}\n↗ ${link}`);
                }
                return;
            }
        } catch (e) { logRequestError('mediafire api', e); }
    }
    await editar('*[ MEDIAFIRE ]*\n\n✘ No pude procesar el link ahora.');
}

// ════════════════════════════════════════════════════
//  SPOTIFY
// ════════════════════════════════════════════════════
async function cmdSpotify(sock, jid, args) {
    const url = args[0];
    if (!url || !url.includes('spotify.com')) {
        await sock.sendMessage(jid, { text: '✘ Uso: *#spotify <link de cancion>*' });
        return;
    }
    const sent = await sock.sendMessage(jid, { text: '*[ SPOTIFY ]* _Procesando..._' });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };

    // Helper: limpiar todos los archivos temporales generados por un tmpBase
    const limpiarTmpBase = async (tmpBase) => {
        try {
            const base = path.basename(tmpBase);
            const dir  = path.dirname(tmpBase);
            const archivos = fs.readdirSync(dir).filter(f => f.startsWith(base));
            await Promise.all(archivos.map(f => fs.remove(path.join(dir, f)).catch(() => {})));
        } catch { }
    };

    // 1. Intentar con yt-dlp usando cookies de Spotify
    if (tieneCookiesValidas(SPOTIFY_COOKIES_PATH)) {
        const tmpBase = path.join(os.tmpdir(), `sp_${Date.now()}`);
        const tmpMp3  = `${tmpBase}.mp3`;
        try {
            await ytdlpEjecutar([
                url, '-x', '--audio-format', 'mp3', '--audio-quality', '5',
                '-o', `${tmpBase}.%(ext)s`,
                '--cookies', SPOTIFY_COOKIES_PATH,
                '--no-playlist', '--quiet', '--no-warnings',
                ...ytdlpHeadersArgs()
            ], 120000);
            if (fs.existsSync(tmpMp3)) {
                const buffer = await fs.readFile(tmpMp3);
                await limpiarTmpBase(tmpBase);
                await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg' });
                await editar('*[ SPOTIFY ]*\n\n★ _Audio enviado._');
                return;
            }
        } catch (e) { logRequestError('spotify yt-dlp cookies', e); }
        await limpiarTmpBase(tmpBase);
    }

    // 2. Extraer metadatos con yt-dlp
    let titulo = '', artista = '';
    try {
        const { stdout: infoStdout } = await ytdlpEjecutar([
            url, '--dump-json', '--no-playlist', '--quiet',
            '--no-warnings', '--skip-download',
            ...(tieneCookiesValidas(SPOTIFY_COOKIES_PATH) ? ['--cookies', SPOTIFY_COOKIES_PATH] : [])
        ], 30000);
        const info = JSON.parse(infoStdout);
        titulo  = info?.title  || info?.track  || '';
        artista = info?.artist || info?.uploader || '';
        if (titulo && !artista && titulo.includes(' - ')) {
            const partes = titulo.split(' - ');
            artista = partes[0].trim();
            titulo  = partes.slice(1).join(' - ').trim();
        }
        if (titulo || artista) await editar(`*[ SPOTIFY ]* _Buscando audio..._\n\n★ *${titulo || 'Spotify'}*${artista ? `\n✒ ${artista}` : ''}`);
    } catch { }

    // 3. APIs de terceros
    const apis = [
        () => axios.get(`https://api.dorratz.com/v2/spotify-dl?url=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
        () => axios.get(`https://api.siputzx.my.id/api/d/spotify?url=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
        () => axios.get(`https://api.agatz.xyz/api/spotifydl?message=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
    ];
    for (const fn of apis) {
        try {
            const data = await fn();
            const link = data?.data?.download || data?.data?.url || data?.result?.url || data?.url || data?.download;
            titulo  = data?.data?.title  || data?.result?.title  || data?.title  || titulo;
            artista = data?.data?.artist || data?.result?.artist || data?.artist || artista;
            if (link) {
                await sock.sendMessage(jid, { audio: { url: link }, mimetype: 'audio/mpeg' });
                await editar(`*[ SPOTIFY ]*\n\n★ *${titulo || 'Cancion'}*${artista ? `\n✒ ${artista}` : ''}\n\n★ _Audio enviado._`);
                return;
            }
        } catch (e) { logRequestError('spotify api', e); }
    }

    // 4. Fallback YouTube
    const ytQuery = titulo && artista ? `${titulo} ${artista}` : titulo || artista;
    if (ytQuery) {
        const tmpBase = path.join(os.tmpdir(), `spyt_${Date.now()}`);
        const tmpMp3  = `${tmpBase}.mp3`;
        try {
            await ytdlpEjecutar([
                `ytsearch1:${ytQuery}`,
                '-x', '--audio-format', 'mp3', '--audio-quality', '5',
                '-o', `${tmpBase}.%(ext)s`,
                '--no-playlist', '--quiet', '--no-warnings',
                ...ytYoutubeArgsAudio(),
                ...(tieneCookiesReales() ? ['--cookies', YT_COOKIES_PATH] : [])
            ], 120000);
            if (fs.existsSync(tmpMp3)) {
                const buffer = await fs.readFile(tmpMp3);
                await limpiarTmpBase(tmpBase);
                await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg' });
                await editar(`*[ SPOTIFY ]*\n\n★ *${titulo || ytQuery}*${artista ? `\n✒ ${artista}` : ''}\n_via YouTube_\n\n★ _Audio enviado._`);
                return;
            }
        } catch (e) { logRequestError('spotify yt fallback', e); }
        await limpiarTmpBase(tmpBase);
    }

    await editar('*[ SPOTIFY ]*\n\n✘ No pude descargar de Spotify ahora.');
}

// ════════════════════════════════════════════════════
//  SOUNDCLOUD
// ════════════════════════════════════════════════════
async function cmdSoundcloud(sock, jid, args) {
    const url = args[0];
    if (!url || !url.includes('soundcloud.com')) {
        await sock.sendMessage(jid, { text: '✘ Uso: *#soundcloud <link>*' });
        return;
    }
    const sent = await sock.sendMessage(jid, { text: '*[ SOUNDCLOUD ]* _Descargando..._' });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };
    const tmpBase = path.join(os.tmpdir(), `sc_${Date.now()}`);
    const tmpMp3 = `${tmpBase}.mp3`;
    try {
        const info = await ytdlpInfo(url);
        if (info.titulo || info.autor) {
            // Msg 2: info card — mensaje nuevo
            await enviarInfoCard(sock, jid, info, url, 'audio');
        }
        await ytdlpEjecutar([
            url, '-x', '--audio-format', 'mp3', '--audio-quality', '5',
            '-o', `${tmpBase}.%(ext)s`, '--no-playlist', '--quiet', '--no-warnings',
            ...ytdlpHeadersArgs()
        ], 120000);
        const buffer = await fs.readFile(tmpMp3);
        // Msg 3: audio — mensaje nuevo
        await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg' });
        await editar(`*[ SOUNDCLOUD ]*\n\n★ _Audio enviado._`);
    } catch (err) {
        logRequestError('cmdSoundcloud', err);
        await editar(`*[ SOUNDCLOUD ]*\n\n✘ ${mensajeErrorDescarga(err, 'SoundCloud')}`);
    } finally {
        await fs.remove(tmpMp3).catch(() => {});
    }
}

// ════════════════════════════════════════════════════
//  THREADS
// ════════════════════════════════════════════════════
async function cmdThreads(sock, jid, args) {
    const url = args[0];
    if (!url || (!url.includes('threads.net') && !url.includes('threads.com'))) {
        await sock.sendMessage(jid, { text: '✘ Uso: *#threads <link>*' });
        return;
    }
    const sent = await sock.sendMessage(jid, { text: '*[ THREADS ]* _Descargando..._' });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };
    const apis = [
        () => axios.get(`https://api.siputzx.my.id/api/d/threads?url=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
        () => axios.get(`https://api.dorratz.com/threads?url=${encodeURIComponent(url)}`, axiosOpts).then(r => r.data),
    ];
    for (const fn of apis) {
        try {
            const data = await fn();
            const items = data?.data?.video_urls || data?.data?.image_urls || data?.video_urls || data?.image_urls || data?.result?.media || [];
            const lista = Array.isArray(items) ? items : (items ? [items] : []);
            if (lista.length) {
                for (const item of lista.slice(0, 4)) {
                    const u = typeof item === 'string' ? item : (item.url || item.video || item.image);
                    if (!u) continue;
                    if (/\.mp4($|\?)/i.test(u)) {
                        await sock.sendMessage(jid, { video: { url: u }, caption: '[ THREADS ]' });
                    } else {
                        await sock.sendMessage(jid, { image: { url: u }, caption: '[ THREADS ]' });
                    }
                }
                await editar('*[ THREADS ]*\n\n★ _Contenido enviado._');
                return;
            }
        } catch (e) { logRequestError('threads api', e); }
    }
    await editar('*[ THREADS ]*\n\n✘ No pude descargar de Threads ahora.');
}

// ════════════════════════════════════════════════════
//  APKPURE
// ════════════════════════════════════════════════════
async function cmdApkpure(sock, jid, args) {
    const query = args.join(' ');
    if (!query) {
        await sock.sendMessage(jid, { text: '✘ Uso: *#apk <nombre de la app>*' });
        return;
    }
    const sent = await sock.sendMessage(jid, { text: `*[ APKPURE ]* _Buscando *${query}*..._` });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };
    const apis = [
        () => axios.get(`https://api.siputzx.my.id/api/d/apkpure?search=${encodeURIComponent(query)}`, axiosOpts).then(r => r.data),
        () => axios.get(`https://api.dorratz.com/apkpure?search=${encodeURIComponent(query)}`, axiosOpts).then(r => r.data),
    ];
    for (const fn of apis) {
        try {
            const data = await fn();
            const item = data?.data?.[0] || data?.result?.[0] || data?.data || data?.result;
            const link = item?.download || item?.url || item?.dl;
            const nombre = item?.name || item?.title || query;
            if (link) {
                try {
                    await sock.sendMessage(jid, { document: { url: link }, fileName: `${nombre}.apk`, mimetype: 'application/vnd.android.package-archive' });
                    await editar(`*[ APKPURE ]*\n\n▣ _${nombre}.apk_\n\n★ _APK enviado._`);
                } catch (e) {
                    logRequestError('apkpure send', e);
                    await editar(`*[ APKPURE ]*\n\n▣ _${nombre}_\n↗ ${link}`);
                }
                return;
            }
        } catch (e) { logRequestError('apkpure api', e); }
    }
    await editar('*[ APKPURE ]*\n\n✘ No encontre la app o las APIs estan caidas.');
}

// ════════════════════════════════════════════════════
//  GOOGLE DRIVE
// ════════════════════════════════════════════════════
async function cmdDrive(sock, jid, args) {
    const url = args[0];
    if (!url || !url.includes('drive.google.com')) {
        await sock.sendMessage(jid, { text: '✘ Uso: *#drive <link publico>*' });
        return;
    }
    const sent = await sock.sendMessage(jid, { text: '*[ DRIVE ]* _Procesando link..._' });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };
    const idMatch = url.match(/[-\w]{25,}/);
    if (!idMatch) {
        await editar('*[ DRIVE ]*\n\n✘ No pude extraer el ID del archivo del link.');
        return;
    }
    const id = idMatch[0];
    const direct = `https://drive.google.com/uc?export=download&id=${id}`;
    try {
        await sock.sendMessage(jid, { document: { url: direct }, fileName: `drive_${id}`, mimetype: 'application/octet-stream' });
        await editar(`*[ DRIVE ]*\n\n★ _Archivo enviado._`);
    } catch (e) {
        logRequestError('drive', e);
        await editar(`*[ DRIVE ]*\n\n↗ ${direct}\n\n_Si el archivo es muy grande o privado, descargalo del link directamente._`);
    }
}

// ════════════════════════════════════════════════════
//  MEGA.NZ
// ════════════════════════════════════════════════════
const MEGA_MAX_BYTES = 300 * 1024 * 1024; // 300MB — límite razonable para RAM/WhatsApp

async function cmdMega(sock, jid, args) {
    const url = args[0];
    if (!url || !url.includes('mega.nz')) {
        await sock.sendMessage(jid, { text: '✘ Uso: *#mega <link>*\nEjemplo: #mega https://mega.nz/file/...' });
        return;
    }
    if (url.includes('/folder/')) {
        await sock.sendMessage(jid, { text: '✘ Ese link es una carpeta de Mega. *#mega* solo descarga archivos individuales (link */file/*).' });
        return;
    }
    const sent = await sock.sendMessage(jid, { text: '*[ MEGA ]* _Procesando link..._' });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };

    try {
        const { File } = require('megajs');
        const file = File.fromURL(url);
        await file.loadAttributes();

        const nombre = file.name || 'archivo_mega';
        const tamano = file.size || 0;
        if (tamano > MEGA_MAX_BYTES) {
            await editar(`*[ MEGA ]*\n\n▣ _${nombre}_\n▣ Tamano: ${(tamano / 1024 / 1024).toFixed(1)}MB\n\n✘ El archivo supera el limite de ${MEGA_MAX_BYTES / 1024 / 1024}MB que soporta el bot.`);
            return;
        }

        await editar(`*[ MEGA ]* _Descargando..._\n\n▣ _${nombre}_${tamano ? `\n▣ Tamano: ${(tamano / 1024 / 1024).toFixed(1)}MB` : ''}`);
        const buffer = await file.downloadBuffer({});
        await sock.sendMessage(jid, { document: buffer, fileName: nombre, mimetype: 'application/octet-stream' });
        await editar(`*[ MEGA ]*\n\n▣ _${nombre}_\n\n★ _Archivo enviado._`);
    } catch (e) {
        logRequestError('mega', e);
        await editar('*[ MEGA ]*\n\n✘ No pude descargar ese link. Puede estar caido, ser privado, o haber excedido la cuota de transferencia de Mega.');
    }
}

// ════════════════════════════════════════════════════
//  TERABOX
// ════════════════════════════════════════════════════
const TERABOX_COOKIES_PATH = path.join(COOKIES_DIR, 'terabox.txt');

async function cmdTerabox(sock, jid, args) {
    const url = args[0];
    if (!url || !/terabox\.(com|app)|1024tera\.com|teraboxapp\.com|1024terabox\.com/.test(url)) {
        await sock.sendMessage(jid, { text: '✘ Uso: *#terabox <link>*\nEjemplo: #terabox https://terabox.com/s/...' });
        return;
    }
    const sent = await sock.sendMessage(jid, { text: '*[ TERABOX ]* _Procesando link..._' });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };

    const cookieHeader = parsearCookiesHeader(TERABOX_COOKIES_PATH);
    if (!cookieHeader) {
        await editar('*[ TERABOX ]*\n\n✘ Terabox requiere una cookie de sesion configurada por el owner (cookies/terabox.txt) para poder descargar. Pidele al owner que la configure.');
        return;
    }
    const tbHeaders = { ...HUMAN_HEADERS, Cookie: cookieHeader };

    try {
        // 1. Seguir redirects para obtener la URL final y extraer el "surl"
        const pagina = await axios.get(url, { headers: tbHeaders, timeout: 20000, maxRedirects: 5 });
        const finalUrl = pagina.request?.res?.responseUrl || url;
        const surlMatch = finalUrl.match(/[?&]surl=([^&]+)/) || url.match(/\/s\/1?([\w-]+)/);
        if (!surlMatch) throw new Error('No se pudo extraer el surl del link');
        const surl = surlMatch[1];

        // 2. Info del share (shareid, uk, sign, timestamp, lista de archivos)
        const infoRes = await axios.get('https://www.terabox.com/api/shorturlinfo', {
            params: { shorturl: '1' + surl, root: 1 },
            headers: tbHeaders,
            timeout: 20000
        });
        const info = infoRes.data;
        const archivo = info?.list?.[0];
        if (!archivo) throw new Error('El link no tiene archivos o expiro');

        // 3. Pedir el link de descarga directo
        const dlRes = await axios.get('https://www.terabox.com/share/download', {
            params: {
                shareid: info.shareid,
                uk: info.uk,
                sign: info.sign,
                timestamp: info.timestamp,
                product: 'share',
                fid_list: `[${archivo.fs_id}]`
            },
            headers: tbHeaders,
            timeout: 20000
        });
        const link = dlRes.data?.dlink?.[0]?.dlink || dlRes.data?.list?.[0]?.dlink;
        if (!link) throw new Error('No se obtuvo el dlink final');

        const nombre = archivo.server_filename || 'archivo_terabox';
        await sock.sendMessage(jid, { document: { url: link }, fileName: nombre, mimetype: 'application/octet-stream' });
        await editar(`*[ TERABOX ]*\n\n▣ _${nombre}_\n\n★ _Archivo enviado._`);
    } catch (e) {
        logRequestError('terabox', e);
        await editar('*[ TERABOX ]*\n\n✘ No pude procesar ese link. La cookie de sesion puede haber vencido, o el link es privado/invalido.');
    }
}

// ════════════════════════════════════════════════════
//  GITHUB CLONE (descarga un repo como .zip)
// ════════════════════════════════════════════════════
async function cmdGitclone(sock, jid, args) {
    const url = args[0];
    if (!url || !url.includes('github.com')) {
        await sock.sendMessage(jid, { text: '✘ Uso: *#gitclone <url del repo>*\nEjemplo: #gitclone https://github.com/usuario/repo' });
        return;
    }
    const match = url.match(/github\.com\/([^\/]+)\/([^\/\s#?]+)/);
    if (!match) {
        await sock.sendMessage(jid, { text: '✘ No pude reconocer ese link de GitHub.' });
        return;
    }
    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '');

    const sent = await sock.sendMessage(jid, { text: `*[ GITCLONE ]* _Preparando ${owner}/${repo}..._` });
    const editKey = sent?.key;
    const editar = async (txt) => { try { if (editKey) await sock.sendMessage(jid, { text: txt, edit: editKey }); } catch {} };

    try {
        let branch = 'main';
        try {
            const repoInfo = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, { headers: HUMAN_HEADERS, timeout: 15000 });
            branch = repoInfo.data?.default_branch || 'main';
        } catch (e) {
            throw new Error('Repo no encontrado o es privado');
        }

        const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`;
        await sock.sendMessage(jid, { document: { url: zipUrl }, fileName: `${repo}-${branch}.zip`, mimetype: 'application/zip' });
        await editar(`*[ GITCLONE ]*\n\n▣ _${owner}/${repo}_ (${branch})\n\n★ _Repositorio enviado como .zip._`);
    } catch (e) {
        logRequestError('gitclone', e);
        await editar(`*[ GITCLONE ]*\n\n✘ No pude descargar *${owner}/${repo}*. Verifica que el repositorio exista y sea publico.`);
    }
}

// ════════════════════════════════════════════════════
//  DESCARGADOR UNIVERSAL (#dl / #aio) — detecta la plataforma y delega
// ════════════════════════════════════════════════════
async function cmdUniversalDl(sock, jid, args) {
    const url = (args[0] || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
        await sock.sendMessage(jid, {
            text: '✘ Uso: *#dl <link>*\n_Detecta automaticamente la plataforma: YouTube, TikTok, Instagram, Facebook, Twitter/X, Spotify, SoundCloud, MediaFire, Drive, Mega, Terabox, Pinterest, Threads o un repo de GitHub._'
        });
        return;
    }

    if (/youtu\.?be/.test(url)) {
        return cmdYoutube(sock, jid, args);
    } else if (/tiktok\.com/.test(url)) {
        return cmdTiktok(sock, jid, args);
    } else if (/instagram\.com/.test(url)) {
        return cmdInstagram(sock, jid, args);
    } else if (/facebook\.com|fb\.watch/.test(url)) {
        return cmdFacebook(sock, jid, args);
    } else if (/twitter\.com|x\.com/.test(url)) {
        return cmdTwitter(sock, jid, args);
    } else if (/spotify\.com/.test(url)) {
        return cmdSpotify(sock, jid, args);
    } else if (/soundcloud\.com/.test(url)) {
        return cmdSoundcloud(sock, jid, args);
    } else if (/mediafire\.com/.test(url)) {
        return cmdMediafire(sock, jid, args);
    } else if (/drive\.google\.com/.test(url)) {
        return cmdDrive(sock, jid, args);
    } else if (/mega\.nz/.test(url)) {
        return cmdMega(sock, jid, args);
    } else if (/terabox\.(com|app)|1024tera\.com|teraboxapp\.com|1024terabox\.com/.test(url)) {
        return cmdTerabox(sock, jid, args);
    } else if (/pinterest\.com|pin\.it/.test(url)) {
        await sock.sendMessage(jid, { text: '✘ Para Pinterest usa directamente *#pin <link>*.' });
        return;
    } else if (/threads\.net/.test(url)) {
        return cmdThreads(sock, jid, args);
    } else if (/github\.com/.test(url)) {
        return cmdGitclone(sock, jid, args);
    }

    await sock.sendMessage(jid, { text: '✘ No reconozco esa plataforma. Usa el comando especifico (#yt, #tiktok, #ig, etc) o revisa el link.' });
}

module.exports = {
    cmdYoutube, cmdYoutubeAudio, cmdYoutubeSearch, cmdYoutubeVideoSearch,
    cmdTiktok, cmdTiktokAudio, cmdTiktokFotos, cmdTiktokSticker, cmdFacebook,
    cmdTwitter, cmdInstagram, cmdPinterest: async () => {}, cmdImagen,
    buscarImagenPinterest, cmdDiagnosticoDescargas,
    cmdMediafire, cmdSpotify, cmdSoundcloud, cmdThreads, cmdApkpure, cmdDrive,
    cmdMega, cmdTerabox, cmdGitclone, cmdUniversalDl,
    // Utilidades compartidas exportadas para nsfwdownloads y otros módulos
    ytdlpEjecutar, ytdlpHeadersArgs, extraerErrorYtdlp, logRequestError, conReintentos
};
