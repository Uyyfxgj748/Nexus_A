const { getUsuario, guardarUsuario } = require('./database');
const { H, SH, F, FS, FL, FI, FC, FA, FP, FT, FR, FE, OK, ERR, WARN, INFO, DIV, barra, nivelInfo, nombre: fmt } = require('./style');

function calcularStatsUsuario(u) {
    if (!u.stats) u.stats = { fuerza: 10, defensa: 10, suerte: 10, xp: 0, nivel: 1 };
    return u.stats;
}

function subirNivel(stats) {
    let subio = false;
    while (stats.xp >= stats.nivel * 100) {
        stats.xp -= stats.nivel * 100;
        stats.nivel++;
        stats.fuerza += 2;
        stats.defensa += 2;
        stats.suerte += 1;
        subio = true;
    }
    return subio;
}

// ══════════════════════════════════════════
//  VER STATS
// ══════════════════════════════════════════
async function cmdStats(sock, jid, senderJid, mencionados) {
    const targetId = (mencionados && mencionados.length > 0) ? mencionados[0] : senderJid;
    const u = getUsuario(targetId);
    const s = calcularStatsUsuario(u);
    const c = u.contadores || {};
    const xpNeeded = s.nivel * 100;
    const ni = nivelInfo(s.nivel);
    const barXp = barra(s.xp, xpNeeded);

    const txt =
`${H(`${ni.icono} Stats de Combate`)}

${FS} Nivel » *${s.nivel}* — _${ni.nombre}_
${FS} XP » *${s.xp}/${xpNeeded}*
| [${barXp}]

${FA} Fuerza » *${s.fuerza}*
${FC} Defensa » *${s.defensa}*
${FI} Suerte » *${s.suerte}*

${OK} Victorias » *${c.victorias || 0}*
${ERR} Derrotas » *${c.derrotas || 0}*
${F} Combates totales » *${c.combates || 0}*`;

    await sock.sendMessage(jid, { text: txt });
}

// ══════════════════════════════════════════
//  ENTRENAR  (cooldown: 30 min)
// ══════════════════════════════════════════
async function cmdTrain(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const ahora = Date.now();
    const cooldown = 30 * 60 * 1000;
    if (!u.cooldowns) u.cooldowns = {};
    if (u.cooldowns.train && ahora - u.cooldowns.train < cooldown) {
        const restante = cooldown - (ahora - u.cooldowns.train);
        const m = Math.ceil(restante / 60000);
        await sock.sendMessage(jid, { text: `${WARN} Necesitas descansar. Entrena de nuevo en *${m} minutos*.` });
        return;
    }
    const s = calcularStatsUsuario(u);
    const xpGanada = Math.floor(Math.random() * 30) + 10;
    s.xp += xpGanada;
    const subio = subirNivel(s);
    u.stats = s;
    u.cooldowns.train = ahora;
    if (!u.contadores) u.contadores = {};
    u.contadores.entrenamientos = (u.contadores.entrenamientos || 0) + 1;
    guardarUsuario(senderJid, u);

    let msg = `${H('Entrenamiento Completado')}\n\n${FS} XP ganada » *+${xpGanada}* → ${s.xp}/${s.nivel * 100}`;
    if (subio) {
        const ni = nivelInfo(s.nivel);
        msg += `\n\n${FI} *Subiste al nivel ${s.nivel}* — _${ni.nombre}_\n${FA} Fuerza » *${s.fuerza}* ${FC} Defensa » *${s.defensa}* ${FI} Suerte » *${s.suerte}*`;
    }
    await sock.sendMessage(jid, { text: msg });
}

// ══════════════════════════════════════════
//  PELEAR  (cooldown: 5 min)
// ══════════════════════════════════════════
async function cmdFight(sock, jid, senderJid, mencionados, pushName) {
    if (!mencionados || !mencionados.length) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#fight @usuario*\nReta a alguien a combate PVP.` });
        return;
    }
    const targetId = mencionados[0];
    if (targetId === senderJid) {
        await sock.sendMessage(jid, { text: `${ERR} No puedes pelear contigo mismo.` });
        return;
    }
    const uA = getUsuario(senderJid);
    const uD = getUsuario(targetId);
    const ahora = Date.now();
    const cooldown = 5 * 60 * 1000;
    if (!uA.cooldowns) uA.cooldowns = {};
    if (uA.cooldowns.fight && ahora - uA.cooldowns.fight < cooldown) {
        const m = Math.ceil((cooldown - (ahora - uA.cooldowns.fight)) / 60000);
        await sock.sendMessage(jid, { text: `${WARN} Espera *${m} minutos* antes de otro combate.` });
        return;
    }

    const sA = calcularStatsUsuario(uA);
    const sD = calcularStatsUsuario(uD);

    if (!uA.itemsActivos) uA.itemsActivos = {};
    if (!uD.itemsActivos) uD.itemsActivos = {};

    let cargaPesadaMsg = '';
    let defD = sD.defensa;
    if (uA.itemsActivos.carga_pesada) {
        defD = Math.round(defD * 0.70);
        delete uA.itemsActivos.carga_pesada;
        cargaPesadaMsg = `\n${FC} Carga Pesada — Defensa enemiga reducida 30%`;
    }

    let loboMsgA = '';
    let loboMsgD = '';
    let defA = sA.defensa;
    if (uA.itemsActivos.lobo_guardian && Date.now() < uA.itemsActivos.lobo_guardian) {
        defA = Math.round(defA * 1.40);
        loboMsgA = `\n${FC} Lobo Guardian — Tu defensa es mayor`;
    }
    if (uD.itemsActivos.lobo_guardian && Date.now() < uD.itemsActivos.lobo_guardian) {
        defD = Math.round(defD * 1.40);
        const ndD = fmt(targetId, uD.pushName);
        loboMsgD = `\n${FC} Lobo Guardian de ${ndD} — Su defensa es mayor`;
    }

    const crA = (sA.suerte / 100) * Math.random() < 0.15 ? 1.5 : 1;
    const crD = (sD.suerte / 100) * Math.random() < 0.15 ? 1.5 : 1;
    const poderA = (sA.fuerza * 2 + defA * 0.5 + Math.random() * 20) * crA;
    const poderD = (sD.fuerza * 2 + defD * 0.5 + Math.random() * 20) * crD;

    const ganoA = poderA > poderD;
    const nA = fmt(senderJid, pushName);
    const nD = fmt(targetId, uD.pushName);

    const recompensa = Math.floor(Math.random() * 15000) + 5000;
    const xp = Math.floor(Math.random() * 70) + 50;

    if (!uA.contadores) uA.contadores = {};
    if (!uD.contadores) uD.contadores = {};
    uA.contadores.combates = (uA.contadores.combates || 0) + 1;
    uD.contadores.combates = (uD.contadores.combates || 0) + 1;

    if (ganoA) {
        uA.contadores.victorias = (uA.contadores.victorias || 0) + 1;
        uD.contadores.derrotas = (uD.contadores.derrotas || 0) + 1;
        uA.monedas = (uA.monedas || 0) + recompensa;
        sA.xp += xp;
        const subio = subirNivel(sA);
        uA.stats = sA;
        if (subio) uA._combateLvlUp = sA.nivel;
    } else {
        uD.contadores.victorias = (uD.contadores.victorias || 0) + 1;
        uA.contadores.derrotas = (uA.contadores.derrotas || 0) + 1;
        uD.monedas = (uD.monedas || 0) + recompensa;
        sD.xp += xp;
        const subio = subirNivel(sD);
        uD.stats = sD;
        if (subio) uD._combateLvlUp = sD.nivel;
    }

    uA.cooldowns.fight = ahora;
    guardarUsuario(senderJid, uA);
    guardarUsuario(targetId, uD);

    const criticoA = crA > 1 ? ' — *CRITICO*' : '';
    const criticoD = crD > 1 ? ' — *CRITICO*' : '';
    const ganador = ganoA ? nA : nD;
    const perdedor = ganoA ? nD : nA;

    const itemsMsgs = cargaPesadaMsg + loboMsgA + loboMsgD;

    const resultado =
`${H('COMBATE PVP')}

${FA} ${nA} ataca con *${Math.round(poderA)}* de poder${criticoA}
${FC} ${nD} defiende con *${Math.round(poderD)}* de poder${criticoD}${itemsMsgs}

${DIV}
${OK} *${ganador} gana*
${FE} +${recompensa.toLocaleString()} ⓃNexCoins ${FS} +${xp} XP
${ERR} ${perdedor} pierde`;

    await sock.sendMessage(jid, { text: resultado });
}

module.exports = { cmdStats, cmdTrain, cmdFight, getStats: calcularStatsUsuario };
