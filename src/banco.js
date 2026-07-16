const { getUsuario, guardarUsuario } = require('./database');
const { H, F, FS, FI, FC, FE, OK, ERR, WARN, INFO, barra } = require('./style');

const TASA_INTERES   = 0.05;
const TASA_PRESTAMO  = 1.5;
const MAX_INVERSION  = 5000000;
const MAX_PRESTAMO   = 300000;
const TIEMPO_INTERES = 6 * 60 * 60 * 1000;   // 6 horas
const TIEMPO_PRESTAMO = 24 * 60 * 60 * 1000; // 24 horas

// ══════════════════════════════════════════
//  INVERTIR
// ══════════════════════════════════════════
async function cmdInvertir(sock, jid, senderJid, args) {
    const cantidad = parseInt(args[0]);
    if (isNaN(cantidad) || cantidad <= 0) {
        await sock.sendMessage(jid, {
            text: `${ERR} Uso: *#invest [cantidad]*\nEj: *#invest 100000*\n\n${FS} Tasa » *5% cada 6h* (máx 24h = 20%)\n${F} Máx inversión » *5,000,000 ⓃNexCoins*`
        });
        return;
    }
    const u = getUsuario(senderJid);
    if (!u.inversion) u.inversion = { cantidad: 0, fecha: 0 };
    if (u.inversion.cantidad > 0) {
        const periodos = Math.min(Math.floor((Date.now() - u.inversion.fecha) / TIEMPO_INTERES), 4);
        const interes = Math.floor(u.inversion.cantidad * TASA_INTERES * periodos);
        await sock.sendMessage(jid, {
            text: `${WARN} Ya tienes una inversión activa de *${u.inversion.cantidad.toLocaleString()} ⓃNexCoins*.\n${FI} Intereses acumulados » *+${interes.toLocaleString()} ⓃNexCoins*\n\n_Usa *#interest* para cobrarlos._`
        });
        return;
    }
    if ((u.monedas || 0) < cantidad) {
        await sock.sendMessage(jid, { text: `${ERR} No tienes suficientes ⓃNexCoins. Tienes *${(u.monedas || 0).toLocaleString()}*.` });
        return;
    }
    const cant = Math.min(cantidad, MAX_INVERSION);
    u.monedas -= cant;
    u.inversion = { cantidad: cant, fecha: Date.now() };
    if (!u.contadores) u.contadores = {};
    u.contadores.inversiones = (u.contadores.inversiones || 0) + 1;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, {
        text: `${H('Inversion realizada')}\n\n${FE} Invertido » *${cant.toLocaleString()} ⓃNexCoins*\n${FS} Tasa » *5% cada 6h*\n${F} Máximo » *24 horas*\n\n_Usa *#interest* para reclamar ganancias._`
    });
}

// ══════════════════════════════════════════
//  RECLAMAR INTERESES
// ══════════════════════════════════════════
async function cmdInteres(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    if (!u.inversion || u.inversion.cantidad === 0) {
        await sock.sendMessage(jid, { text: `${ERR} No tienes ninguna inversión activa.\n_Invierte con *#invest [cantidad]*_` });
        return;
    }
    const elapsed = Date.now() - u.inversion.fecha;
    const periodos = Math.min(Math.floor(elapsed / TIEMPO_INTERES), 4);
    if (periodos === 0) {
        const restante = TIEMPO_INTERES - elapsed;
        const h = Math.floor(restante / 3600000);
        const m = Math.floor((restante % 3600000) / 60000);
        await sock.sendMessage(jid, {
            text: `${WARN} Aún no hay intereses disponibles.\n\n${FE} Inversión » *${u.inversion.cantidad.toLocaleString()} ⓃNexCoins*\n${F} Primer cobro en » *${h}h ${m}m*`
        });
        return;
    }
    const interes = Math.floor(u.inversion.cantidad * TASA_INTERES * periodos);
    const total = u.inversion.cantidad + interes;
    u.monedas = (u.monedas || 0) + total;
    u.inversion = { cantidad: 0, fecha: 0 };
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, {
        text: `${H('Intereses cobrados')}\n\n${FE} Capital » *${(total - interes).toLocaleString()} ⓃNexCoins*\n${FS} Ganancia (*${periodos}×5%*) » *+${interes.toLocaleString()} ⓃNexCoins*\n${FI} Total cobrado » *${total.toLocaleString()} ⓃNexCoins*\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`
    });
}

// ══════════════════════════════════════════
//  PRÉSTAMO
// ══════════════════════════════════════════
async function cmdPrestamo(sock, jid, senderJid, args) {
    const cantidad = parseInt(args[0]);
    if (isNaN(cantidad) || cantidad <= 0) {
        await sock.sendMessage(jid, {
            text: `${ERR} Uso: *#loan [cantidad]*\nEj: *#loan 50000*\n\n${WARN} Deberás pagar *×1.5* en 24h o perderás monedas automáticamente.\n${F} Máximo » *${MAX_PRESTAMO.toLocaleString()} ⓃNexCoins*`
        });
        return;
    }
    const u = getUsuario(senderJid);
    if (!u.prestamo) u.prestamo = { cantidad: 0, deuda: 0, fecha: 0 };
    if (u.prestamo.cantidad > 0) {
        const restante = Math.max(0, TIEMPO_PRESTAMO - (Date.now() - u.prestamo.fecha));
        const h = Math.floor(restante / 3600000);
        const m = Math.floor((restante % 3600000) / 60000);
        await sock.sendMessage(jid, {
            text: `${ERR} Ya tienes un préstamo de *${u.prestamo.cantidad.toLocaleString()} ⓃNexCoins*.\n${FI} Deuda » *${u.prestamo.deuda.toLocaleString()} ⓃNexCoins*\n${F} Paga en » *${h}h ${m}m*\n\n_Usa *#payloan* para pagar._`
        });
        return;
    }
    const cant = Math.min(cantidad, MAX_PRESTAMO);
    const deuda = Math.floor(cant * TASA_PRESTAMO);
    u.monedas = (u.monedas || 0) + cant;
    u.prestamo = { cantidad: cant, deuda, fecha: Date.now() };
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, {
        text: `${H('Prestamo aprobado')}\n\n${FE} Recibiste » *${cant.toLocaleString()} ⓃNexCoins*\n${FI} Deuda total (×1.5) » *${deuda.toLocaleString()} ⓃNexCoins*\n${F} Plazo » *24 horas*\n\n${WARN} Usa *#payloan* para pagar antes del vencimiento.`
    });
}

async function cmdPagarPrestamo(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    if (!u.prestamo || u.prestamo.cantidad === 0) {
        await sock.sendMessage(jid, { text: `${OK} No tienes préstamos pendientes.` });
        return;
    }
    if ((u.monedas || 0) < u.prestamo.deuda) {
        await sock.sendMessage(jid, {
            text: `${ERR} No tienes suficientes ⓃNexCoins.\n${FI} Deuda » *${u.prestamo.deuda.toLocaleString()}*  ${F} Tienes » *${u.monedas.toLocaleString()}*`
        });
        return;
    }
    const deuda = u.prestamo.deuda;
    u.monedas -= deuda;
    if (!u.contadores) u.contadores = {};
    u.contadores.prestamosOK = (u.contadores.prestamosOK || 0) + 1;
    u.prestamo = { cantidad: 0, deuda: 0, fecha: 0 };
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `${H('Prestamo pagado')}\n\n${FE} Pagaste » *${deuda.toLocaleString()} ⓃNexCoins*\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*` });
}

// ══════════════════════════════════════════
//  VER INFO BANCO
// ══════════════════════════════════════════
async function cmdBancoInfo(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const inv = u.inversion || { cantidad: 0, fecha: 0 };
    const prest = u.prestamo || { cantidad: 0, deuda: 0, fecha: 0 };

    let txt = `${H('Banco Nexus')}\n\n`;
    txt += `${FE} Cartera » *${(u.monedas || 0).toLocaleString()} ⓃNexCoins*\n`;
    txt += `${FI} Banco » *${(u.banco || 0).toLocaleString()} ⓃNexCoins*\n\n`;

    if (inv.cantidad > 0) {
        const p = Math.min(Math.floor((Date.now() - inv.fecha) / TIEMPO_INTERES), 4);
        const intAcum = Math.floor(inv.cantidad * TASA_INTERES * p);
        txt += `${FS} Inversion activa » ${inv.cantidad.toLocaleString()} ⓃNexCoins\n`;
        txt += `${FI} Intereses acumulados » *+${intAcum.toLocaleString()} ⓃNexCoins* (${p} período${p !== 1 ? 's' : ''})\n\n`;
    } else {
        txt += `${F} Sin inversión activa _(#invest)_\n\n`;
    }

    if (prest.cantidad > 0) {
        const restante = Math.max(0, TIEMPO_PRESTAMO - (Date.now() - prest.fecha));
        const h = Math.floor(restante / 3600000);
        const m = Math.floor((restante % 3600000) / 60000);
        txt += `${WARN} Prestamo pendiente » *${prest.deuda.toLocaleString()} ⓃNexCoins*\n`;
        txt += `${F} Tiempo para pagar » *${h}h ${m}m*`;
    } else {
        txt += `${F} Sin préstamos pendientes _(#loan)_`;
    }
    await sock.sendMessage(jid, { text: txt });
}

// ══════════════════════════════════════════
//  VERIFICAR DEUDAS VENCIDAS (llamar en cada mensaje)
// ══════════════════════════════════════════
function verificarDeudaVencida(userId) {
    try {
        const u = getUsuario(userId);
        if (!u.prestamo || u.prestamo.cantidad === 0) return null;
        if (Date.now() - u.prestamo.fecha > TIEMPO_PRESTAMO) {
            const deuda = u.prestamo.deuda;
            const monedasAntes = u.monedas || 0;
            const confiscado = Math.min(monedasAntes, deuda);
            u.monedas = Math.max(0, monedasAntes - deuda);
            if (!u.contadores) u.contadores = {};
            u.contadores.prestamosImpagos = (u.contadores.prestamosImpagos || 0) + 1;
            u.prestamo = { cantidad: 0, deuda: 0, fecha: 0 };
            guardarUsuario(userId, u);
            if (confiscado < deuda) {
                return `${WARN} *Deuda ejecutada.* Solo tenías *${monedasAntes.toLocaleString()} ⓃNexCoins* — todas fueron confiscadas. Debes *${(deuda - confiscado).toLocaleString()}* más.`;
            }
            return `${WARN} *Deuda ejecutada.* Se confiscaron *${deuda.toLocaleString()} ⓃNexCoins* por préstamo impago. Saldo: *${u.monedas.toLocaleString()} ⓃNC*`;
        }
    } catch { }
    return null;
}

// ══════════════════════════════════════════
//  VERIFICAR SI EL USUARIO TIENE DEUDA VENCIDA
// ══════════════════════════════════════════
function tieneDeudaVencida(userId) {
    try {
        const u = getUsuario(userId);
        if (!u.prestamo || u.prestamo.cantidad === 0) return false;
        return Date.now() - u.prestamo.fecha > TIEMPO_PRESTAMO;
    } catch { return false; }
}

// ══════════════════════════════════════════
//  SCHEDULER DE DEUDAS EN SEGUNDO PLANO
// ══════════════════════════════════════════
let _deudasInterval = null;

function iniciarSchedulerDeudas() {
    // Limpiar interval previo para evitar acumulación en reconexiones
    if (_deudasInterval) { clearInterval(_deudasInterval); _deudasInterval = null; }

    const { cargarUsuarios, guardarUsuario: _guardar } = require('./database');

    function aplicarPenalizacionesPendientes() {
        try {
            const db = cargarUsuarios();
            const ahora = Date.now();
            let penalizados = 0;
            for (const [userId, u] of Object.entries(db)) {
                if (!u.prestamo || u.prestamo.cantidad === 0) continue;
                if (ahora - u.prestamo.fecha <= TIEMPO_PRESTAMO) continue;
                const deuda = u.prestamo.deuda;
                u.monedas = Math.max(0, (u.monedas || 0) - deuda);
                if (!u.contadores) u.contadores = {};
                u.contadores.prestamosImpagos = (u.contadores.prestamosImpagos || 0) + 1;
                u.prestamo = { cantidad: 0, deuda: 0, fecha: 0 };
                _guardar(userId, u);
                penalizados++;
            }
            if (penalizados > 0) {
                console.log(`[Banco] Scheduler: ${penalizados} deuda(s) ejecutada(s) automáticamente.`);
            }
        } catch (e) {
            console.error('[Banco] Error en scheduler de deudas:', e.message);
        }
    }

    aplicarPenalizacionesPendientes();
    _deudasInterval = setInterval(aplicarPenalizacionesPendientes, 30 * 60 * 1000);
    console.log('🏦 Scheduler de deudas bancarias activo — cada 30 min.');
}

module.exports = {
    cmdInvertir, cmdInteres, cmdPrestamo, cmdPagarPrestamo, cmdBancoInfo,
    verificarDeudaVencida, tieneDeudaVencida, iniciarSchedulerDeudas
};
