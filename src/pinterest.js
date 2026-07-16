'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  PINTEREST — módulo central (API oficial v5 exclusivamente)
//
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  Descarga / metadata por URL                                            │
//  │    Scraping de página pública del pin (sin credenciales)                │
//  │    → extrae __PWS_RELAY_REGISTER_COMPLETED_REQUEST__ del HTML           │
//  │    → imagen original, título, usuario, tablero, vídeo                   │
//  │    Fallback vídeo: yt-dlp                                               │
//  ├─────────────────────────────────────────────────────────────────────────┤
//  │  Búsqueda (#pin <query>)                                                │
//  │    Fuente 1 (primaria): GET /v5/search/pins                             │
//  │      → busca dentro de los pines guardados del usuario autenticado      │
//  │    Fuente 2 (local):    búsqueda en caché de tableros/pines cargados    │
//  │                                                                         │
//  │  ⚠️  LIMITACIÓN OFICIAL DE PINTEREST API v5 (Standard/Business Access): │
//  │    /v5/search/pins busca SOLO en los pins del usuario autenticado.      │
//  │    La búsqueda del catálogo público global requiere Partner Access,     │
//  │    que Pinterest no otorga en acceso estándar.                          │
//  │    No se utiliza Bing, scraping de terceros ni proxies.                 │
//  ├─────────────────────────────────────────────────────────────────────────┤
//  │  Contenido de la cuenta autenticada                                     │
//  │    GET /v5/boards            → tableros del usuario                     │
//  │    GET /v5/boards/{id}/pins  → pines de un tablero específico           │
//  │    GET /v5/pins              → pines creados por el usuario             │
//  │                                                                         │
//  │  ⚠️  LIMITACIÓN: Los pines guardados privados de otros usuarios que     │
//  │    no pertenezcan a ningún tablero NO son accesibles vía API oficial.   │
//  │    Pinterest no expone una lista plana de "todos los guardados"         │
//  │    fuera de tablero en acceso estándar.                                 │
//  ├─────────────────────────────────────────────────────────────────────────┤
//  │  Caché local                                                            │
//  │    data/pinterest_cache.json — evita peticiones repetidas              │
//  │    TTL: tableros 60 min | pines de tablero 30 min | búsquedas 15 min   │
//  ├─────────────────────────────────────────────────────────────────────────┤
//  │  Token API v5 (data/pinterest_token.json)                               │
//  │    Auto-refresh con refresh_token vía POST /v5/oauth/token              │
//  │    Scopes requeridos: pins:read, boards:read, user_accounts:read        │
//  └─────────────────────────────────────────────────────────────────────────┘
// ══════════════════════════════════════════════════════════════════════════════

const axios         = require('axios');
const fs            = require('fs-extra');
const path          = require('path');
const os            = require('os');
const { execFile }  = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const YTDLP             = path.join(__dirname, '..', 'yt-dlp');
const PINTEREST_COOKIES = path.join(__dirname, '..', 'cookies', 'pinterest.txt');
const TOKEN_FILE        = path.join(__dirname, '..', 'data', 'pinterest_token.json');
const CACHE_FILE        = path.join(__dirname, '..', 'data', 'pinterest_cache.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const REGEX_PIN_URL = /^https?:\/\/(?:(?:www|co|m)\.)?(?:pinterest\.(?:com|es|fr|de|co\.uk|com\.au|com\.mx|pt|it|jp|cl|ar|br|ph|nz|at|be|ch|dk|fi|gr|hu|ie|nl|no|pl|pt|ro|se|sg|th|vn)|pin\.it)\//i;

// ══════════════════════════════════════════════════════════════════════════════
//  CACHÉ LOCAL (in-memory + disco)
// ══════════════════════════════════════════════════════════════════════════════

const TTL = {
    boards    : 60 * 60 * 1000,  // 1 hora
    boardPins : 30 * 60 * 1000,  // 30 min
    myPins    : 30 * 60 * 1000,  // 30 min
    search    : 15 * 60 * 1000,  // 15 min
};

let _cache = {
    boards      : null,  // { data: [], cachedAt: 0 }
    boardPins   : {},    // { [boardId]: { data: [], cachedAt: 0 } }
    myPins      : null,  // { data: [], cachedAt: 0 }
    searchResults: {},   // { [queryKey]: { data: [], cachedAt: 0 } }
};

function _cargarCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            if (raw) _cache = {
                boards: null, boardPins: {}, myPins: null, searchResults: {},
                ...raw
            };
        }
    } catch {}
}

function _guardarCache() {
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify(_cache, null, 2)); } catch {}
}

_cargarCache();

function _cacheGetSection(section) {
    const entry = _cache[section];
    if (!entry || (Date.now() - entry.cachedAt) >= TTL[section]) return null;
    return entry.data;
}

function _cacheGetKey(section, key) {
    const entry = _cache[section]?.[key];
    if (!entry || (Date.now() - entry.cachedAt) >= TTL[section === 'searchResults' ? 'search' : 'boardPins']) return null;
    return entry.data;
}

function _cacheSetSection(section, data) {
    _cache[section] = { data, cachedAt: Date.now() };
    _guardarCache();
}

function _cacheSetKey(section, key, data) {
    if (!_cache[section] || typeof _cache[section] !== 'object' || Array.isArray(_cache[section])) {
        _cache[section] = {};
    }
    _cache[section][key] = { data, cachedAt: Date.now() };
    _guardarCache();
}

// ══════════════════════════════════════════════════════════════════════════════
//  CLASIFICACIÓN DE CONTENIDO POR PALABRAS CLAVE
// ══════════════════════════════════════════════════════════════════════════════

const KEYWORDS_CATEGORIA = {
    'anime'        : ['anime', 'manga', 'otaku', 'kawaii', 'waifu', 'chibi', 'isekai', 'shounen', 'seinen', 'naruto', 'one piece', 'demon slayer', 'aot', 'jjk', 'jujutsu', 'bleach', 'hunter x hunter', 'dragon ball', 'studio ghibli', 'attack on titan'],
    'cosplay'      : ['cosplay', 'costume', 'disfraz', 'cosplayer', 'cosplaygirl', 'cosplayboy', 'cos'],
    'arte'         : ['art', 'arte', 'drawing', 'illustration', 'ilustración', 'ilustracion', 'sketch', 'digital art', 'concept art', 'artwork', 'dibujo', 'painting', 'pintura', 'acuarela', 'watercolor', 'fanart', 'fan art'],
    'memes'        : ['meme', 'memes', 'funny', 'humor', 'gracioso', 'lol', 'joke', 'chiste', 'relatable', 'cursed'],
    'fotografía'   : ['photo', 'photography', 'fotografía', 'fotografia', 'portrait', 'retrato', 'photographer', 'photoshoot', 'canon', 'nikon', 'film photography'],
    'tecnología'   : ['tech', 'technology', 'programming', 'code', 'developer', 'software', 'hardware', 'linux', 'python', 'javascript', 'setup', 'battlestation'],
    'gaming'       : ['gaming', 'videogame', 'videojuego', 'gamer', 'playstation', 'xbox', 'nintendo', 'pc gaming', 'rpg', 'fps', 'esports', 'minecraft', 'valorant', 'league of legends'],
    'naturaleza'   : ['nature', 'naturaleza', 'flowers', 'flores', 'forest', 'bosque', 'animals', 'animales', 'plants', 'plantas', 'ocean', 'mountain', 'wildlife', 'landscape'],
    'arquitectura' : ['architecture', 'arquitectura', 'building', 'interior design', 'diseño interior', 'home', 'hogar', 'decor', 'room', 'habitacion', 'house'],
    'moda'         : ['fashion', 'moda', 'outfit', 'style', 'estilo', 'clothing', 'ropa', 'streetwear', 'ootd', 'clothes', 'aesthetic outfit'],
    'comida'       : ['food', 'comida', 'recipe', 'receta', 'cooking', 'cocina', 'dessert', 'postre', 'baking', 'repostería', 'restaurante', 'cafe'],
    'wallpaper'    : ['wallpaper', 'background', 'fondos de pantalla', 'fondo', 'lockscreen', 'aesthetic wallpaper', 'phone wallpaper'],
    'aesthetic'    : ['aesthetic', 'vsco', 'cottagecore', 'dark academia', 'light academia', 'grunge', 'soft girl', 'vaporwave', 'y2k', 'retro'],
    'citas'        : ['quote', 'quotes', 'citas', 'frases', 'motivational', 'motivacion', 'inspirational', 'inspiración', 'words', 'saying'],
};

function clasificarPin(titulo = '', descripcion = '', tablero = '') {
    const texto = [titulo, descripcion, tablero]
        .join(' ')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const scores = {};
    for (const [cat, keywords] of Object.entries(KEYWORDS_CATEGORIA)) {
        scores[cat] = keywords.filter(kw => texto.includes(kw)).length;
    }

    const mejor = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return (mejor && mejor[1] > 0) ? mejor[0] : 'general';
}

// ══════════════════════════════════════════════════════════════════════════════
//  GESTIÓN DE TOKEN (data/pinterest_token.json)
//  Auto-refresh cuando el access_token expira, usando el refresh_token.
// ══════════════════════════════════════════════════════════════════════════════

let _tokenCache = null;

// Estado de autenticación — se actualiza cuando la API devuelve 401 o falta token
let _estadoAuth = { error: false, tipo: null, at: 0 };
function getEstadoAuth() { return { ..._estadoAuth }; }
function limpiarEstadoAuth() { _estadoAuth = { error: false, tipo: null, at: 0 }; }

function _cargarTokenArchivo() {
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
            if (data?.access_token && data?.expires_at) return data;
        }
    } catch {}
    return null;
}

function _guardarTokenArchivo(data) {
    try { fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2)); } catch {}
}

async function _refrescarToken(refreshToken) {
    const appId     = (process.env.PINTEREST_APP_ID     || '').trim();
    const appSecret = (process.env.PINTEREST_APP_SECRET || '').trim();
    if (!appId || !appSecret || !refreshToken) return null;

    try {
        const creds = Buffer.from(`${appId}:${appSecret}`).toString('base64');
        const res   = await axios.post(
            'https://api.pinterest.com/v5/oauth/token',
            new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
            {
                headers: {
                    'Authorization': `Basic ${creds}`,
                    'Content-Type' : 'application/x-www-form-urlencoded',
                },
                timeout: 15000
            }
        );
        const d         = res.data;
        const expiresAt = Math.floor(Date.now() / 1000) + (d.expires_in || 2592000) - 300;
        const tokenData = {
            access_token : d.access_token,
            refresh_token: d.refresh_token || refreshToken,
            expires_at   : expiresAt,
        };
        _tokenCache = tokenData;
        _guardarTokenArchivo(tokenData);
        console.log('[Pinterest] Token refrescado. Expira:', new Date(expiresAt * 1000).toLocaleDateString());
        return tokenData.access_token;
    } catch (e) {
        console.error('[Pinterest] Error al refrescar token:', e.response?.status, e.message?.split('\n')[0]);
        return null;
    }
}

async function _obtenerAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (_tokenCache?.access_token && _tokenCache.expires_at > now) return _tokenCache.access_token;

    const fileData = _cargarTokenArchivo();
    if (fileData) {
        if (fileData.expires_at > now) {
            _tokenCache = fileData;
            return fileData.access_token;
        }
        if (fileData.refresh_token) {
            const newToken = await _refrescarToken(fileData.refresh_token);
            if (newToken) return newToken;
        }
    }

    const envToken = (process.env.PINTEREST_ACCESS_TOKEN || '').trim();
    if (envToken) return envToken;

    return null;
}

// ══════════════════════════════════════════════════════════════════════════════
//  HELPER: llamada autenticada a la API oficial de Pinterest v5
// ══════════════════════════════════════════════════════════════════════════════

async function _apiGet(endpoint, params = {}) {
    const token = await _obtenerAccessToken();
    if (!token) throw new Error('SIN_TOKEN');

    try {
        const res = await axios.get(`https://api.pinterest.com/v5${endpoint}`, {
            params,
            timeout: 20000,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type' : 'application/json',
            },
        });
        // Petición exitosa — limpiar cualquier error previo
        if (_estadoAuth.error) limpiarEstadoAuth();
        return res.data;
    } catch (e) {
        if (e.response?.status === 401) {
            // Token inválido o expirado — invalidar en memoria y disco
            _tokenCache = null;
            _estadoAuth = { error: true, tipo: 'TOKEN_INVALIDO', at: Date.now() };
            try { fs.removeSync(TOKEN_FILE); } catch {}
            console.error('[Pinterest] ❌ Token inválido (401). Limpiando credenciales guardadas.');
            throw new Error('TOKEN_INVALIDO');
        }
        throw e;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  HELPER: paginación automática — devuelve todos los items del endpoint
// ══════════════════════════════════════════════════════════════════════════════

async function _paginarTodo(endpoint, params = {}, maxItems = 300) {
    const items   = [];
    let bookmark  = null;
    let paginas   = 0;
    const MAX_PAG = 10;

    while (paginas < MAX_PAG && items.length < maxItems) {
        const qp = { page_size: 50, ...params };
        if (bookmark) qp.bookmark = bookmark;

        const data  = await _apiGet(endpoint, qp);
        const batch = data?.items || [];
        items.push(...batch);

        bookmark = data?.bookmark || null;
        if (!bookmark || batch.length === 0) break;
        paginas++;
    }

    return items;
}

// ══════════════════════════════════════════════════════════════════════════════
//  NORMALIZAR PIN — shape uniforme desde respuesta de la API
// ══════════════════════════════════════════════════════════════════════════════

function _normalizarPin(pin, nombreTablero = '') {
    const imgs   = pin.media?.images || {};
    const imgUrl =
        imgs['1200x']?.url   || imgs['736x']?.url   ||
        imgs['600x']?.url    || imgs['400x300']?.url ||
        imgs['236x']?.url    || imgs['150x150']?.url || null;

    const titulo      = (pin.title       || '').trim();
    const descripcion = (pin.description || '').trim();
    const tablero     = nombreTablero || '';

    return {
        url        : imgUrl,
        urlPin     : `https://www.pinterest.com/pin/${pin.id}/`,
        titulo,
        descripcion,
        autor      : '',
        username   : '',
        tablero,
        pinId      : pin.id,
        width      : imgs['1200x']?.width  || imgs['736x']?.width  || 0,
        height     : imgs['1200x']?.height || imgs['736x']?.height || 0,
        categoria  : clasificarPin(titulo, descripcion, tablero),
        _fuenteAPI : true,
    };
}

// ══════════════════════════════════════════════════════════════════════════════
//  OBTENER TABLEROS DEL USUARIO AUTENTICADO
//  Endpoint: GET /v5/boards
//  Requiere scope: boards:read
//  Devuelve tableros públicos Y privados del usuario autenticado.
// ══════════════════════════════════════════════════════════════════════════════

async function obtenerTableros(forzar = false) {
    if (!forzar) {
        const cached = _cacheGetSection('boards');
        if (cached) return cached;
    }

    console.log('[Pinterest] GET /v5/boards...');
    const items = await _paginarTodo('/boards', { privacy: 'ALL' });

    const tableros = items.map(b => ({
        id         : b.id,
        nombre     : b.name || '',
        descripcion: b.description || '',
        privacidad : b.privacy || 'PUBLIC',
        pinCount   : b.pin_count || 0,
        portada    : b.media?.image_cover_url ||
                     b.media?.images?.['400x300']?.url || null,
    }));

    _cacheSetSection('boards', tableros);
    console.log(`[Pinterest] ← ${tableros.length} tablero(s) obtenidos`);
    return tableros;
}

// ══════════════════════════════════════════════════════════════════════════════
//  OBTENER PINES DE UN TABLERO
//  Endpoint: GET /v5/boards/{board_id}/pins
//  Requiere scope: boards:read, pins:read
//  Accede a tableros públicos y privados del usuario autenticado.
// ══════════════════════════════════════════════════════════════════════════════

async function obtenerPinesTablero(boardId, nombreTablero = '', forzar = false) {
    if (!forzar) {
        const cached = _cacheGetKey('boardPins', boardId);
        if (cached) return cached;
    }

    console.log(`[Pinterest] GET /v5/boards/${boardId}/pins...`);
    const items = await _paginarTodo(`/boards/${boardId}/pins`);

    const pines = items
        .map(p => _normalizarPin(p, nombreTablero))
        .filter(p => p.url);

    _cacheSetKey('boardPins', boardId, pines);
    console.log(`[Pinterest] ← ${pines.length} pin(es) en tablero "${nombreTablero || boardId}"`);
    return pines;
}

// ══════════════════════════════════════════════════════════════════════════════
//  OBTENER MIS PINES CREADOS
//  Endpoint: GET /v5/pins
//  Requiere scope: pins:read
//
//  ⚠️  LIMITACIÓN OFICIAL: devuelve únicamente los pins CREADOS por el
//  usuario autenticado (publicados o borradores). Los pins guardados de
//  otros creadores solo son accesibles si fueron guardados en un tablero
//  concreto, mediante GET /v5/boards/{id}/pins.
//  Pinterest no expone una lista plana de "todos los pins guardados"
//  independientemente de tablero en acceso Standard o Business.
// ══════════════════════════════════════════════════════════════════════════════

async function obtenerMisPines(forzar = false) {
    if (!forzar) {
        const cached = _cacheGetSection('myPins');
        if (cached) return cached;
    }

    console.log('[Pinterest] GET /v5/pins (mis pins creados)...');
    const items = await _paginarTodo('/pins');

    const pines = items.map(p => _normalizarPin(p)).filter(p => p.url);
    _cacheSetSection('myPins', pines);
    console.log(`[Pinterest] ← ${pines.length} pin(es) propios`);
    return pines;
}

// ══════════════════════════════════════════════════════════════════════════════
//  BÚSQUEDA OFICIAL DENTRO DE LA CUENTA
//  Endpoint: GET /v5/search/pins
//  Requiere scope: pins:read
//
//  ⚠️  LIMITACIÓN OFICIAL: busca SOLO dentro de los pins guardados/creados
//  por el usuario autenticado. No es una búsqueda del catálogo público global
//  de Pinterest (eso requiere Pinterest Partner Access, no disponible en
//  acceso Standard o Business).
// ══════════════════════════════════════════════════════════════════════════════

async function buscarEnCuenta(query, maxPins = 50) {
    const cacheKey = query.toLowerCase().trim().slice(0, 100);
    const cached   = _cacheGetKey('searchResults', cacheKey);
    if (cached) {
        console.log(`[Pinterest] Cache hit search "${query}" → ${cached.length} resultado(s)`);
        return cached;
    }

    console.log(`[Pinterest] GET /v5/search/pins  query="${query}"`);
    try {
        const data  = await _apiGet('/search/pins', { query, page_size: Math.min(maxPins, 50) });
        const items = data?.items || [];
        const pines = items.map(p => _normalizarPin(p)).filter(p => p.url);

        _cacheSetKey('searchResults', cacheKey, pines);
        console.log(`[Pinterest] ← ${pines.length} resultado(s) en cuenta para "${query}"`);
        return pines;
    } catch (e) {
        if (e.message === 'SIN_TOKEN' || e.message === 'TOKEN_INVALIDO') return [];
        console.error(`[Pinterest/Search] Error: HTTP ${e.response?.status ?? 'NETWORK'} — ${e.message?.split('\n')[0]}`);
        if (e.response?.data) console.error(`[Pinterest/Search]`, JSON.stringify(e.response.data));
        return [];
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PRECARGA AUTOMÁTICA DE TODOS LOS TABLEROS Y SUS PINES
//
//  Se lanza en background la primera vez que se hace una búsqueda.
//  Esto permite que la búsqueda local encuentre pines que NO tienen título
//  ni descripción, usando el nombre del tablero como señal primaria.
//
//  Patrón singleton: solo una precarga en curso a la vez.
// ══════════════════════════════════════════════════════════════════════════════

let _precargarPromise = null;
let _precargarCompletado = false;

async function precargarTodosLosPines() {
    // Si ya está en curso o completado, no lanzar otra vez
    if (_precargarPromise) return _precargarPromise;
    if (_precargarCompletado) return;

    // Si ya hay datos en caché válidos (cargados desde disco al inicio), marcar como listo
    const tieneCachePines = Object.keys(_cache.boardPins || {}).length > 0;
    if (tieneCachePines) {
        _precargarCompletado = true;
        console.log('[Pinterest] Precarga: datos encontrados en caché de disco, sin peticiones extra.');
        return;
    }

    _precargarPromise = (async () => {
        const token = await _obtenerAccessToken();
        if (!token) {
            _precargarPromise = null;
            return;
        }

        console.log('[Pinterest] Iniciando precarga de tableros en background...');
        let tableros;
        try {
            tableros = await obtenerTableros();
        } catch (e) {
            console.warn('[Pinterest] Precarga: no se pudieron obtener tableros:', e.message?.split('\n')[0]);
            _precargarPromise = null;
            return;
        }

        // Cargar pines de todos los tableros en lotes de 3 (no saturar la API)
        const BATCH = 3;
        for (let i = 0; i < tableros.length; i += BATCH) {
            const lote = tableros.slice(i, i + BATCH);
            await Promise.allSettled(
                lote.map(t => obtenerPinesTablero(t.id, t.nombre).catch(() => []))
            );
        }

        _precargarCompletado = true;
        _precargarPromise    = null;
        const totalPines = Object.values(_cache.boardPins)
            .reduce((sum, e) => sum + (e?.data?.length || 0), 0);
        console.log(`[Pinterest] Precarga completa: ${tableros.length} tablero(s), ${totalPines} pin(es) indexados.`);
    })();

    return _precargarPromise;
}

// ══════════════════════════════════════════════════════════════════════════════
//  BÚSQUEDA LOCAL DENTRO DEL CACHÉ (sin peticiones adicionales a la API)
//
//  Estrategia para pines SIN texto (título/descripción vacíos):
//    → Si la query coincide con el nombre de un tablero, se incluyen TODOS
//      los pines de ese tablero, aunque no tengan ningún metadato textual.
//    → Esto resuelve el caso real: un pin de anime sin título/descripción
//      guardado en un tablero llamado "Anime" sí aparece al buscar "anime".
//
//  Para pines CON texto se usa la puntuación habitual por términos.
// ══════════════════════════════════════════════════════════════════════════════

function _buscarEnCache(query) {
    const norm     = t => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const q        = norm(query);
    const terminos = q.split(/\s+/).filter(Boolean);
    const pool     = [];
    const seen     = new Set();

    if (!terminos.length) return pool;

    // Identificar tableros cuyo nombre coincide con algún término de la query
    // → todos los pines de esos tableros recibirán puntuación máxima
    const tablerosList    = _cache.boards?.data || [];
    const tablerosMatch   = new Set(
        tablerosList
            .filter(t => terminos.some(term => norm(t.nombre).includes(term) || term.includes(norm(t.nombre).split(' ')[0])))
            .map(t => t.id)
    );

    // También mapear boardId → nombre para acceder al nombre desde el pin
    const boardIdToName = {};
    for (const t of tablerosList) boardIdToName[t.id] = norm(t.nombre);

    function _score(pin, boardId) {
        // Coincidencia por nombre de tablero → puntuación alta (permite pines sin texto)
        if (boardId && tablerosMatch.has(boardId)) return 50;

        // Coincidencia por texto del pin
        const texto = norm([
            pin.titulo,
            pin.descripcion,
            pin.tablero,
            pin.categoria,
            boardId ? (boardIdToName[boardId] || '') : '',
        ].join(' '));

        const hits = terminos.filter(t => texto.includes(t)).length;
        return hits;
    }

    // Pines de tableros
    for (const [boardId, entry] of Object.entries(_cache.boardPins || {})) {
        for (const pin of (entry?.data || [])) {
            if (seen.has(pin.pinId)) continue;
            seen.add(pin.pinId);
            const score = _score(pin, boardId);
            if (score > 0) pool.push({ ...pin, _score: score });
        }
    }

    // Mis pines propios (sin boardId disponible)
    for (const pin of (_cache.myPins?.data || [])) {
        if (seen.has(pin.pinId)) continue;
        seen.add(pin.pinId);
        const score = _score(pin, null);
        if (score > 0) pool.push({ ...pin, _score: score });
    }

    return pool.sort((a, b) => b._score - a._score);
}

// ══════════════════════════════════════════════════════════════════════════════
//  buscarPinterest — orquestador principal (solo fuentes oficiales)
//
//  Prioridad:
//    1. GET /v5/search/pins  (búsqueda oficial en pines guardados)
//    2. Búsqueda local en caché con matching por nombre de tablero
//       → encuentra pines SIN título ni descripción si su tablero coincide
//
//  La precarga de tableros se lanza en background al primer uso.
//  ❌ No se usa Bing, scraping de terceros, proxies ni APIs no autorizadas.
// ══════════════════════════════════════════════════════════════════════════════

async function buscarPinterest(query) {
    const token = await _obtenerAccessToken();

    if (!token) {
        _estadoAuth = { error: true, tipo: 'SIN_TOKEN', at: Date.now() };
        return [];
    }

    // Esperar a que todos los tableros y sus pines estén indexados en caché.
    // La primera vez hace las peticiones a la API; las siguientes es instantáneo.
    await precargarTodosLosPines();

    // Buscar en el índice local (tableros + pines ya cargados)
    const pool = _buscarEnCache(query);
    console.log(`[Pinterest] Búsqueda "${query}" → ${pool.length} resultado(s)`);
    return pool;
}

// ══════════════════════════════════════════════════════════════════════════════
//  DETECCIÓN Y RESOLUCIÓN DE URLs
// ══════════════════════════════════════════════════════════════════════════════

function esPinUrl(texto) {
    return REGEX_PIN_URL.test((texto || '').trim());
}

function extraerPinId(url) {
    const m = (url || '').match(/\/pin\/(\d+)/);
    return m ? m[1] : null;
}

async function resolverPinIt(url) {
    if (!url.includes('pin.it')) return url;
    try {
        const res = await axios.get(url, {
            maxRedirects  : 10,
            timeout       : 12000,
            headers       : { 'User-Agent': UA },
            validateStatus: s => s < 500
        });
        return res.request?.res?.responseUrl || res.config?.url || url;
    } catch (e) {
        return e.response?.headers?.location || url;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SCRAPING DE PÁGINA PÚBLICA DEL PIN (solo para descarga por URL directa)
//  Extrae __PWS_RELAY_REGISTER_COMPLETED_REQUEST__ del HTML de la página.
//  Se invoca ÚNICAMENTE cuando el usuario proporciona una URL de pin —
//  nunca para búsquedas. No requiere credenciales.
// ══════════════════════════════════════════════════════════════════════════════

function _extractRelayPinData(html) {
    const MARKER = '__PWS_RELAY_REGISTER_COMPLETED_REQUEST__';
    let searchFrom = 0;

    while (true) {
        const mIdx = html.indexOf(MARKER, searchFrom);
        if (mIdx < 0) break;

        let i = mIdx + MARKER.length;
        while (i < html.length && /[\s(]/.test(html[i])) i++;
        if (html[i] === '"') {
            i++;
            while (i < html.length) {
                if (html[i] === '\\') { i += 2; continue; }
                if (html[i] === '"')  { i++; break; }
                i++;
            }
        }
        while (i < html.length && /[,\s]/.test(html[i])) i++;

        if (i >= html.length || html[i] !== '{') { searchFrom = mIdx + 1; continue; }

        const start = i;
        let depth = 0, inStr = false, esc = false;
        for (; i < html.length; i++) {
            const ch = html[i];
            if (esc)                  { esc = false;  continue; }
            if (ch === '\\' && inStr) { esc = true;   continue; }
            if (ch === '"')           { inStr = !inStr; continue; }
            if (inStr)                continue;
            if (ch === '{')           depth++;
            else if (ch === '}')      { depth--; if (depth === 0) { i++; break; } }
        }

        try {
            const data    = JSON.parse(html.slice(start, i));
            const pinData = data?.data?.v3GetPinQueryv2?.data;
            if (pinData) return pinData;
        } catch {}

        searchFrom = mIdx + 1;
    }
    return null;
}

async function _scrapePinPage(pinId) {
    const res = await axios.get(`https://www.pinterest.com/pin/${pinId}/`, {
        headers: {
            'User-Agent'     : UA,
            'Accept'         : 'text/html,application/xhtml+xml',
            'Accept-Language': 'es-419,es;q=0.9',
        },
        timeout: 20000
    });
    return _extractRelayPinData(res.data || '');
}

function _parseRelayData(p, pinId) {
    if (!p) return null;

    const imgUrl = (
        p.images_orig?.url  ||
        p.images_736x?.url  ||
        p.images_564x?.url  ||
        p.images_474x?.url  ||
        p.images_236x?.url  || ''
    ).replace(/\\/g, '');

    const width  = p.images_736x?.width  || p.images_474x?.width  || 0;
    const height = p.images_736x?.height || p.images_474x?.height || 0;

    const vlist = p.videos?.video_list || {};
    let videoUrl = '', duracion = 0;
    if (Object.keys(vlist).length > 0) {
        for (const key of ['V_720P', 'V_480P', 'V_360P', 'V_EXP6']) {
            if (vlist[key]?.url && !vlist[key].url.includes('.m3u8')) {
                videoUrl  = vlist[key].url;
                duracion  = vlist[key].duration || 0;
                break;
            }
        }
        if (!videoUrl) {
            const first = Object.values(vlist).find(v => v?.url);
            if (first) { videoUrl = first.url; duracion = first.duration || 0; }
        }
    }

    const esVideo     = !!(videoUrl || p.isVideo);
    const pinnerFull  = p.pinner?.fullName   || p.pinner?.full_name   || '';
    const pinnerUser  = p.pinner?.username   || '';
    const creatorUser = p.nativeCreator?.username || p.originPinner?.username || pinnerUser;
    const creatorFull = p.nativeCreator?.fullName || p.originPinner?.fullName ||
                        p.nativeCreator?.full_name || p.originPinner?.full_name || pinnerFull;

    return {
        tipo       : esVideo ? 'video' : 'imagen',
        titulo     : (p.title       || p.gridTitle || '').trim(),
        descripcion: (p.description || p.closeupUnifiedDescription || '').trim(),
        autor      : creatorFull || pinnerFull,
        username   : creatorUser || pinnerUser,
        tablero    : (p.board?.name || '').trim(),
        url        : `https://www.pinterest.com/pin/${p.id || pinId}/`,
        imgUrl,
        videoUrl,
        width,
        height,
        duracion,
        pinId      : String(p.id || pinId),
        createdAt  : p.createdAt || '',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
//  DESCARGA DE UN PIN POR URL
// ══════════════════════════════════════════════════════════════════════════════

async function descargarPin(urlOrig) {
    const url   = await resolverPinIt((urlOrig || '').trim());
    const pinId = extraerPinId(url);
    if (!pinId) throw new Error('No se pudo extraer el ID del pin desde la URL.');

    let info = null;
    try {
        const relayData = await _scrapePinPage(pinId);
        info = _parseRelayData(relayData, pinId);
    } catch (e) {
        console.error('[Pinterest] Scrape error:', e.message?.split('\n')[0]);
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin_'));
    try {
        if (info?.tipo === 'video' && info.videoUrl && !info.videoUrl.includes('.m3u8')) {
            try {
                const res = await axios.get(info.videoUrl, {
                    responseType: 'arraybuffer', timeout: 90000,
                    headers: { 'User-Agent': UA, 'Referer': 'https://www.pinterest.com/' },
                    maxContentLength: 100 * 1024 * 1024
                });
                return { tipo: 'video', buffer: Buffer.from(res.data), info };
            } catch {}
        }

        if (info?.imgUrl) {
            const res = await axios.get(info.imgUrl, {
                responseType: 'arraybuffer', timeout: 30000,
                headers: { 'User-Agent': UA, 'Referer': 'https://www.pinterest.com/' },
                maxContentLength: 50 * 1024 * 1024
            });
            return { tipo: 'imagen', buffer: Buffer.from(res.data), info };
        }

        // Fallback: yt-dlp para vídeos sin URL directa
        const tmpOut     = path.join(tmpDir, 'media.%(ext)s');
        const hasCookies = fs.existsSync(PINTEREST_COOKIES) &&
            fs.readFileSync(PINTEREST_COOKIES, 'utf8').split('\n').some(l => l.trim() && !l.startsWith('#'));

        const infoArgs = ['--no-playlist', '--no-warnings', '-j', '--add-header', `User-Agent:${UA}`];
        if (hasCookies) infoArgs.unshift('--cookies', PINTEREST_COOKIES);
        infoArgs.push(url);

        let ytMeta;
        try {
            const { stdout } = await execFileAsync(YTDLP, infoArgs,
                { timeout: 35000, maxBuffer: 10 * 1024 * 1024 });
            ytMeta = JSON.parse(stdout.trim());
        } catch (e) {
            const msg = e.message || '';
            if (msg.includes('No video formats found') || msg.includes('no video'))
                throw new Error('No se pudo descargar este pin. Puede ser privado o no estar disponible.');
            throw new Error(`Error al obtener el pin: ${msg.split('\n')[0]}`);
        }

        if (!info) {
            info = {
                tipo: 'video', titulo: (ytMeta.title || '').trim(),
                descripcion: (ytMeta.description || '').trim(),
                autor: (ytMeta.uploader || '').trim(),
                username: (ytMeta.uploader_id || '').trim(),
                tablero: '', url: ytMeta.webpage_url || url,
                imgUrl: ytMeta.thumbnail || '', videoUrl: '',
                width: ytMeta.width || 0, height: ytMeta.height || 0,
                duracion: ytMeta.duration || 0, pinId,
            };
        }

        const dlArgs = [
            '--no-playlist', '--no-warnings', '--quiet', '--no-progress',
            '-o', tmpOut, '--add-header', `User-Agent:${UA}`,
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]/best',
            '--merge-output-format', 'mp4'
        ];
        if (hasCookies) dlArgs.unshift('--cookies', PINTEREST_COOKIES);
        dlArgs.push(url);

        await execFileAsync(YTDLP, dlArgs, { timeout: 90000, maxBuffer: 200 * 1024 * 1024 });

        const archivos = fs.readdirSync(tmpDir);
        if (!archivos.length) throw new Error('yt-dlp no generó ningún archivo.');

        const buffer  = fs.readFileSync(path.join(tmpDir, archivos[0]));
        const extReal = path.extname(archivos[0]).replace('.', '').toLowerCase();
        info.tipo = ['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(extReal) ? 'video' : 'imagen';

        return { tipo: info.tipo, buffer, info };

    } finally {
        try { fs.removeSync(tmpDir); } catch {}
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  fetchPinInfo — Metadata de un pin por ID (scraping de página pública)
//  Solo para enriquecer datos de un pin cuyo ID ya se conoce.
// ══════════════════════════════════════════════════════════════════════════════

async function fetchPinInfo(pinId) {
    try {
        const relayData = await _scrapePinPage(pinId);
        return _parseRelayData(relayData, pinId);
    } catch {
        return null;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  FORMATEAR INFO DEL PIN
// ══════════════════════════════════════════════════════════════════════════════

function formatearInfoPin(info, incluirTipo = true) {
    const lineas = [];

    if (info.autor || info.username) {
        const display =
            (info.autor && info.username && info.autor !== info.username)
                ? `${info.autor} (${info.username})`
                : info.autor || info.username;
        lineas.push(`❀ *Usuario »* ${display}`);
    }

    const titulo = info.titulo?.trim();
    if (titulo) lineas.push(`❖ *Título »* ${titulo}`);

    const desc = info.descripcion?.trim();
    if (desc && desc !== titulo) lineas.push(`📝 *Descripción »* ${desc}`);

    if (info.tablero) lineas.push(`□ *Tablero »* ${info.tablero}`);

    if (incluirTipo && info.tipo)
        lineas.push(`🎞️ *Tipo »* ${info.tipo === 'video' ? '🎬 Vídeo' : '🖼️ Imagen'}`);

    if (info.width && info.height)
        lineas.push(`📐 *Resolución »* ${info.width}×${info.height}`);

    if (info.duracion > 0) {
        const seg = Math.round(info.duracion);
        const dur = seg >= 60 ? `${Math.floor(seg / 60)}m ${seg % 60}s` : `${seg}s`;
        lineas.push(`⏱️ *Duración »* ${dur}`);
    }

    if (info.url) lineas.push(`🔗 *Link »* ${info.url}`);

    return lineas.join('\n');
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
//  BÚSQUEDA DIRECTA POR SCRAPING (sin OAuth, sin credenciales)
//  Usa la API interna de Pinterest igual que lo hace el navegador.
// ══════════════════════════════════════════════════════════════════════════════
async function buscarPinsDirecto(query) {
    const q = encodeURIComponent(query);
    const url =
        `https://id.pinterest.com/resource/BaseSearchResource/get/` +
        `?source_url=%2Fsearch%2Fpins%2F%3Fq%3D${q}%26rs%3Dtyped` +
        `&data=%7B%22options%22%3A%7B%22applied_unified_filters%22%3Anull%2C` +
        `%22auto_correction_disabled%22%3Afalse%2C%22query%22%3A%22${q}%22%2C` +
        `%22redux_normalize_feed%22%3Atrue%2C%22rs%22%3A%22typed%22%2C` +
        `%22scope%22%3A%22pins%22%7D%2C%22context%22%3A%7B%7D%7D`;
    const headers = {
        'accept'                  : 'application/json, text/javascript, */*; q=0.01',
        'accept-language'         : 'es-MX,es;q=0.9,en-US;q=0.8',
        'referer'                 : 'https://id.pinterest.com/',
        'user-agent'              : UA,
        'x-app-version'           : 'c056fb7',
        'x-pinterest-appstate'    : 'active',
        'x-pinterest-pws-handler' : 'www/index.js',
        'x-pinterest-source-url'  : '/',
        'x-requested-with'        : 'XMLHttpRequest',
    };
    const res = await axios.get(url, { headers, timeout: 15000 });
    const results = res.data?.resource_response?.data?.results || [];
    return results
        .filter(item => item?.images)
        .map(item => ({
            url   : item.images?.orig?.url || item.images?.['564x']?.url || null,
            titulo: (item.title || '').trim(),
            urlPin: item.id ? `https://www.pinterest.com/pin/${item.id}/` : null,
        }))
        .filter(item => item.url);
}

module.exports = {
    esPinUrl,
    resolverPinIt,
    descargarPin,
    buscarPinterest,
    buscarPinsDirecto,
    buscarEnCuenta,
    formatearInfoPin,
    fetchPinInfo,
    obtenerTableros,
    obtenerPinesTablero,
    obtenerMisPines,
    clasificarPin,
    getEstadoAuth,
    limpiarEstadoAuth,
    obtenerAccessToken: _obtenerAccessToken,
    tieneTokenBusqueda: () => fs.existsSync(TOKEN_FILE),
    buscarImagenPinterest: async (query) => {
        const res = await buscarPinterest(query);
        return res.length > 0 ? (res[0].url || null) : null;
    },
};
