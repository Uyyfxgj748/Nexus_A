const { getUsuario, guardarUsuario, agregarMonedas, quitarMonedas, cargarUsuarios } = require('./database');
const { enviarMediaLocal } = require('./mediaUtils');
const { obtenerEventoActivo } = require('./extras');
const { H, SH, F, FS, FI, FC, FE, FA, OK, ERR, WARN, INFO, DIV, barra, nivelInfo, nombre: fmt } = require('./style');
const fs = require('fs-extra');
const path = require('path');

// ── Caché del ranking global ───────────────────────────────────────────────
let _rankingCache   = null;
let _rankingCacheTs = 0;
const RANKING_CACHE_TTL = 60000;

// ── Límites de apuestas y multiplicadores ──────────────────────────────────
const MAX_COINFLIP      = 500_000;
const MAX_RULETA        = 500_000;
const MAX_MULTIPLICADOR = 2.5;

function trackear(u, tipo, n = 1) {
    if (!u.contadores) u.contadores = {};
    u.contadores[tipo] = (u.contadores[tipo] || 0) + n;
}

function verificarCarcel(u) {
    if (u.encarcelado && Date.now() < u.encarcelado) {
        const min = Math.ceil((u.encarcelado - Date.now()) / 60000);
        return `${ERR} *Estás en la cárcel.* No puedes usar comandos de economía por *${min} min*.\n_Paga con *#buyitem fianza* (25,000 ⓃNC) o espera._`;
    }
    return null;
}

function fmtCooldown(ts, ms) {
    if (!ts) return `${OK} Listo`;
    const r = ms - (Date.now() - ts);
    if (r <= 0) return `${OK} Listo`;
    const h = Math.floor(r / 3600000);
    const m = Math.floor((r % 3600000) / 60000);
    return h > 0 ? `${WARN} ${h}h ${m}m` : `${WARN} ${m}m`;
}

// ══════════════════════════════════════════
//  SALDO
// ══════════════════════════════════════════
async function cmdSaldo(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const n = fmt(senderJid, u.pushName);
    const cartera = u.monedas || 0;
    const banco   = u.banco   || 0;
    await sock.sendMessage(jid, {
        text: `◤ Fondos de ${n} ◢\n\n⛀ Cartera » *¥${cartera.toLocaleString()} ⓃNexcoins*\n⚿ Banco » *¥${banco.toLocaleString()} ⓃNexcoins*\n⛁ Total » *¥${(cartera + banco).toLocaleString()} ⓃNexcoins*`
    });
}

// ══════════════════════════════════════════
//  ECONOMÍA INFO (#bal / #balance)
// ══════════════════════════════════════════
async function cmdEconomyInfo(sock, jid, senderJid, mencionados = [], quotedParticipant = null) {
    let objetivoJid = senderJid;
    if (mencionados && mencionados.length > 0) {
        objetivoJid = mencionados[0];
    } else if (quotedParticipant) {
        objetivoJid = quotedParticipant.replace(/:\d+@/, '@');
    }

    const u = getUsuario(objetivoJid);
    const esPropioUsuario = objetivoJid === senderJid;
    const n = fmt(objetivoJid, u.pushName);

    const _ahoraRank = Date.now();
    if (!_rankingCache || _ahoraRank - _rankingCacheTs > RANKING_CACHE_TTL) {
        const _db = cargarUsuarios();
        _rankingCache   = Object.values(_db).map(u2 => (u2.monedas || 0) + (u2.banco || 0)).sort((a, b) => b - a);
        _rankingCacheTs = _ahoraRank;
    }
    const todos = _rankingCache;
    const total = (u.monedas || 0) + (u.banco || 0);
    const posicion = todos.findIndex(t => t <= total) + 1 || todos.length;
    const enCarcel = u.encarcelado && Date.now() < u.encarcelado
        ? `${ERR} En la cárcel » ${Math.ceil((u.encarcelado - Date.now()) / 60000)} min`
        : `${OK} En libertad`;
    const streakTxt = u.dailyStreak ? `${FI} Racha diaria » *${u.dailyStreak}* días` : `${FI} Racha » _Sin iniciar_`;

    const texto =
`${H(`Economia de ${n}`)}

${FE} Cartera » *${(u.monedas || 0).toLocaleString()} ⓃNC*
${FI} Banco » *${(u.banco || 0).toLocaleString()} ⓃNC*
${FS} Total » *${total.toLocaleString()} ⓃNC*

${FC} Posición » *#${posicion}* de ${todos.length}
${streakTxt}
${enCarcel}

${SH('Ingresos')}

${F} #daily » ${u.ultimoDiario && Date.now() - u.ultimoDiario < 86400000 ? `${WARN} Reclamado` : `${OK} Disponible`}
${F} #work » ${fmtCooldown(u.ultimoTrabajo, 45 * 60000)}
${F} #crime » ${fmtCooldown(u.ultimoCrimen, 15 * 60000)}
${F} #slut » ${fmtCooldown(u.ultimoSlut, 30 * 60000)}

${F} #minar » ${fmtCooldown(u.ultimoMinar, 25 * 60000)}
${F} #aventura » ${fmtCooldown(u.ultimoAdventure, 50 * 60000)}
${F} #cazar » ${fmtCooldown(u.ultimoCazar, 25 * 60000)}
${F} #pescar » ${fmtCooldown(u.ultimoFish, 20 * 60000)}
${F} #mazmorra » ${fmtCooldown(u.ultimaMazmorra, 60 * 60000)}`;

    await sock.sendMessage(jid, { text: texto });
}

// ══════════════════════════════════════════
//  DIARIO
// ══════════════════════════════════════════
async function cmdDiario(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const un_dia  = 24 * 60 * 60 * 1000;
    const dos_dias = 48 * 60 * 60 * 1000;

    if (u.ultimoDiario && ahora - u.ultimoDiario < un_dia) {
        const restante = un_dia - (ahora - u.ultimoDiario);
        const horas   = Math.floor(restante / 3600000);
        const minutos = Math.floor((restante % 3600000) / 60000);
        await sock.sendMessage(jid, {
            text: `${WARN} Ya recogiste tu diario. Vuelve en *${horas}h ${minutos}m*\n${FI} Racha actual » *${u.dailyStreak || 1}* día(s)`
        });
        return;
    }

    let streak = 1;
    if (u.ultimoDiario && (ahora - u.ultimoDiario) < dos_dias) {
        streak = (u.dailyStreak || 1) + 1;
    }
    streak = Math.min(streak, 30);

    let base   = Math.floor(Math.random() * 401) + 400;
    const bonus = Math.min(streak * 150, 3000);
    let ganadas = base + bonus;

    const hoy = new Date();
    const esFinDeSemana = hoy.getDay() === 0 || hoy.getDay() === 6;
    if (esFinDeSemana) ganadas = Math.floor(ganadas * 1.5);

    const evDiario = obtenerEventoActivo(jid);
    let eventoMsg = '';
    if (esFinDeSemana) {
        eventoMsg = `\n| Fin de semana — x1.5`;
    } else if (evDiario?.tipo === 'lluvia_coins') {
        ganadas = Math.floor(ganadas * 2);
        eventoMsg = `\n| Lluvia de Coins — x2`;
    } else if (evDiario?.tipo === 'hora_dorada') {
        ganadas = Math.floor(ganadas * 1.25);
        eventoMsg = `\n| Hora Dorada — x1.25`;
    } else if (evDiario?.tipo === 'turbo_laboral') {
        ganadas = Math.floor(ganadas * 1.5);
        eventoMsg = `\n| Turbo Laboral — x1.5`;
    } else if (evDiario?.tipo === 'tormenta_legendaria') {
        ganadas = Math.floor(ganadas * 4);
        eventoMsg = `\n| Tormenta Legendaria — x4`;
    } else if (evDiario?.tipo === 'vendaval_monedas') {
        ganadas = Math.floor(ganadas * 5);
        eventoMsg = `\n| Vendaval de Monedas — x5`;
    } else if (evDiario?.tipo === 'suerte_total') {
        ganadas = Math.floor(ganadas * 2);
        eventoMsg = `\n| Suerte Total — x2`;
    } else if (evDiario?.tipo === 'cosecha_abundante') {
        ganadas = Math.floor(ganadas * 1.75);
        eventoMsg = `\n| Cosecha Abundante — x1.75`;
    } else if (evDiario?.tipo === 'fiesta_nexus') {
        ganadas = Math.floor(ganadas * 2);
        eventoMsg = `\n| Fiesta Nexus — x2`;
    }
    if (u.itemsActivos?.bendicion_fortuna && Date.now() < u.itemsActivos.bendicion_fortuna) {
        ganadas = Math.floor(ganadas * 1.25);
        eventoMsg += `\n| Bendicion de Fortuna — +25%`;
    }

    ganadas = Math.min(ganadas, 500000);

    u.monedas = (u.monedas || 0) + ganadas;
    u.ultimoDiario = ahora;
    u.dailyStreak  = streak;
    trackear(u, 'diarios');
    guardarUsuario(senderJid, u);

    const rachaMsg = streak > 1
        ? `${FI} Racha » día *${streak}* — bonus *+${bonus.toLocaleString()} ⓃNC*`
        : `${FI} _Racha iniciada — reclama cada día para más bonus_`;

    await sock.sendMessage(jid, {
        text: `${H('Recompensa Diaria')}\n\n${FE} Base » *+${base.toLocaleString()} ⓃNC*\n${streak > 1 ? `${FS} Bonus racha » *+${bonus.toLocaleString()} ⓃNC*\n` : ''}${FI} Total » *+${ganadas.toLocaleString()} ⓃNC*${eventoMsg}\n${rachaMsg}\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`
    });
}

// ══════════════════════════════════════════
//  WORK
// ══════════════════════════════════════════
async function cmdWork(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const espera = 45 * 60 * 1000;
    if (u.ultimoTrabajo && ahora - u.ultimoTrabajo < espera) {
        const restante = espera - (ahora - u.ultimoTrabajo);
        const minutos = Math.ceil(restante / 60000);
        await sock.sendMessage(jid, { text: `${WARN} Ya trabajaste. Descansa y vuelve en *${minutos}m*` });
        return;
    }
    const trabajos = [
        { trabajo: 'programador',  ganancia: Math.floor(Math.random() * 700) + 500 },
        { trabajo: 'chef',         ganancia: Math.floor(Math.random() * 700) + 400 },
        { trabajo: 'médico',       ganancia: Math.floor(Math.random() * 700) + 800 },
        { trabajo: 'maestro',      ganancia: Math.floor(Math.random() * 700) + 500 },
        { trabajo: 'diseñador',    ganancia: Math.floor(Math.random() * 700) + 500 },
        { trabajo: 'streamer',     ganancia: Math.floor(Math.random() * 1200) + 300 },
        { trabajo: 'agricultor',   ganancia: Math.floor(Math.random() * 600) + 400 },
        { trabajo: 'mecánico',     ganancia: Math.floor(Math.random() * 700) + 500 },
        { trabajo: 'youtuber',     ganancia: Math.floor(Math.random() * 1200) + 300 },
        { trabajo: 'abogado',      ganancia: Math.floor(Math.random() * 1300) + 700 },
        { trabajo: 'futbolista',   ganancia: Math.floor(Math.random() * 1900) + 600 },
        { trabajo: 'carpintero',   ganancia: Math.floor(Math.random() * 600) + 400 },
    ];
    const trabajo = trabajos[Math.floor(Math.random() * trabajos.length)];
    let ganancia = trabajo.ganancia;
    let boostMsg = '';

    if (u.itemsActivos?.boost_trabajo) {
        ganancia *= 2;
        delete u.itemsActivos.boost_trabajo;
        boostMsg = '\n| Boost activo — x2';
    }
    const hoy = new Date();
    if (hoy.getDay() === 0 || hoy.getDay() === 6) {
        ganancia *= 2;
        boostMsg += '\n| Fin de semana — x2';
    }
    const evWork = obtenerEventoActivo(jid);
    if (evWork?.tipo === 'trabajo_extra')       { ganancia *= 2;                            boostMsg += '\n| Jornada Extra — x2'; }
    else if (evWork?.tipo === 'hora_dorada')    { ganancia = Math.floor(ganancia * 1.5);    boostMsg += '\n| Hora Dorada — x1.5'; }
    else if (evWork?.tipo === 'turbo_laboral')  { ganancia *= 2;                            boostMsg += '\n| Turbo Laboral — x2'; }
    else if (evWork?.tipo === 'tormenta_legendaria') { ganancia *= 3;                       boostMsg += '\n| Tormenta Legendaria — x3'; }
    else if (evWork?.tipo === 'suerte_total')   { ganancia *= 2;                            boostMsg += '\n| Suerte Total — x2'; }
    else if (evWork?.tipo === 'cosecha_abundante') { ganancia = Math.floor(ganancia * 1.75); boostMsg += '\n| Cosecha Abundante — x1.75'; }
    else if (evWork?.tipo === 'fiesta_nexus')   { ganancia *= 2;                            boostMsg += '\n| Fiesta Nexus — x2'; }

    if (u.itemsActivos?.bendicion_fortuna && Date.now() < u.itemsActivos.bendicion_fortuna) {
        ganancia = Math.floor(ganancia * 1.25);
        boostMsg += '\n| Bendicion de Fortuna — +25%';
    }
    u.monedas = (u.monedas || 0) + ganancia;
    u.ultimoTrabajo = ahora;
    trackear(u, 'trabajos');
    guardarUsuario(senderJid, u);

    const textoWork = `${H('Trabajo')}\n\n${F} Trabajaste como *${trabajo.trabajo}*\n${FE} Ganaste » *+${ganancia.toLocaleString()} ⓃNexCoins*${boostMsg}\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`;
    const enviado = await enviarMediaLocal(sock, jid, 'media/jobs/win', textoWork);
    if (!enviado) await sock.sendMessage(jid, { text: textoWork });
}

// ══════════════════════════════════════════
//  CRIME
// ══════════════════════════════════════════
async function cmdCrime(sock, jid, senderJid, args) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();

    const nivel = (args[0] || 'simple').toLowerCase();
    const configs = {
        simple: { espera: 15 * 60 * 1000, exito: 0.60, recompensaMin: 500,  recompensaMax: 1500,  multaMin: 200,  multaMax: 600,  crimenes: ['asaltaste una tienda', 'robaste a un transeúnte', 'vendiste mercancía robada', 'estafaste a un turista', 'robaste una bicicleta'] },
        banco:  { espera: 30 * 60 * 1000, exito: 0.40, recompensaMin: 2000, recompensaMax: 5000,  multaMin: 800,  multaMax: 2000, crimenes: ['asaltaste un banco', 'hackeaste cuentas bancarias', 'robaste una caja fuerte', 'interceptaste transferencias'] },
        mafia:  { espera: 45 * 60 * 1000, exito: 0.25, recompensaMin: 5000, recompensaMax: 14000, multaMin: 2000, multaMax: 5000, crimenes: ['dirigiste una operación mafia', 'controlaste una ruta ilegal', 'ejecutaste un atraco internacional', 'hackeaste el banco central'] },
    };

    if (!configs[nivel]) {
        await sock.sendMessage(jid, {
            text: `${ERR} Nivel inválido. Usa:\n*#crime simple* — Crimen menor (60% éxito)\n*#crime banco* — Robo bancario (40% éxito)\n*#crime mafia* — Operación mafia (25% éxito)\n\n_Mayor riesgo = mayor recompensa._`
        });
        return;
    }

    const cfg = configs[nivel];
    if (u.ultimoCrimen && ahora - u.ultimoCrimen < cfg.espera) {
        const restante = cfg.espera - (ahora - u.ultimoCrimen);
        const minutos  = Math.floor(restante / 60000);
        const segundos = Math.floor((restante % 60000) / 1000);
        await sock.sendMessage(jid, { text: `${WARN} La policía te sigue buscando. Espera *${minutos}m ${segundos}s*` });
        return;
    }

    let tasaExito = cfg.exito;
    const rep = u.reputacion || 0;
    if (rep >= 20) tasaExito += 0.05;
    if (rep <= -10) tasaExito -= 0.05;

    const eventoActivo = obtenerEventoActivo(jid);
    let eventoMsg = '';
    let sinCarcel = false;
    let sinMulta  = false;
    if (eventoActivo?.tipo === 'redada')           { tasaExito -= 0.20; eventoMsg = '\n| Redada policial — riesgo aumentado'; }
    else if (eventoActivo?.tipo === 'golpe_grande'){ tasaExito += 0.15; eventoMsg = '\n| El Golpe Grande — mayor probabilidad'; }
    else if (eventoActivo?.tipo === 'caos_criminal'){ tasaExito += 0.25; eventoMsg = '\n| Caos Criminal — policía distraída'; }
    else if (eventoActivo?.tipo === 'noche_oscura'){ tasaExito += 0.30; sinCarcel = true; eventoMsg = '\n| Noche Oscura — +30%, sin cárcel'; }
    else if (eventoActivo?.tipo === 'hora_oscura') { tasaExito += 0.40; eventoMsg = '\n| La Hora Oscura — +40%'; }
    else if (eventoActivo?.tipo === 'tregua_policial'){ sinCarcel = true; sinMulta = true; eventoMsg = '\n| Tregua Policial — sin multa ni cárcel'; }

    const exito = Math.random() < tasaExito;
    u.ultimoCrimen = ahora;

    if (exito) {
        let ganancia = Math.floor(Math.random() * (cfg.recompensaMax - cfg.recompensaMin)) + cfg.recompensaMin;
        const crimen = cfg.crimenes[Math.floor(Math.random() * cfg.crimenes.length)];
        if (u.itemsActivos?.bendicion_fortuna && Date.now() < u.itemsActivos.bendicion_fortuna) {
            ganancia = Math.floor(ganancia * 1.25);
            eventoMsg += '\n| Bendicion de Fortuna — +25%';
        }
        u.monedas = (u.monedas || 0) + ganancia;
        trackear(u, 'crimenesOK');
        guardarUsuario(senderJid, u);
        const txt = `${H('Crimen exitoso')}\n\n${F} _${crimen}_${eventoMsg}\n${FE} *+${ganancia.toLocaleString()} ⓃNexCoins*\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`;
        const env = await enviarMediaLocal(sock, jid, 'media/crime/win', txt);
        if (!env) await sock.sendMessage(jid, { text: txt });
    } else {
        const multa  = Math.floor(Math.random() * (cfg.multaMax - cfg.multaMin)) + cfg.multaMin;
        const motivos = ['te atrapó la policía', 'un testigo te delató', 'fallaste en el intento', 'las cámaras te grabaron'];
        const motivo  = motivos[Math.floor(Math.random() * motivos.length)];
        if (!sinMulta) u.monedas = Math.max(0, (u.monedas || 0) - multa);

        let carcelMsg = '';
        if (!sinCarcel && (nivel === 'banco' || nivel === 'mafia')) {
            const tiempoCarcel = nivel === 'mafia' ? 15 : 8;
            u.encarcelado = ahora + tiempoCarcel * 60 * 1000;
            carcelMsg = `\n${ERR} *En la cárcel por ${tiempoCarcel} min*\n_Usa *#buyitem fianza* (25,000 ⓃNC) para salir antes._`;
        }
        guardarUsuario(senderJid, u);
        const multaTexto = sinMulta ? '_sin multa por evento_' : `${ERR} Multa » *-${multa.toLocaleString()} ⓃNexCoins*`;
        const txt = `${H('Atrapado')}\n\n${F} _${motivo}_${eventoMsg}\n${multaTexto}${carcelMsg}\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`;
        const env = await enviarMediaLocal(sock, jid, 'media/crime/lose', txt);
        if (!env) await sock.sendMessage(jid, { text: txt });
    }
}

// ══════════════════════════════════════════
//  SLUT
// ══════════════════════════════════════════
async function cmdSlut(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const espera = 30 * 60 * 1000;
    if (u.ultimoSlut && ahora - u.ultimoSlut < espera) {
        const minutos = Math.ceil((espera - (ahora - u.ultimoSlut)) / 60000);
        await sock.sendMessage(jid, { text: `${WARN} Necesitas descansar. Vuelve en *${minutos}m*` });
        return;
    }
    const exito = Math.random() < 0.7;
    u.ultimoSlut = ahora;
    if (exito) {
        let ganancia = Math.floor(Math.random() * 900) + 300;
        let msg = '';
        if (u.itemsActivos?.bendicion_fortuna && Date.now() < u.itemsActivos.bendicion_fortuna) {
            ganancia = Math.floor(ganancia * 1.25);
            msg = '\n| Bendicion de Fortuna — +25%';
        }
        const acciones = [
            `te ganaste *${ganancia.toLocaleString()} ⓃNexCoins* en una noche loca`,
            `un cliente generoso te dio *${ganancia.toLocaleString()} ⓃNexCoins*`,
            `hiciste un show privado y te pagaron *${ganancia.toLocaleString()} ⓃNexCoins*`,
        ];
        const accion = acciones[Math.floor(Math.random() * acciones.length)];
        u.monedas = (u.monedas || 0) + ganancia;
        guardarUsuario(senderJid, u);
        const txt = `${H('Noche de trabajo')}\n\n${F} _${accion}_${msg}\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`;
        const env = await enviarMediaLocal(sock, jid, 'media/jobs/win', txt);
        if (!env) await sock.sendMessage(jid, { text: txt });
    } else {
        const perdida = Math.floor(Math.random() * 300) + 100;
        u.monedas = Math.max(0, (u.monedas || 0) - perdida);
        guardarUsuario(senderJid, u);
        const txt = `${H('Noche tranquila')}\n\n${F} No hubo clientes hoy.\n${ERR} Perdiste *${perdida.toLocaleString()} ⓃNexCoins* en gastos\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`;
        const env = await enviarMediaLocal(sock, jid, 'media/jobs/lose', txt);
        if (!env) await sock.sendMessage(jid, { text: txt });
    }
}

// ══════════════════════════════════════════
//  COINFLIP
// ══════════════════════════════════════════
async function cmdCoinflip(sock, jid, senderJid, args) {
    const cantidad = parseInt(args[0]);
    const eleccion = args[1]?.toLowerCase();
    if (isNaN(cantidad) || cantidad <= 0 || !['cara', 'cruz', 'heads', 'tails'].includes(eleccion)) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#coinflip [cantidad] [cara/cruz]*\nEjemplo: *#coinflip 1000 cara*` });
        return;
    }
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const capProporcional = Math.floor((u.monedas || 0) * 0.10);
    const limite = Math.min(MAX_COINFLIP, Math.max(capProporcional, 10000));
    if (cantidad > limite) {
        await sock.sendMessage(jid, {
            text: `${ERR} *Límite de apuesta superado.*\n${F} Máximo » *${limite.toLocaleString()} ⓃNexCoins*\n_10% de tu cartera o ${MAX_COINFLIP.toLocaleString()}, el menor_`
        });
        return;
    }
    if ((u.monedas || 0) < cantidad) {
        await sock.sendMessage(jid, { text: `${ERR} No tienes suficientes ⓃNexCoins.` });
        return;
    }
    const esCara   = ['cara', 'heads'].includes(eleccion);
    const resultado = Math.random() < 0.5 ? 'cara' : 'cruz';
    const gano     = (esCara && resultado === 'cara') || (!esCara && resultado === 'cruz');
    let dadoMsg = '';
    if (gano) {
        let ganar = cantidad;
        if (u.itemsActivos?.dado_suerte) {
            ganar = Math.floor(ganar * 1.5);
            delete u.itemsActivos.dado_suerte;
            dadoMsg = '\n| Dado de la Suerte — x1.5';
        }
        if (u.itemsActivos?.turbo_apuesta && Date.now() < u.itemsActivos.turbo_apuesta) {
            ganar *= 2;
            dadoMsg += '\n| Turbo-Apuesta — x2';
        }
        const ganMax = Math.floor(cantidad * MAX_MULTIPLICADOR);
        if (ganar > ganMax) { ganar = ganMax; dadoMsg += '\n_(multiplicador al límite)_'; }
        u.monedas = (u.monedas || 0) + ganar;
        trackear(u, 'apuestasGanadas');
        trackear(u, 'coinflipGanados');
        guardarUsuario(senderJid, u);
        await sock.sendMessage(jid, {
            text: `${H('Coinflip')}\n\n${FI} Resultado » *${resultado}*\n\n${OK} *Ganaste ${ganar.toLocaleString()} ⓃNexCoins*${dadoMsg}\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`
        });
    } else {
        u.monedas = Math.max(0, (u.monedas || 0) - cantidad);
        guardarUsuario(senderJid, u);
        await sock.sendMessage(jid, {
            text: `${H('Coinflip')}\n\n${FI} Resultado » *${resultado}*\n\n${ERR} *Perdiste ${cantidad.toLocaleString()} ⓃNexCoins*\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`
        });
    }
}

// ══════════════════════════════════════════
//  DEPOSITAR / RETIRAR
// ══════════════════════════════════════════
async function cmdDeposit(sock, jid, senderJid, args) {
    const u = getUsuario(senderJid);
    let cantidad = args[0] === 'all' ? (u.monedas || 0) : parseInt(args[0]);
    if (isNaN(cantidad) || cantidad <= 0) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#depositar [cantidad | all]*` });
        return;
    }
    if ((u.monedas || 0) < cantidad) {
        await sock.sendMessage(jid, { text: `${ERR} No tienes suficientes ⓃNexCoins en tu cartera.` });
        return;
    }
    u.monedas -= cantidad;
    u.banco = (u.banco || 0) + cantidad;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, {
        text: `${OK} Depositaste *${cantidad.toLocaleString()} ⓃNexCoins*\n${FI} Banco » *${u.banco.toLocaleString()} ⓃNC*  ${FE} Cartera » *${u.monedas.toLocaleString()} ⓃNC*`
    });
}

async function cmdWithdraw(sock, jid, senderJid, args) {
    const u = getUsuario(senderJid);
    let cantidad = args[0] === 'all' ? (u.banco || 0) : parseInt(args[0]);
    if (isNaN(cantidad) || cantidad <= 0) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#retirar [cantidad | all]*` });
        return;
    }
    if ((u.banco || 0) < cantidad) {
        await sock.sendMessage(jid, { text: `${ERR} No tienes suficientes ⓃNexCoins en el banco.` });
        return;
    }
    u.banco  = (u.banco || 0) - cantidad;
    u.monedas = (u.monedas || 0) + cantidad;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, {
        text: `${OK} Retiraste *${cantidad.toLocaleString()} ⓃNexCoins*\n${FE} Cartera » *${u.monedas.toLocaleString()} ⓃNC*  ${FI} Banco » *${u.banco.toLocaleString()} ⓃNC*`
    });
}

// ══════════════════════════════════════════
//  RULETA
// ══════════════════════════════════════════
async function cmdRoulette(sock, jid, senderJid, args) {
    const cantidad = parseInt(args[0]);
    const eleccion = (args[1] || '').toLowerCase();
    const validas = ['rojo', 'negro', 'verde', 'par', 'impar', 'alto', 'bajo', ...Array.from({ length: 37 }, (_, i) => `${i}`)];
    if (isNaN(cantidad) || cantidad <= 0 || !validas.includes(eleccion)) {
        await sock.sendMessage(jid, {
            text: `${ERR} Uso: *#ruleta [cantidad] [elección]*\n\nElecciones:\n${F} *rojo/negro* — x2\n${F} *par/impar* — x2\n${F} *alto/bajo* — x2\n${F} *verde* — x14\n${F} *0-36* (número exacto) — x14\n\nEjemplo: *#ruleta 1000 rojo*`
        });
        return;
    }
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }

    const capProp = Math.floor((u.monedas || 0) * 0.10);
    const limite  = Math.min(MAX_RULETA, Math.max(capProp, 10000));
    if (cantidad > limite) {
        await sock.sendMessage(jid, {
            text: `${ERR} Límite » *${limite.toLocaleString()} ⓃNC* _(10% de cartera o ${MAX_RULETA.toLocaleString()})_`
        });
        return;
    }
    if ((u.monedas || 0) < cantidad) {
        await sock.sendMessage(jid, { text: `${ERR} No tienes suficientes ⓃNexCoins.` });
        return;
    }

    const numero  = Math.floor(Math.random() * 37);
    const ROJOS   = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    const color   = numero === 0 ? 'verde' : ROJOS.includes(numero) ? 'rojo' : 'negro';
    const es_par  = numero !== 0 && numero % 2 === 0;
    const es_alto = numero >= 19 && numero <= 36;

    let gano = false;
    let mult = 1;
    if (['rojo','negro','par','impar','alto','bajo'].includes(eleccion)) {
        mult = 2;
        gano = eleccion === color || (eleccion === 'par' && es_par) || (eleccion === 'impar' && !es_par && numero !== 0) || (eleccion === 'alto' && es_alto) || (eleccion === 'bajo' && !es_alto && numero !== 0);
    } else if (eleccion === 'verde') {
        mult = 14; gano = numero === 0;
    } else {
        const num = parseInt(eleccion);
        mult = 14; gano = numero === num;
    }

    let dadoMsg = '';
    if (gano) {
        let ganar = cantidad * mult;
        if (u.itemsActivos?.dado_suerte) {
            ganar = Math.floor(ganar * 1.5);
            delete u.itemsActivos.dado_suerte;
            dadoMsg = '\n| Dado de la Suerte — x1.5';
        }
        if (u.itemsActivos?.turbo_apuesta && Date.now() < u.itemsActivos.turbo_apuesta) {
            ganar *= 2;
            dadoMsg += '\n| Turbo-Apuesta — x2';
        }
        const ganMax = Math.floor(cantidad * MAX_MULTIPLICADOR * mult);
        if (ganar > ganMax) { ganar = ganMax; dadoMsg += '\n_(multiplicador al límite)_'; }
        u.monedas = (u.monedas || 0) + ganar;
        trackear(u, 'apuestasGanadas');
        guardarUsuario(senderJid, u);
        await sock.sendMessage(jid, {
            text: `${H('Ruleta')}\n\n${FI} Cayó » *${numero}* — _${color}_\n\n${OK} *Ganaste ${ganar.toLocaleString()} ⓃNexCoins* (x${mult})${dadoMsg}\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`
        });
    } else {
        u.monedas = Math.max(0, (u.monedas || 0) - cantidad);
        guardarUsuario(senderJid, u);
        await sock.sendMessage(jid, {
            text: `${H('Ruleta')}\n\n${FI} Cayó » *${numero}* — _${color}_\n\n${ERR} *Perdiste ${cantidad.toLocaleString()} ⓃNexCoins*\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`
        });
    }
}

// ══════════════════════════════════════════
//  ROBAR
// ══════════════════════════════════════════
async function cmdSteal(sock, jid, senderJid, mencionados, pushName) {
    if (!mencionados || !mencionados.length) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#steal @usuario*` });
        return;
    }
    const objetivo = mencionados[0];
    if (objetivo === senderJid) {
        await sock.sendMessage(jid, { text: `${ERR} No puedes robarte a ti mismo.` });
        return;
    }
    const uSender  = getUsuario(senderJid);
    const uObjetivo = getUsuario(objetivo);
    const jail = verificarCarcel(uSender);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }

    const ahora   = Date.now();
    const cooldown = 20 * 60 * 1000;
    if (!uSender.cooldowns) uSender.cooldowns = {};
    if (uSender.cooldowns.steal && ahora - uSender.cooldowns.steal < cooldown) {
        const restante = cooldown - (ahora - uSender.cooldowns.steal);
        const m = Math.ceil(restante / 60000);
        await sock.sendMessage(jid, { text: `${WARN} La policía te sigue. Espera *${m} minutos* para intentar otro robo.` });
        return;
    }
    if (!uObjetivo.monedas || uObjetivo.monedas < 2000) {
        await sock.sendMessage(jid, { text: `${ERR} Esa persona no tiene suficientes ⓃNexCoins para robarle.` });
        return;
    }

    uSender.cooldowns.steal = ahora;

    const nO = fmt(objetivo, uObjetivo.pushName);

    if (uObjetivo.itemsActivos?.escudo) {
        delete uObjetivo.itemsActivos.escudo;
        guardarUsuario(objetivo, uObjetivo);
        await sock.sendMessage(jid, { text: `${FC} El escudo de ${nO} bloqueó tu robo. No pudiste llevarte nada.` });
        return;
    }
    if (uObjetivo.itemsActivos?.granada_aturd) {
        delete uObjetivo.itemsActivos.granada_aturd;
        guardarUsuario(objetivo, uObjetivo);
        guardarUsuario(senderJid, uSender);
        await sock.sendMessage(jid, { text: `${ERR} *BOOM.* ${nO} tenía una Granada Aturdidora. Saliste corriendo sin nada.` });
        return;
    }

    let tasaExito = 0.45;
    let detectorMsg = '';
    if (uSender.itemsActivos?.detector) {
        tasaExito = 0.85;
        delete uSender.itemsActivos.detector;
        detectorMsg = '\n| Detector activo — exito aumentado';
    }
    if (uSender.itemsActivos?.contrato_oscuro && Date.now() < uSender.itemsActivos.contrato_oscuro) {
        tasaExito = 1.0;
        detectorMsg += '\n| Contrato Oscuro — exito garantizado';
    }
    const evSteal = obtenerEventoActivo(jid);
    let eventoMsgSteal = '';
    if (evSteal?.tipo === 'bonus_robo') {
        tasaExito = Math.min(tasaExito + 0.20, 1.0);
        eventoMsgSteal = '\n| Ladrones en la Ciudad — bonus activo';
    }

    const exito = Math.random() < tasaExito;
    const nA = fmt(senderJid, pushName);

    if (exito) {
        let robado = Math.floor(Math.random() * Math.min(uObjetivo.monedas * 0.2, 8000)) + 1000;
        let bendMsg = '';
        if (uSender.itemsActivos?.bendicion_fortuna && Date.now() < uSender.itemsActivos.bendicion_fortuna) {
            robado = Math.floor(robado * 1.25);
            bendMsg = '\n| Bendicion de Fortuna — +25%';
        }
        uSender.monedas  = (uSender.monedas || 0) + robado;
        uObjetivo.monedas = Math.max(0, (uObjetivo.monedas || 0) - robado);
        trackear(uSender, 'robosExitosos');
        guardarUsuario(senderJid, uSender);
        guardarUsuario(objetivo, uObjetivo);
        await sock.sendMessage(jid, {
            text: `${H('Robo exitoso')}\n\n${nA} robó *${robado.toLocaleString()} ⓃNexCoins* a ${nO}${detectorMsg}${eventoMsgSteal}${bendMsg}\n\n${FE} Tu saldo » *${uSender.monedas.toLocaleString()} ⓃNC*\n${WARN} Próximo robo en *20 min*`
        });
    } else {
        const multa = Math.floor(Math.random() * 2000) + 500;
        uSender.monedas = Math.max(0, (uSender.monedas || 0) - multa);
        guardarUsuario(senderJid, uSender);
        await sock.sendMessage(jid, {
            text: `${H('Atrapado robando')}\n\n${ERR} Te atraparon intentando robar a ${nO}.\n${FI} Multa » *-${multa.toLocaleString()} ⓃNexCoins*\n\n${F} Saldo » *${uSender.monedas.toLocaleString()} ⓃNC*\n${WARN} Próximo robo en *20 min*`
        });
    }
}

// ══════════════════════════════════════════
//  TRANSFERIR
// ══════════════════════════════════════════
async function cmdTransferir(sock, jid, senderJid, mencionados, args) {
    if (!mencionados || !mencionados.length) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#pay @usuario cantidad*` });
        return;
    }
    const destinoJid = mencionados[0];
    const cantidad   = parseInt(args.find(a => !isNaN(parseInt(a))));
    if (isNaN(cantidad) || cantidad <= 0) {
        await sock.sendMessage(jid, { text: `${ERR} Ingresa una cantidad válida.` });
        return;
    }
    if (!quitarMonedas(senderJid, cantidad)) {
        await sock.sendMessage(jid, { text: `${ERR} No tienes suficientes ⓃNexCoins.` });
        return;
    }
    agregarMonedas(destinoJid, cantidad);
    const uD = getUsuario(destinoJid);
    const nD = fmt(destinoJid, uD.pushName);
    await sock.sendMessage(jid, {
        text: `${OK} Enviaste *${cantidad.toLocaleString()} ⓃNexCoins* a ${nD}`
    });
}

// ══════════════════════════════════════════
//  TOP RIQUEZA (grupo + global)
// ══════════════════════════════════════════
async function cmdBaltop(sock, jid, groupMetadata, pagina = 1) {
    const { getOwners } = require('./owners');
    const { paginar, piePagina, emblema } = require('./paginator');
    const { resolverJid } = require('./lidResolver');
    const ownersRaw = getOwners();
    const ownersSet = new Set([...ownersRaw, ...ownersRaw.map(o => resolverJid(o)).filter(Boolean)]);
    const db = cargarUsuarios();
    const todasEntries = Object.entries(db).filter(([key]) => key.includes('@') && !key.endsWith('@g.us'));
    let entries = todasEntries.filter(([key]) => !ownersSet.has(key));

    const filtrarPorGrupo = (lista) => {
        if (!groupMetadata?.participants?.length) return lista;
        const memberIds = new Set();
        for (const p of groupMetadata.participants) {
            const raw = (p.id || '').replace(/:\d+@/, '@');
            memberIds.add(raw);
            const resolved = resolverJid(raw);
            if (resolved !== raw) memberIds.add(resolved);
        }
        return lista.filter(([key]) => memberIds.has(key));
    };

    entries = filtrarPorGrupo(entries);
    if (!entries.length) entries = filtrarPorGrupo(todasEntries);
    if (!entries.length) {
        await sock.sendMessage(jid, { text: `${ERR} No hay usuarios registrados en este grupo.` });
        return;
    }

    const todos = entries
        .map(([ujid, u]) => ({ jid: ujid, total: (u.monedas || 0) + (u.banco || 0), nombre: u.pushName || ujid.split('@')[0] }))
        .sort((a, b) => b.total - a.total);

    const { items: usuarios, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    let texto = `${H('Top Riqueza')}\n\n`;
    for (let i = 0; i < usuarios.length; i++) {
        const u = usuarios[i];
        texto += `${emblema(inicio + i)} \`${u.nombre}\` — *${u.total.toLocaleString()} ⓃNC*\n`;
    }
    if (groupMetadata) texto += `\n_Solo miembros de este grupo_`;
    texto += piePagina(pag, totalPags, 'baltop');
    await sock.sendMessage(jid, { text: texto });
}

async function cmdRichTopGlobal(sock, jid, pagina = 1) {
    const { paginar, piePagina, emblema } = require('./paginator');
    const db = cargarUsuarios();
    const todos = Object.entries(db)
        .filter(([k]) => k.includes('@') && !k.endsWith('@g.us'))
        .map(([ujid, u]) => ({ jid: ujid, total: (u.monedas || 0) + (u.banco || 0), nombre: u.pushName || ujid.split('@')[0] }))
        .sort((a, b) => b.total - a.total);
    if (!todos.length) { await sock.sendMessage(jid, { text: `${ERR} No hay usuarios registrados.` }); return; }
    const { items: lista, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    let texto = `${H('Top Riqueza Mundial')}\n\n`;
    lista.forEach((u, i) => { texto += `${emblema(inicio + i)} \`${u.nombre}\` — *${u.total.toLocaleString()} ⓃNC*\n`; });
    texto += `\n_Todos los usuarios registrados_${piePagina(pag, totalPags, 'richtop')}`;
    await sock.sendMessage(jid, { text: texto });
}

async function cmdRichTopGroup(sock, jid, groupMetadata, pagina = 1) {
    if (!groupMetadata?.participants?.length) {
        await sock.sendMessage(jid, { text: `${ERR} Este comando solo funciona en grupos.` }); return;
    }
    const { paginar, piePagina, emblema } = require('./paginator');
    const { resolverJid } = require('./lidResolver');
    const db = cargarUsuarios();
    const memberIds = new Set();
    for (const p of groupMetadata.participants) {
        const raw = (p.id || '').replace(/:\d+@/, '@');
        memberIds.add(raw);
        const resolved = resolverJid(raw);
        if (resolved !== raw) memberIds.add(resolved);
    }
    const todos = Object.entries(db)
        .filter(([k]) => memberIds.has(k))
        .map(([ujid, u]) => ({ jid: ujid, total: (u.monedas || 0) + (u.banco || 0), nombre: u.pushName || ujid.split('@')[0] }))
        .sort((a, b) => b.total - a.total);
    if (!todos.length) { await sock.sendMessage(jid, { text: `${ERR} Ningún miembro del grupo tiene datos.` }); return; }
    const { items: lista, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    let texto = `${H('Top Riqueza Grupo')}\n\n`;
    lista.forEach((u, i) => { texto += `${emblema(inicio + i)} \`${u.nombre}\` — *${u.total.toLocaleString()} ⓃNC*\n`; });
    texto += `\n_Solo miembros de este grupo_${piePagina(pag, totalPags, 'richtopg')}`;
    await sock.sendMessage(jid, { text: texto });
}

async function cmdLevelTopGlobal(sock, jid, pagina = 1) {
    const { paginar, piePagina, emblema } = require('./paginator');
    const db = cargarUsuarios();
    const todos = Object.entries(db)
        .filter(([k]) => k.includes('@') && !k.endsWith('@g.us'))
        .map(([ujid, u]) => ({ jid: ujid, nivel: u.nivel || 1, exp: u.experiencia || 0, nombre: u.pushName || ujid.split('@')[0] }))
        .sort((a, b) => b.nivel !== a.nivel ? b.nivel - a.nivel : b.exp - a.exp);
    if (!todos.length) { await sock.sendMessage(jid, { text: `${ERR} No hay usuarios registrados.` }); return; }
    const { items: lista, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    let texto = `${H('Top Nivel Mundial')}\n\n`;
    lista.forEach((u, i) => { texto += `${emblema(inicio + i)} \`${u.nombre}\` — Nv.*${u.nivel}* _(${u.exp} XP)_\n`; });
    texto += `\n_Todos los usuarios registrados_${piePagina(pag, totalPags, 'leveltop')}`;
    await sock.sendMessage(jid, { text: texto });
}

async function cmdLevelTopGroup(sock, jid, groupMetadata, pagina = 1) {
    if (!groupMetadata?.participants?.length) {
        await sock.sendMessage(jid, { text: `${ERR} Este comando solo funciona en grupos.` }); return;
    }
    const { paginar, piePagina, emblema } = require('./paginator');
    const { resolverJid } = require('./lidResolver');
    const db = cargarUsuarios();
    const memberIds = new Set();
    for (const p of groupMetadata.participants) {
        const raw = (p.id || '').replace(/:\d+@/, '@');
        memberIds.add(raw);
        const resolved = resolverJid(raw);
        if (resolved !== raw) memberIds.add(resolved);
    }
    const todos = Object.entries(db)
        .filter(([k]) => memberIds.has(k))
        .map(([ujid, u]) => ({ jid: ujid, nivel: u.nivel || 1, exp: u.experiencia || 0, nombre: u.pushName || ujid.split('@')[0] }))
        .sort((a, b) => b.nivel !== a.nivel ? b.nivel - a.nivel : b.exp - a.exp);
    if (!todos.length) { await sock.sendMessage(jid, { text: `${ERR} Ningún miembro del grupo tiene datos.` }); return; }
    const { items: lista, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    let texto = `${H('Top Nivel Grupo')}\n\n`;
    lista.forEach((u, i) => { texto += `${emblema(inicio + i)} \`${u.nombre}\` — Nv.*${u.nivel}* _(${u.exp} XP)_\n`; });
    texto += `\n_Solo miembros de este grupo_${piePagina(pag, totalPags, 'leveltopg')}`;
    await sock.sendMessage(jid, { text: texto });
}

// ══════════════════════════════════════════
//  TIENDA
// ══════════════════════════════════════════
const TIENDA_PATH = path.join(__dirname, '../data/tienda.json');
function getTienda() { return fs.readJsonSync(TIENDA_PATH); }

async function cmdTienda(sock, jid) {
    const items = getTienda();
    const { ITEMS_DB } = require('./items');
    let texto = `${H('Tienda Nexus')}\n\n${SH('Articulos especiales')}\n`;
    for (const item of items) {
        texto += `${F} *${item.nombre}* (ID: \`${item.id}\`)\n| ${item.descripcion}\n| *${item.precio.toLocaleString()} ⓃNC* — \`#comprar ${item.id}\`\n\n`;
    }
    texto += `${SH('Items con efectos')}\n`;
    for (const [id, item] of Object.entries(ITEMS_DB)) {
        texto += `${F} *${item.nombre}*\n| ${item.desc}\n| *${item.precio.toLocaleString()} ⓃNC* — \`#buyitem ${id}\`\n\n`;
    }
    await sock.sendMessage(jid, { text: texto });
}

async function cmdComprar(sock, jid, senderJid, args) {
    const id   = parseInt(args[0]);
    const items = getTienda();
    const item  = items.find(i => i.id === id);
    if (!item) {
        await sock.sendMessage(jid, { text: `${ERR} Artículo no encontrado. Usa *#tienda* para ver lo disponible.` });
        return;
    }
    const u = getUsuario(senderJid);
    if ((u.monedas || 0) < item.precio) {
        await sock.sendMessage(jid, { text: `${ERR} No tienes suficientes ⓃNexCoins. Necesitas *${item.precio.toLocaleString()}* y tienes *${(u.monedas || 0).toLocaleString()}*` });
        return;
    }
    if (!Array.isArray(u.inventarioTienda)) u.inventarioTienda = [];
    if (u.inventarioTienda.find(i => i.id === id)) {
        await sock.sendMessage(jid, { text: `${ERR} Ya tienes este artículo en tu inventario.` });
        return;
    }
    u.monedas -= item.precio;
    u.inventarioTienda.push({ id: item.id, nombre: item.nombre, tipo: item.tipo });
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `${OK} Compraste *${item.nombre}* por *${item.precio.toLocaleString()} ⓃNexCoins*\n${F} Saldo restante » *${u.monedas.toLocaleString()} ⓃNC*` });
}

async function cmdInventario(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const tiendaInv = u.inventarioTienda || [];
    if (!tiendaInv.length) {
        await sock.sendMessage(jid, { text: `${INFO} Tu inventario de tienda está vacío. Usa *#tienda* para comprar.\n\n_Para ítems con efectos usa *#inv*_` });
        return;
    }
    let texto = `${H('Inventario')}\n\n`;
    for (const item of tiendaInv) {
        texto += `${F} *${item.nombre}* — _${item.tipo}_\n`;
    }
    await sock.sendMessage(jid, { text: texto });
}

// ══════════════════════════════════════════
//  MINAR
// ══════════════════════════════════════════
async function cmdMinar(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const espera = 25 * 60 * 1000;
    if (u.ultimoMinar && ahora - u.ultimoMinar < espera) {
        const r = espera - (ahora - u.ultimoMinar);
        await sock.sendMessage(jid, { text: `${WARN} Tu pico está roto. Espera *${Math.ceil(r / 60000)} min*` });
        return;
    }
    const minerales = [
        { nombre: 'Piedra',         valor: 800,   prob: 0.45 },
        { nombre: 'Hierro',         valor: 2200,  prob: 0.25 },
        { nombre: 'Oro',            valor: 5500,  prob: 0.15 },
        { nombre: 'Diamante',       valor: 13000, prob: 0.10 },
        { nombre: 'Esmeralda',      valor: 25000, prob: 0.04 },
        { nombre: 'Mineral Cosmico',valor: 50000, prob: 0.01 },
    ];
    const r = Math.random();
    let acc = 0, mineral;
    for (const m of minerales) { acc += m.prob; if (r <= acc) { mineral = m; break; } }
    if (!mineral) mineral = minerales[0];
    const evMinar = obtenerEventoActivo();
    let valorMinar = mineral.valor;
    let msgEvento = '';
    if      (evMinar?.tipo === 'veta_oro')          { valorMinar *= 2;                          msgEvento = '\n| Veta de Oro — x2'; }
    else if (evMinar?.tipo === 'racha_suerte')       { valorMinar = Math.floor(valorMinar * 1.5); msgEvento = '\n| Racha de Suerte — x1.5'; }
    else if (evMinar?.tipo === 'luna_llena')         { valorMinar = Math.floor(valorMinar * 2.5); msgEvento = '\n| Luna Llena — x2.5'; }
    else if (evMinar?.tipo === 'suerte_total')       { valorMinar *= 2;                          msgEvento = '\n| Suerte Total — x2'; }
    else if (evMinar?.tipo === 'cosecha_abundante')  { valorMinar = Math.floor(valorMinar * 1.75); msgEvento = '\n| Cosecha Abundante — x1.75'; }
    u.monedas = (u.monedas || 0) + valorMinar;
    u.ultimoMinar = ahora;
    trackear(u, 'minados');
    guardarUsuario(senderJid, u);
    const txt = `${H('Mineria')}\n\n${FI} Encontraste » *${mineral.nombre}*\n${FE} *+${valorMinar.toLocaleString()} ⓃNexCoins*${msgEvento}\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`;
    const env = await enviarMediaLocal(sock, jid, 'media/jobs/win', txt);
    if (!env) await sock.sendMessage(jid, { text: txt });
}

// ══════════════════════════════════════════
//  AVENTURA
// ══════════════════════════════════════════
async function cmdAdventure(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const espera = 50 * 60 * 1000;
    if (u.ultimoAdventure && ahora - u.ultimoAdventure < espera) {
        const r = espera - (ahora - u.ultimoAdventure);
        await sock.sendMessage(jid, { text: `${WARN} Aún descansas de tu última aventura. Espera *${Math.ceil(r / 60000)} min*` });
        return;
    }
    const aventuras = [
        { txt: 'Exploraste un castillo abandonado y encontraste un cofre.',        min: 3000,  max: 12000 },
        { txt: 'Salvaste a una aldea de bandidos. Te recompensaron.',               min: 4000,  max: 15000 },
        { txt: 'Cruzaste el desierto y descubriste un oasis con tesoros.',          min: 3500,  max: 13000 },
        { txt: 'Resolviste el acertijo de una esfinge. Te dejó pasar con premio.',  min: 5000,  max: 15000 },
        { txt: 'Encontraste una caja mágica flotando en el río.',                   min: 2500,  max: 14000 },
    ];
    const ev = aventuras[Math.floor(Math.random() * aventuras.length)];
    const exito = Math.random() < 0.75;
    if (exito) {
        let ganancia = Math.floor(Math.random() * (ev.max - ev.min)) + ev.min;
        const evAdv  = obtenerEventoActivo();
        let msgEvento = '';
        if      (evAdv?.tipo === 'racha_suerte')      { ganancia = Math.floor(ganancia * 1.5); msgEvento = '\n| Racha de Suerte — x1.5'; }
        else if (evAdv?.tipo === 'fiebre_aventura')   { ganancia *= 2;                         msgEvento = '\n| Fiebre de Aventura — x2'; }
        else if (evAdv?.tipo === 'suerte_total')      { ganancia *= 2;                         msgEvento = '\n| Suerte Total — x2'; }
        else if (evAdv?.tipo === 'cosecha_abundante') { ganancia = Math.floor(ganancia * 1.75); msgEvento = '\n| Cosecha Abundante — x1.75'; }
        else if (evAdv?.tipo === 'fiesta_nexus')      { ganancia *= 2;                         msgEvento = '\n| Fiesta Nexus — x2'; }
        u.monedas = (u.monedas || 0) + ganancia;
        trackear(u, 'aventurasOK');
        u.ultimoAdventure = ahora;
        guardarUsuario(senderJid, u);
        const txt = `${H('Aventura exitosa')}\n\n${FI} _${ev.txt}_${msgEvento}\n${FE} *+${ganancia.toLocaleString()} ⓃNexCoins*\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`;
        const env = await enviarMediaLocal(sock, jid, 'media/jobs/win', txt);
        if (!env) await sock.sendMessage(jid, { text: txt });
    } else {
        const perdida = Math.floor(Math.random() * 1500) + 1000;
        u.monedas = Math.max(0, (u.monedas || 0) - perdida);
        u.ultimoAdventure = ahora;
        guardarUsuario(senderJid, u);
        const txt = `${H('Aventura fallida')}\n\n${F} Te emboscaron en el camino.\n${ERR} Perdiste *${perdida.toLocaleString()} ⓃNexCoins*\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`;
        const env = await enviarMediaLocal(sock, jid, 'media/jobs/lose', txt);
        if (!env) await sock.sendMessage(jid, { text: txt });
    }
}

// ══════════════════════════════════════════
//  CAZAR
// ══════════════════════════════════════════
async function cmdCazar(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const espera = 25 * 60 * 1000;
    if (u.ultimoCazar && ahora - u.ultimoCazar < espera) {
        const r = espera - (ahora - u.ultimoCazar);
        await sock.sendMessage(jid, { text: `${WARN} Tu arco se enfría. Espera *${Math.ceil(r / 60000)} min*` });
        return;
    }
    const presas = [
        { nombre: 'Conejo',             valor: 1200,  prob: 0.40 },
        { nombre: 'Ciervo',             valor: 4000,  prob: 0.25 },
        { nombre: 'Jabali',             valor: 7000,  prob: 0.15 },
        { nombre: 'Lobo',               valor: 11000, prob: 0.10 },
        { nombre: 'Oso',                valor: 20000, prob: 0.07 },
        { nombre: 'Unicornio legendario',valor: 45000, prob: 0.03 },
    ];
    const r = Math.random();
    let acc = 0, presa;
    for (const p of presas) { acc += p.prob; if (r <= acc) { presa = p; break; } }
    if (!presa) presa = presas[0];
    const evCazar = obtenerEventoActivo();
    let valorPresa = presa.valor;
    let msgEvento = '';
    if      (evCazar?.tipo === 'temporada_caza')    { valorPresa *= 2;                           msgEvento = '\n| Temporada de Caza — x2'; }
    else if (evCazar?.tipo === 'racha_suerte')       { valorPresa = Math.floor(valorPresa * 1.5); msgEvento = '\n| Racha de Suerte — x1.5'; }
    else if (evCazar?.tipo === 'luna_llena')         { valorPresa = Math.floor(valorPresa * 2.5); msgEvento = '\n| Luna Llena — x2.5'; }
    else if (evCazar?.tipo === 'suerte_total')       { valorPresa *= 2;                           msgEvento = '\n| Suerte Total — x2'; }
    else if (evCazar?.tipo === 'cosecha_abundante')  { valorPresa = Math.floor(valorPresa * 1.75); msgEvento = '\n| Cosecha Abundante — x1.75'; }
    u.monedas = (u.monedas || 0) + valorPresa;
    u.ultimoCazar = ahora;
    trackear(u, 'cazados');
    guardarUsuario(senderJid, u);
    const txt = `${H('Caceria')}\n\n${FI} Cazaste un *${presa.nombre}*\n${FE} *+${valorPresa.toLocaleString()} ⓃNexCoins*${msgEvento}\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`;
    const env = await enviarMediaLocal(sock, jid, 'media/jobs/win', txt);
    if (!env) await sock.sendMessage(jid, { text: txt });
}

// ══════════════════════════════════════════
//  PESCAR
// ══════════════════════════════════════════
async function cmdFish(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const espera = 20 * 60 * 1000;
    if (u.ultimoFish && ahora - u.ultimoFish < espera) {
        const r = espera - (ahora - u.ultimoFish);
        await sock.sendMessage(jid, { text: `${WARN} Aún hay peces que se escapan. Espera *${Math.ceil(r / 60000)} min*` });
        return;
    }
    const peces = [
        { nombre: 'Sardina',       valor: 600,   prob: 0.40 },
        { nombre: 'Pez tropical',  valor: 2000,  prob: 0.25 },
        { nombre: 'Pez globo',     valor: 4000,  prob: 0.15 },
        { nombre: 'Calamar gigante',valor: 8000,  prob: 0.10 },
        { nombre: 'Tiburon',       valor: 16000, prob: 0.07 },
        { nombre: 'Ballena dorada', valor: 40000, prob: 0.03 },
    ];
    const r = Math.random();
    let acc = 0, pez;
    for (const p of peces) { acc += p.prob; if (r <= acc) { pez = p; break; } }
    if (!pez) pez = peces[0];
    const evFish = obtenerEventoActivo();
    let valorPez = pez.valor;
    let msgEvento = '';
    if      (evFish?.tipo === 'dia_pesca')          { valorPez *= 2;                          msgEvento = '\n| Dia de Pesca — x2'; }
    else if (evFish?.tipo === 'racha_suerte')        { valorPez = Math.floor(valorPez * 1.5);  msgEvento = '\n| Racha de Suerte — x1.5'; }
    else if (evFish?.tipo === 'luna_llena')          { valorPez = Math.floor(valorPez * 2.5);  msgEvento = '\n| Luna Llena — x2.5'; }
    else if (evFish?.tipo === 'suerte_total')        { valorPez *= 2;                          msgEvento = '\n| Suerte Total — x2'; }
    else if (evFish?.tipo === 'cosecha_abundante')   { valorPez = Math.floor(valorPez * 1.75); msgEvento = '\n| Cosecha Abundante — x1.75'; }
    u.monedas = (u.monedas || 0) + valorPez;
    u.ultimoFish = ahora;
    trackear(u, 'pescados');
    guardarUsuario(senderJid, u);
    const txt = `${H('Pesca')}\n\n${FI} Atrapaste un *${pez.nombre}*\n${FE} *+${valorPez.toLocaleString()} ⓃNexCoins*${msgEvento}\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`;
    const env = await enviarMediaLocal(sock, jid, 'media/jobs/win', txt);
    if (!env) await sock.sendMessage(jid, { text: txt });
}

// ══════════════════════════════════════════
//  MAZMORRA
// ══════════════════════════════════════════
async function cmdMazmorra(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const espera = 60 * 60 * 1000;
    if (u.ultimaMazmorra && ahora - u.ultimaMazmorra < espera) {
        const r = espera - (ahora - u.ultimaMazmorra);
        await sock.sendMessage(jid, { text: `${WARN} Aún te recuperas. Espera *${Math.ceil(r / 60000)} min*` });
        return;
    }
    const pisos = [
        { nombre: 'Cripta de los muertos', enemigo: 'Esqueleto',       min: 6000,  max: 14000, exito: 0.70 },
        { nombre: 'Caverna del dragon',     enemigo: 'Dragon joven',   min: 12000, max: 28000, exito: 0.55 },
        { nombre: 'Torre oscura',           enemigo: 'Mago oscuro',    min: 9000,  max: 20000, exito: 0.60 },
        { nombre: 'Pantano venenoso',       enemigo: 'Hidra',          min: 7000,  max: 18000, exito: 0.65 },
        { nombre: 'Castillo maldito',       enemigo: 'Vampiro anciano', min: 16000, max: 40000, exito: 0.45 },
    ];
    const piso = pisos[Math.floor(Math.random() * pisos.length)];
    const evPre = obtenerEventoActivo();
    const tasa  = evPre?.tipo === 'invasion_mazmorra' ? 0.90 : piso.exito;
    const exito = Math.random() < tasa;
    u.ultimaMazmorra = ahora;

    if (exito) {
        let ganancia = Math.floor(Math.random() * (piso.max - piso.min)) + piso.min;
        const evMaz  = obtenerEventoActivo();
        let msgEvento = '';
        if      (evMaz?.tipo === 'asedio')           { ganancia *= 2;                          msgEvento = '\n| Asedio Epico — x2'; }
        else if (evMaz?.tipo === 'racha_suerte')     { ganancia = Math.floor(ganancia * 1.5); msgEvento = '\n| Racha de Suerte — x1.5'; }
        else if (evMaz?.tipo === 'suerte_total')     { ganancia *= 2;                          msgEvento = '\n| Suerte Total — x2'; }
        else if (evMaz?.tipo === 'fiesta_nexus')     { ganancia *= 2;                          msgEvento = '\n| Fiesta Nexus — x2'; }
        u.monedas = (u.monedas || 0) + ganancia;
        trackear(u, 'mazmorrasOK');
        guardarUsuario(senderJid, u);
        const txt = `${H(`Mazmorra — ${piso.nombre}`)}\n\n${FA} Venciste al *${piso.enemigo}*${msgEvento}\n${FE} Botín » *+${ganancia.toLocaleString()} ⓃNC*\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`;
        const env = await enviarMediaLocal(sock, jid, 'media/jobs/win', txt);
        if (!env) await sock.sendMessage(jid, { text: txt });
    } else {
        const perdida = Math.floor(Math.random() * 5000) + 3000;
        u.monedas = Math.max(0, (u.monedas || 0) - perdida);
        guardarUsuario(senderJid, u);
        const txt = `${H(`Derrotado — ${piso.nombre}`)}\n\n${ERR} *${piso.enemigo}* te venció.\n${FI} Perdiste *${perdida.toLocaleString()} ⓃNC*\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`;
        const env = await enviarMediaLocal(sock, jid, 'media/jobs/lose', txt);
        if (!env) await sock.sendMessage(jid, { text: txt });
    }
}

// ══════════════════════════════════════════
//  SEMANAL
// ══════════════════════════════════════════
async function cmdSemanal(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora    = Date.now();
    const unaSemana = 7 * 24 * 60 * 60 * 1000;
    u.ultimoSemanal   = u.ultimoSemanal  || 0;
    u.weeklyStreak    = u.weeklyStreak   || 0;
    u.ultimoSemanRac  = u.ultimoSemanRac || 0;
    if (u.ultimoSemanal && ahora - u.ultimoSemanal < unaSemana) {
        const restante = unaSemana - (ahora - u.ultimoSemanal);
        const dias    = Math.floor(restante / 86400000);
        const horas   = Math.floor((restante % 86400000) / 3600000);
        const minutos = Math.floor((restante % 3600000) / 60000);
        await sock.sendMessage(jid, {
            text: `${WARN} Ya reclamaste tu semanal.\n${F} Vuelve en *${dias}d ${horas}h ${minutos}m*\n${FI} Racha actual » *${u.weeklyStreak}* semana(s)`
        });
        return;
    }
    const perdioRacha = u.weeklyStreak > 0 && u.ultimoSemanRac && (ahora - u.ultimoSemanRac) > unaSemana * 1.5;
    if (perdioRacha) u.weeklyStreak = 0;
    u.weeklyStreak   = Math.min((u.weeklyStreak || 0) + 1, 30);
    u.ultimoSemanRac = ahora;
    const ganadas  = Math.min(40000 + (u.weeklyStreak - 1) * 5000, 185000);
    const siguiente = Math.min(40000 + u.weeklyStreak * 5000, 185000);
    u.monedas = (u.monedas || 0) + ganadas;
    u.ultimoSemanal = ahora;
    trackear(u, 'semanales');
    guardarUsuario(senderJid, u);
    const rachaMsg = u.weeklyStreak > 1
        ? `${FI} Racha » semana *${u.weeklyStreak}* — Próxima: *+${siguiente.toLocaleString()} ⓃNC*`
        : `${FI} _Primera semana — sigue reclamando cada semana para más bonus_`;
    const perdioMsg = perdioRacha ? `\n${WARN} _Racha perdida — vuelve a construirla_` : '';
    await sock.sendMessage(jid, {
        text: `${H('Recompensa Semanal')}\n\n${FE} *+${ganadas.toLocaleString()} ⓃNexCoins*${perdioMsg}\n${rachaMsg}\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`
    });
}

// ══════════════════════════════════════════
//  MENSUAL
// ══════════════════════════════════════════
async function cmdMensual(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    const jail = verificarCarcel(u);
    if (jail) { await sock.sendMessage(jid, { text: jail }); return; }
    const ahora = Date.now();
    const unMes  = 30 * 24 * 60 * 60 * 1000;
    u.ultimoMensual  = u.ultimoMensual || 0;
    u.monthlyStreak  = u.monthlyStreak || 0;
    u.ultimoMensRac  = u.ultimoMensRac || 0;
    if (u.ultimoMensual && ahora - u.ultimoMensual < unMes) {
        const restante = unMes - (ahora - u.ultimoMensual);
        const dias    = Math.floor(restante / 86400000);
        const horas   = Math.floor((restante % 86400000) / 3600000);
        const minutos = Math.floor((restante % 3600000) / 60000);
        await sock.sendMessage(jid, {
            text: `${WARN} Ya reclamaste tu mensual.\n${F} Vuelve en *${dias}d ${horas}h ${minutos}m*\n${FI} Racha actual » *${u.monthlyStreak}* mes(es)`
        });
        return;
    }
    const perdioRacha = u.monthlyStreak > 0 && u.ultimoMensRac && (ahora - u.ultimoMensRac) > unMes * 1.5;
    if (perdioRacha) u.monthlyStreak = 0;
    u.monthlyStreak  = Math.min((u.monthlyStreak || 0) + 1, 8);
    u.ultimoMensRac  = ahora;
    const ganadas  = Math.min(60000 + (u.monthlyStreak - 1) * 5000, 95000);
    const siguiente = Math.min(60000 + u.monthlyStreak * 5000, 95000);
    u.monedas = (u.monedas || 0) + ganadas;
    u.ultimoMensual = ahora;
    trackear(u, 'mensuales');
    guardarUsuario(senderJid, u);
    const rachaMsg = u.monthlyStreak > 1
        ? `${FI} Racha » mes *${u.monthlyStreak}* — Próxima: *+${siguiente.toLocaleString()} ⓃNC*`
        : `${FI} _Primer mes — recuerda volver cada mes para más bonus_`;
    const perdioMsg = perdioRacha ? `\n${WARN} _Racha mensual perdida — vuelve a construirla_` : '';
    await sock.sendMessage(jid, {
        text: `${H('Recompensa Mensual')}\n\n${FE} *+${ganadas.toLocaleString()} ⓃNexCoins*${perdioMsg}\n${rachaMsg}\n\n${F} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`
    });
}

module.exports = {
    cmdSaldo, cmdEconomyInfo, cmdDiario, cmdWork, cmdCrime, cmdSlut, cmdCoinflip,
    cmdDeposit, cmdWithdraw, cmdRoulette, cmdSteal, cmdTransferir,
    cmdBaltop, cmdRichTopGlobal, cmdRichTopGroup, cmdLevelTopGlobal, cmdLevelTopGroup,
    cmdTienda, cmdComprar, cmdInventario,
    cmdMinar, cmdAdventure, cmdCazar, cmdFish, cmdMazmorra,
    cmdSemanal, cmdMensual
};
