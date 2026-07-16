/**
 * subbots.js — Sistema de Sub-Bots.
 *
 * Permite que cualquier usuario vincule su propio número de WhatsApp como
 * un socket adicional ("Sub-Bot") que responde a los mismos comandos que el
 * bot principal, usando exactamente el mismo gate (src/messageRouter.js).
 *
 * La función viene DESACTIVADA por defecto (data/subbots.json → activo:false).
 * Solo un owner puede activarla/desactivarla con *#subbots on* / *#subbots off*.
 * Al desactivarla se cierran automáticamente todas las sesiones de sub-bots
 * activas, para no dejar sockets huérfanos conectados a WhatsApp.
 *
 * Cada socket de sub-bot se marca con `sock.__esSubbot = true` y
 * `sock.__subbotNumero = <numero>` para que src/handler.js pueda distinguirlo
 * del socket principal (p.ej. para permitir auto-activación de chat o
 * auto-desvinculación solo desde la propia sesión del sub-bot).
 */

const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    Browsers,
    DisconnectReason,
    isJidBroadcast
} = require('@whiskeysockets/baileys');

const SUBBOTS_DIR     = path.join(__dirname, '../auth_info_subs');
const CONFIG_PATH     = path.join(__dirname, '../data/subbots.json');
const MAX_SUBBOTS     = 15;
const COOLDOWN_MS     = 90_000;      // 90s entre solicitudes por usuario
const CODE_TIMEOUT_MS = 3 * 60_000;  // el código de vinculación expira a los pocos minutos
const MAX_REINTENTOS  = 5;           // reintentos de reconexión antes de abandonar

// ── Persistencia (toggle + registro de cada sub-bot) ────────────────────
// registros[numero] = { dueñoJid, nombre, vinculadoEn, comandosEjecutados, ultimoComando, ultimoUso }
let config = { activo: false, registros: {} };
try {
    if (fs.existsSync(CONFIG_PATH)) {
        const cargado = fs.readJsonSync(CONFIG_PATH);
        config = { activo: false, registros: {}, ...cargado };
    } else {
        fs.ensureDirSync(path.dirname(CONFIG_PATH));
        fs.writeJsonSync(CONFIG_PATH, config, { spaces: 2 });
    }
} catch (err) {
    console.error('[SUBBOTS] Error cargando config:', err.message);
}

function guardarConfig() {
    try {
        fs.writeJsonSync(CONFIG_PATH, config, { spaces: 2 });
    } catch (err) {
        console.error('[SUBBOTS] Error guardando config:', err.message);
    }
}

function getSubbotsActivo() {
    return config.activo === true;
}

// ── Estado en memoria de sockets activos ────────────────────────────────
const subBots   = new Map(); // numero -> { sock, conectado, desde, intentos }
const cooldowns = new Map(); // jidSolicitante -> timestamp última solicitud

function listarSubBots() {
    return [...subBots.entries()].map(([numero, info]) => ({
        numero,
        conectado: info.conectado,
        desde: info.desde
    }));
}

/**
 * Listado completo para el owner: mezcla el estado en memoria (conectado)
 * con los metadatos persistidos (nombre, dueño, comandos ejecutados).
 * Incluye también registros de sub-bots que quedaron guardados en disco
 * pero no están conectados ahora mismo.
 */
function listarSubBotsDetallado() {
    const numeros = new Set([...Object.keys(config.registros || {}), ...subBots.keys()]);
    return [...numeros].map(numero => {
        const info = subBots.get(numero);
        const reg  = (config.registros || {})[numero] || {};
        return {
            numero,
            conectado: !!info?.conectado,
            nombre: reg.nombre || null,
            dueñoJid: reg.dueñoJid || null,
            vinculadoEn: reg.vinculadoEn || null,
            comandosEjecutados: reg.comandosEjecutados || 0,
            ultimoComando: reg.ultimoComando || null,
            ultimoUso: reg.ultimoUso || null
        };
    }).sort((a, b) => (b.vinculadoEn || 0) - (a.vinculadoEn || 0));
}

/** Devuelve el número de sub-bot ya vinculado (o pendiente) por ese JID, si existe. */
function getSubbotDeDueño(dueñoJid) {
    const entradas = Object.entries(config.registros || {});
    const match = entradas.find(([, reg]) => reg.dueñoJid === dueñoJid);
    return match ? match[0] : null;
}

function registrarComando(numero, comando) {
    if (!config.registros) config.registros = {};
    if (!config.registros[numero]) return;
    const reg = config.registros[numero];
    reg.comandosEjecutados = (reg.comandosEjecutados || 0) + 1;
    reg.ultimoComando = comando;
    reg.ultimoUso = Date.now();
    guardarConfig();
}

function verificarCooldown(jidSolicitante) {
    const ultimo   = cooldowns.get(jidSolicitante) || 0;
    const restante = COOLDOWN_MS - (Date.now() - ultimo);
    return restante > 0 ? restante : 0;
}

function marcarCooldown(jidSolicitante) {
    cooldowns.set(jidSolicitante, Date.now());
}

async function detenerSubBot(numero, { eliminarSesion = false, eliminarRegistro = false } = {}) {
    const info = subBots.get(numero);
    if (info) {
        try { info.sock.ev.removeAllListeners(); } catch {}
        try { info.sock.end?.(new Error('Sub-bot detenido')); } catch {}
        subBots.delete(numero);
    }
    if (eliminarSesion) {
        try { await fs.remove(path.join(SUBBOTS_DIR, numero)); } catch {}
    }
    if (eliminarRegistro && config.registros?.[numero]) {
        delete config.registros[numero];
        guardarConfig();
    }
    return !!info;
}

async function detenerTodos() {
    const numeros = [...subBots.keys()];
    for (const numero of numeros) await detenerSubBot(numero);
}

function setSubbotsActivo(activo) {
    config.activo = !!activo;
    guardarConfig();
    if (!config.activo) {
        detenerTodos().catch(err => console.error('[SUBBOTS] Error al desactivar todos:', err.message));
    }
    return config.activo;
}

/**
 * Inicia (o reintenta) el socket de un sub-bot para el número dado.
 * @param {object} opts
 * @param {string} opts.numero        Número de teléfono, solo dígitos.
 * @param {object} opts.sockPrincipal Socket del bot principal (para avisar por privado al solicitante).
 * @param {string} [opts.chatId]      Chat PRIVADO donde avisar código/estado (nunca un grupo, para no exponer el código). null = no avisar (reconexión silenciosa).
 * @param {string} [opts.dueñoJid]    JID de quien solicitó este sub-bot (se conserva entre reconexiones).
 */
async function iniciarSubBot({ numero, sockPrincipal, chatId = null, dueñoJid = null }) {
    if (!getSubbotsActivo()) {
        throw new Error('La función de Sub-Bots está desactivada. Un owner puede activarla con *#subbots on*.');
    }
    if (subBots.has(numero)) {
        throw new Error(`El número +${numero} ya está vinculado como Sub-Bot.`);
    }
    if (subBots.size >= MAX_SUBBOTS) {
        throw new Error('No hay espacios disponibles para nuevos Sub-Bots en este momento.');
    }

    const { procesarMensajeEntrante, extraerComando } = require('./messageRouter');

    const carpeta = path.join(SUBBOTS_DIR, numero);
    fs.ensureDirSync(carpeta);

    // Conservar/crear el registro persistido (dueño, fecha de vinculación).
    if (!config.registros) config.registros = {};
    if (!config.registros[numero]) {
        config.registros[numero] = {
            dueñoJid: dueñoJid || null,
            nombre: null,
            vinculadoEn: Date.now(),
            comandosEjecutados: 0,
            ultimoComando: null,
            ultimoUso: null
        };
        guardarConfig();
    } else if (dueñoJid && !config.registros[numero].dueñoJid) {
        config.registros[numero].dueñoJid = dueñoJid;
        guardarConfig();
    }

    const { state, saveCreds } = await useMultiFileAuthState(carpeta);
    const { version } = await fetchLatestBaileysVersion();
    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
        version,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        browser: Browsers.windows('Chrome'),
        logger,
        printQRInTerminal: false,
        syncFullHistory: false,
        getMessage: async () => ({ conversation: '' }),
        shouldIgnoreJid: jid => isJidBroadcast(jid),
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
    });

    // Marcas para que handler.js sepa que este socket es un sub-bot.
    sock.__esSubbot = true;
    sock.__subbotNumero = numero;

    const info = { sock, conectado: false, desde: null, intentos: 0 };
    subBots.set(numero, info);

    sock.ev.on('creds.update', saveCreds);

    // Si se pide un código y el usuario nunca completa la vinculación (código
    // expirado o simplemente no lo usó), no dejamos el intento colgado
    // ocupando un espacio para siempre — lo cerramos y liberamos el número.
    let expiracionTimer = null;
    function programarExpiracion() {
        limpiarExpiracion();
        expiracionTimer = setTimeout(async () => {
            if (info.conectado) return;
            console.log(`[SUBBOTS] Código de +${numero} expiró sin vincularse. Liberando.`);
            await detenerSubBot(numero, { eliminarSesion: true, eliminarRegistro: true });
            if (chatId) {
                await sockPrincipal.sendMessage(chatId, {
                    text: `⌛ El código de vinculación para *+${numero}* expiró sin usarse.\n_Usa *#serbot* de nuevo para pedir uno nuevo._`
                }).catch(() => {});
            }
        }, CODE_TIMEOUT_MS);
    }
    function limpiarExpiracion() {
        if (expiracionTimer) { clearTimeout(expiracionTimer); expiracionTimer = null; }
    }

    let codigoSolicitado = false;
    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'connecting' && !sock.authState.creds.registered && !codigoSolicitado) {
            codigoSolicitado = true;
            try {
                await new Promise(r => setTimeout(r, 1500));
                const codigo = await sock.requestPairingCode(numero);
                programarExpiracion();
                if (chatId) {
                    await sockPrincipal.sendMessage(chatId, {
                        text: `🔗 *Código para vincular Sub-Bot*\n\n\`${codigo}\`\n\nWhatsApp > Dispositivos vinculados > Vincular con número de teléfono.\n_El código expira en unos minutos y solo funciona en el número +${numero}. Si expira, pide uno nuevo con *#serbot*._`
                    }).catch(() => {});
                }
            } catch (e) {
                console.error(`[SUBBOTS] Error solicitando código para ${numero}:`, e.message);
                if (chatId) {
                    await sockPrincipal.sendMessage(chatId, {
                        text: `❌ No se pudo generar el código de vinculación: ${e.message}`
                    }).catch(() => {});
                }
                await detenerSubBot(numero, { eliminarSesion: true, eliminarRegistro: true });
            }
            return;
        }

        if (connection === 'open') {
            limpiarExpiracion();
            info.conectado = true;
            info.desde = Date.now();
            info.intentos = 0;
            console.log(`[SUBBOTS] +${numero} conectado.`);
            if (config.registros?.[numero]) {
                config.registros[numero].nombre = sock.user?.name || sock.user?.verifiedName || config.registros[numero].nombre || null;
                guardarConfig();
            }
            if (chatId) {
                await sockPrincipal.sendMessage(chatId, {
                    text: `✅ Sub-Bot *+${numero}* conectado correctamente. Ya responde a los mismos comandos que el bot principal.\n\n_Para dejar de ser sub-bot en cualquier momento, envía *#delbot* desde este mismo número._`
                }).catch(() => {});
            }
            return;
        }

        if (connection === 'close') {
            limpiarExpiracion();
            const reason = lastDisconnect?.error?.output?.statusCode;
            const yaRegistrado = sock.authState.creds.registered;
            subBots.delete(numero);
            try { sock.ev.removeAllListeners(); } catch {}

            if (reason === DisconnectReason.loggedOut) {
                console.log(`[SUBBOTS] +${numero} cerró sesión (logout). Eliminando credenciales.`);
                try { await fs.remove(carpeta); } catch {}
                if (config.registros?.[numero]) {
                    delete config.registros[numero];
                    guardarConfig();
                }
                return;
            }

            // Reintentar solo si la función sigue activada, ya se había
            // completado la vinculación alguna vez, y no superamos el máximo
            // de reintentos (evita loops infinitos con números caídos).
            if (getSubbotsActivo() && yaRegistrado) {
                info.intentos = (info.intentos || 0) + 1;
                if (info.intentos > MAX_REINTENTOS) {
                    console.log(`[SUBBOTS] +${numero} superó el máximo de reintentos. Abandonando.`);
                    const dueño = config.registros?.[numero]?.dueñoJid;
                    if (dueño) {
                        sockPrincipal.sendMessage(dueño, {
                            text: `⚠️ Tu Sub-Bot *+${numero}* perdió la conexión repetidamente y dejó de reintentar.\n_Usa *#serbot* para volver a vincularlo cuando quieras._`
                        }).catch(() => {});
                    }
                    return;
                }
                setTimeout(() => {
                    const reg = config.registros?.[numero];
                    iniciarSubBot({ numero, sockPrincipal, chatId: null, dueñoJid: reg?.dueñoJid || null })
                        .then(() => { subBots.get(numero) && (subBots.get(numero).intentos = info.intentos); })
                        .catch(err => console.error(`[SUBBOTS] Error reconectando +${numero}:`, err.message));
                }, 5000);
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const m of messages) {
            const { comando } = extraerComando(m);
            if (comando) registrarComando(numero, comando);
            await procesarMensajeEntrante(sock, m);
        }
    });

    return true;
}

/**
 * Al arrancar el bot principal, restaura los sub-bots que ya tenían sesión
 * guardada en disco — solo si la función sigue activada. Si un owner la
 * desactivó, las sesiones quedan en disco pero no se reconectan.
 */
async function reconectarSesionesGuardadas(sockPrincipal) {
    if (!getSubbotsActivo()) return;
    if (!fs.existsSync(SUBBOTS_DIR)) return;

    let carpetas = [];
    try {
        carpetas = fs.readdirSync(SUBBOTS_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory() && fs.existsSync(path.join(SUBBOTS_DIR, d.name, 'creds.json')))
            .map(d => d.name);
    } catch (err) {
        console.error('[SUBBOTS] Error leyendo sesiones guardadas:', err.message);
        return;
    }

    for (const numero of carpetas) {
        const reg = config.registros?.[numero];
        iniciarSubBot({ numero, sockPrincipal, chatId: null, dueñoJid: reg?.dueñoJid || null }).catch(err =>
            console.error(`[SUBBOTS] Error restaurando sesión +${numero}:`, err.message)
        );
    }
}

module.exports = {
    getSubbotsActivo,
    setSubbotsActivo,
    iniciarSubBot,
    detenerSubBot,
    detenerTodos,
    listarSubBots,
    listarSubBotsDetallado,
    getSubbotDeDueño,
    registrarComando,
    verificarCooldown,
    marcarCooldown,
    reconectarSesionesGuardadas,
    MAX_SUBBOTS
};
