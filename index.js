// ── Suprimir logs internos verbose de Baileys (deben ir ANTES de cualquier require) ──
const _stdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...rest) => {
    const txt = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (
        txt.includes('Closing session') ||
        txt.includes('Removing old closed session') ||
        txt.includes('SessionEntry') ||
        txt.includes('ephemeralKeyPair') ||
        txt.includes('currentRatchet') ||
        txt.includes('pendingPreKey') ||
        txt.includes('remoteIdentityKey') ||
        txt.includes('baseKeyType')
    ) return true;
    return _stdoutWrite(chunk, ...rest);
};

const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers,
    isJidBroadcast
} = require('@whiskeysockets/baileys');

const pino  = require('pino');
const readline = require('readline');
const fs    = require('fs');
const path  = require('path');
const http  = require('http');

const { manejarMensaje, getBotActivo, getModoMantenimiento, getMensajeMantenimiento } = require('./src/handler');
const { isOwner, isSuperOwner } = require('./src/owners');
const { registrarContactos, registrarContacto, registrarParticipantes, resolverJid, getLidMap } = require('./src/lidResolver');
const { esAdmin, esMuteadoBot } = require('./src/admin');
const { getGrupo, cargarGrupos, migrarCuentasLid, limpiarDuplicadosLid } = require('./src/database');
const { iniciarSchedulerEventos } = require('./src/extras');
const { manejarMensajePersonajes, migracionDuplicados, validarIntegridadPersonajes } = require('./src/personajes');
const botState = require('./src/botState');
const { iniciarBackupAutomatico } = require('./src/backup');
const { logError, logInfo, logWarn } = require('./src/logger');
const { renderDashboard } = require('./src/dashboard');
const { actualizarYtdlp } = require('./src/ytdlpUpdater');
const { restaurarDesdeBackup } = require('./scripts/restaurar_backup');

// ── Auto-restaurar datos si faltan o están vacíos (útil tras clonar desde GitHub) ──
restaurarDesdeBackup();

// ── Limpiar duplicados @lid usando el lid_map persistido en disco ─────────
limpiarDuplicadosLid();

// ── Logger silencioso ────────────────────────────────────────────────────
const logger = pino({ level: 'silent' });

// ── Archivo de bloqueo: garantiza una sola instancia activa ─────────────
const PID_FILE = path.join(__dirname, '.bot.pid');

function registrarPID() {
    if (fs.existsSync(PID_FILE)) {
        const pidAnterior = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
        if (!isNaN(pidAnterior) && pidAnterior !== process.pid) {
            try {
                process.kill(pidAnterior, 'SIGTERM');
                console.log(`🔫 Proceso anterior (PID ${pidAnterior}) terminado con SIGTERM.`);
            } catch (_) {}
            // Esperar 500ms y forzar SIGKILL si sigue vivo
            const inicio = Date.now();
            while (Date.now() - inicio < 500) {
                try { process.kill(pidAnterior, 0); } catch { break; } // ya murió
            }
            try {
                process.kill(pidAnterior, 'SIGKILL');
                console.log(`🔫 Proceso anterior (PID ${pidAnterior}) eliminado con SIGKILL.`);
            } catch (_) {} // ya estaba muerto, normal
        }
    }
    fs.writeFileSync(PID_FILE, String(process.pid));
}

function limpiarPID() {
    try {
        if (fs.existsSync(PID_FILE)) {
            const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
            if (pid === process.pid) fs.unlinkSync(PID_FILE);
        }
    } catch (_) {}
}

// Limpiar PID al salir
process.on('exit',    limpiarPID);
process.on('SIGINT',  () => { limpiarPID(); process.exit(0); });
process.on('SIGTERM', () => { limpiarPID(); process.exit(0); });

// Registrar esta instancia y matar la anterior si existe
registrarPID();

// ── Control de instancia única ───────────────────────────────────────────
let corriendo = false;
let intentosReconexion = 0;

// ── Watchdog: reconexión automática por silencio o conexión muerta ───────
let sockActivo    = null;
let watchdogTimer = null;

const WATCHDOG_INTERVALO = 2  * 60 * 1000;   // revisar cada 2 min
const WATCHDOG_UMBRAL    =  5 * 60 * 1000;   // umbral de silencio: 5 min

function iniciarWatchdog() {
    if (watchdogTimer) clearInterval(watchdogTimer);
    watchdogTimer = setInterval(async () => {
        if (!corriendo || !sockActivo) return;
        const silencio = Date.now() - botState.ultimoMensaje;
        if (silencio < WATCHDOG_UMBRAL) return;

        const mins = Math.round(silencio / 60000);
        console.log(`🐕 Watchdog: ${mins} min sin actividad. Verificando conexión...`);

        try {
            await sockActivo.sendPresenceUpdate('available');
            console.log(`🐕 Watchdog: conexión OK (${mins} min sin tráfico).`);
        } catch (err) {
            console.log(`🐕 Watchdog: conexión muerta (${err.message}). Reconectando...`);
            const sockRef = sockActivo;
            corriendo  = false;
            sockActivo = null;
            try { sockRef.end(new Error('watchdog')); } catch {}
            await esperar(2000);
            iniciarBot();
        }
    }, WATCHDOG_INTERVALO);
}

function preguntarNumero() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('📱 Número (con código de país, sin + ni espacios, ej: 521234567890): ', (n) => {
            rl.close();
            resolve(n.trim());
        });
    });
}

function esperar(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function iniciarBot() {
    if (corriendo) return;
    corriendo = true;

    try {
        // ── Credenciales con cache de claves de señal ──────────────────
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const { version, isLatest } = await fetchLatestBaileysVersion();

        // ── Crear socket con configuración estable ─────────────────────
        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                // El CacheableSignalKeyStore reduce errores de descifrado
                // que provocan desconexiones inesperadas
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            // Windows + Chrome es el fingerprint más común de WhatsApp Web real.
            // Ubuntu llama la atención de los filtros de Meta porque casi ningún
            // usuario real accede desde Linux.
            browser: Browsers.windows('Chrome'),
            logger,
            printQRInTerminal: false,

            // Keep-alive cada 28-32 s (aleatorio en cada instancia) — imita el
            // intervalo real de WhatsApp Web en un navegador humano.
            keepAliveIntervalMs: 28_000 + Math.floor(Math.random() * 4_000),
            connectTimeoutMs:    60_000,
            defaultQueryTimeoutMs: 60_000,

            // No cargar historial completo (reduce carga y errores)
            syncFullHistory: false,

            // Función requerida para descifrar mensajes correctamente
            getMessage: async () => ({ conversation: '' }),

            // Ignorar mensajes de broadcast para evitar errores
            shouldIgnoreJid: jid => isJidBroadcast(jid),

            // Retry con delay más humano: 1-2 segundos entre intentos
            retryRequestDelayMs: 1000 + Math.floor(Math.random() * 1000),
            maxMsgRetryCount: 3,
        });

        sock.ev.on('creds.update', saveCreds);

        // ── Registrar contactos para resolver @lid → @s.whatsapp.net ──────
        sock.ev.on('contacts.upsert', (contactos) => {
            const nuevos = registrarContactos(contactos);
            if (nuevos > 0) {
                console.log(`[LID] contacts.upsert: ${nuevos} mapeo(s) nuevo(s) registrado(s).`);
                migrarCuentasLid(getLidMap());
            }
        });
        sock.ev.on('contacts.update', (contactos) => {
            const nuevos = registrarContactos(contactos);
            if (nuevos > 0) {
                console.log(`[LID] contacts.update: ${nuevos} mapeo(s) nuevo(s) registrado(s).`);
                migrarCuentasLid(getLidMap());
            }
        });

        // ── Solicitar código de emparejamiento si no está registrado ───
        let codigoSolicitado = false;

        sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (connection === 'connecting' && !sock.authState.creds.registered && !codigoSolicitado) {
                codigoSolicitado = true;
                try {
                    await esperar(2000);
                    const numero = process.env.PHONE_NUMBER || await preguntarNumero();
                    const limpio = numero.replace(/\D/g, '');
                    const codigo = await sock.requestPairingCode(limpio);
                    console.log(`\n╔══════════════════════════════╗`);
                    console.log(`║  CÓDIGO: ${codigo.padEnd(20)}║`);
                    console.log(`╚══════════════════════════════╝`);
                    console.log('👉 WhatsApp > Dispositivos vinculados > Vincular con número\n');
                } catch (e) {
                    console.error('⚠️ Error al pedir código:', e.message);
                    codigoSolicitado = false;
                }
            }

            if (connection === 'open') {
                intentosReconexion         = 0;
                botState.intentosReconexion = 0;
                botState.conectado         = true;
                botState.ultimoMensaje     = Date.now();
                sockActivo = sock;
                iniciarWatchdog();
                const { iniciarCheckTempbans } = require('./src/tempban');
                const { iniciarCheckMutebots } = require('./src/admin');
                iniciarCheckTempbans(sock);
                iniciarCheckMutebots(sock);
                iniciarSchedulerEventos(sock, cargarGrupos);
                const { iniciarSchedulerDeudas } = require('./src/banco');
                iniciarSchedulerDeudas();
                const { iniciarSchedulerCumpleanos } = require('./src/profile');
                iniciarSchedulerCumpleanos(sock, cargarGrupos);
                console.log('✅ Bot conectado.');

                // Resolver LIDs de los owners al conectar
                (async () => {
                    try {
                        const { getOwners } = require('./src/owners');
                        const phones = getOwners()
                            .filter(o => o.endsWith('@s.whatsapp.net'))
                            .map(o => o.replace('@s.whatsapp.net', ''));
                        if (!phones.length) return;
                        const results = await sock.onWhatsApp(...phones);
                        let registrados = 0;
                        for (const r of (Array.isArray(results) ? results : [])) {
                            if (r?.exists && r.jid && r.lid) {
                                registrarContacto({ id: r.jid, lid: r.lid });
                                registrados++;
                            }
                        }
                        if (registrados) console.log(`[LID] ${registrados} owner(s) registrado(s) en lid_map.`);
                    } catch (e) {
                        console.error('[LID] Error al resolver owners en startup:', e.message);
                    }
                })();

                // ── Escanear grupos conocidos para extraer mapeos LID→phone ──
                // Se ejecuta 6 segundos después de conectar (deja tiempo a contacts.upsert).
                // Extrae los participantes de cada grupo y registra cualquier
                // par { id: phone, lid: lid } que Baileys provea en los metadatos.
                setTimeout(async () => {
                    try {
                        const gruposConocidos = Object.keys(cargarGrupos());
                        if (!gruposConocidos.length) return;
                        let totalNuevos = 0;
                        for (const gJid of gruposConocidos) {
                            try {
                                const meta = await sock.groupMetadata(gJid);
                                if (!meta?.participants?.length) continue;
                                const nuevos = registrarParticipantes(meta.participants);
                                totalNuevos += nuevos;
                            } catch {}
                        }
                        if (totalNuevos > 0) {
                            migrarCuentasLid(getLidMap());
                            console.log(`[LID] ${totalNuevos} mapeo(s) extraído(s) de metadatos de grupos → migración ejecutada.`);
                        } else {
                            // Aunque no haya nuevos mapeos, intentar migrar por si el lid_map
                            // ya tenía entradas desde el arranque (disco)
                            migrarCuentasLid(getLidMap());
                        }
                    } catch (e) {
                        console.error('[LID] Error al escanear grupos:', e.message);
                    }
                }, 6000);
            }

            if (connection === 'close') {
                corriendo          = false;
                sockActivo         = null;
                botState.conectado = false;
                const code = lastDisconnect?.error?.output?.statusCode;

                // Sesión cerrada permanentemente → no reconectar
                if (code === DisconnectReason.loggedOut || code === 401 || code === 403) {
                    console.log('❌ Sesión cerrada definitivamente. Borra auth_info y reinicia.');
                    process.exit(1);
                }

                // Backoff progresivo: máximo 60 s para evitar reconexiones que parecen automatizadas
                intentosReconexion++;
                botState.intentosReconexion = intentosReconexion;
                const base   = code === 440 ? 8000 : 3000;
                const demora = Math.min(base * Math.min(intentosReconexion, 5), 60_000);
                const razon  = DisconnectReason[code] || `código ${code}`;
                console.log(`🔄 Desconectado (${razon}). Reconectando en ${demora / 1000}s... (intento ${intentosReconexion})`);

                await esperar(demora);
                iniciarBot();
            }
        });

        // ── Bienvenida / Despedida de grupos ──────────────────────────
        const enviarMediaBG = async (id, texto, p, media) => {
            try {
                if (!media || !media.path || !fs.existsSync(media.path)) {
                    await sock.sendMessage(id, { text: texto, mentions: [p] });
                    return;
                }
                const buf = fs.readFileSync(media.path);
                if (media.tipo === 'image') {
                    await sock.sendMessage(id, { image: buf, caption: texto, mentions: [p] });
                } else if (media.tipo === 'gif') {
                    await sock.sendMessage(id, { video: buf, caption: texto, mentions: [p], gifPlayback: true });
                } else if (media.tipo === 'video') {
                    await sock.sendMessage(id, { video: buf, caption: texto, mentions: [p] });
                } else {
                    await sock.sendMessage(id, { text: texto, mentions: [p] });
                }
            } catch (err) {
                console.error('Error enviando media BG:', err.message);
                await sock.sendMessage(id, { text: texto, mentions: [p] });
            }
        };

        const obtenerMediaBG = (g, modo) => {
            const campo = modo === 'welcome' ? 'welcomeMedia' : 'goodbyeMedia';
            const legacy = modo === 'welcome' ? 'welcomeImagePath' : 'goodbyeImagePath';
            if (g[campo] && g[campo].path) return g[campo];
            if (g[legacy]) return { tipo: 'image', path: g[legacy] };
            return null;
        };

        sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
            try {
                console.log(`[GP-UPDATE] grupo=${id.slice(-10)} action=${action}`);
                const g = getGrupo(id);
                if (g.botActivo === false) return;

                // Baileys 7.x puede entregar participantes como objetos { phoneNumber, lid }
                // o como strings JID directos — esta función normaliza ambos casos
                const extraerJid = (p) => {
                    if (typeof p === 'string') return p;
                    return p.phoneNumber || p.jid || p.id || String(p);
                };

                // Metadatos del grupo (cacheados 10 min para no hacer fetch en cada evento)
                const groupMeta = await getGroupMeta(sock, id);
                const groupName = groupMeta?.subject || 'el grupo';

                // ── Bienvenida ───────────────────────────────────────────────
                if ((action === 'add' || action === 'invite') && g.bienvenida) {
                    const customMedia = obtenerMediaBG(g, 'welcome');
                    for (const p of participants) {
                        const jid = extraerJid(p);
                        const texto = (g.mensajeBienvenida ||
                            `👋 ¡Bienvenido/a @usuario a *${groupName}*!\n\nEscribe *#menu* para ver todo lo que puedo hacer 🚀`)
                            .replace(/@usuario|(?<!\w)@(?!\w)/g, `@${jid.split('@')[0]}`);

                        if (customMedia) {
                            await enviarMediaBG(id, texto, jid, customMedia);
                        } else {
                            // Intentar foto de perfil del nuevo miembro como imagen de bienvenida
                            let pfpBuf = null;
                            try {
                                const pfpUrl = await sock.profilePictureUrl(jid, 'image');
                                const { data } = await require('axios').get(pfpUrl, { responseType: 'arraybuffer', timeout: 8000 });
                                pfpBuf = Buffer.from(data);
                            } catch {}
                            if (pfpBuf) {
                                await sock.sendMessage(id, { image: pfpBuf, caption: texto, mentions: [jid] });
                            } else {
                                await sock.sendMessage(id, { text: texto, mentions: [jid] });
                            }
                        }
                    }
                }

                // ── Despedida ────────────────────────────────────────────────
                if (action === 'remove' && g.despedida) {
                    const customMedia = obtenerMediaBG(g, 'goodbye');
                    for (const p of participants) {
                        const jid = extraerJid(p);
                        const texto = (g.mensajeDespedida ||
                            `👋 @usuario salió de *${groupName}*. ¡Hasta la próxima!`)
                            .replace(/@usuario|(?<!\w)@(?!\w)/g, `@${jid.split('@')[0]}`);
                        await enviarMediaBG(id, texto, jid, customMedia);
                    }
                }

                // ── Alertas de promote / demote ──────────────────────────────
                if (action === 'promote' || action === 'demote') {
                    for (const p of participants) {
                        const jid = extraerJid(p);
                        const numero = jid.split('@')[0];
                        if (action === 'promote') {
                            await sock.sendMessage(id, {
                                text: `👑 @${numero} ahora es administrador de *${groupName}* 🎉`,
                                mentions: [jid]
                            });
                        } else {
                            await sock.sendMessage(id, {
                                text: `◤ Administración ◢\n\n@${numero} ya no es administrador de *${groupName}*`,
                                mentions: [jid]
                            });
                        }
                    }
                }
            } catch (err) {
                console.error('Error group-participants.update:', err.message);
            }
        });

        // ── Mensajes entrantes ─────────────────────────────────────────
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            // Registrar actividad para el watchdog
            botState.ultimoMensaje = Date.now();

            for (const msg of messages) {
                try {
                    // Ignorar mensajes de estado
                    if (msg.key.remoteJid === 'status@broadcast') continue;

                    // Ignorar protocolMessages (edits, deletes, reactions, etc.)
                    // para evitar que el bot procese sus propios mensajes editados
                    if (msg.message?.protocolMessage) continue;
                    if (msg.message?.reactionMessage)  continue;
                    if (msg.message?.pollUpdateMessage) continue;

                    // Permitir mensajes propios solo si son comandos (#)
                    if (msg.key.fromMe) {
                        const textoPropio = (
                            msg.message?.conversation ||
                            msg.message?.extendedTextMessage?.text || ''
                        ).trim();
                        if (!textoPropio.startsWith('#')) continue;
                    }

                    let groupMetadata = null;
                    if (msg.key.remoteJid?.endsWith('@g.us')) {
                        try {
                            groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
                            // Extraer mapeos LID→phone desde los participantes del grupo.
                            // Si se registran nuevos mapeos, ejecutar migración inmediata.
                            if (groupMetadata?.participants?.length) {
                                const nuevos = registrarParticipantes(groupMetadata.participants);
                                if (nuevos > 0) {
                                    migrarCuentasLid(getLidMap());
                                }
                            }
                        } catch {}
                    }

                    const texto = (
                        msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text || ''
                    ).trim();

                    const comando = texto.startsWith('#')
                        ? texto.slice(1).split(' ')[0].toLowerCase()
                        : '';

                    // Al detectar el comando base, eliminamos el sufijo numérico
                    // para que #harem2 → base='harem', #slist3 → base='slist', etc.
                    const comandoBase = comando.replace(/\d+$/, '');

                    const comandosPersonajes = [
                        'roll', 'rw', 'rollwaifu',
                        'harem', 'waifus', 'claims',
                        'deletewaifu', 'delwaifu', 'delchar',
                        'givechar', 'givewaifu', 'regalar',
                        'giveallharem',
                        'sell', 'vender',
                        'removesale', 'removerventa',
                        'haremshop', 'tiendawaifus', 'wshop',
                        'trade', 'intercambiar',
                        'accepttrade', 'aceptartrade', 'confirmtrade',
                        'canceltrade', 'cancelartrade', 'rejecttrade', 'rechazartrade',
                        'gachainfo', 'ginfo', 'infogacha',
                        'charimage', 'waifuimage', 'cimage', 'wimage',
                        'charinfo', 'winfo', 'waifuinfo',
                        'charvideo', 'waifuvideo', 'cvideo', 'wvideo',
                        'waifusboard', 'waifustop', 'topwaifus', 'wtop',
                        'favoritetop', 'favtop',
                        'serieinfo', 'ainfo', 'animeinfo',
                        'serielist', 'slist', 'animelist',
                        'vote', 'votar',
                        'setclaimmsg', 'setclaim',
                        'delclaimmsg',
                        'buyshop', 'comprarshop', 'bshop', 'buychar', 'buyc',
                        'claim', 'c', 'reclamar',
                        'coleccion', 'colección', 'catalog', 'catalogo', 'colec',
                        'addchar', 'addwaifu', 'darharem',
                        'removechar', 'quitarchar', 'delchar',
                        'deleteharem', 'haremdel', 'borrarharem', 'clearharem',
                        'fixdupe'
                    ];

                    if (comandosPersonajes.includes(comandoBase)) {
                        // ── Gate global para comandos gacha — MISMAS restricciones que manejarMensaje ─
                        const jidG     = msg.key.remoteJid;
                        const esGrupoG = jidG?.endsWith('@g.us');

                        // Resolución correcta del JID (incluye @lid → @s.whatsapp.net)
                        const senderRawG = msg.key.fromMe
                            ? (sock.user?.id || '').replace(/:\d+@/, '@')
                            : esGrupoG
                                ? (msg.key.participant || jidG).replace(/:\d+@/, '@')
                                : jidG;
                        const senderG = resolverJid(senderRawG);

                        // 1. chatHabilitado — gate maestro.
                        //    Por defecto todos los chats están DESACTIVADOS.
                        //    Solo el SUPER_OWNER puede actuar en chats no activados.
                        if (!isSuperOwner(senderG)) {
                            const chatDataG = getGrupo(jidG);
                            if (!chatDataG.chatHabilitado) return;
                        }

                        // 2. Bot apagado globalmente (#on/#off global)
                        if (!getBotActivo()) {
                            await sock.sendMessage(jidG, { text: '⚠️ El bot está apagado. Solo el owner puede activarlo con *#on*.' });
                            return;
                        }

                        // 3. Modo mantenimiento
                        if (getModoMantenimiento() && !isOwner(senderG)) {
                            await sock.sendMessage(jidG, { text: getMensajeMantenimiento() });
                            return;
                        }

                        // 4. Bot apagado en el grupo (#on/#off de grupo)
                        if (esGrupoG && getGrupo(jidG)?.botActivo === false && !isOwner(senderG)) {
                            await sock.sendMessage(jidG, { text: '⚠️ El bot está desactivado en este grupo. Un admin puede usar *#on* para reactivarlo.' });
                            return;
                        }

                        // 5. Solo admin (#onlyadmin)
                        if (esGrupoG && getGrupo(jidG)?.soloAdmin && !esAdmin(groupMetadata, senderG) && !isOwner(senderG)) {
                            await sock.sendMessage(jidG, { text: '⛔ Solo los administradores y owners pueden usar comandos en este grupo.' });
                            return;
                        }

                        // 6. Mutebot
                        if (esGrupoG) {
                            const gDataG = getGrupo(jidG);
                            if (esMuteadoBot(gDataG, senderG) && !isOwner(senderG)) {
                                await sock.sendMessage(jidG, { text: '⛔ Estás silenciado en este grupo y no puedes usar comandos.' });
                                return;
                            }
                        }

                        await manejarMensajePersonajes(sock, msg);
                    } else {
                        await manejarMensaje(sock, msg, groupMetadata);
                    }
                } catch (err) {
                    console.error('Error procesando mensaje:', err.message);
                }
            }
        });

    } catch (err) {
        corriendo = false;
        intentosReconexion++;
        const demora = Math.min(3000 * intentosReconexion, 30_000);
        console.error(`Error iniciando bot (intento ${intentosReconexion}):`, err.message);
        await esperar(demora);
        iniciarBot();
    }
}

// ── Caché de metadatos de grupo (evita fetch repetido en cada evento) ────
// Clave: groupJid, Valor: { meta, ts }  — TTL 10 minutos
const _groupMetaCache = new Map();
async function getGroupMeta(sock, groupJid) {
    const cached = _groupMetaCache.get(groupJid);
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) return cached.meta;
    try {
        const meta = await sock.groupMetadata(groupJid);
        _groupMetaCache.set(groupJid, { meta, ts: Date.now() });
        return meta;
    } catch { return null; }
}

// ── Servidor keep-alive + panel web ─────────────────────────────────────
const PORT = process.env.PORT || 3000;
const _botStart = new Date().toISOString();

const _server = http.createServer(async (req, res) => {
    const parsed  = require('url').parse(req.url || '/', true);
    const url     = parsed.pathname;

    // ── Pinterest OAuth: paso 1 — redirigir al consentimiento ──────────────
    if (url === '/pinterest/auth') {
        const appId       = process.env.PINTEREST_APP_ID;
        const redirectUri = `https://${process.env.REPLIT_DEV_DOMAIN}/pinterest/callback`;
        if (!appId) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('❌ PINTEREST_APP_ID no configurado.');
            return;
        }
        const scope      = 'pins:read,boards:read,user_accounts:read';
        const authUrl    = `https://www.pinterest.com/oauth/?` +
            `client_id=${encodeURIComponent(appId)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=code` +
            `&scope=${encodeURIComponent(scope)}`;
        res.writeHead(302, { Location: authUrl });
        res.end();
        return;
    }

    // ── Pinterest OAuth: paso 2 — canjear code por access_token ───────────
    if (url === '/pinterest/callback') {
        const code        = parsed.query.code;
        const error       = parsed.query.error;
        const appId       = process.env.PINTEREST_APP_ID;
        const appSecret   = process.env.PINTEREST_APP_SECRET;
        const redirectUri = `https://${process.env.REPLIT_DEV_DOMAIN}/pinterest/callback`;

        if (error || !code) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`❌ Autorización rechazada: ${error || 'sin código'}`);
            return;
        }

        try {
            const axios   = require('axios');
            const params  = new URLSearchParams({
                grant_type  : 'authorization_code',
                code,
                redirect_uri: redirectUri,
            });
            const tokenRes = await axios.post(
                'https://api.pinterest.com/v5/oauth/token',
                params.toString(),
                {
                    headers: {
                        'Content-Type' : 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
                    },
                    timeout: 15000,
                }
            );
            const d          = tokenRes.data;
            const expiresAt  = Math.floor(Date.now() / 1000) + (d.expires_in || 2592000) - 300;
            const tokenData  = {
                access_token : d.access_token,
                refresh_token: d.refresh_token || null,
                expires_at   : expiresAt,
            };

            // Guardar en disco para que pinterest.js lo lea
            const tokenFile = path.join(__dirname, 'data', 'pinterest_token.json');
            fs.writeFileSync(tokenFile, JSON.stringify(tokenData, null, 2));

            // También actualizar la variable de entorno en este proceso
            process.env.PINTEREST_ACCESS_TOKEN = d.access_token;

            console.log('[Pinterest] ✅ Token OAuth guardado correctamente. Expira:', new Date(expiresAt * 1000).toLocaleDateString());

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Pinterest conectado</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fff0f3;}
.card{background:#fff;border-radius:16px;padding:40px 48px;box-shadow:0 4px 24px #e0005520;text-align:center;max-width:400px;}
h2{color:#e60023;margin-bottom:8px;}p{color:#555;}</style></head>
<body><div class="card">
<h2>✅ Pinterest conectado</h2>
<p>El token fue guardado correctamente.<br>Ya puedes usar <strong>#pin &lt;búsqueda&gt;</strong> en WhatsApp.</p>
<p style="margin-top:24px;font-size:13px;color:#aaa;">Expira: ${new Date(expiresAt * 1000).toLocaleDateString('es-ES', { day:'2-digit', month:'long', year:'numeric' })}</p>
</div></body></html>`);
        } catch (e) {
            console.error('[Pinterest] ❌ Error al canjear token OAuth:', e.response?.data || e.message);
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`❌ Error al obtener el token: ${JSON.stringify(e.response?.data || e.message)}`);
        }
        return;
    }

    if (url === '/dashboard' || url === '/panel') {
        renderDashboard(req, res);
        return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: 'Nexus-Bot',
        uptime: process.uptime().toFixed(0) + 's',
        started: _botStart,
        hora: new Date().toISOString(),
        panel: '/dashboard'
    }));
});

function iniciarServidor(puerto) {
    _server.listen(puerto, '0.0.0.0', () => {
        console.log(`🌐 Servidor keep-alive activo en el puerto ${puerto}`);

        // Auto-ping interno cada 4 minutos
        const urlPropia = process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : `http://localhost:${puerto}`;

        setInterval(() => {
            const mod = urlPropia.startsWith('https') ? require('https') : http;
            mod.get(urlPropia, (r) => {
                console.log(`🔄 Auto-ping OK [${new Date().toLocaleTimeString()}] — uptime: ${process.uptime().toFixed(0)}s`);
                r.resume();
            }).on('error', () => {});
        }, 4 * 60 * 1000);
    });

    _server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️  Puerto ${puerto} ocupado, reintentando en ${puerto + 1}...`);
            setTimeout(() => iniciarServidor(puerto + 1), 1000);
        } else {
            console.error('❌ Error servidor keep-alive:', err.message);
        }
    });
}

iniciarServidor(PORT);

// ── Backup automático cada hora ──────────────────────────────────────────
iniciarBackupAutomatico(60 * 60 * 1000);
// Diferir migración de duplicados: costosa (O(usuarios×harem)), no debe bloquear el arranque
setTimeout(() => migracionDuplicados(), 8000);

// ── Manejo de errores globales para evitar caídas silenciosas ─────────────
process.on('uncaughtException', (err) => {
    logError('Error no capturado', err);
});

process.on('unhandledRejection', (reason) => {
    if (reason instanceof Error) {
        logError('Promesa rechazada', reason);
    } else if (typeof reason === 'string') {
        logWarn(`Promesa rechazada: ${reason}`);
    } else {
        console.error('❌ Promesa rechazada: [objeto interno de Baileys - ignorado]');
    }
});

logInfo('Nexus-Bot iniciando...');
// ── Validar integridad del JSON de personajes al arrancar ────────────────
// Detecta tags vacíos, duplicados y nombres repetidos. Solo muestra avisos.
validarIntegridadPersonajes();
// ── Auto-actualizar yt-dlp al arrancar (no bloquea el inicio del bot) ────
actualizarYtdlp();
iniciarBot();
