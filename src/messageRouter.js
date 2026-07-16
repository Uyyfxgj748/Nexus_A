/**
 * messageRouter.js — Lógica de despacho de mensajes entrantes, compartida
 * entre el socket principal (index.js) y cada socket de Sub-Bot (subbots.js).
 *
 * Por qué existe este archivo:
 * Antes esta lógica vivía inline dentro del listener 'messages.upsert' de
 * index.js. Cuando se agregaron los Sub-Bots, cada socket de sub-bot necesita
 * exactamente las mismas validaciones (gates de chatHabilitado, mantenimiento,
 * onlyadmin, mutebot, etc.) que el bot principal — de lo contrario un sub-bot
 * podría saltarse restricciones que el bot principal respeta. Centralizarlo
 * aquí garantiza que ambos casos usen el mismo código, sin duplicar el gate.
 */

const { registrarParticipantes, resolverJid, migrarCuentasLid, getLidMap } = require('./lidResolver');
const { isOwner, isSuperOwner } = require('./owners');
const { getGrupo } = require('./database');
const { esAdmin, esMuteadoBot } = require('./admin');
const { manejarMensaje, getBotActivo, getModoMantenimiento, getMensajeMantenimiento } = require('./handler');
const { manejarMensajePersonajes } = require('./personajes');

// Comandos que pertenecen al módulo de personajes/gacha — deben pasar por
// manejarMensajePersonajes() en lugar de manejarMensaje().
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
    'setmessageclaim', 'setgroupclaim',
    'delmessageclaim', 'delgroupclaim',
    'buyshop', 'comprarshop', 'bshop', 'buychar', 'buyc',
    'claim', 'c', 'reclamar',
    'coleccion', 'colección', 'catalog', 'catalogo', 'colec',
    'addchar', 'addwaifu', 'darharem',
    'removechar', 'quitarchar', 'delchar',
    'deleteharem', 'haremdel', 'borrarharem', 'clearharem',
    'fixdupe'
];

/**
 * Extrae el texto y el comando base (sin sufijo numérico) de un mensaje,
 * sin aplicar ningún gate. Usado por subbots.js para llevar estadísticas
 * de uso sin duplicar el parseo de texto.
 */
function extraerComando(msg) {
    const texto = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text || ''
    ).trim();
    const comando = texto.startsWith('#')
        ? texto.slice(1).split(' ')[0].toLowerCase().replace(/\d+$/, '')
        : '';
    return { texto, comando };
}

/**
 * Procesa un único mensaje entrante para el socket dado (principal o sub-bot).
 * Contiene exactamente el mismo gate que index.js usaba inline.
 */
async function procesarMensajeEntrante(sock, msg) {
    try {
        // Ignorar mensajes de estado
        if (msg.key.remoteJid === 'status@broadcast') return;

        // Ignorar protocolMessages (edits, deletes, reactions, etc.)
        if (msg.message?.protocolMessage) return;
        if (msg.message?.reactionMessage)  return;
        if (msg.message?.pollUpdateMessage) return;

        // Permitir mensajes propios solo si son comandos (#)
        if (msg.key.fromMe) {
            const textoPropio = (
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text || ''
            ).trim();
            if (!textoPropio.startsWith('#')) return;
        }

        let groupMetadata = null;
        if (msg.key.remoteJid?.endsWith('@g.us')) {
            try {
                groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
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

        const comandoBase = comando.replace(/\d+$/, '');

        if (comandosPersonajes.includes(comandoBase)) {
            // ── Gate global para comandos gacha — MISMAS restricciones que manejarMensaje ─
            const jidG     = msg.key.remoteJid;
            const esGrupoG = jidG?.endsWith('@g.us');

            const senderRawG = msg.key.fromMe
                ? (sock.user?.id || '').replace(/:\d+@/, '@')
                : esGrupoG
                    ? (msg.key.participant || jidG).replace(/:\d+@/, '@')
                    : jidG;
            const senderG = resolverJid(senderRawG);

            if (!isSuperOwner(senderG)) {
                const chatDataG = getGrupo(jidG);
                if (!chatDataG.chatHabilitado) return;
            }

            if (!getBotActivo()) {
                await sock.sendMessage(jidG, { text: '⚠️ El bot está apagado. Solo el owner puede activarlo con *#on*.' });
                return;
            }

            if (getModoMantenimiento() && !isOwner(senderG)) {
                await sock.sendMessage(jidG, { text: getMensajeMantenimiento() });
                return;
            }

            if (esGrupoG && getGrupo(jidG)?.botActivo === false && !isOwner(senderG)) {
                await sock.sendMessage(jidG, { text: '⚠️ El bot está desactivado en este grupo. Un admin puede usar *#on* para reactivarlo.' });
                return;
            }

            if (esGrupoG && getGrupo(jidG)?.soloAdmin && !esAdmin(groupMetadata, senderG) && !isOwner(senderG)) {
                await sock.sendMessage(jidG, { text: '⛔ Solo los administradores y owners pueden usar comandos en este grupo.' });
                return;
            }

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

module.exports = { procesarMensajeEntrante, extraerComando };
