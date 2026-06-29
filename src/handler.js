const fs = require('fs');
const path = require('path');

const { H, FI, FC, OK, ERR, WARN, INFO, DIV } = require('./style');
const { isOwner, isSuperOwner, addOwner, removeOwner, getOwners, SUPER_OWNER } = require('./owners');
const { resolverJid } = require('./lidResolver');
const { getCommandWeight, increaseRisk, applyRiskDelay, getRiskLevel, isMediaLimited, MEDIA_LIMIT_PER_MIN } = require('./antiban');

const rutaEstado = './data/estado.json';
let botActivo;
let modoMantenimiento;
let mensajeMantenimiento;

if (fs.existsSync(rutaEstado)) {
    const data        = JSON.parse(fs.readFileSync(rutaEstado));
    botActivo         = data.activo            ?? true;
    modoMantenimiento = data.mantenimiento     ?? false;
    mensajeMantenimiento = data.msgMantenimiento ?? `${WARN} *Bot en mantenimiento.*\nEstamos haciendo mejoras, vuelve en un momento.`;
    // Restaurar eventosActivos desde disco para que sobreviva reinicios del bot.
    // Antes esto se perdía porque solo se guardaba en memoria (botState.eventosActivos = false al arrancar).
    if (data.eventosActivos === true) {
        const botState = require('./botState');
        botState.eventosActivos = true;
    }
} else {
    botActivo            = true;
    modoMantenimiento    = false;
    mensajeMantenimiento = `${WARN} *Bot en mantenimiento.*\nEstamos haciendo mejoras, vuelve en un momento.`;
    fs.writeFileSync(rutaEstado, JSON.stringify({ activo: true, mantenimiento: false, msgMantenimiento: mensajeMantenimiento }, null, 2));
}

function guardarEstado() {
    const botState = require('./botState');
    fs.writeFileSync(rutaEstado, JSON.stringify({
        activo:           botActivo,
        mantenimiento:    modoMantenimiento,
        msgMantenimiento: mensajeMantenimiento,
        // Persistir el estado de los eventos para que no se pierda al reiniciar
        eventosActivos:   botState.eventosActivos
    }, null, 2));
}

// ── Módulos ────────────────────────────────────────────────────────────────
const { enviarMenu, enviarMenuNsfw, cmdSetMenuImage, cmdDelMenuImage, cmdSetMultimediaMenu, cmdSearchCmd } = require('./menu');
const { cmdGivechest, cmdClaimchest } = require('./chest');

const {
    cmdSaldo, cmdEconomyInfo, cmdDiario, cmdWork, cmdCrime, cmdSlut, cmdCoinflip,
    cmdDeposit, cmdWithdraw, cmdRoulette, cmdSteal, cmdTransferir,
    cmdBaltop, cmdRichTopGlobal, cmdRichTopGroup, cmdLevelTopGlobal, cmdLevelTopGroup,
    cmdTienda, cmdComprar, cmdInventario,
    cmdMinar, cmdAdventure, cmdCazar, cmdFish, cmdMazmorra,
    cmdSemanal, cmdMensual
} = require('./economy');

const { cmdLogros, cmdListaLogros }                                = require('./logros');
const { cmdInventario: cmdInv2, cmdShop, cmdBuyItem, cmdUseItem }  = require('./items');
const { cmdInvertir, cmdInteres, cmdPrestamo, cmdPagarPrestamo, cmdBancoInfo, verificarDeudaVencida, tieneDeudaVencida, iniciarSchedulerDeudas } = require('./banco');
const { cmdStats, cmdTrain, cmdFight }                             = require('./combate');
const { cmdTrivia, cmdMath, cmdGuess, cmdWordchain, cmdStopGame, cmdPpt, cmdAhorcado, cmdScramble, cmdQuien, procesarRespuesta, cmdTsQuiz, cmdCompleta, cmdVof, cmdEmojiAdivina, cmdBola8 } = require('./minijuegos');
const { cmdMisiones, cmdClaimMision, cmdMisionesSemanales, cmdClaimMisionSemanal } = require('./misiones');
const { cmdDarRep, cmdVerRep, cmdTopRep }                          = require('./reputacion');
const { cmdPoll, cmdPollVote, cmdPollResults, cmdTruth, cmdDare, cmdTruthOrDare } = require('./social');
const { cmdBlackjack, cmdHit, cmdStand, cmdSlots, cmdJackpot }     = require('./casino');
const {
    cmdCrearClan, cmdUnirClan, cmdSalirClan, cmdInfoClan, cmdEditarClan, cmdGuerraClanes, cmdListaClanes,
    cmdVerSolicitudes, cmdGestionarSolicitud,
    cmdBancoClan, cmdDepositarClan, cmdRetirarClan,
    cmdPromoverMiembro, cmdDemotarMiembro, cmdDisolverClan, cmdKickClan
} = require('./clanes');
const { cmdMercado, cmdListar, cmdComprarOferta, cmdCancelarOferta } = require('./mercado');
const {
    cmdAfk, verificarAfk, notificarAfk,
    cmdAfkList, cmdAfkDel,
    cmdAdoptar, cmdPetInfo, cmdPetFeed, cmdPetPlay, cmdCambiarMascota, cmdAbandonarMascota,
    cmdHack, cmdRankGlobal, cmdEvento, cmdEventosCatalogo, cmdLoot, obtenerEventoActivo, invalidarCacheEvento
} = require('./extras');
const { verificarYNotificar }                                      = require('./logros');
const { registrarMensajeGrupal }                                   = require('./ai');

const {
    cmdInteraccion, cmdNsfw, cmdNsfwAccion, cmdWaifu, cmdImageboard, cmdTopRandom,
    precalentarCacheSfw,
    TODO_SFW, TODO_NSFW_IMG, TODO_NSFW_ACCION, TODO_IMAGEBOARDS, TODO_IMAGEBOARDS_VIDEO
} = require('./interactions');

const { cmdSticker, cmdStickerSearch, ssMap, lastSearch } = require('./sticker');

const {
    cmdYoutube, cmdYoutubeAudio, cmdYoutubeSearch, cmdYoutubeVideoSearch,
    cmdTiktok, cmdTiktokAudio, cmdFacebook,
    cmdTwitter, cmdInstagram, cmdPinterest, cmdImagen,
    cmdDiagnosticoDescargas,
    cmdMediafire, cmdSpotify, cmdSoundcloud, cmdThreads, cmdApkpure, cmdDrive
} = require('./downloads');

const { cmdPixiv } = require('./pixiv');
const {
    esPinUrl, descargarPin, buscarPinterest, formatearInfoPin, fetchPinInfo,
    tieneTokenBusqueda, getEstadoAuth, limpiarEstadoAuth,
} = require('./pinterest');
const _axiosPinImg = require('axios');

const {
    cmdHitomi, cmdNhentai, cmdVermangasporno, cmdXnxx, cmdPornhub, cmdXvideos,
    TODO_NSFW_DOWNLOADS
} = require('./nsfwdownloads');

const { cmdTranslate, cmdWikipedia, cmdSsweb, cmdIpLookup, cmdCalc } = require('./utiltools');

const {
    cmdPing, cmdStatus, cmdEliminar, cmdFotoPerfil, cmdTagAll,
    cmdStickerAImagen, cmdStickerAVideo, cmdSuggest, cmdReport, cmdBots, cmdInvite,
    cmdTestWelcome, cmdLeave, cmdHd, cmdRead, cmdVideoAGif
} = require('./utils');

const {
    cmdJoin, cmdLogout, cmdSetPrefix, cmdSetChannel, cmdSetLink,
    cmdSetPfp, cmdSetUsername, cmdKickBot
} = require('./sockets');

const {
    cmdPerfil, cmdSetbirth, cmdDelbirth, cmdSetdesc, cmdSetgenre, cmdDelgenre,
    cmdSetfav, cmdMarry, cmdDivorce, cmdLevel, cmdLeaderboard,
    cmdCumpleanos, cmdAllBirthdays, cmdGrupoInfo, cmdRango, cmdRacha,
    cmdTopWeekly
} = require('./profile');

const {
    esAdmin, verificarAntilink, cmdKick, cmdPromote, cmdDemote,
    cmdAntilink, cmdClose, cmdSetwelcome, cmdSetgoodbye, cmdResetwelcome, cmdResetgoodbye, cmdWelcome,
    cmdGoodbye, cmdOnlyadmin, cmdOpen, cmdWarn, cmdDelwarn, cmdWarns, cmdResetwarns, cmdWarnsList,
    cmdSetwarnlimit, cmdTopmensajes, cmdAlerts, cmdToggleEconomy, cmdToggleGacha,
    cmdTempban, cmdTempbans, cmdUntempban,
    cmdMuteBot, cmdUnmuteBot, cmdMutedList, esMuteadoBot, iniciarCheckMutebots,
    cmdModlog, cmdClearmodlog,
    cmdToggleNsfw, cmdGroupImage, cmdMsgCount, cmdTopInactive, cmdInactivos, cmdKickInactivos, cmdSetPrimary,
    cmdSetWelcomeImage, cmdDelWelcomeImage, cmdSetGoodbyeImage, cmdDelGoodbyeImage,
    cmdSetMultimediaWelcome, cmdSetMultimediaGoodbye,
    cmdSetNsfwMenuMedia, cmdDelNsfwMenuMedia, cmdUploadNsfwMedia, cmdUploadSfwMedia,
    cmdLimpiarUsuarios, cmdSetGpName, cmdSetGpDesc,
    cmdSetTagMode, cmdConfig
} = require('./admin');

const { getUsuario, getGrupo, guardarGrupo, agregarExp, guardarUsuario, cargarGrupos, quitarMonedas, agregarMonedas } = require('./database');
const { cmdIA, cmdLimpiarMemoria } = require('./ai');
const { cmdShip, cmdMeme, cmdFrase } = require('./fun');
const { logError } = require('./logger');
const { obtenerRango } = require('./profile');

const cooldownGlobal = new Map();
const cooldownGlobalMs = 15 * 1000;
const rateLimitState = new Map();
const botState = require('./botState');

// ── Limpieza periódica de Maps para evitar fugas de memoria ────────────────
// Los Maps cooldownGlobal y rateLimitState acumulan entradas viejas
// indefinidamente sin este cleanup (una entrada por usuario × por comando).
setInterval(() => {
    const ahora = Date.now();
    const UMBRAL = 60 * 60 * 1000; // descartar entradas con más de 1 hora
    for (const [key, ts] of cooldownGlobal.entries()) {
        if (ahora - ts > UMBRAL) cooldownGlobal.delete(key);
    }
    for (const [key, state] of rateLimitState.entries()) {
        const bloqueadoExpirado = !state.lockedUntil || ahora > state.lockedUntil;
        const inicioViejo = ahora - (state.start || 0) > UMBRAL;
        if (bloqueadoExpirado && inicioViejo) rateLimitState.delete(key);
    }
}, 10 * 60 * 1000).unref();

// ── Antispam por usuario (punto 7) ────────────────────────────────────────
const ANTISPAM_WINDOW  = 10 * 1000; // ventana de 10 segundos
const ANTISPAM_MAX     = 8;          // máx 8 comandos en la ventana
const ANTISPAM_BLOCK   = 30 * 1000; // bloqueo de 30 segundos

function checkAntispam(senderJid) {
    const now = Date.now();
    const state = botState.antispam.get(senderJid) || { count: 0, start: now, blockedUntil: 0 };
    if (state.blockedUntil && now < state.blockedUntil) {
        return Math.ceil((state.blockedUntil - now) / 1000);
    }
    if (now - state.start > ANTISPAM_WINDOW) {
        state.count = 0;
        state.start = now;
        state.blockedUntil = 0;
    }
    state.count++;
    if (state.count > ANTISPAM_MAX) {
        state.blockedUntil = now + ANTISPAM_BLOCK;
        botState.antispam.set(senderJid, state);
        return Math.ceil(ANTISPAM_BLOCK / 1000);
    }
    botState.antispam.set(senderJid, state);
    return 0;
}

// ── Tracking de uso de comandos (punto 6) ─────────────────────────────────
function trackCmd(cmd) {
    const prev = botState.cmdStats.get(cmd) || 0;
    botState.cmdStats.set(cmd, prev + 1);
}

const rateLimitConfig = new Map([
    ['yt', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['mp4', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['ytmp4', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['play', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['ytaudio', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['mp3', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['ytsearch', { window: 45 * 1000, max: 3, lock: 3 * 60 * 1000 }],
    ['search', { window: 45 * 1000, max: 3, lock: 3 * 60 * 1000 }],
    ['buscarvideo', { window: 45 * 1000, max: 3, lock: 3 * 60 * 1000 }],
    ['tiktok', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['tt', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['ttplay', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['tiktokmp3', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['ttaudio', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['facebook', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['fb', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['fvideo', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['twitter', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['x', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['instagram', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['ig', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['reel', { window: 60 * 1000, max: 2, lock: 5 * 60 * 1000 }],
    ['pin', { window: 45 * 1000, max: 3, lock: 3 * 60 * 1000 }],
    ['pinterest', { window: 45 * 1000, max: 3, lock: 3 * 60 * 1000 }],
    ['img', { window: 45 * 1000, max: 3, lock: 3 * 60 * 1000 }],
    ['downloaddiag', { window: 2 * 60 * 1000, max: 1, lock: 10 * 60 * 1000 }],
    ['diagdescargas', { window: 2 * 60 * 1000, max: 1, lock: 10 * 60 * 1000 }],
    ['ss', { window: 45 * 1000, max: 3, lock: 3 * 60 * 1000 }],
    ['again', { window: 45 * 1000, max: 3, lock: 3 * 60 * 1000 }],
    ['sticker', { window: 45 * 1000, max: 4, lock: 3 * 60 * 1000 }],
    ['s', { window: 45 * 1000, max: 4, lock: 3 * 60 * 1000 }],
    ['vote',  { window: 20 * 1000, max: 5, lock: 60 * 1000 }],
    ['pixiv', { window: 60 * 1000, max: 3, lock: 3 * 60 * 1000 }],
    ['px',    { window: 60 * 1000, max: 3, lock: 3 * 60 * 1000 }],
]);

function checkCooldownGlobal(user, comando) {
    const key = `${user}:${comando}`;
    const now = Date.now();
    const last = cooldownGlobal.get(key) || 0;
    if (now - last < cooldownGlobalMs) return Math.ceil((cooldownGlobalMs - (now - last)) / 1000);
    cooldownGlobal.set(key, now);
    return 0;
}

function aplicarRateLimit(senderJid, cmd) {
    const conf = rateLimitConfig.get(cmd);
    if (!conf) return 0;
    const key = `${senderJid}:${cmd}`;
    const now = Date.now();
    const state = rateLimitState.get(key) || { count: 0, start: now, lockedUntil: 0 };
    if (state.lockedUntil && now < state.lockedUntil) {
        return Math.ceil((state.lockedUntil - now) / 1000);
    }
    if (now - state.start > conf.window) {
        state.count = 0;
        state.start = now;
    }
    state.count += 1;
    if (state.count > conf.max) {
        state.lockedUntil = now + conf.lock;
        rateLimitState.set(key, state);
        return Math.ceil(conf.lock / 1000);
    }
    rateLimitState.set(key, state);
    return 0;
}

// ── Mapa de búsquedas activas para #pin (responder con 🔄) ─────────────────
//  Guarda: msgId → { query, pool: [], usados: Set() }
const pinMap = new Map();

// ── Descarga directa de un pin por URL ────────────────────────────────────
// Intenta primero con cheerio (YotsubaBot approach), luego cae al método legacy
async function _manejarDescargaPin(sock, from, url) {
    await sock.sendMessage(from, { text: `${INFO} Descargando pin...` });

    // Intento 1: cheerio scraping (sin deps de OAuth)
    try {
        const { tipo, url: mediaUrl, titulo } = await _descargarPinCheerio(url);
        const caption = `◈ *Pinterest*${titulo ? `\n◇ ${titulo}` : ''}`;
        if (tipo === 'video') {
            const buf = await _descargarImgBuffer(mediaUrl);
            await sock.sendMessage(from, { video: buf, caption, mimetype: 'video/mp4' });
        } else {
            try {
                await sock.sendMessage(from, { image: { url: mediaUrl }, caption });
            } catch {
                const buf = await _descargarImgBuffer(mediaUrl);
                await sock.sendMessage(from, { image: buf, caption });
            }
        }
        return;
    } catch (e) {
        console.log('[PIN] cheerio falló, intentando método legacy:', e.message);
    }

    // Intento 2: método legacy (descargarPin del módulo pinterest)
    let resultado;
    try {
        resultado = await descargarPin(url);
    } catch (e) {
        const msg = e.message || '';
        if (msg.includes('private') || msg.includes('privad')) {
            await sock.sendMessage(from, { text: `${WARN} Este pin es privado.` });
        } else if (msg.includes('deleted') || msg.includes('eliminado') || msg.includes('404')) {
            await sock.sendMessage(from, { text: `${WARN} Este pin ya no existe o fue eliminado.` });
        } else if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
            await sock.sendMessage(from, { text: `${WARN} Tiempo de espera agotado. Intenta de nuevo.` });
        } else {
            await sock.sendMessage(from, { text: `${ERR} No se pudo descargar el pin.\n_${msg.split('\n')[0]}_` });
        }
        return;
    }
    const { tipo, buffer, info } = resultado;
    const caption = formatearInfoPin(info) || '◈ *Pinterest*';
    try {
        if (tipo === 'video') {
            await sock.sendMessage(from, { video: buffer, caption, mimetype: 'video/mp4' });
        } else {
            await sock.sendMessage(from, { image: buffer, caption });
        }
    } catch {
        await sock.sendMessage(from, { text: `${ERR} No se pudo enviar el archivo.\n${info?.url || url}` });
    }
}

// ── Helpers para búsqueda Pinterest ───────────────────────────────────────
const _UA_PIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

async function _descargarImgBuffer(url) {
    const res = await _axiosPinImg.get(url, {
        responseType     : 'arraybuffer',
        timeout          : 20000,
        headers          : { 'User-Agent': _UA_PIN, 'Referer': 'https://www.pinterest.com/' },
        maxContentLength : 50 * 1024 * 1024
    });
    return Buffer.from(res.data);
}

function _buildPinCaption(query, item) {
    let caption = `◈ *Pinterest:* ${query}`;
    if (item.titulo) caption += `\n◇ *Título »* ${item.titulo}`;
    if (item.urlPin) caption += `\n${item.urlPin}`;
    caption += `\n\n_Responde con otro mensaje para ver más_`;
    return caption;
}

// ── Búsqueda directa en Pinterest (sin OAuth — API interna pública) ────────
// Implementación basada en YotsubaBot-MD: no requiere tokens ni cuenta
async function _buscarPinsDirecto(query) {
    const q = encodeURIComponent(query);
    const url =
        `https://id.pinterest.com/resource/BaseSearchResource/get/` +
        `?source_url=%2Fsearch%2Fpins%2F%3Fq%3D${q}%26rs%3Dtyped` +
        `&data=%7B%22options%22%3A%7B%22applied_unified_filters%22%3Anull%2C` +
        `%22auto_correction_disabled%22%3Afalse%2C%22query%22%3A%22${q}%22%2C` +
        `%22redux_normalize_feed%22%3Atrue%2C%22rs%22%3A%22typed%22%2C` +
        `%22scope%22%3A%22pins%22%7D%2C%22context%22%3A%7B%7D%7D`;
    const headers = {
        'accept'                   : 'application/json, text/javascript, */*; q=0.01',
        'accept-language'          : 'es-MX,es;q=0.9,en-US;q=0.8',
        'referer'                  : 'https://id.pinterest.com/',
        'user-agent'               : _UA_PIN,
        'x-app-version'            : 'c056fb7',
        'x-pinterest-appstate'     : 'active',
        'x-pinterest-pws-handler'  : 'www/index.js',
        'x-pinterest-source-url'   : '/',
        'x-requested-with'         : 'XMLHttpRequest',
    };
    const res = await _axiosPinImg.get(url, { headers, timeout: 15000 });
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

// ── Descarga de URL Pinterest con cheerio (YotsubaBot approach) ────────────
async function _descargarPinCheerio(url) {
    const cheerio = require('cheerio');
    const res = await _axiosPinImg.get(url, {
        headers: { 'User-Agent': _UA_PIN },
        timeout: 15000,
    });
    const $ = cheerio.load(res.data);
    const videoTag = $('script[data-test-id="video-snippet"]');
    if (videoTag.length) {
        const result = JSON.parse(videoTag.text());
        return { tipo: 'video', url: result.contentUrl, titulo: result.name || '' };
    }
    const relayScript = $("script[data-relay-response='true']").eq(0).text();
    if (relayScript) {
        const json = JSON.parse(relayScript);
        const result = json?.response?.data?.['v3GetPinQuery']?.data;
        if (result) {
            return { tipo: 'image', url: result.imageLargeUrl || result.imageUrl, titulo: result.title || '' };
        }
    }
    throw new Error('No se pudo extraer el pin de la página.');
}

// ── Búsqueda de imágenes Pinterest ────────────────────────────────────────
async function _manejarBusquedaPin(sock, from, query) {
    await sock.sendMessage(from, { text: `${INFO} Buscando en Pinterest: *${query}*...` });

    let pool = [];
    try {
        pool = await _buscarPinsDirecto(query);
    } catch (e) {
        console.error('[PIN] Error búsqueda directa:', e.message);
        // Intentar fallback con buscarPinterest (OAuth) si está configurado
        try {
            const legacyPool = await buscarPinterest(query);
            if (legacyPool.length) pool = legacyPool.map(it => ({
                url   : it.url,
                titulo: it.titulo || '',
                urlPin: it.urlPin || null,
            }));
        } catch {}
    }

    if (!pool.length) {
        await sock.sendMessage(from, { text: `${ERR} No encontré pines para: *${query}*` });
        return;
    }

    const usados = new Set();
    const idx = Math.floor(Math.random() * Math.min(pool.length, 20));
    usados.add(idx);
    const item = pool[idx];
    const caption = _buildPinCaption(query, item);

    let sentMsg;
    try {
        sentMsg = await sock.sendMessage(from, { image: { url: item.url }, caption });
    } catch {
        try {
            const buf = await _descargarImgBuffer(item.url);
            sentMsg   = await sock.sendMessage(from, { image: buf, caption });
        } catch {
            await sock.sendMessage(from, { text: `${ERR} No se pudo enviar la imagen. Intenta de nuevo.` });
            return;
        }
    }

    if (sentMsg?.key?.id) {
        pinMap.set(sentMsg.key.id, { query, pool, usados });
        if (pinMap.size > 200) pinMap.delete(pinMap.keys().next().value);
    }
}

// ── Handler principal del comando #pin ────────────────────────────────────
async function manejarPin(sock, msg, isReply = false) {
    const from = msg.key.remoteJid;

    // ── Caso 1: El usuario respondió con 🔄 a una imagen anterior ──────────
    if (isReply) {
        const repliedId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
        if (!repliedId || !pinMap.has(repliedId)) return;

        const estado = pinMap.get(repliedId);
        const { query, pool, usados } = estado;

        // Buscar un resultado que no se haya mostrado aún
        const disponibles = pool
            .map((_, i) => i)
            .filter(i => !usados.has(i))
            .slice(0, 15);

        if (!disponibles.length) {
            await sock.sendMessage(from, { text: `${INFO} Ya mostré todas las imágenes disponibles para: *${query}*\nIntenta una búsqueda nueva.` });
            return;
        }

        const idx = disponibles[Math.floor(Math.random() * disponibles.length)];
        usados.add(idx);
        let item = pool[idx];

        // Enriquecer con info del creador original via scrape
        if (item.urlPin) {
            try {
                const info = await fetchPinInfo(item.urlPin);
                if (info?.autor || info?.username) {
                    item = { ...item, autor: info.autor, username: info.username };
                }
            } catch { /* no bloquear si falla el scrape */ }
        }

        const caption = _buildPinCaption(query, item);

        let sentMsg;
        try {
            sentMsg = await sock.sendMessage(from, { image: { url: item.url }, caption });
        } catch {
            try {
                const buf = await _descargarImgBuffer(item.url);
                sentMsg = await sock.sendMessage(from, { image: buf, caption });
            } catch {
                await sock.sendMessage(from, { text: `${ERR} No se pudo enviar la imagen.` });
                return;
            }
        }

        // Transferir estado al nuevo mensaje
        if (sentMsg?.key?.id) {
            pinMap.set(sentMsg.key.id, { query, pool, usados });
            pinMap.delete(repliedId);
        }
        return;
    }

    // ── Caso 2: Nuevo comando #pin ─────────────────────────────────────────
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const raw  = text.slice(text.indexOf(' ') + 1).trim();

    if (!raw) {
        await sock.sendMessage(from, {
            text:
                `${H('Pinterest')}\n\n` +
                '• `#pin <búsqueda>` — busca imágenes en Pinterest\n' +
                '• `#pin <link>` — descarga imagen o vídeo de un pin\n\n' +
                '*Ejemplos:*\n' +
                '`#pin anime aesthetic`\n' +
                '`#pin wallpaper dark`\n' +
                '`#pin https://pin.it/xxxxxx`'
        });
        return;
    }

    if (esPinUrl(raw)) {
        await _manejarDescargaPin(sock, from, raw);
    } else {
        await _manejarBusquedaPin(sock, from, raw);
    }
}

// ── Fijar / Desfijar mensaje ───────────────────────────────────────────────
async function cmdFijar(sock, jid, groupMetadata, senderJid, msg, desfijar = false) {
    if (!groupMetadata) {
        await sock.sendMessage(jid, { text: `${ERR} Este comando solo funciona en grupos.` });
        return;
    }
    if (!isOwner(senderJid) && !esAdmin(groupMetadata, senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo administradores pueden fijar mensajes.` });
        return;
    }
    const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
    const msgId = ctxInfo?.stanzaId;
    if (!msgId) {
        const accion = desfijar ? 'desfijar' : 'fijar';
        await sock.sendMessage(jid, { text: `${ERR} Debes citar el mensaje que quieres ${accion}.` });
        return;
    }
    const msgKey = {
        remoteJid: jid,
        id: msgId,
        participant: ctxInfo.participant || undefined,
    };
    try {
        await sock.sendMessage(jid, { pin: msgKey, type: desfijar ? 2 : 1 });
        const accion = desfijar ? 'desfijado' : 'fijado';
        await sock.sendMessage(jid, { text: `${OK} Mensaje ${accion} correctamente.` });
    } catch (err) {
        await sock.sendMessage(jid, { text: `${ERR} No se pudo ${desfijar ? 'desfijar' : 'fijar'} el mensaje. Asegúrate de que el bot sea administrador.` });
    }
}

// ── Comandos de Owner ──────────────────────────────────────────────────────
async function cmdAddOwner(sock, jid, senderJid, mencionados) {
    if (!isSuperOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el owner principal puede agregar owners.` });
        return;
    }
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#addowner @persona*` });
        return;
    }
    const target = mencionados[0];
    const ok = addOwner(target);
    if (ok) {
        await sock.sendMessage(jid, {
            text: `${OK} \`${target.split('@')[0]}\` fue agregado como owner del bot.`
        });
    } else {
        await sock.sendMessage(jid, {
            text: `${INFO} \`${target.split('@')[0]}\` ya es owner del bot.`
        });
    }
}

async function cmdDelOwner(sock, jid, senderJid, mencionados) {
    if (!isSuperOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el owner principal puede quitar owners.` });
        return;
    }
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#delowner @persona*` });
        return;
    }
    const target = mencionados[0];
    if (target === SUPER_OWNER) {
        await sock.sendMessage(jid, { text: `${ERR} No puedes quitarte a ti mismo como owner principal.` });
        return;
    }
    const ok = removeOwner(target);
    if (ok) {
        await sock.sendMessage(jid, {
            text: `${OK} \`${target.split('@')[0]}\` fue removido como owner del bot.`
        });
    } else {
        await sock.sendMessage(jid, {
            text: `${INFO} \`${target.split('@')[0]}\` no era owner del bot.`
        });
    }
}

async function cmdOwners(sock, jid) {
    const owners = getOwners();
    if (!owners.length) {
        await sock.sendMessage(jid, { text: `${INFO} No hay owners registrados.` });
        return;
    }
    let texto = `${H('Owners')}\n\n`;
    owners.forEach((o, i) => {
        const num = o.split('@')[0];
        const badge = i === 0 ? ' (Principal)' : '';
        texto += `${i + 1}. \`${num}\`${badge}\n`;
    });
    await sock.sendMessage(jid, { text: texto });
}

async function cmdSetBotCurrency(sock, jid, senderJid, args) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el owner puede usar este comando.` });
        return;
    }
    const moneda = args[0];
    if (!moneda) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: #setbotcurrency [símbolo]` });
        return;
    }
    const g = getGrupo(jid);
    g.moneda = moneda;
    guardarGrupo(jid, g);
    await sock.sendMessage(jid, { text: `${OK} Moneda del bot cambiada a: *${moneda}*` });
}

async function cmdSetBotOwner(sock, jid, senderJid, mencionados) {
    if (!isSuperOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el owner principal puede usar este comando.` });
        return;
    }
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: #setbotowner @usuario` });
        return;
    }
    const nuevo = mencionados[0];
    addOwner(nuevo);
    await sock.sendMessage(jid, {
        text: `${OK} \`${nuevo.split('@')[0]}\` establecido como owner del bot.`
    });
}

async function cmdAutoJoin(sock, jid, senderJid, args) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el owner puede usar este comando.` });
        return;
    }
    const link = args[0];
    if (!link || !link.includes('chat.whatsapp.com')) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: #autojoin [link del grupo]` });
        return;
    }
    const code = link.split('/').pop();
    try {
        await sock.groupAcceptInvite(code);
        await sock.sendMessage(jid, { text: `${OK} Me uní al grupo exitosamente.` });
    } catch {
        await sock.sendMessage(jid, { text: `${ERR} No pude unirme al grupo. Verifica el link.` });
    }
}

function resolverJidDesdeArgs(args, mencionados) {
    // Si hay una @mención, usarla directamente
    if (mencionados && mencionados.length > 0) return mencionados[0];
    // Si el primer arg parece un número de teléfono (solo dígitos)
    if (args[0] && /^\d{7,15}$/.test(args[0])) return `${args[0]}@s.whatsapp.net`;
    return null;
}

async function cmdQuitarDinero(sock, jid, senderJid, args, mencionados) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el owner puede usar este comando.` });
        return;
    }

    const targetJid = resolverJidDesdeArgs(args, mencionados);
    const cantidadRaw = (mencionados && mencionados.length > 0 ? args[0] : args[1]) || '';
    const modoArg    = ((mencionados && mencionados.length > 0 ? args[1] : args[2]) || '').toLowerCase();

    if (!targetJid) {
        await sock.sendMessage(jid, { text: `${ERR} Uso:\n• #quitarcoins @usuario 500\n• #quitarcoins @usuario 500 banco\n• #quitarcoins @usuario all` });
        return;
    }

    const u      = getUsuario(targetJid);
    const numero = targetJid.split('@')[0];

    // ── Modo ALL: borrar cartera + banco ─────────────────────────────────────
    if (cantidadRaw.toLowerCase() === 'all') {
        const prevCartera = u.monedas || 0;
        const prevBanco   = u.banco   || 0;
        u.monedas = 0;
        u.banco   = 0;
        guardarUsuario(targetJid, u);
        await sock.sendMessage(jid, {
            text: `${OK} Todo el saldo de \`${numero}\` fue borrado.\n◇ Cartera: *${prevCartera.toLocaleString()}* → 0\n◇ Banco: *${prevBanco.toLocaleString()}* → 0`
        });
        return;
    }

    const cantidad = parseInt(cantidadRaw, 10);
    if (!cantidad || cantidad <= 0) {
        await sock.sendMessage(jid, { text: `${ERR} Debes indicar una cantidad válida mayor a 0 o *all*.` });
        return;
    }

    // ── Modo BANCO: quitar del banco ─────────────────────────────────────────
    if (modoArg === 'banco' || modoArg === 'bank') {
        const bancoPrev = u.banco || 0;
        const quitar    = Math.min(cantidad, bancoPrev);
        u.banco = bancoPrev - quitar;
        guardarUsuario(targetJid, u);
        await sock.sendMessage(jid, {
            text: `${OK} Se quitaron *${quitar.toLocaleString()} ⓃNexCoins* del banco de \`${numero}\`.\n◇ Banco anterior: *${bancoPrev.toLocaleString()}*\n◇ Banco actual: *${u.banco.toLocaleString()}*`
        });
        return;
    }

    // ── Modo normal: quitar de cartera ────────────────────────────────────────
    const saldoActual = u.monedas || 0;
    if (saldoActual < cantidad) {
        await sock.sendMessage(jid, {
            text: `${WARN} \`${numero}\` solo tiene *${saldoActual.toLocaleString()} ⓃNexCoins* en cartera (banco: *${(u.banco || 0).toLocaleString()}*).\nUsa *#quitarcoins @usuario all* para borrar todo.`
        });
        return;
    }

    quitarMonedas(targetJid, cantidad);
    await sock.sendMessage(jid, {
        text: `${OK} Se quitaron *${cantidad.toLocaleString()} ⓃNexCoins* (cartera) a \`${numero}\`.\n◇ Cartera: *${saldoActual.toLocaleString()}* → *${(saldoActual - cantidad).toLocaleString()}*\n◇ Banco: *${(u.banco || 0).toLocaleString()}* (intacto)`
    });
}

async function cmdDarDinero(sock, jid, senderJid, args, mencionados) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el owner puede usar este comando.` });
        return;
    }

    const targetJid = resolverJidDesdeArgs(args, mencionados);
    const cantidadRaw = mencionados && mencionados.length > 0 ? args[0] : args[1];
    const cantidad = parseInt(cantidadRaw, 10);

    if (!targetJid) {
        await sock.sendMessage(jid, { text: `${ERR} Uso:\n• #dardinero @usuario 500\n• #dardinero 521234567890 500` });
        return;
    }
    if (!cantidad || cantidad <= 0) {
        await sock.sendMessage(jid, { text: `${ERR} Debes indicar una cantidad válida mayor a 0.` });
        return;
    }

    const u = getUsuario(targetJid);
    const numero = targetJid.split('@')[0];
    const saldoAnterior = u.monedas || 0;

    agregarMonedas(targetJid, cantidad);
    await sock.sendMessage(jid, {
        text: `${OK} Se dieron *${cantidad.toLocaleString()} ⓃNexCoins* a \`${numero}\`.\n◇ Saldo anterior: *${saldoAnterior.toLocaleString()}*\n◇ Saldo actual: *${(saldoAnterior + cantidad).toLocaleString()}*`
    });
}

async function cmdReload(sock, jid, senderJid) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el owner puede recargar el bot.` });
        return;
    }
    await sock.sendMessage(jid, { text: `${INFO} Recargando bot...` });
    setTimeout(() => process.exit(0), 1000);
}

async function cmdBackup(sock, jid, senderJid) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el owner puede usar este comando.` });
        return;
    }
    await sock.sendMessage(jid, { text: `${INFO} Creando backup manual...` });
    const { hacerBackup, listarBackups } = require('./backup');
    const resultado = await hacerBackup();
    if (resultado.ok) {
        const backups = listarBackups();
        await sock.sendMessage(jid, {
            text: `${OK} *Backup completado*\n◇ Fecha: ${resultado.ts}\n◇ Archivos: ${resultado.count}\n◇ Total backups guardados: ${backups.length}`
        });
    } else {
        await sock.sendMessage(jid, { text: `${ERR} Error en backup: ${resultado.err}` });
    }
}

async function cmdVerLogs(sock, jid, senderJid, args) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el owner puede ver los logs.` });
        return;
    }
    const { getRecentLogs } = require('./logger');
    const n = parseInt(args[0]) || 20;
    const logs = getRecentLogs(Math.min(n, 50));
    if (!logs.length) {
        await sock.sendMessage(jid, { text: `${INFO} No hay logs registrados aún.` });
        return;
    }
    const texto = `${H(`Últimos ${logs.length} logs`)}\n\n` + logs.slice(-n).join('\n');
    await sock.sendMessage(jid, { text: texto.slice(0, 3800) });
}

async function cmdEstadisticas(sock, jid, senderJid) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el owner puede ver las estadísticas.` });
        return;
    }
    const { getStats } = require('./database');
    const s = getStats();
    const top = s.topEconomia.map((u, i) => `  ${i + 1}. ${u.nombre} — ${u.total.toLocaleString()} ⓃNC`).join('\n');
    const panel = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/dashboard` : 'http://localhost:3000/dashboard';
    await sock.sendMessage(jid, {
        text:
`${H('Estadísticas Nexus')}

◇ Usuarios registrados : *${s.totalUsuarios}*
◇ Grupos activos       : *${s.totalGrupos}*
◇ ⓃNC en circulación  : *${s.totalMonedas.toLocaleString()}*

${SH('Top 5 Economía')}
${top}

◇ Panel web: ${panel}`
    });
}

async function cmdMediaInfo(sock, jid, senderJid, args) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el owner puede usar este comando.` });
        return;
    }

    const fsSync  = require('fs');
    const pathMod = require('path');
    const MEDIA_EXTS = new Set(['.gif', '.mp4', '.webm', '.jpg', '.jpeg', '.png', '.webp']);

    function contarCarpeta(dirBase) {
        if (!fsSync.existsSync(dirBase)) return [];
        return fsSync.readdirSync(dirBase)
            .filter(sub => fsSync.statSync(pathMod.join(dirBase, sub)).isDirectory())
            .map(sub => {
                const ruta = pathMod.join(dirBase, sub);
                const total = fsSync.readdirSync(ruta).filter(f => MEDIA_EXTS.has(pathMod.extname(f).toLowerCase()) && !f.startsWith('.')).length;
                return { nombre: sub, total };
            })
            .sort((a, b) => b.total - a.total);
    }

    const filtro  = (args[0] || '').toLowerCase();
    const raizInt = pathMod.join(__dirname, '..', 'interactions');

    const secciones = [];

    if (!filtro || filtro === 'sfw') {
        const sfwData = contarCarpeta(pathMod.join(raizInt, 'sfw'));
        const sfwTotal = sfwData.reduce((s, c) => s + c.total, 0);
        const sfwLineas = sfwData.map(c => {
            const barra = '█'.repeat(Math.min(c.total, 10)) + '░'.repeat(Math.max(0, 10 - Math.min(c.total, 10)));
            return `  ${c.nombre.padEnd(14)} ${barra} ${c.total}`;
        }).join('\n');
        secciones.push(`${OK} *SFW — ${sfwData.length} categorías / ${sfwTotal} archivos*\n${sfwLineas}`);
    }

    if (!filtro || filtro === 'nsfw') {
        const nsfwData = contarCarpeta(pathMod.join(raizInt, 'nsfw'));
        const nsfwTotal = nsfwData.reduce((s, c) => s + c.total, 0);
        const nsfwLineas = nsfwData.map(c => {
            const barra = '█'.repeat(Math.min(c.total, 10)) + '░'.repeat(Math.max(0, 10 - Math.min(c.total, 10)));
            return `  ${c.nombre.padEnd(14)} ${barra} ${c.total}`;
        }).join('\n');
        secciones.push(`${ERR} *NSFW — ${nsfwData.length} categorías / ${nsfwTotal} archivos*\n${nsfwLineas}`);
    }

    if (!secciones.length) {
        await sock.sendMessage(jid, { text: `${ERR} Filtro inválido. Usa *#mediainfo*, *#mediainfo sfw* o *#mediainfo nsfw*.` });
        return;
    }

    const texto =
`${H('Media de interacciones')}

${secciones.join('\n\n')}

_Usa *#mediainfo sfw* o *#mediainfo nsfw* para filtrar._`;

    await sock.sendMessage(jid, { text: texto });
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════
async function manejarMensaje(sock, msg, groupMetadata) {
    if (!msg.message) return;

    // Descartar protocol messages (edits, deletes), reactions y polls
    if (msg.message.protocolMessage)  return;
    if (msg.message.reactionMessage)  return;
    if (msg.message.pollUpdateMessage) return;

    const texto_previo = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        ''
    ).trim();

    if (msg.key.fromMe && !texto_previo.startsWith('#')) return;

    const jid = msg.key.remoteJid;
    const esGrupo = jid.endsWith('@g.us');
    // En chat privado con fromMe=true, el remoteJid es el DESTINATARIO, no el bot.
    // Usamos sock.user.id (JID del bot) para identificar correctamente al owner.
    // Cuando fromMe=true (el bot es el remitente), siempre usar sock.user.id
    // sin importar si es grupo o privado, ya que en grupos msg.key.participant
    // puede ser undefined y el fallback sería el JID del grupo (@g.us),
    // lo que causa que la línea de filtrado de abajo descarte el mensaje.
    const senderJidRaw = msg.key.fromMe
        ? (sock.user?.id || '').replace(/:\d+@/, '@')
        : esGrupo
            ? (msg.key.participant || msg.key.remoteJid).replace(/:\d+@/, '@')
            : msg.key.remoteJid;
    // Resolver @lid → @s.whatsapp.net usando el mapa de contactos de Baileys
    const senderJid = resolverJid(senderJidRaw);
    const pushName = msg.pushName || null;

    // Ignorar si senderJid es un JID de grupo (no es un usuario real)
    if (!senderJid || senderJid.endsWith('@g.us') || senderJid.endsWith('@broadcast')) return;

    const texto = texto_previo;

    // ── Guardar pushName del usuario ───────────────────────────────────────
    if (pushName) {
        try {
            const uPN = getUsuario(senderJid);
            if (uPN.pushName !== pushName) {
                uPN.pushName = pushName;
                guardarUsuario(senderJid, uPN);
            }
        } catch { }
    }

    const textoLower = texto.toLowerCase();

    // ── #myjid — cualquiera puede ver su propio JID ────────────────────────
    if (textoLower === '#myjid') {
        const rawJid = senderJidRaw || senderJid;
        const resolved = senderJid !== senderJidRaw ? `\n${OK} Resuelto: \`${senderJid}\`` : '';
        await sock.sendMessage(jid, {
            text: `${INFO} *Tu JID:*\n\`${rawJid}\`${resolved}`
        });
        return;
    }

    // ── #maplid — owner puede registrar manualmente un LID ────────────────
    // Uso: #maplid <phone>  →  registra senderJidRaw (@lid) → phone@s.whatsapp.net
    // Uso: #maplid <lid> <phone>  →  registra cualquier lid (solo superowner)
    if (textoLower.startsWith('#maplid')) {
        if (!isOwner(senderJid)) {
            await sock.sendMessage(jid, { text: `${ERR} Solo los owners pueden usar este comando.` });
            return;
        }
        const { registrarContacto } = require('./src/lidResolver');
        const partesMaplid = texto.trim().split(/\s+/).slice(1);
        const [arg1, arg2] = partesMaplid;
        if (!arg1) {
            await sock.sendMessage(jid, {
                text: [
                    `${H('Registro manual de LID')}`,
                    '',
                    'Usos:',
                    '`#maplid <teléfono>` — registra TU propio @lid al número dado',
                    '`#maplid <lid> <teléfono>` — registra cualquier LID (solo superowner)',
                    '',
                    `Tu JID raw: \`${senderJidRaw || senderJid}\``,
                    `Tu JID resuelto: \`${senderJid}\``,
                ].join('\n')
            });
            return;
        }
        if (arg2) {
            // Dos argumentos: maplid <lid> <phone> — solo superowner
            if (!isSuperOwner(senderJid)) {
                await sock.sendMessage(jid, { text: `${ERR} Solo el super-owner puede mapear LIDs de terceros.` });
                return;
            }
            const lid   = arg1.includes('@') ? arg1 : `${arg1}@lid`;
            const phone = arg2.includes('@') ? arg2 : `${arg2.replace(/\D/g, '')}@s.whatsapp.net`;
            registrarContacto({ id: phone, lid });
            await sock.sendMessage(jid, { text: `${OK} Mapeado: \`${lid}\` → \`${phone}\`` });
        } else {
            // Un argumento: registrar el propio @lid del sender
            const rawSender = senderJidRaw || senderJid;
            if (!rawSender.endsWith('@lid')) {
                await sock.sendMessage(jid, { text: `${INFO} Tu JID ya es \`${rawSender}\` (no es @lid, no necesita mapeo).` });
                return;
            }
            const phone = `${arg1.replace(/\D/g, '')}@s.whatsapp.net`;
            registrarContacto({ id: phone, lid: rawSender });
            await sock.sendMessage(jid, { text: `${OK} Registrado: \`${rawSender}\` → \`${phone}\`` });
        }
        return;
    }

    // ── #activatebot / #desactivatebot — solo SUPER_OWNER ─────────────────
    // Activa o desactiva el bot en un chat específico (grupo o privado).
    // Solo el número vinculado al bot puede usar estos comandos.
    // Por defecto todos los chats están DESACTIVADOS hasta que el owner active.
    if (textoLower === '#activatebot' || textoLower === '#enablebot') {
        if (isSuperOwner(senderJid)) {
            const chatData = getGrupo(jid);
            chatData.chatHabilitado = true;
            guardarGrupo(jid, chatData);
            await sock.sendMessage(jid, {
                text: `${OK} *Bot activado* en este chat.\n_Los usuarios ya pueden usar todos los comandos._`
            });
        }
        return;
    }

    if (textoLower === '#desactivatebot' || textoLower === '#disablebot') {
        if (isSuperOwner(senderJid)) {
            const chatData = getGrupo(jid);
            chatData.chatHabilitado = false;
            guardarGrupo(jid, chatData);
            await sock.sendMessage(jid, {
                text: `${INFO} *Bot desactivado* en este chat.\n_Los usuarios serán ignorados completamente._`
            });
        }
        return;
    }

    // ── #activateevents / #deactivateevents — solo SUPER_OWNER ────────────
    // Activa o desactiva el lanzamiento de eventos aleatorios globalmente.
    // Por defecto los eventos están APAGADOS para evitar spam y bandeos.
    if (textoLower === '#activateevents' || textoLower === '#enableevents') {
        if (!isSuperOwner(senderJid)) return;
        if (botState.eventosActivos) {
            await sock.sendMessage(jid, { text: `${WARN} Los eventos aleatorios ya están *activados*.` });
            return;
        }
        botState.eventosActivos = true;
        guardarEstado(); // Persistir para que sobreviva reinicios del bot
        await sock.sendMessage(jid, {
            text: `${OK} *Eventos aleatorios activados.*\n_El bot comenzará a lanzar eventos en grupos y chats habilitados._`
        });
        return;
    }

    if (textoLower === '#deactivateevents' || textoLower === '#disableevents') {
        if (!isSuperOwner(senderJid)) return;
        if (!botState.eventosActivos) {
            await sock.sendMessage(jid, { text: `${WARN} Los eventos aleatorios ya están *desactivados*.` });
            return;
        }
        botState.eventosActivos = false;
        guardarEstado(); // Persistir para que sobreviva reinicios del bot
        await sock.sendMessage(jid, {
            text: `${INFO} *Eventos aleatorios desactivados.*\n_No se lanzarán más eventos en ningún grupo ni chat._`
        });
        return;
    }

    // ── Chat habilitado check ───────────────────────────────────────────────
    // Si el chat no está activado, el SUPER_OWNER sigue pudiendo usar TODO,
    // pero cualquier otro usuario es ignorado completamente (sin respuesta).
    if (!isSuperOwner(senderJid)) {
        const chatCheck = getGrupo(jid);
        if (!chatCheck.chatHabilitado) return;
    }

    // ── Control encendido/apagado ──────────────────────────────────────────

    if (textoLower === '#off') {
        const puedeGlobal = isOwner(senderJid);
        const puedeGrupo  = esGrupo && groupMetadata && (isOwner(senderJid) || esAdmin(groupMetadata, senderJid));

        if (!puedeGlobal && !puedeGrupo) {
            await sock.sendMessage(jid, { text: `${ERR} No tienes permiso para usar este comando.`, quoted: msg });
            return;
        }
        if (esGrupo) {
            const gData = getGrupo(jid);
            gData.botActivo = false;
            guardarGrupo(jid, gData);
            await sock.sendMessage(jid, { text: `${INFO} Bot desactivado en este grupo.\n_Un admin puede usar *#on* para reactivarlo._`, quoted: msg });
        } else {
            botActivo = false;
            guardarEstado();
            await sock.sendMessage(jid, { text: `${INFO} Bot desactivado globalmente.`, quoted: msg });
        }
        return;
    }

    if (textoLower === '#on') {
        const puedeGlobal = isOwner(senderJid);
        const puedeGrupo  = esGrupo && groupMetadata && (isOwner(senderJid) || esAdmin(groupMetadata, senderJid));

        if (!puedeGlobal && !puedeGrupo) {
            await sock.sendMessage(jid, { text: `${ERR} No tienes permiso para usar este comando.`, quoted: msg });
            return;
        }
        if (esGrupo) {
            const gData = getGrupo(jid);
            gData.botActivo = true;
            guardarGrupo(jid, gData);
            await sock.sendMessage(jid, { text: `${OK} Bot activado en este grupo.`, quoted: msg });
        } else {
            botActivo = true;
            guardarEstado();
            await sock.sendMessage(jid, { text: `${OK} Bot activado globalmente.`, quoted: msg });
        }
        return;
    }

    // ── Modo mantenimiento ─────────────────────────────────────────────────
    if (textoLower === '#mantenimiento' || textoLower === '#maint' || textoLower === '#maintenance') {
        if (!isOwner(senderJid)) {
            await sock.sendMessage(jid, { text: `${ERR} Solo el owner puede usar este comando.` });
            return;
        }
        modoMantenimiento = !modoMantenimiento;
        guardarEstado();
        if (modoMantenimiento) {
            await sock.sendMessage(jid, {
                text: `${WARN} *Modo mantenimiento activado.*\n\nSolo los owners pueden usar el bot.\nMensaje actual:\n_"${mensajeMantenimiento}"_\n\nUsa *#setmaint <texto>* para personalizar el mensaje.\nUsa *#mantenimiento* de nuevo para desactivarlo.`
            });
        } else {
            await sock.sendMessage(jid, {
                text: `${OK} *Modo mantenimiento desactivado.*\n\nEl bot vuelve a estar disponible para todos.`
            });
        }
        return;
    }

    if (textoLower.startsWith('#setmaint ') || textoLower.startsWith('#setmaintenancemsg ')) {
        if (!isOwner(senderJid)) {
            await sock.sendMessage(jid, { text: `${ERR} Solo el owner puede usar este comando.` });
            return;
        }
        const nuevoMsg = texto.slice(texto.indexOf(' ') + 1).trim();
        if (!nuevoMsg) {
            await sock.sendMessage(jid, { text: `${ERR} Uso: *#setmaint <mensaje>*\nEjemplo: _#setmaint Volvemos en 30 minutos_` });
            return;
        }
        mensajeMantenimiento = nuevoMsg;
        guardarEstado();
        await sock.sendMessage(jid, {
            text: `${OK} *Mensaje de mantenimiento actualizado:*\n\n_"${mensajeMantenimiento}"_`
        });
        return;
    }

    if (textoLower === '#grupos' || textoLower === '#listgroups' || textoLower === '#misgrupos') {
        if (!isOwner(senderJid)) {
            await sock.sendMessage(jid, { text: `${ERR} Solo el owner puede usar este comando.` });
            return;
        }
        let gruposData;
        try {
            gruposData = await sock.groupFetchAllParticipating();
        } catch {
            await sock.sendMessage(jid, { text: `${ERR} No se pudo obtener la lista de grupos.` });
            return;
        }
        const lista = Object.values(gruposData);
        if (!lista.length) {
            await sock.sendMessage(jid, { text: `${INFO} El bot no está en ningún grupo todavía.` });
            return;
        }
        lista.sort((a, b) => (b.participants?.length || 0) - (a.participants?.length || 0));
        const SEP = '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
        let texto = `${H(`Grupos del bot (${lista.length})`)}\n\n`;
        lista.forEach((g, i) => {
            const nombre = g.subject || '(sin nombre)';
            const miembros = g.participants?.length || '?';
            texto += `*${i + 1}.* ${nombre}\n◇ ${miembros} miembros\n${SEP}\n`;
        });
        texto += `\n_Usa *#broadcast <mensaje>* para enviarles un aviso a todos._`;
        await sock.sendMessage(jid, { text: texto });
        return;
    }

    if (textoLower === '#broadcast' || textoLower === '#bc' || textoLower.startsWith('#broadcast ') || textoLower.startsWith('#bc ')) {
        if (!isOwner(senderJid)) {
            await sock.sendMessage(jid, { text: `${ERR} Solo el owner puede usar este comando.` });
            return;
        }
        const mensajeBC = texto.slice(texto.indexOf(' ') + 1).trim();
        if (!mensajeBC) {
            await sock.sendMessage(jid, { text: `${ERR} Uso: *#broadcast <mensaje>*\nEjemplo: _#broadcast Estaremos en mantenimiento a las 8pm_` });
            return;
        }
        const grupos = cargarGrupos();
        const jids = Object.keys(grupos).filter(g => g.endsWith('@g.us'));
        if (!jids.length) {
            await sock.sendMessage(jid, { text: `${INFO} El bot no está en ningún grupo todavía.` });
            return;
        }
        await sock.sendMessage(jid, { text: `${INFO} Enviando broadcast a *${jids.length}* grupo(s)...\n_Puede tardar unos minutos para no parecer spam._` });
        let enviados = 0;
        let fallidos = 0;
        for (const gjid of jids) {
            try {
                await sock.sendMessage(gjid, {
                    text: `${INFO} *AVISO*\n\n${mensajeBC}`
                });
                enviados++;
                // Delay largo y aleatorio entre mensajes — evita que Meta detecte
                // un patrón de envío masivo automático (típico de cuentas spam)
                const espera = 8000 + Math.floor(Math.random() * 7000); // 8-15 s
                await new Promise(r => setTimeout(r, espera));
            } catch {
                fallidos++;
            }
        }
        await sock.sendMessage(jid, {
            text: `${OK} *Broadcast completado.*\n\n◇ Enviados: *${enviados}*\n◇ Fallidos: *${fallidos}*`
        });
        return;
    }

    // Global off check
    if (!botActivo) {
        if (texto.startsWith('#')) {
            await sock.sendMessage(jid, { text: `${WARN} El bot está apagado. Solo el owner puede activarlo con *#on*.`, quoted: msg });
        }
        return;
    }

    // Mantenimiento check — bloquea todo excepto owners
    if (modoMantenimiento && !isOwner(senderJid)) {
        if (texto.startsWith('#')) {
            await sock.sendMessage(jid, { text: mensajeMantenimiento, quoted: msg });
        }
        return;
    }

    // Per-group off check (solo grupos, solo comandos #)
    if (esGrupo && texto.startsWith('#')) {
        const gTemp = getGrupo(jid);
        if (gTemp.botActivo === false && !isOwner(senderJid)) {
            await sock.sendMessage(jid, { text: `${WARN} El bot está desactivado en este grupo. Un admin puede usar *#on* para reactivarlo.`, quoted: msg });
            return;
        }
    }

    // ── EXP, level-up y antilink ───────────────────────────────────────────
    if (esGrupo && texto) {
        try {
            const _gMute = getGrupo(jid);
            const _esMutedXP = esMuteadoBot(_gMute, senderJid) && !isOwner(senderJid);
            const _evXP = obtenerEventoActivo(jid)?.tipo;
            const _xpBase = _evXP === 'olimpiadas_nexus' ? 15 : (_evXP === 'xp_doble' || _evXP === 'suerte_total' || _evXP === 'fiesta_nexus') ? 10 : 5;
            const expRes = _esMutedXP ? null : agregarExp(senderJid, _xpBase);
            if (expRes && expRes.leveledUp && _gMute.anunciosNivel !== false) {
                const nombre = pushName || senderJid.split('@')[0];
                const rangoAnterior = obtenerRango(expRes.nivelAnterior);
                const rangoNuevo    = obtenerRango(expRes.nivelNuevo);
                const cambioRango   = rangoAnterior.nombre !== rangoNuevo.nombre;

                // Recompensa en monedas: nivel nuevo × 100
                const recompensa = expRes.nivelNuevo * 100;
                agregarMonedas(senderJid, recompensa);

                let textoNivel =
`${H('Subiste de Nivel')}

✦ ¡Felicidades, \`${senderJid.split('@')[0]}\`!

◇ *${nombre}*
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
◇ Nv. *${expRes.nivelAnterior}*  ➜  Nv. *${expRes.nivelNuevo}*
◇ XP: *${expRes.expActual} / ${expRes.nivelNuevo * 100}*
◇ Premio: *+${recompensa} ⓃNexCoins*`;

                if (cambioRango) {
                    textoNivel += `\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n✦ *¡NUEVO RANGO DESBLOQUEADO!*\n◇ *${rangoAnterior.nombre}* ➜ *${rangoNuevo.nombre}*`;
                }

                textoNivel += `\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n_¡Sigue chateando y sigue subiendo!_\n> *Nexus•System* — by Alejx_h`;

                await sock.sendMessage(jid, {
                    text: textoNivel
                });
            }
        } catch {}
    }
    if (esGrupo && texto && !texto.startsWith('#')) {
        await verificarAntilink(sock, jid, msg, groupMetadata, senderJid);
    }

    // ── Verificar deuda vencida ────────────────────────────────────────────
    try {
        const deudaMsg = verificarDeudaVencida(senderJid);
        if (deudaMsg) await sock.sendMessage(jid, { text: deudaMsg, quoted: msg });
    } catch { }

    // ── Verificar AFK del sender ────────────────────────────────────────────
    if (texto && !texto.startsWith('#')) {
        try { await verificarAfk(sock, jid, senderJid, pushName, texto); } catch { }
        const mencionadosEnMsg = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mencionadosEnMsg.length) {
            try { await notificarAfk(sock, jid, mencionadosEnMsg); } catch { }
        }
        if (esGrupo) {
            try { registrarMensajeGrupal(jid, texto); } catch { }
        }
        try {
            // Crear proxy con quoted aquí ya que sockR se define más adelante en el flujo.
            // Esto garantiza que las respuestas de minijuegos (trivia, ahorcado, etc.)
            // respondan al mensaje del usuario igual que todos los demás comandos.
            const sockQ = new Proxy(sock, {
                get(target, prop) {
                    if (prop === 'sendMessage') {
                        return (tjid, content, opts = {}) => {
                            if (tjid === jid && !opts.quoted) {
                                return target.sendMessage(tjid, content, { quoted: msg, ...opts });
                            }
                            return target.sendMessage(tjid, content, opts);
                        };
                    }
                    return target[prop];
                }
            });
            const handled = await procesarRespuesta(sockQ, jid, senderJid, texto, pushName);
            if (handled) return;
        } catch { }
    }

    if (!texto.startsWith('#') && texto !== '🔄') return;

    // Solo el comando (primera palabra) va en minúsculas; los args conservan
    // su capitalización original para no romper URLs con mayúsculas (ej. vt.tiktok.com/ZS9q2AhNB)
    const _partes = texto.startsWith('#') ? texto.slice(1).split(' ') : [texto];
    let cmd       = _partes[0].toLowerCase();
    const args    = _partes.slice(1);

    // ── Detección de página: #baltop2 → cmd='baltop', pagina=2 ───────────
    const PAGINABLE_CMDS = new Set([
        'harem', 'waifus', 'claims',
        'slist', 'animelist', 'serielist',
        'baltop', 'economyboard', 'eboard',
        'richtop', 'toprico', 'richtopg', 'richtopgrupo',
        'leveltop', 'topnivel', 'leveltopg', 'leveltopgrupo',
        'leaderboard', 'lboard',
        'rankglobal', 'topglobal',
        'achievementlist', 'listlogros',
        'warnslist', 'listwarn',
        'tempbans', 'listbans',
        'modlog', 'modlogs',
        'mutedlist', 'silenciados',
        'mercado', 'market',
        'logs', 'verlogs',
        'catalogo', 'eventoslist',
        'shop', 'itemshop', 'store', 'tiendaitems', 'tienda',
        'inv', 'inventory', 'mochila', 'items', 'inventario',
        'afklist', 'listaafk',
        'reptop', 'toprep',
        'allbirthdays',
        'guildtop', 'topclanes',
        'topmensajes', 'topmessages',
        'topinactive', 'topinactivos', 'topinactiveusers',
        'topweekly', 'weeklytop', 'topweek', 'topsemanal', 'semanalboard',
    ]);
    let pagina = 1;
    const _pmH = cmd.match(/^(.+?)(\d+)$/);
    if (_pmH && PAGINABLE_CMDS.has(_pmH[1])) {
        cmd    = _pmH[1];
        pagina = Math.max(1, parseInt(_pmH[2]));
    }

    // ── Menciones: explícitas (@) + fallback al participante citado ────────
    // Normaliza el sufijo de dispositivo ":N@" para evitar JIDs duplicados
    // (ej: "123@s.whatsapp.net:1" → "123@s.whatsapp.net").
    const ctxInfoMsg = msg.message.extendedTextMessage?.contextInfo || {};
    let mencionados = (ctxInfoMsg.mentionedJid || [])
        .map(j => resolverJid(j.replace(/:\d+@/, '@')))
        .filter(j => j && !j.endsWith('@g.us') && !j.endsWith('@broadcast'));
    if (!mencionados.length && ctxInfoMsg.participant) {
        const rawP    = ctxInfoMsg.participant.replace(/:\d+@/, '@');
        const resolvedP = resolverJid(rawP);
        if (resolvedP && !resolvedP.endsWith('@g.us') && !resolvedP.endsWith('@broadcast')) {
            mencionados = [resolvedP];
        }
    }
    const g = esGrupo ? getGrupo(jid) : null;

    // Owners NO se ven afectados por #onlyadmin (sí siguen afectados por bot off,
    // que se comprueba antes en este handler).
    if (g && g.soloAdmin && !esAdmin(groupMetadata, senderJid) && !isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo los administradores y owners pueden usar este grupo en modo restringido.`, quoted: msg });
        return;
    }

    // Mutebot check — ignora comandos de usuarios silenciados (owners siempre pasan)
    if (esGrupo && g && esMuteadoBot(g, senderJid) && !isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Estás silenciado en este grupo.`, quoted: msg });
        return;
    }

    getUsuario(senderJid);

    // ── Antispam por usuario ────────────────────────────────────────────────
    if (!isOwner(senderJid)) {
        const bloqueado = checkAntispam(senderJid);
        if (bloqueado > 0) {
            await sock.sendMessage(jid, {
                text: `${ERR} Estás enviando comandos muy rápido. Espera *${bloqueado}s* antes de continuar.`,
                quoted: msg
            });
            return;
        }
    }

    // ── Tracking del comando ────────────────────────────────────────────────
    trackCmd(cmd);

    const comandosConCooldownGlobal = new Set([
        'yt', 'mp4', 'ytmp4', 'play', 'ytaudio', 'mp3', 'ytsearch', 'search', 'buscarvideo',
        'ytv', 'ytvideo', 'ytdescargar', 'tiktok', 'tt', 'ttplay', 'tiktokmp3', 'ttaudio',
        'facebook', 'fb', 'fvideo', 'twitter', 'x', 'instagram', 'ig', 'reel', 'pin', 'pinterest',
        'img', 'downloaddiag', 'diagdescargas',
        ...TODO_IMAGEBOARDS, ...TODO_IMAGEBOARDS_VIDEO, ...TODO_NSFW_IMG, ...TODO_NSFW_ACCION,
        ...TODO_NSFW_DOWNLOADS
    ]);
    if (comandosConCooldownGlobal.has(cmd)) {
        const restante = checkCooldownGlobal(senderJid, cmd);
        if (restante > 0) {
            await sock.sendMessage(jid, { text: `${WARN} Espera *${restante}s* antes de volver a usar este comando para evitar bloqueos.`, quoted: msg });
            return;
        }
    }

    const restanteRate = aplicarRateLimit(senderJid, cmd);
    if (restanteRate > 0) {
        await sock.sendMessage(jid, { text: `${WARN} Te estás pasando con *#${cmd}*.\nEspera *${restanteRate}s* y vuelve a intentar para evitar bloqueos.`, quoted: msg });
        return;
    }

    // ── Anti-ban: peso del comando + riesgo dinámico + limitador de media ───
    const cmdWeight = getCommandWeight(cmd);
    if (cmdWeight === 'HEAVY') {
        // Si se superó el límite de media por minuto, rechazar
        if (!isOwner(senderJid) && isMediaLimited()) {
            await sock.sendMessage(jid, {
                text: `${WARN} El bot está procesando demasiadas solicitudes pesadas ahora mismo.\n_Máximo ${MEDIA_LIMIT_PER_MIN} descargas por minuto. Intenta en un momento._`,
                quoted: msg
            });
            return;
        }
        // Si el riesgo acumulado es alto, esperar antes de responder
        await applyRiskDelay();
    }
    // Acumular riesgo según el peso del comando ejecutado
    increaseRisk(cmdWeight);

    // ── Delay humano + simulación "escribiendo..." (anti-ban) ────────────────
    // Imita el comportamiento real de un humano: escribe durante 1–3 s antes
    // de responder. Los comandos HEAVY usan el rango alto del delay para parecer
    // más naturales cuando el bot "procesa" algo pesado.
    try {
        const minDelay = cmdWeight === 'HEAVY' ? 1500 : 1000;
        const maxExtra = cmdWeight === 'HEAVY' ? 2500 : 2000;
        const humanDelay = minDelay + Math.floor(Math.random() * maxExtra);
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(r => setTimeout(r, humanDelay));
        await sock.sendPresenceUpdate('paused', jid);
    } catch { /* ignorar si el chat no soporta presencia */ }

    // ── Proxy que agrega quoted: msg a todas las respuestas al grupo ─────────
    const sockR = new Proxy(sock, {
        get(target, prop) {
            if (prop === 'sendMessage') {
                return (tjid, content, opts = {}) => {
                    // No agregar quoted en mensajes de delete (interfiere con la operación)
                    if (tjid === jid && !opts.quoted && !content.delete) {
                        return target.sendMessage(tjid, content, { quoted: msg, ...opts });
                    }
                    return target.sendMessage(tjid, content, opts);
                };
            }
            return target[prop];
        }
    });

    try {
        if (texto === '🔄' || cmd === 'again') {
            const repliedMsgId = msg.message.extendedTextMessage?.contextInfo?.stanzaId;
            // Primero buscar en ssMap por ID del mensaje citado
            if (repliedMsgId && ssMap.has(repliedMsgId)) {
                await cmdStickerSearch(sockR, jid, [], repliedMsgId);
                return;
            }
            // Fallback: si no hay reply exacto pero hay búsqueda previa en el grupo
            if (cmd === 'again' && lastSearch.has(jid)) {
                await cmdStickerSearch(sockR, jid, [], repliedMsgId || '_fallback_');
                return;
            }
            // Intentar como pin
            if (msg.message.extendedTextMessage?.contextInfo?.quotedMessage) {
                await manejarPin(sockR, msg, true);
                return;
            }
            await sockR.sendMessage(jid, { text: `${ERR} Responde a un sticker del bot o usa *#ss [búsqueda]* primero.` });
            return;
        }

        // Verificar toggles de economía y gacha usando el módulo centralizado.
        // verificarModulo devuelve null si está permitido, o un string con el
        // mensaje de bloqueo. Centralizado en permisos.js para que ningún comando
        // se salte la validación aunque alguien agregue uno nuevo en el futuro.
        {
            const { verificarModulo } = require('./permisos');
            const bloqueo = verificarModulo(cmd, esGrupo ? g : null, senderJid);
            if (bloqueo) {
                await sockR.sendMessage(jid, { text: bloqueo });
                return;
            }
        }

        switch (cmd) {

            // ── MENÚ Y UTILIDADES ──────────────────────────────────────────
            case 'menu': case 'ayuda': case 'help': case 'commands': case 'comandos':
                await enviarMenu(sock, jid, pushName, groupMetadata, senderJid); break;
            case 'searchcmd': case 'buscarcmd': case 'findcmd': case 'searchcommand': case 'busc':
                await cmdSearchCmd(sockR, jid, args); break;
            case 'ping': case 'p':
                await cmdPing(sockR, jid); break;
            case 'status': case 'botinfo': case 'infobot':
                await cmdStatus(sockR, jid); break;

            // ── HERRAMIENTAS (de Yotsuba) ──────────────────────────────────
            case 'translate': case 'trad': case 'traducir': case 'tr':
                await cmdTranslate(sockR, jid, args); break;
            case 'wiki': case 'wikipedia':
                await cmdWikipedia(sockR, jid, args); break;
            case 'ssweb': case 'ss': case 'screenshot': case 'screenshotweb':
                await cmdSsweb(sockR, jid, args); break;
            case 'ip': case 'iplookup': case 'ipinfo': case 'geoip':
                await cmdIpLookup(sockR, jid, args); break;
            case 'calculadora': case 'calc': case 'calz': case 'cal':
                await cmdCalc(sockR, jid, args); break;
            case 'del': case 'delete': {
                const esAdminSender = esAdmin(groupMetadata, senderJid);
                if (!isOwner(senderJid) && !esAdminSender) {
                    await sockR.sendMessage(jid, { text: `${ERR} Este comando es exclusivo para administradores y owners.\nSi no tienes permisos, no puedes borrar mensajes.` });
                    break;
                }
                await cmdEliminar(sockR, jid, msg, groupMetadata);
                break;
            }
            case 'pfp': case 'getpic':
                await cmdFotoPerfil(sockR, jid, senderJid, mencionados); break;
            case 'tagall': case 'tag': case 'hidetag': case 'tagsay':
                // Usar sock raw (sin proxy quoted) para evitar que los mensajes de
                // broadcast con quoted:msg sean re-procesados como comandos por el bot
                await cmdTagAll(sock, jid, groupMetadata, args, senderJid, g, isOwner(senderJid)); break;
            case 'settag': case 'tagmode': case 'settagmode':
                await cmdSetTagMode(sockR, jid, groupMetadata, senderJid, args, isOwner(senderJid)); break;
            case 'toimage': case 'toimg':
                await cmdStickerAImagen(sockR, jid, msg); break;
            case 'tovideo': case 'tov': case 'tomp4':
                await cmdStickerAVideo(sockR, jid, msg); break;
            case 'suggest': case 'sug': case 'add': case 'addanime':
                await cmdSuggest(sockR, jid, senderJid, args); break;
            case 'report': case 'reportar': case 'bug':
                await cmdReport(sockR, jid, senderJid, args); break;
            case 'gif': case 'togif': case 'mp4togif': case 'videogif': case 'gifconvert':
                await cmdVideoAGif(sockR, jid, msg); break;
            case 'hd': case 'enhance': case 'remini':
                await cmdHd(sockR, jid, msg); break;
            case 'read': case 'readviewonce': case 'rvo':
                await cmdRead(sockR, jid, msg); break;
            case 'bots': case 'sockets':
                await cmdBots(sockR, jid, groupMetadata); break;
            case 'invite':
                await cmdInvite(sockR, jid, groupMetadata); break;
            case 'testwelcome':
                await cmdTestWelcome(sockR, jid, groupMetadata, senderJid, 'welcome'); break;
            case 'testgoodbye':
                await cmdTestWelcome(sockR, jid, groupMetadata, senderJid, 'goodbye'); break;
            case 'leave': case 'salir':
                await cmdLeave(sockR, jid, groupMetadata, senderJid); break;

            // ── OWNER ─────────────────────────────────────────────────────
            case 'quitardinero': case 'removecoins': case 'quitarcoins':
                await cmdQuitarDinero(sockR, jid, senderJid, args, mencionados); break;
            case 'dardinero': case 'addcoins': case 'darcoins':
                await cmdDarDinero(sockR, jid, senderJid, args, mencionados); break;
            case 'addowner':
                await cmdAddOwner(sockR, jid, senderJid, mencionados); break;
            case 'delowner':
                await cmdDelOwner(sockR, jid, senderJid, mencionados); break;
            case 'owners': case 'ownerlist':
                await cmdOwners(sockR, jid); break;
            case 'autojoin':
                await cmdAutoJoin(sockR, jid, senderJid, args); break;
            case 'reload':
                await cmdReload(sockR, jid, senderJid); break;
            case 'backup':
                await cmdBackup(sockR, jid, senderJid); break;
            case 'logs': case 'verlogs': case 'errorlogs':
                await cmdVerLogs(sockR, jid, senderJid, args); break;
            case 'stats': case 'estadisticas': case 'botstats':
                await cmdEstadisticas(sockR, jid, senderJid); break;
            case 'mediainfo': case 'medialist': case 'listmedia': case 'mediacount':
                await cmdMediaInfo(sockR, jid, senderJid, args); break;
            case 'setbotcurrency':
                await cmdSetBotCurrency(sockR, jid, senderJid, args); break;
            case 'setbotowner':
                await cmdSetBotOwner(sockR, jid, senderJid, mencionados); break;
            case 'sfwprecalentar': case 'sfwwarmup': case 'precalentarsfw': {
                if (!isOwner(senderJid)) {
                    await sockR.sendMessage(jid, { text: `${ERR} Solo los dueños del bot pueden usar este comando.` });
                    break;
                }
                // Ejecutar en background para no bloquear otros mensajes
                precalentarCacheSfw(sockR, jid).catch(e =>
                    sockR.sendMessage(jid, { text: `${ERR} Error al precalentar: ${e.message}` })
                );
                break;
            }

            // ── SOCKETS ───────────────────────────────────────────────────
            case 'kickbot':
                await cmdKickBot(sockR, jid, senderJid, args, groupMetadata); break;
            case 'join':
                await cmdJoin(sockR, jid, senderJid, args); break;
            case 'logout':
                await cmdLogout(sockR, jid, senderJid); break;
            case 'setprefix':
                await cmdSetPrefix(sockR, jid, senderJid, args); break;
            case 'setchannel':
                await cmdSetChannel(sockR, jid, senderJid, args); break;
            case 'setlink':
                await cmdSetLink(sockR, jid, senderJid, args); break;
            case 'setpfp': case 'setbotpic':
                await cmdSetPfp(sockR, jid, senderJid, msg); break;
            case 'setusername': case 'setbotname':
                await cmdSetUsername(sockR, jid, senderJid, args); break;

            // ── ECONOMÍA ──────────────────────────────────────────────────
            case 'saldo': case 'balance': case 'bal': case 'coins':
                await cmdSaldo(sockR, jid, senderJid); break;
            case 'economyinfo': case 'einfo':
                await cmdEconomyInfo(sockR, jid, senderJid, mencionados, ctxInfoMsg.participant || null); break;
            case 'diario': case 'daily':
            case 'semanal': case 'weeklybonus': case 'semanalrecompensa':
            case 'mensual': case 'monthlybonus': case 'mensualrecompensa':
            case 'work': case 'w': case 'trabajar':
            case 'crime': case 'crimen':
            case 'slut': {
                if (tieneDeudaVencida(senderJid)) {
                    await sockR.sendMessage(jid, {
                        text: `${ERR} *Bloqueado por deuda bancaria vencida.*\n\nTienes un préstamo sin pagar que ya expiró. Paga tu deuda primero con *#payloan*.\n_El banco cobrará automáticamente en tu próximo ingreso._`
                    });
                    break;
                }
                if (cmd === 'diario' || cmd === 'daily') {
                    await cmdDiario(sockR, jid, senderJid);
                } else if (cmd === 'semanal' || cmd === 'weeklybonus' || cmd === 'semanalrecompensa') {
                    await cmdSemanal(sockR, jid, senderJid);
                } else if (cmd === 'mensual' || cmd === 'monthlybonus' || cmd === 'mensualrecompensa') {
                    await cmdMensual(sockR, jid, senderJid);
                } else if (cmd === 'work' || cmd === 'w' || cmd === 'trabajar') {
                    await cmdWork(sockR, jid, senderJid);
                } else if (cmd === 'crime' || cmd === 'crimen') {
                    await cmdCrime(sockR, jid, senderJid, args);
                } else if (cmd === 'slut') {
                    await cmdSlut(sockR, jid, senderJid);
                }
                break;
            }
            case 'coinflip': case 'flip': case 'cf':
                await cmdCoinflip(sockR, jid, senderJid, args); break;
            case 'depositar': case 'deposit': case 'dep': case 'd':
                await cmdDeposit(sockR, jid, senderJid, args); break;
            case 'retirar': case 'withdraw': case 'with':
                await cmdWithdraw(sockR, jid, senderJid, args); break;
            case 'ruleta': case 'roulette': case 'rt':
                await cmdRoulette(sockR, jid, senderJid, args); break;
            case 'robar': case 'steal': case 'rob':
                await cmdSteal(sockR, jid, senderJid, mencionados); break;
            case 'transferir': case 'givecoins': case 'pay': case 'coinsgive':
                await cmdTransferir(sockR, jid, senderJid, mencionados, args); break;
            case 'baltop': case 'economyboard': case 'eboard':
                await cmdBaltop(sockR, jid, groupMetadata, pagina); break;
            case 'richtop': case 'toprico': case 'ricostop': case 'globalrich': case 'wealthtop':
                await cmdRichTopGlobal(sockR, jid, pagina); break;
            case 'richtopg': case 'richtopgrupo': case 'topricogrupo': case 'grouptop': case 'topricogroup':
                await cmdRichTopGroup(sockR, jid, groupMetadata, pagina); break;
            case 'leveltop': case 'topnivel': case 'nivelestop': case 'globallevel': case 'levelmundo':
                await cmdLevelTopGlobal(sockR, jid, pagina); break;
            case 'leveltopg': case 'leveltopgrupo': case 'topnivelgrupo': case 'grouplevel': case 'nivelesgroup':
                await cmdLevelTopGroup(sockR, jid, groupMetadata, pagina); break;
            case 'tienda': case 'shop2': case 'tienda2':
                await cmdShop(sockR, jid, pagina); break;
            case 'comprar':
                await cmdComprar(sockR, jid, senderJid, args); break;
            case 'inventario':
                await cmdInv2(sockR, jid, senderJid, pagina); break;
            case 'minar': case 'mine':
                await cmdMinar(sockR, jid, senderJid); break;
            case 'adventure': case 'aventura':
                await cmdAdventure(sockR, jid, senderJid); break;
            case 'cazar': case 'hunt':
                await cmdCazar(sockR, jid, senderJid); break;
            case 'fish': case 'pescar':
                await cmdFish(sockR, jid, senderJid); break;
            case 'mazmorra': case 'dungeon':
                await cmdMazmorra(sockR, jid, senderJid); break;

            // ── MENÚ NSFW ─────────────────────────────────────────────────
            case 'menunsfw': case 'nsfwmenu': case 'menu18':
                await enviarMenuNsfw(sockR, jid, g); break;
            case 'setnsfwmedia': case 'nsfwmedia':
                await cmdSetNsfwMenuMedia(sockR, jid, groupMetadata, senderJid, msg); break;
            case 'delnsfwmedia': case 'removensfwmedia':
                await cmdDelNsfwMenuMedia(sockR, jid, groupMetadata, senderJid); break;
            case 'upload': case 'uploadnsfw': case 'subirnsfw':
                await cmdUploadNsfwMedia(sockR, jid, senderJid, args, msg); break;
            case 'uploadsfw': case 'subirsfw':
                await cmdUploadSfwMedia(sockR, jid, senderJid, args, msg); break;

            // ── INVENTARIO (nuevo sistema de ítems) ───────────────────────
            case 'inv': case 'inventory': case 'mochila': case 'items':
                await cmdInv2(sockR, jid, senderJid, pagina); break;
            case 'shop': case 'itemshop': case 'store': case 'tiendaitems':
                await cmdShop(sockR, jid, pagina); break;
            case 'buyitem': case 'compraritem': case 'buyi':
                await cmdBuyItem(sockR, jid, senderJid, args); break;
            case 'useitem': case 'usaritem': case 'usar': case 'usei':
                await cmdUseItem(sockR, jid, senderJid, args); break;

            // ── BANCO AVANZADO ────────────────────────────────────────────
            case 'invest': case 'invertir': case 'invert':
                await cmdInvertir(sockR, jid, senderJid, args); break;
            case 'interest': case 'interes': case 'cobrar':
                await cmdInteres(sockR, jid, senderJid); break;
            case 'loan': case 'prestamo': case 'pedir':
                await cmdPrestamo(sockR, jid, senderJid, args); break;
            case 'payloan': case 'pagarprestamo': case 'pagar':
                await cmdPagarPrestamo(sockR, jid, senderJid); break;
            case 'bankinfo': case 'bancovanzado': case 'banco': case 'bank':
                await cmdBancoInfo(sockR, jid, senderJid); break;

            // ── COMBATE PVP ───────────────────────────────────────────────
            case 'fight': case 'pelear': case 'pvp': case 'battle':
                await cmdFight(sockR, jid, senderJid, mencionados, pushName); break;
            case 'stats': case 'stat': case 'combate': case 'statscombate':
                await cmdStats(sockR, jid, senderJid, mencionados); break;
            case 'train': case 'entrenar': case 'entrenamiento':
                await cmdTrain(sockR, jid, senderJid); break;

            // ── MINIJUEGOS ────────────────────────────────────────────────
            case 'trivia': case 'quiz':
                await cmdTrivia(sockR, jid, senderJid); break;
            case 'math': case 'matematicas': case 'calculo':
                await cmdMath(sockR, jid, senderJid, args); break;
            case 'ppt': case 'rps': case 'piedrapapeltijera':
                await cmdPpt(sockR, jid, senderJid, args); break;
            case 'guess': case 'adivinar': case 'guessnumber':
                await cmdGuess(sockR, jid, senderJid); break;
            case 'wordchain': case 'palabras': case 'encadenada':
                await cmdWordchain(sockR, jid, senderJid); break;
            case 'ahorcado': case 'hangman': case 'horca':
                await cmdAhorcado(sockR, jid, senderJid); break;
            case 'scramble': case 'descifra': case 'revueltas':
                await cmdScramble(sockR, jid, senderJid); break;
            case 'quien': case 'quiensoy': case 'personaje': case 'adivina_personaje':
                await cmdQuien(sockR, jid, senderJid); break;
            case 'tsquiz': case 'taylorswift': case 'ts': case 'swiftie':
                await cmdTsQuiz(sockR, jid, senderJid); break;
            case 'completa': case 'lyrics': case 'completaletra': case 'letra':
                await cmdCompleta(sockR, jid, senderJid); break;
            case 'vof': case 'verdaderofalso': case 'trueorfalse': case 'tf': case 'vo':
                await cmdVof(sockR, jid, senderJid); break;
            case 'emojiadivina': case 'emojiquiz': case 'emojiAdivina': case 'emoji':
                await cmdEmojiAdivina(sockR, jid, senderJid); break;
            case '8ball': case 'bola8': case 'oraculo': case 'oracle':
                await cmdBola8(sockR, jid, senderJid, args.join(' ')); break;
            case 'stopgame': case 'parar': case 'endgame': case 'terminar':
                await cmdStopGame(sockR, jid, senderJid); break;

            // ── MISIONES ─────────────────────────────────────────────────
            case 'missions': case 'misiones': case 'quest': case 'quests':
                await cmdMisiones(sockR, jid, senderJid); break;
            case 'claimmission': case 'reclamar_mision': case 'claimmissions': case 'completar':
                await cmdClaimMision(sockR, jid, senderJid); break;
            case 'weeklymissions': case 'misionessemanales': case 'weekly': case 'semana': case 'misionesweekly':
                await cmdMisionesSemanales(sockR, jid, senderJid); break;
            case 'claimweekly': case 'reclamarsemanales': case 'completarweekly': case 'weeklyreclamar':
                await cmdClaimMisionSemanal(sockR, jid, senderJid); break;

            // ── MERCADO DE USUARIOS ──────────────────────────────────────
            case 'mercado': case 'market': case 'tiendausers': case 'marketplace':
                await cmdMercado(sockR, jid, pagina); break;
            case 'listar': case 'sellitem': case 'venderitem': case 'oferta': case 'poneraventa':
                await cmdListar(sockR, jid, senderJid, args); break;
            case 'comprarof': case 'buyoffer': case 'comprarmercado': case 'comprarlocal':
                await cmdComprarOferta(sockR, jid, senderJid, args); break;
            case 'cancelaroferta': case 'cancelsell': case 'quitaroferta': case 'borraroferta':
                await cmdCancelarOferta(sockR, jid, senderJid, args); break;

            // ── LOGROS ────────────────────────────────────────────────────
            case 'achievements': case 'logros': case 'achievement': case 'logro':
                await cmdLogros(sockR, jid, senderJid);
                await verificarYNotificar(sockR, jid, senderJid, getUsuario(senderJid)); break;
            case 'achievementlist': case 'listlogros': case 'logroslist': case 'todos_logros':
                await cmdListaLogros(sockR, jid, pagina); break;

            // ── REPUTACIÓN ────────────────────────────────────────────────
            case 'rep': case 'reputar': case 'dar_rep': case '+rep':
                await cmdDarRep(sockR, jid, senderJid, mencionados, pushName);
                await verificarYNotificar(sockR, jid, senderJid, getUsuario(senderJid)); break;
            case 'reputation': case 'reputacion': case 'misrep': case 'verep':
                await cmdVerRep(sockR, jid, senderJid, mencionados); break;
            case 'reptop': case 'toprep': case 'repleaderboard':
                await cmdTopRep(sockR, jid, pagina); break;

            // ── SOCIAL ────────────────────────────────────────────────────
            case 'poll': case 'encuesta': case 'votacion':
                await cmdPoll(sockR, jid, senderJid, args); break;
            case 'pollvote': case 'vote_encuesta': case 'voteenc':
                await cmdPollVote(sockR, jid, senderJid, args); break;
            case 'pollresults': case 'resultados': case 'encuesta_resultado':
                await cmdPollResults(sockR, jid); break;
            case 'truth': case 'verdad': case 'truth_dare':
                await cmdTruth(sockR, jid, senderJid, mencionados, pushName); break;
            case 'dare': case 'reto': case 'atrevete':
                await cmdDare(sockR, jid, senderJid, mencionados, pushName); break;
            case 'tod': case 'truthordare': case 'verdadoreto': case 'tof':
                await cmdTruthOrDare(sockR, jid, senderJid, mencionados, pushName); break;

            // ── CASINO ────────────────────────────────────────────────────
            case 'blackjack': case 'bj': case '21':
                await cmdBlackjack(sockR, jid, senderJid, args); break;
            case 'hit': case 'pedir_carta': case 'carta':
                await cmdHit(sockR, jid, senderJid); break;
            case 'stand': case 'plantarme': case 'plantar': case 'me_planto':
                await cmdStand(sockR, jid, senderJid); break;
            case 'slots': case 'tragamonedas': case 'slot': case 'maquina':
                await cmdSlots(sockR, jid, senderJid, args); break;
            case 'jackpot': case 'pozo': case 'jackpotinfo':
                await cmdJackpot(sockR, jid); break;

            // ── CLANES ────────────────────────────────────────────────────
            case 'createguild': case 'crearclan': case 'newclan': case 'nuevoclan':
                await cmdCrearClan(sockR, jid, senderJid, args); break;
            case 'joinguild': case 'unirclan': case 'entrar_clan':
                await cmdUnirClan(sockR, jid, senderJid, args); break;
            case 'leaveguild': case 'salirclan': case 'dejar_clan':
                await cmdSalirClan(sockR, jid, senderJid); break;
            case 'guildinfo': case 'infoclan': case 'clan': case 'miclan':
                await cmdInfoClan(sockR, jid, senderJid, args); break;
            case 'editguild': case 'editclan': case 'editarclan': case 'guildset':
                await cmdEditarClan(sockR, jid, senderJid, args, msg); break;
            case 'guildbattle': case 'guerraclan': case 'atacar': case 'guild_war':
                await cmdGuerraClanes(sockR, jid, senderJid, args); break;
            case 'guildtop': case 'topclanes': case 'clansranking': case 'clantop':
                await cmdListaClanes(sockR, jid, pagina); break;

            // ── BANCO DEL CLAN ────────────────────────────────────────────
            case 'guildbankinfo': case 'bancoguild': case 'gbanco': case 'gbancoinfo':
                await cmdBancoClan(sockR, jid, senderJid); break;
            case 'guilddeposit': case 'depositarguild': case 'gdepositar': case 'gclandeposit':
                await cmdDepositarClan(sockR, jid, senderJid, args); break;
            case 'guildwithdraw': case 'retirarguild': case 'gretirar': case 'gclanwithdraw':
                await cmdRetirarClan(sockR, jid, senderJid, args); break;

            // ── ROLES DEL CLAN ────────────────────────────────────────────
            case 'guildpromote': case 'promoverclan': case 'ascenderclan': case 'guildraise':
                await cmdPromoverMiembro(sockR, jid, senderJid, args, mencionados); break;
            case 'guilddepromote': case 'bajarclan': case 'guilddemote': case 'guilddemotemember':
                await cmdDemotarMiembro(sockR, jid, senderJid, mencionados); break;
            case 'disbandguild': case 'disolverclan': case 'deleteguild': case 'cerrarclan':
                await cmdDisolverClan(sockR, jid, senderJid); break;
            case 'clankick': case 'guildkick': case 'expulsarclan': case 'kickguild':
                await cmdKickClan(sockR, jid, senderJid, mencionados); break;
            case 'guildaccept': case 'aceptarclan': case 'aprobarmiembro': case 'acceptmember':
                await cmdGestionarSolicitud(sockR, jid, senderJid, mencionados, true); break;
            case 'guilddeny': case 'rechazarclan': case 'denegarmiembro': case 'denymember':
                await cmdGestionarSolicitud(sockR, jid, senderJid, mencionados, false); break;
            case 'guildpending': case 'solicitudesclan': case 'pendientesclan': case 'pendingmembers':
                await cmdVerSolicitudes(sockR, jid, senderJid); break;

            // ── EXTRAS ────────────────────────────────────────────────────
            case 'afk': case 'ausente': case 'ocupado':
                await cmdAfk(sockR, jid, senderJid, args, pushName); break;
            case 'afklist': case 'listaafk': case 'listafk':
                await cmdAfkList(sockR, jid, groupMetadata, pagina); break;
            case 'afkdel': case 'volver': case 'deafk': case 'noafk':
                await cmdAfkDel(sockR, jid, senderJid, pushName); break;
            case 'adoptpet': case 'adoptar': case 'mascota': case 'pet':
            case 'adoptpokemon': case 'adoptp': case 'adoptarpokemon': case 'pokemon':
                await cmdAdoptar(sockR, jid, senderJid, args); break;
            case 'petinfo': case 'mimascota': case 'mipet': case 'vermasocta':
                await cmdPetInfo(sockR, jid, senderJid); break;
            case 'petfeed': case 'alimentar': case 'darcomida': case 'feed':
                await cmdPetFeed(sockR, jid, senderJid); break;
            case 'petplay': case 'jugarcon': case 'play_pet': case 'jugar':
                await cmdPetPlay(sockR, jid, senderJid); break;
            case 'changepet': case 'cambiarmascota': case 'newpet': case 'nuevamascota':
                await cmdCambiarMascota(sockR, jid, senderJid, args); break;
            case 'abandopet': case 'abandonarpet': case 'liberarmascota': case 'delpet':
                await cmdAbandonarMascota(sockR, jid, senderJid); break;
            case 'hack': case 'hackear': case 'hacker':
                await cmdHack(sockR, jid, senderJid, mencionados, pushName); break;
            case 'rankglobal': case 'globalrank': case 'topglobal': case 'rankingglobal':
                await cmdRankGlobal(sockR, jid, pagina); break;
            case 'event': case 'evento': case 'temporada':
                await cmdEvento(sockR, jid); break;
            case 'eventos': case 'listaeventos': case 'catalogo': case 'eventoslist':
                await cmdEventosCatalogo(sockR, jid, pagina); break;
            case 'loot': case 'recoger': case 'pickup':
                await cmdLoot(sockR, jid, senderJid, pushName); break;

            // ── PERFIL ────────────────────────────────────────────────────
            case 'perfil': case 'profile':
                await cmdPerfil(sockR, jid, senderJid, mencionados); break;
            case 'racha': case 'streak': case 'misracha':
                await cmdRacha(sockR, jid, senderJid, mencionados); break;
            case 'setbirth':
                await cmdSetbirth(sockR, jid, senderJid, args); break;
            case 'delbirth':
                await cmdDelbirth(sockR, jid, senderJid); break;
            case 'setdesc': case 'setdescription':
                await cmdSetdesc(sockR, jid, senderJid, args); break;
            case 'setgenre':
                await cmdSetgenre(sockR, jid, senderJid, args); break;
            case 'delgenre':
                await cmdDelgenre(sockR, jid, senderJid); break;
            case 'setfavourite': case 'setfav':
                await cmdSetfav(sockR, jid, senderJid, args); break;
            case 'marry': case 'casarse':
                await cmdMarry(sockR, jid, senderJid, mencionados); break;
            case 'divorce':
                await cmdDivorce(sockR, jid, senderJid); break;
            case 'level': case 'lvl':
                await cmdLevel(sockR, jid, senderJid, mencionados); break;
            case 'leaderboard': case 'lboard': case 'top':
                await cmdLeaderboard(sockR, jid, groupMetadata, pagina); break;
            case 'topweekly': case 'weeklytop': case 'topweek': case 'semanalboard': case 'topsemanal':
                await cmdTopWeekly(sockR, jid, groupMetadata, pagina); break;
            case 'rango': case 'rangos': case 'ranks': case 'rank':
                await cmdRango(sockR, jid, senderJid, mencionados); break;
            case 'cumpleanos': case 'cumpleaños': case 'birthdays':
                await cmdCumpleanos(sockR, jid); break;
            case 'allbirthdays': case 'allbirths':
                await cmdAllBirthdays(sockR, jid); break;
            case 'gp': case 'group': case 'groupinfo': case 'infogrupo':
                await cmdGrupoInfo(sockR, jid, groupMetadata); break;

            // ── STICKERS ──────────────────────────────────────────────────
            case 'sticker': case 's': case 'stickers':
                await cmdSticker(sockR, jid, msg, pushName); break;
            case 'stickersearch': case 'sticker_search': case 'stickerbus': case 'ss':
                await cmdStickerSearch(sockR, jid, args); break;

            // ── DESCARGAS ─────────────────────────────────────────────────
            case 'yt': case 'mp4': case 'ytmp4':
                await cmdYoutube(sockR, jid, args); break;
            case 'play': case 'ytaudio': case 'mp3':
                await cmdYoutubeAudio(sockR, jid, args); break;
            case 'ytsearch': case 'search': case 'buscarvideo':
                await cmdYoutubeSearch(sockR, jid, args); break;
            case 'ytv': case 'ytvideo': case 'ytdescargar':
                await cmdYoutubeVideoSearch(sockR, jid, args); break;
            case 'tiktok': case 'tt':
                await cmdTiktok(sockR, jid, args); break;
            case 'ttplay': case 'tiktokmp3': case 'ttaudio':
                await cmdTiktokAudio(sockR, jid, args); break;
            case 'facebook': case 'fb': case 'fvideo':
                await cmdFacebook(sockR, jid, args); break;
            case 'twitter': case 'x':
                await cmdTwitter(sockR, jid, args); break;
            case 'instagram': case 'ig': case 'reel':
                await cmdInstagram(sockR, jid, args); break;
            case 'pin': case 'pinterest':
                await manejarPin(sockR, msg); break;
            case 'img':
                await cmdImagen(sockR, jid, args); break;
            case 'downloaddiag': case 'diagdescargas':
                await cmdDiagnosticoDescargas(sockR, jid); break;
            case 'mediafire': case 'mf':
                await cmdMediafire(sockR, jid, args); break;
            case 'spotify': case 'sp':
                await cmdSpotify(sockR, jid, args); break;
            case 'soundcloud': case 'sc':
                await cmdSoundcloud(sockR, jid, args); break;
            case 'threads': case 'thread':
                await cmdThreads(sockR, jid, args); break;
            case 'apk': case 'apkpure':
                await cmdApkpure(sockR, jid, args); break;
            case 'drive': case 'gdrive':
                await cmdDrive(sockR, jid, args); break;
            case 'pixiv': case 'px':
                await cmdPixiv(sockR, jid, args); break;
            case 'vermangasporno': case 'vmp':
                await sockR.sendMessage(jid, { text: `${INFO} *VerMangasPorno*\nUso: *#vmp <URL del manga>*\n\n_Esta función está en desarrollo._` }); break;

            // ── ADMIN ─────────────────────────────────────────────────────
            case 'setwelcome':
                await cmdSetwelcome(sockR, jid, groupMetadata, senderJid, args); break;
            case 'resetwelcome':
                await cmdResetwelcome(sockR, jid, groupMetadata, senderJid); break;
            case 'setgoodbye':
                await cmdSetgoodbye(sockR, jid, groupMetadata, senderJid, args); break;
            case 'resetgoodbye':
                await cmdResetgoodbye(sockR, jid, groupMetadata, senderJid); break;
            case 'setwelcomeimage': case 'welcomeimage': case 'welcomeimg':
                await cmdSetWelcomeImage(sockR, jid, groupMetadata, senderJid, msg); break;
            case 'setmultimediawelcome': case 'setwelcomemedia': case 'setwelcomevideo': case 'setwelcomegif':
                await cmdSetMultimediaWelcome(sockR, jid, groupMetadata, senderJid, msg); break;
            case 'delwelcomeimage': case 'removewelcomeimage': case 'delwelcomemedia':
                await cmdDelWelcomeImage(sockR, jid, groupMetadata, senderJid); break;
            case 'setgoodbyeimage': case 'goodbyeimage': case 'goodbyeimg':
                await cmdSetGoodbyeImage(sockR, jid, groupMetadata, senderJid, msg); break;
            case 'setmultimediagoodbye': case 'setgoodbyemedia': case 'setgoodbyevideo': case 'setgoodbyegif':
                await cmdSetMultimediaGoodbye(sockR, jid, groupMetadata, senderJid, msg); break;
            case 'delgoodbyeimage': case 'removegoodbyeimage': case 'delgoodbyemedia':
                await cmdDelGoodbyeImage(sockR, jid, groupMetadata, senderJid); break;
            case 'givechest': case 'darcofre': case 'dropcofre': case 'cofre':
                await cmdGivechest(sockR, jid, groupMetadata, senderJid, args); break;
            case 'claimchest': case 'reclamarcofre': case 'abrircofre':
                await cmdClaimchest(sockR, jid, senderJid); break;
            case 'welcome': case 'bienvenida':
                await cmdWelcome(sockR, jid, groupMetadata, senderJid, args); break;
            case 'goodbye': case 'despedida':
                await cmdGoodbye(sockR, jid, groupMetadata, senderJid, args); break;
            case 'onlyadmin': case 'onlyadmins':
                await cmdOnlyadmin(sockR, jid, groupMetadata, senderJid, args); break;
            case 'eventoson': {
                if (esGrupo && !isOwner(senderJid) && !esAdmin(groupMetadata, senderJid)) {
                    await sockR.sendMessage(jid, { text: `${ERR} Solo los admins o el owner pueden gestionar eventos del grupo.` }); break;
                }
                const _gEv = getGrupo(jid);
                if (_gEv.eventosHabilitados) {
                    await sockR.sendMessage(jid, { text: `${WARN} Los eventos ya están *activados* en este chat.` }); break;
                }
                _gEv.eventosHabilitados = true;
                guardarGrupo(jid, _gEv);
                await sockR.sendMessage(jid, {
                    text: `${OK} *Eventos activados.*\nLos eventos globales (lluvia de coins, hora dorada, etc.) aplicarán en este chat.`
                });
                break;
            }
            case 'eventosoff': {
                if (esGrupo && !isOwner(senderJid) && !esAdmin(groupMetadata, senderJid)) {
                    await sockR.sendMessage(jid, { text: `${ERR} Solo los admins o el owner pueden gestionar eventos del grupo.` }); break;
                }
                const _gEv = getGrupo(jid);
                if (!_gEv.eventosHabilitados) {
                    await sockR.sendMessage(jid, { text: `${WARN} Los eventos ya están *desactivados* en este chat.` }); break;
                }
                _gEv.eventosHabilitados = false;
                guardarGrupo(jid, _gEv);
                await sockR.sendMessage(jid, {
                    text: `${ERR} *Eventos desactivados.*\nLos eventos globales no tendrán efecto aquí hasta que uses *#eventoson*.`
                });
                break;
            }

            case 'eventostop': case 'stopevento': case 'detenerevento': {
                if (!isOwner(senderJid)) {
                    await sockR.sendMessage(jid, { text: `${ERR} Solo el owner puede detener un evento activo.` }); break;
                }
                const EVENT_PATH_HANDLER = path.join(__dirname, '../data/evento_activo.json');
                try { require('fs-extra').removeSync(EVENT_PATH_HANDLER); } catch { /* ya no existía */ }
                invalidarCacheEvento();
                await sockR.sendMessage(jid, {
                    text: `${OK} *Evento detenido.*\nEl evento activo ha sido eliminado y el caché limpiado.\n_Usa *#evento* para confirmar que no hay ninguno activo._`
                });
                break;
            }

            // ── #levelnotif — activa/desactiva anuncios de subida de nivel ──
            case 'levelnotif': case 'nivelnotif': case 'levelanuncios': case 'anunciosnivel': {
                if (!esGrupo) { await sockR.sendMessage(jid, { text: `${ERR} Este comando solo funciona en grupos.` }); break; }
                if (!isOwner(senderJid) && !esAdmin(groupMetadata, senderJid)) {
                    await sockR.sendMessage(jid, { text: `${ERR} Solo los admins o el owner pueden cambiar esta configuración.` }); break;
                }
                const _gNv = getGrupo(jid);
                const _sub = (args[0] || '').toLowerCase();
                const _estadoActual = _gNv.anunciosNivel !== false;

                if (_sub === 'on' || _sub === 'enable' || _sub === 'activar') {
                    if (_estadoActual) { await sockR.sendMessage(jid, { text: `${WARN} Los anuncios de nivel ya están *activados*.` }); break; }
                    _gNv.anunciosNivel = true;
                    guardarGrupo(jid, _gNv);
                    await sockR.sendMessage(jid, { text: `${OK} *Anuncios de nivel activados.*\nCuando alguien suba de nivel, el bot lo anunciará en el grupo.` });
                } else if (_sub === 'off' || _sub === 'disable' || _sub === 'desactivar') {
                    if (!_estadoActual) { await sockR.sendMessage(jid, { text: `${WARN} Los anuncios de nivel ya están *desactivados*.` }); break; }
                    _gNv.anunciosNivel = false;
                    guardarGrupo(jid, _gNv);
                    await sockR.sendMessage(jid, { text: `${ERR} *Anuncios de nivel desactivados.*\nLas subidas de nivel ya no se anunciarán en el grupo.` });
                } else {
                    const estado = _estadoActual ? `${OK} *Activados*` : `${ERR} *Desactivados*`;
                    await sockR.sendMessage(jid, {
                        text: `${INFO} *Anuncios de subida de nivel*\nEstado actual: ${estado}\n\n_Usa *#levelnotif on* para activar o *#levelnotif off* para desactivar._`
                    });
                }
                break;
            }
            case 'open':
                await cmdOpen(sockR, jid, groupMetadata, senderJid); break;
            case 'close':
                await cmdClose(sockR, jid, groupMetadata, senderJid); break;
            case 'kick':
                await cmdKick(sockR, jid, groupMetadata, senderJid, mencionados); break;
            case 'promote':
                await cmdPromote(sockR, jid, groupMetadata, senderJid, mencionados); break;
            case 'demote':
                await cmdDemote(sockR, jid, groupMetadata, senderJid, mencionados); break;
            case 'fijar': case 'pinmsg': case 'pinar': case 'fixmsg':
                await cmdFijar(sockR, jid, groupMetadata, senderJid, msg); break;
            case 'desfijar': case 'unpinmsg': case 'despinar': case 'unfijar':
                await cmdFijar(sockR, jid, groupMetadata, senderJid, msg, true); break;

            case 'antilink': case 'antienlace':
                await cmdAntilink(sockR, jid, groupMetadata, senderJid, args); break;
            case 'warn':
                await cmdWarn(sockR, jid, groupMetadata, senderJid, mencionados, args); break;
            case 'delwarn':
                await cmdDelwarn(sockR, jid, groupMetadata, senderJid, mencionados); break;
            case 'warns':
                await cmdWarns(sockR, jid, groupMetadata, senderJid, mencionados); break;
            case 'resetwarns':
                await cmdResetwarns(sockR, jid, groupMetadata, senderJid, mencionados); break;
            case 'warnslist': case 'listwarn': case 'listwarnss': case 'listawarn':
                await cmdWarnsList(sockR, jid, groupMetadata, senderJid); break;
            case 'tempban':
                await cmdTempban(sockR, jid, groupMetadata, senderJid, mencionados, args); break;
            case 'tempbans': case 'listbans': case 'banslist':
                await cmdTempbans(sockR, jid, groupMetadata, senderJid); break;
            case 'untempban': case 'destempban':
                await cmdUntempban(sockR, jid, groupMetadata, senderJid, mencionados); break;
            case 'modlog': case 'modlogs': case 'logmod':
                await cmdModlog(sockR, jid, groupMetadata, senderJid, args); break;
            case 'clearmodlog': case 'limpiarmodlog':
                await cmdClearmodlog(sockR, jid, groupMetadata, senderJid); break;
            case 'mutebot':
                await cmdMuteBot(sockR, jid, groupMetadata, senderJid, mencionados, args); break;
            case 'unmutebot':
                await cmdUnmuteBot(sockR, jid, groupMetadata, senderJid, mencionados); break;
            case 'mutedlist': case 'mutedusers': case 'silenciados':
                await cmdMutedList(sockR, jid, groupMetadata, senderJid); break;
            case 'setwarnlimit':
                await cmdSetwarnlimit(sockR, jid, groupMetadata, senderJid, args); break;
            case 'topmensajes': case 'topcount': case 'topmessages': case 'topmsgcount':
                await cmdTopmensajes(sockR, jid); break;
            case 'alerts': case 'alertas':
                await cmdAlerts(sockR, jid, groupMetadata, senderJid, args); break;
            case 'economy': case 'economia':
                await cmdToggleEconomy(sockR, jid, groupMetadata, senderJid, args); break;
            case 'gacha':
                await cmdToggleGacha(sockR, jid, groupMetadata, senderJid, args); break;
            case 'nsfw':
                await cmdToggleNsfw(sockR, jid, groupMetadata, senderJid, args); break;
            case 'groupimage': case 'groupimg': case 'gpimg': case 'setgroupimage':
            case 'setgpbaner': case 'setgpbanner':
                await cmdGroupImage(sockR, jid, groupMetadata, senderJid, msg); break;
            case 'setgpname': case 'setgroupname': case 'setgpsubject':
                await cmdSetGpName(sockR, jid, groupMetadata, senderJid, args); break;
            case 'setgpdesc': case 'setgroupdesc': case 'setgpdescription':
                await cmdSetGpDesc(sockR, jid, groupMetadata, senderJid, args); break;
            case 'msgcount': case 'count': case 'messages': case 'mensajes':
                await cmdMsgCount(sockR, jid, groupMetadata, senderJid, mencionados); break;
            case 'topinactive': case 'topinactivos': case 'topinactiveusers':
                await cmdTopInactive(sockR, jid, pagina); break;
            case 'inactivos': case 'fantasmas': case 'ghostlist':
                await cmdInactivos(sockR, jid, groupMetadata); break;
            case 'kickinactivos': case 'kickfantasmas': case 'kickghosts': case 'purgeinactive':
                await cmdKickInactivos(sockR, jid, groupMetadata, senderJid); break;
            case 'setprimary':
                await cmdSetPrimary(sockR, jid, groupMetadata, senderJid, mencionados); break;
            case 'cleanup': case 'limpiar': case 'limpiarusuarios':
                await cmdLimpiarUsuarios(sockR, jid, groupMetadata, senderJid); break;
            case 'config': case 'settings': case 'ajustes': case 'configuracion': case 'gpconfig':
                await cmdConfig(sockR, jid, groupMetadata); break;

            // ── WAIFU ─────────────────────────────────────────────────────
            case 'waifu':
                await cmdWaifu(sockR, jid, args); break;

            // ── TOP RANDOM ────────────────────────────────────────────────
            case 'toprand': case 'toprandom': case 'rankrand': case 'rankrandom':
                await cmdTopRandom(sockR, jid, groupMetadata, args); break;

            // ── IA ────────────────────────────────────────────────────────
            case 'ai': case 'nexus': case 'gpt': case 'ask':
                await cmdIA(sockR, jid, senderJid, args, pushName); break;
            case 'clearmemory': case 'limpiarai': case 'resetai': case 'clearai': {
                const esAdminIA = isOwner(senderJid) || (esGrupo && esAdmin(groupMetadata, senderJid));
                if (!esAdminIA) {
                    await sockR.sendMessage(jid, { text: `${ERR} Solo admins/owners pueden limpiar la memoria IA.` });
                } else {
                    await cmdLimpiarMemoria(sockR, jid, senderJid);
                }
                break;
            }

            // ── FUN ───────────────────────────────────────────────────────
            case 'ship':
                await cmdShip(sockR, jid, mencionados, pushName, senderJid); break;
            case 'meme': case 'memes':
                await cmdMeme(sockR, jid, args); break;
            case 'frase': case 'quote': case 'cita':
                await cmdFrase(sockR, jid, args); break;

            // ── MENU IMAGE (owner only) ────────────────────────────────────
            case 'setmenuimage': case 'setmenuimg': case 'menuimage':
                await cmdSetMenuImage(sockR, jid, senderJid, msg); break;
            case 'setmultimediamenu': case 'setmenumedia': case 'setmenuvideo': case 'setmenugif':
                await cmdSetMultimediaMenu(sockR, jid, senderJid, msg); break;
            case 'delmenuimage': case 'delmenuimg': case 'removemenuimage': case 'delmenumedia':
                await cmdDelMenuImage(sockR, jid, senderJid); break;

            // ── DEFAULT: acciones de anime / NSFW / imageboards / descargas NSFW ───────────
            default: {
                const esNsfwCmd = TODO_IMAGEBOARDS.includes(cmd) || TODO_IMAGEBOARDS_VIDEO.includes(cmd)
                    || TODO_NSFW_IMG.includes(cmd) || TODO_NSFW_ACCION.includes(cmd)
                    || TODO_NSFW_DOWNLOADS.includes(cmd);

                if (esNsfwCmd) {
                    const nsfwPermitido = esGrupo
                        ? g?.nsfw === true
                        : isOwner(senderJid);

                    if (!nsfwPermitido) {
                        const texto_nsfw = esGrupo
                            ? `${ERR} Los comandos *NSFW (+18)* están desactivados en este grupo.\n\n_El owner del bot puede activarlos con_ *#nsfw enable*`
                            : `${ERR} Los comandos NSFW solo están disponibles en grupos con NSFW activado.`;
                        await sockR.sendMessage(jid, { text: texto_nsfw });
                        break;
                    }
                }

                if (TODO_SFW.includes(cmd)) {
                    await cmdInteraccion(sockR, jid, senderJid, cmd, mencionados, pushName);
                } else if (TODO_IMAGEBOARDS_VIDEO.includes(cmd)) {
                    await cmdImageboard(sockR, jid, cmd, args, true);
                } else if (TODO_IMAGEBOARDS.includes(cmd)) {
                    await cmdImageboard(sockR, jid, cmd, args);
                } else if (TODO_NSFW_IMG.includes(cmd)) {
                    await cmdNsfw(sockR, jid, cmd);
                } else if (TODO_NSFW_ACCION.includes(cmd)) {
                    await cmdNsfwAccion(sockR, jid, senderJid, cmd, mencionados, pushName);
                } else if (cmd === 'hitomi' || cmd === 'hitomila') {
                    await cmdHitomi(sockR, jid, args);
                } else if (cmd === 'nhentai' || cmd === 'nh' || cmd === 'nhdl') {
                    await cmdNhentai(sockR, jid, args);
                } else if (cmd === 'vermangasporno' || cmd === 'vmp') {
                    await cmdVermangasporno(sockR, jid, args);
                } else if (cmd === 'xnxx') {
                    await cmdXnxx(sockR, jid, args);
                } else if (cmd === 'pornhub' || cmd === 'ph') {
                    await cmdPornhub(sockR, jid, args);
                } else if (cmd === 'xvideos' || cmd === 'xvid') {
                    await cmdXvideos(sockR, jid, args);
                } else {
                    await sockR.sendMessage(jid, {
                        text: `${WARN} Comando *#${cmd}* no encontrado.\nUsa *#menu* para ver todos los comandos disponibles.`
                    });
                }
            }
        }

        // ── Chequeo automático de logros ──────────────────────────────────
        const cmdsConLogros = ['work','w','trabajar','crime','crimen','daily','diario','steal','rob','robar',
            'coinflip','cf','roulette','rt','ruleta','fight','pvp','battle','pelear','train','entrenar',
            'rep','reputar','missions','misiones','claimmission','completar','blackjack','bj','slots','invest',
            'ppt','piedra','papel','tijera','rock','paper','scissors',
            'deposit','depositar','guildbattle','guerraclanes','war',
            'marry','casarse','divorce','divorciar','casado',
            'fish','pescar','minar','mine','cazar','hunt','adventure','aventura','mazmorra','dungeon',
            'payloan','pagarprestamo'];
        if (cmdsConLogros.includes(cmd)) {
            try {
                const uCheck = getUsuario(senderJid);
                await verificarYNotificar(sockR, jid, senderJid, uCheck);
            } catch { }
        }
    } catch (err) {
        const txt = String(err?.message || err?.response?.data || err?.stderr || '').toLowerCase();
        if (txt.includes('rate-overlimit') || txt.includes('too many requests') || txt.includes('overlimit') || err?.response?.status === 429) {
            return;
        }
        logError(`Error en comando #${cmd}`, err);
        // Mensajes de error más descriptivos por tipo (punto 10)
        let userMsg = `${ERR} Ocurrió un error ejecutando ese comando. Intenta de nuevo en un momento.`;
        if (txt.includes('timeout') || txt.includes('econnreset') || txt.includes('econnrefused') || txt.includes('enotfound')) {
            userMsg = `${WARN} No pude conectarme al servicio externo. Revisa tu conexión o intenta más tarde.`;
        } else if (txt.includes('file too large') || txt.includes('size') || txt.includes('too big')) {
            userMsg = `${WARN} El archivo es demasiado grande para enviar por WhatsApp (límite ~64 MB).`;
        } else if (txt.includes('unsupported') || txt.includes('not supported')) {
            userMsg = `${WARN} Formato no soportado. Intenta con otro archivo o enlace.`;
        } else if (txt.includes('no se encontr') || txt.includes('not found') || txt.includes('404')) {
            userMsg = `${WARN} No encontré ese contenido. Verifica el enlace o intenta con otra búsqueda.`;
        } else if (txt.includes('ffmpeg') || txt.includes('conversion')) {
            userMsg = `${WARN} Error convirtiendo el archivo. Intenta con una imagen o video diferente.`;
        }
        await sockR.sendMessage(jid, { text: userMsg });
    }
}

function getBotActivo() { return botActivo; }
function getModoMantenimiento() { return modoMantenimiento; }
function getMensajeMantenimiento() { return mensajeMantenimiento; }

module.exports = { manejarMensaje, getBotActivo, getModoMantenimiento, getMensajeMantenimiento };
