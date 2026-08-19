const { getUsuario, guardarUsuario } = require('./database');
const { H, F, FS, FI, OK, ERR, WARN, INFO, barra, nombre: fmt } = require('./style');

const COOLDOWN_REP = 24 * 60 * 60 * 1000;

const RANGOS_REP = [
    { min: 200, nombre: 'VIP',        icono: '♛' },
    { min: 100, nombre: 'Estrella',   icono: '☆'  },
    { min: 50,  nombre: 'Respetado',  icono: '◈'  },
    { min: 20,  nombre: 'Conocido',   icono: '◆'  },
    { min: 5,   nombre: 'Activo',     icono: '◇'  },
    { min: 0,   nombre: 'Novato',     icono: '⊹'  },
];

function rangoRep(rep) {
    return RANGOS_REP.find(r => rep >= r.min) || RANGOS_REP[RANGOS_REP.length - 1];
}

async function cmdDarRep(sock, jid, senderJid, mencionados, pushName) {
    if (!mencionados || !mencionados.length) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#rep @usuario*\nDa +1 de reputación a alguien.` });
        return;
    }
    const targetId = mencionados[0];
    if (targetId === senderJid) {
        await sock.sendMessage(jid, { text: `${ERR} No puedes darte reputación a ti mismo.` });
        return;
    }
    const u = getUsuario(senderJid);
    if (!u.repDado) u.repDado = {};
    const ahora = Date.now();
    if (u.repDado[targetId] && ahora - u.repDado[targetId] < COOLDOWN_REP) {
        const restante = COOLDOWN_REP - (ahora - u.repDado[targetId]);
        const h = Math.floor(restante / 3600000);
        const m = Math.floor((restante % 3600000) / 60000);
        await sock.sendMessage(jid, { text: `${WARN} Ya le diste rep a este usuario hoy. Vuelve en *${h}h ${m}m*.` });
        return;
    }
    const uTarget = getUsuario(targetId);
    uTarget.reputacion = (uTarget.reputacion || 0) + 1;
    guardarUsuario(targetId, uTarget);
    u.repDado[targetId] = ahora;
    guardarUsuario(senderJid, u);

    const nA = fmt(senderJid, pushName);
    const nT = fmt(targetId, uTarget.pushName);
    const rango = rangoRep(uTarget.reputacion);

    await sock.sendMessage(jid, {
        text: `${H('+1 Reputacion')}\n\n${F} De » ${nA}\n${F} Para » ${nT}\n\n${FI} Reputación actual » *${uTarget.reputacion}* — _${rango.icono} ${rango.nombre}_`
    });
}

async function cmdVerRep(sock, jid, senderJid, mencionados) {
    const targetId = (mencionados && mencionados.length) ? mencionados[0] : senderJid;
    const u = getUsuario(targetId);
    const rep = u.reputacion || 0;
    const rango = rangoRep(rep);
    const capRep = Math.min(rep, 200);
    const bar = barra(capRep, 200, 12);
    const n = fmt(targetId, u.pushName);

    await sock.sendMessage(jid, {
        text: `${H(`Reputacion de ${n}`)}\n\n${FI} Puntos » *${rep}*\n${FS} Rango » *${rango.icono} ${rango.nombre}*\n\n| [${bar}] ${rep}/200`
    });
}

async function cmdTopRep(sock, jid, pagina = 1) {
    const { cargarUsuarios } = require('./database');
    const { paginar, piePagina, emblema } = require('./paginator');
    const db = cargarUsuarios();
    const todos = Object.entries(db)
        .map(([id, u]) => ({ id, rep: u.reputacion || 0, pushName: u.pushName }))
        .filter(x => x.rep > 0)
        .sort((a, b) => b.rep - a.rep);
    if (!todos.length) {
        await sock.sendMessage(jid, { text: `${INFO} Nadie tiene reputación todavía.` });
        return;
    }
    const { items: ranking, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    const txt = ranking.map((x, i) => {
        const n = fmt(x.id, x.pushName);
        return `${emblema(inicio + i)} ${n} — *${x.rep} rep*`;
    }).join('\n');
    await sock.sendMessage(jid, {
        text: `${H('Top Reputacion')}\n\n${txt}${piePagina(pag, totalPags, 'reptop')}`
    });
}

module.exports = { cmdDarRep, cmdVerRep, cmdTopRep };
