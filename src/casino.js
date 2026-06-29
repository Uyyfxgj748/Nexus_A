const fs = require('fs-extra');
const path = require('path');
const { getUsuario, guardarUsuario } = require('./database');
const { obtenerEventoActivo } = require('./extras');
const { H, F, FI, FC, FE, OK, ERR, WARN, INFO, DIV } = require('./style');

// ══════════════════════════════════════════
//  BLACKJACK
// ══════════════════════════════════════════
const PALOS = ['♠', '♥', '♦', '♣'];
const VALORES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function crearBaraja() {
    const b = [];
    for (const p of PALOS) for (const v of VALORES) b.push({ p, v });
    for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
}

function valorCarta(v) {
    if (['J', 'Q', 'K'].includes(v)) return 10;
    if (v === 'A') return 11;
    return parseInt(v);
}

function calcularMano(mano) {
    let total = mano.reduce((a, c) => a + valorCarta(c.v), 0);
    let ases = mano.filter(c => c.v === 'A').length;
    while (total > 21 && ases > 0) { total -= 10; ases--; }
    return total;
}

function mostrarMano(mano, ocultar = false) {
    if (ocultar) return `${mano[0].p}${mano[0].v} | ??`;
    return mano.map(c => `${c.p}${c.v}`).join(' ');
}

const partidas_bj = new Map();

async function cmdBlackjack(sock, jid, senderJid, args) {
    const apuesta = parseInt(args[0]);
    if (isNaN(apuesta) || apuesta < 500) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#blackjack [apuesta]*\nMínimo: *500 ⓃNexCoins*\nEj: *#blackjack 5000*` });
        return;
    }
    if (partidas_bj.has(senderJid)) {
        await sock.sendMessage(jid, { text: `${WARN} Ya tienes una partida activa. Usa *#hit* o *#stand*` });
        return;
    }
    const u = getUsuario(senderJid);
    if ((u.monedas || 0) < apuesta) {
        await sock.sendMessage(jid, { text: `${ERR} No tienes suficientes ⓃNexCoins. Tienes *${(u.monedas || 0).toLocaleString()}*.` });
        return;
    }
    u.monedas -= apuesta;
    guardarUsuario(senderJid, u);

    const baraja = crearBaraja();
    const jugador = [baraja.pop(), baraja.pop()];
    const dealer = [baraja.pop(), baraja.pop()];

    const timeout = setTimeout(async () => {
        if (partidas_bj.has(senderJid)) {
            const p = partidas_bj.get(senderJid);
            partidas_bj.delete(senderJid);
            await sock.sendMessage(jid, { text: `${WARN} Tiempo agotado en tu blackjack. Perdiste *${p.apuesta.toLocaleString()} ⓃNexCoins*.` }).catch(() => {});
        }
    }, 120000);

    partidas_bj.set(senderJid, { jugador, dealer, baraja, apuesta, jid, timeout });

    const pj = calcularMano(jugador);
    if (pj === 21) {
        partidas_bj.delete(senderJid);
        clearTimeout(timeout);
        const ganancia = Math.floor(apuesta * 2.5);
        const uu = getUsuario(senderJid);
        uu.monedas = (uu.monedas || 0) + ganancia;
        if (!uu.contadores) uu.contadores = {};
        uu.contadores.victoriasBJ = (uu.contadores.victoriasBJ || 0) + 1;
        guardarUsuario(senderJid, uu);
        await sock.sendMessage(jid, {
            text: `${H('BLACKJACK NATURAL — x2.5')}\n\n${F} Tu mano » ${mostrarMano(jugador)} = *21*\n\n${FE} Ganaste » *${ganancia.toLocaleString()} ⓃNexCoins*`
        });
        return;
    }
    await sock.sendMessage(jid, {
        text: `${H(`BLACKJACK — Apuesta: ${apuesta.toLocaleString()} ⓃNC`)}\n\n${FC} Dealer » ${mostrarMano(dealer, true)}\n${F} Tu mano » ${mostrarMano(jugador)} = *${pj}*\n\n_*#hit* para pedir carta  |  *#stand* para plantarte_`
    });
}

async function cmdHit(sock, jid, senderJid) {
    if (!partidas_bj.has(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} No tienes una partida activa. Usa *#blackjack [apuesta]*` });
        return;
    }
    const p = partidas_bj.get(senderJid);
    if (p.jid !== jid) return;
    p.jugador.push(p.baraja.pop());
    const pj = calcularMano(p.jugador);
    if (pj > 21) {
        clearTimeout(p.timeout);
        partidas_bj.delete(senderJid);
        await sock.sendMessage(jid, {
            text: `${H('BLACKJACK')}\n\n${F} Tu mano » ${mostrarMano(p.jugador)} = *${pj}*\n\n${ERR} *Te pasaste.* Perdiste *${p.apuesta.toLocaleString()} ⓃNexCoins*`
        });
        return;
    }
    if (pj === 21) {
        await cmdStand(sock, jid, senderJid);
        return;
    }
    await sock.sendMessage(jid, {
        text: `${H('BLACKJACK')}\n\n${FC} Dealer » ${mostrarMano(p.dealer, true)}\n${F} Tu mano » ${mostrarMano(p.jugador)} = *${pj}*\n\n_*#hit* para pedir  |  *#stand* para plantarte_`
    });
}

async function cmdStand(sock, jid, senderJid) {
    if (!partidas_bj.has(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} No tienes una partida activa.` });
        return;
    }
    const p = partidas_bj.get(senderJid);
    if (p.jid !== jid) return;
    clearTimeout(p.timeout);
    partidas_bj.delete(senderJid);

    while (calcularMano(p.dealer) < 17) p.dealer.push(p.baraja.pop());

    const pj = calcularMano(p.jugador);
    const pd = calcularMano(p.dealer);
    const u = getUsuario(senderJid);

    let resultado = '';
    let ganancia = 0;
    if (pd > 21 || pj > pd) {
        ganancia = p.apuesta * 2;
        u.monedas = (u.monedas || 0) + ganancia;
        if (!u.contadores) u.contadores = {};
        u.contadores.victoriasBJ = (u.contadores.victoriasBJ || 0) + 1;
        resultado = `${OK} *GANASTE* — +${ganancia.toLocaleString()} ⓃNexCoins`;
    } else if (pj === pd) {
        ganancia = p.apuesta;
        u.monedas = (u.monedas || 0) + ganancia;
        resultado = `${FI} *EMPATE* — Te devolvemos ${ganancia.toLocaleString()} ⓃNexCoins`;
    } else {
        resultado = `${ERR} *Dealer gana.* Perdiste ${p.apuesta.toLocaleString()} ⓃNexCoins`;
    }
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, {
        text: `${H('BLACKJACK — Resultado')}\n\n${FC} Dealer » ${mostrarMano(p.dealer)} = *${pd > 21 ? 'BUST' : pd}*\n${F} Tu mano » ${mostrarMano(p.jugador)} = *${pj}*\n\n${resultado}\n${FE} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`
    });
}

// ══════════════════════════════════════════
//  SLOTS ANIMADOS
// ══════════════════════════════════════════
const SIMBOLOS = ['♧', '◆', '◇', '☆', '◈', '7', '⛀'];

const CASINO_PATH = path.join(__dirname, '../data/casino.json');

function _cargarJackpot() {
    try {
        if (fs.existsSync(CASINO_PATH)) {
            const data = fs.readJsonSync(CASINO_PATH);
            if (data && typeof data.monto === 'number' && data.monto >= 500000) return data;
        }
    } catch (_) {}
    return { monto: 500000 };
}

const JACKPOT_POOL = _cargarJackpot();

function persistirJackpot() {
    try { fs.writeJsonSync(CASINO_PATH, JACKPOT_POOL); } catch (_) {}
}

const _sleep = ms => new Promise(r => setTimeout(r, ms));
const _rand  = () => SIMBOLOS[Math.floor(Math.random() * SIMBOLOS.length)];

function _buildFrame(a, b, c, footer) {
    return `${H('S L O T S')}\n\n┌─────────────────┐\n│   ${a}  ${b}  ${c}   │\n└─────────────────┘\n\n${footer}`;
}

async function cmdSlots(sock, jid, senderJid, args) {
    const apuesta = parseInt(args[0]) || 5000;
    if (apuesta < 2000) {
        await sock.sendMessage(jid, { text: `${ERR} Apuesta mínima de slots: *2,000 ⓃNexCoins*\nEj: *#slots 10000*` });
        return;
    }
    const u = getUsuario(senderJid);
    if ((u.monedas || 0) < apuesta) {
        await sock.sendMessage(jid, { text: `${ERR} No tienes suficientes ⓃNexCoins. Tienes *${(u.monedas || 0).toLocaleString()} ⓃNexCoins*.` });
        return;
    }

    u.monedas -= apuesta;
    JACKPOT_POOL.monto += Math.floor(apuesta * 0.1);
    persistirJackpot();
    if (!u.contadores) u.contadores = {};
    u.contadores.slotsJugados = (u.contadores.slotsJugados || 0) + 1;

    const s1 = SIMBOLOS[Math.floor(Math.random() * SIMBOLOS.length)];
    const s2 = SIMBOLOS[Math.floor(Math.random() * SIMBOLOS.length)];
    const s3 = SIMBOLOS[Math.floor(Math.random() * SIMBOLOS.length)];

    const sent = await sock.sendMessage(jid, {
        text: _buildFrame('◇', '◇', '◇', '_Girando..._')
    });
    const key = sent?.key;

    await _sleep(650);
    if (key) await sock.sendMessage(jid, { text: _buildFrame(_rand(), _rand(), _rand(), '_Girando..._'), edit: key });
    await _sleep(650);
    if (key) await sock.sendMessage(jid, { text: _buildFrame(s1, _rand(), _rand(), `_${s1} — Rodillo 1 detenido..._`), edit: key });
    await _sleep(700);
    if (key) await sock.sendMessage(jid, { text: _buildFrame(s1, s2, _rand(), `_${s1} ${s2} — Rodillo 2 detenido..._`), edit: key });
    await _sleep(750);

    let ganancia = 0;
    let msg = '';

    if (s1 === s2 && s2 === s3) {
        if (s1 === '7') {
            ganancia = JACKPOT_POOL.monto;
            u.contadores.jackpotsGanados = (u.contadores.jackpotsGanados || 0) + 1;
            JACKPOT_POOL.monto = 500000;
            persistirJackpot();
            msg = `${OK} *JACKPOT* — Ganaste *${ganancia.toLocaleString()} ⓃNexCoins*`;
        } else if (s1 === '◈') {
            ganancia = apuesta * 10;
            msg = `${FI} *TRIPLE ◈ — x10* — +*${ganancia.toLocaleString()} ⓃNexCoins*`;
        } else if (s1 === '☆') {
            ganancia = apuesta * 5;
            msg = `${F} *TRIPLE ☆ — x5* — +*${ganancia.toLocaleString()} ⓃNexCoins*`;
        } else {
            ganancia = apuesta * 3;
            msg = `${OK} *TRIPLE — x3* — +*${ganancia.toLocaleString()} ⓃNexCoins*`;
        }
    } else if (s1 === s2 || s2 === s3 || s1 === s3) {
        ganancia = Math.floor(apuesta * 1.5);
        msg = `${OK} *PAR — x1.5* — +*${ganancia.toLocaleString()} ⓃNexCoins*`;
    } else {
        ganancia = 0;
        msg = `${ERR} Sin suerte. Perdiste *${apuesta.toLocaleString()} ⓃNexCoins*`;
    }

    const evSlots = obtenerEventoActivo(jid);
    if (ganancia > 0 && s1 !== '7') {
        if (evSlots?.tipo === 'fiebre_casino') {
            ganancia *= 2;
            msg += '\n| Fiebre de Casino — Ganancias x2';
        } else if (evSlots?.tipo === 'jackpot_fest' && s1 === s2 && s2 === s3) {
            ganancia = Math.floor(ganancia * 3);
            msg += '\n| Jackpot Fest — Premio x3';
        }
    }

    u.monedas = (u.monedas || 0) + ganancia;
    guardarUsuario(senderJid, u);

    const footerFinal = `${msg}\n\n${FE} Saldo » *${u.monedas.toLocaleString()} ⓃNC*\n${FI} Jackpot » *${JACKPOT_POOL.monto.toLocaleString()} ⓃNC*`;

    if (key) {
        await sock.sendMessage(jid, { text: _buildFrame(s1, s2, s3, footerFinal), edit: key });
    } else {
        await sock.sendMessage(jid, { text: _buildFrame(s1, s2, s3, footerFinal) });
    }
}

async function cmdJackpot(sock, jid) {
    await sock.sendMessage(jid, {
        text: `${H('Jackpot Actual')}\n\n${FI} Pozo » *${JACKPOT_POOL.monto.toLocaleString()} ⓃNexCoins*\n\n_Saca 7 7 7 en *#slots* para ganarlo._\n_El pozo crece 10% con cada jugada._`
    });
}

module.exports = { cmdBlackjack, cmdHit, cmdStand, cmdSlots, cmdJackpot };
