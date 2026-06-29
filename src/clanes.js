const { getUsuario, guardarUsuario, safeInt } = require('./database');
const fs = require('fs-extra');
const path = require('path');
const { H, SH, F, FS, FI, FE, FC, FA, OK, ERR, WARN, INFO, DIV, nombre: fmt } = require('./style');

const CLANES_PATH = path.join(__dirname, '../data/clanes.json');

let _clanesCache = null;
let _clanesDirty = false;

function _flushClanes() {
    if (!_clanesDirty || !_clanesCache) return;
    try {
        fs.ensureDirSync(path.dirname(CLANES_PATH));
        fs.writeJsonSync(CLANES_PATH, _clanesCache, { spaces: 2 });
        _clanesDirty = false;
    } catch (e) {
        console.error('Error guardando clanes:', e.message);
    }
}

setInterval(_flushClanes, 5000).unref();
process.on('exit',    _flushClanes);
process.on('SIGINT',  () => { _flushClanes(); process.exit(0); });
process.on('SIGTERM', () => { _flushClanes(); process.exit(0); });

function cargarClanes() {
    if (_clanesCache) return _clanesCache;
    fs.ensureDirSync(path.dirname(CLANES_PATH));
    if (!fs.existsSync(CLANES_PATH)) fs.writeJsonSync(CLANES_PATH, {});
    try {
        _clanesCache = fs.readJsonSync(CLANES_PATH);
    } catch { _clanesCache = {}; }
    return _clanesCache;
}

function guardarClanes(data) {
    _clanesCache = data;
    _clanesDirty = true;
    _flushClanes();
}

function esLider(clan, jid)    { return clan.lider === jid; }
function esOficial(clan, jid)  { return (clan.oficiales || []).includes(jid); }
function esMiembro(clan, jid)  { return (clan.miembros || []).includes(jid); }
function esRangoClan(clan, jid) { return esLider(clan, jid) || esOficial(clan, jid); }

function getRangoClan(clan, jid) {
    if (esLider(clan, jid))   return '◈ Lider';
    if (esOficial(clan, jid)) return '✦ Oficial';
    return '◇ Miembro';
}

async function cmdCrearClan(sock, jid, senderJid, args) {
    const nombre = args.join(' ').trim();
    if (!nombre || nombre.length < 3 || nombre.length > 20) {
        await sock.sendMessage(jid, {
            text: `${ERR} Uso: *#createguild [nombre]*\nEl nombre debe tener entre 3 y 20 caracteres.`
        });
        return;
    }
    const u = getUsuario(senderJid);
    if (u.clanId) {
        await sock.sendMessage(jid, {
            text: `${ERR} Ya perteneces al clan *${u.clanId}*. Usa *#leaveguild* para salir primero.`
        });
        return;
    }
    const clanes = cargarClanes();
    const clanIdNorm = nombre.toLowerCase().replace(/\s+/g, '_');
    if (clanes[clanIdNorm]) {
        await sock.sendMessage(jid, { text: `${ERR} Ya existe un clan con ese nombre.` });
        return;
    }
    const costoCrear = 1000;
    if (safeInt(u.monedas) < costoCrear) {
        await sock.sendMessage(jid, {
            text: `${ERR} Crear un clan cuesta *${costoCrear} ⓃNexCoins*. Tienes *${u.monedas || 0}*.`
        });
        return;
    }
    u.monedas -= costoCrear;
    u.clanId = clanIdNorm;
    if (!u.contadores) u.contadores = {};
    u.contadores.clanFundado = true;
    guardarUsuario(senderJid, u);
    clanes[clanIdNorm] = {
        nombre,
        lider:        senderJid,
        miembros:     [senderJid],
        oficiales:    [],
        xp:           0,
        nivel:        1,
        descripcion:  null,
        fotoUrl:      null,
        banco:        0,
        logBanco:     [],
        ultimaGuerra: null,
        guerrasGanadas: 0,
        guerrasTotales: 0,
        creado:       Date.now()
    };
    guardarClanes(clanes);
    await sock.sendMessage(jid, {
        text: `${H('Clan creado')}\n\n${F} Nombre » *${nombre}*\n${FC} Lider » \`${u.pushName || senderJid.split('@')[0]}\`\n${FE} Costo » *${costoCrear} ⓃNexCoins*\n\n${INFO} Personaliza con *#editguild desc [texto]*\n_Invita miembros con *#joinguild ${nombre}*_`
    });
}

async function cmdUnirClan(sock, jid, senderJid, args) {
    const nombre = args.join(' ').trim();
    if (!nombre) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#joinguild [nombre del clan]*` });
        return;
    }
    const u = getUsuario(senderJid);
    if (u.clanId) {
        await sock.sendMessage(jid, {
            text: `${ERR} Ya eres miembro del clan *${u.clanId}*. Sal primero con *#leaveguild*`
        });
        return;
    }
    const clanes = cargarClanes();
    const clanId = nombre.toLowerCase().replace(/\s+/g, '_');
    if (!clanes[clanId]) {
        await sock.sendMessage(jid, { text: `${ERR} El clan *${nombre}* no existe.` });
        return;
    }
    const clan = clanes[clanId];
    if (clan.miembros.length >= 20) {
        await sock.sendMessage(jid, {
            text: `${ERR} El clan *${clan.nombre}* está lleno (máx 20 miembros).`
        });
        return;
    }

    if (clan.abierto === true) {
        clan.miembros.push(senderJid);
        u.clanId = clanId;
        guardarUsuario(senderJid, u);
        guardarClanes(clanes);
        const liderN = fmt(clan.lider, null);
        await sock.sendMessage(jid, {
            text: `${OK} *Te uniste a ${clan.nombre}*\n\n${FI} Miembros » *${clan.miembros.length}/20*\n${FC} Lider » \`${clan.lider.split('@')[0]}\`\n${FE} Banco del clan » *${(clan.banco || 0).toLocaleString()} ⓃNC*`
        });
        return;
    }

    if (!clan.solicitudes) clan.solicitudes = [];
    if (clan.solicitudes.includes(senderJid)) {
        await sock.sendMessage(jid, {
            text: `${WARN} Ya tienes una solicitud pendiente en *${clan.nombre}*. Espera a que el líder la revise.`
        });
        return;
    }
    clan.solicitudes.push(senderJid);
    guardarClanes(clanes);

    await sock.sendMessage(jid, {
        text: `${OK} *Solicitud enviada a ${clan.nombre}*\n\n_El líder del clan recibirá tu solicitud y podrá aceptarla con *#guildaccept @ti*._\n${WARN} Espera la respuesta del líder.`
    });

    try {
        await sock.sendMessage(jid, {
            text: `${INFO} \`${clan.lider.split('@')[0]}\`, \`${senderJid.split('@')[0]}\` quiere unirse a *${clan.nombre}*.\n_Usa *#guildpending* para ver solicitudes o *#guildaccept @usuario* para aprobar._`
        });
    } catch {}
}

async function cmdVerSolicitudes(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    if (!u.clanId) {
        await sock.sendMessage(jid, { text: `${ERR} No perteneces a ningún clan.` });
        return;
    }
    const clanes = cargarClanes();
    const clan = clanes[u.clanId];
    if (!clan) {
        await sock.sendMessage(jid, { text: `${ERR} Tu clan no existe.` });
        return;
    }
    if (!esRangoClan(clan, senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el líder o los oficiales pueden ver las solicitudes.` });
        return;
    }
    const solicitudes = clan.solicitudes || [];
    if (!solicitudes.length) {
        await sock.sendMessage(jid, {
            text: `${INFO} No hay solicitudes pendientes para *${clan.nombre}*.`
        });
        return;
    }
    const lista = solicitudes.map((jidS, i) => `${i + 1}. \`${jidS.split('@')[0]}\``).join('\n');
    await sock.sendMessage(jid, {
        text: `${H(`Solicitudes — ${clan.nombre}`)}\n\n${lista}\n\n_Acepta con *#guildaccept @usuario*\nRechaza con *#guilddeny @usuario*_`
    });
}

async function cmdGestionarSolicitud(sock, jid, senderJid, mencionados, aceptar) {
    const u = getUsuario(senderJid);
    if (!u.clanId) {
        await sock.sendMessage(jid, { text: `${ERR} No perteneces a ningún clan.` });
        return;
    }
    const clanes = cargarClanes();
    const clan = clanes[u.clanId];
    if (!clan) {
        await sock.sendMessage(jid, { text: `${ERR} Tu clan no existe.` });
        return;
    }
    if (!esRangoClan(clan, senderJid)) {
        await sock.sendMessage(jid, {
            text: `${ERR} Solo el líder o los oficiales pueden ${aceptar ? 'aceptar' : 'rechazar'} solicitudes.`
        });
        return;
    }
    if (!mencionados || !mencionados.length) {
        await sock.sendMessage(jid, {
            text: `${ERR} Uso: *#${aceptar ? 'guildaccept' : 'guilddeny'} @usuario*`
        });
        return;
    }
    const targetJid = mencionados[0];
    if (!clan.solicitudes) clan.solicitudes = [];
    const solIdx = clan.solicitudes.indexOf(targetJid);
    if (solIdx === -1) {
        await sock.sendMessage(jid, {
            text: `${ERR} \`${targetJid.split('@')[0]}\` no tiene una solicitud pendiente en *${clan.nombre}*.`
        });
        return;
    }

    clan.solicitudes.splice(solIdx, 1);

    if (!aceptar) {
        guardarClanes(clanes);
        await sock.sendMessage(jid, {
            text: `${OK} Solicitud de \`${targetJid.split('@')[0]}\` rechazada.`
        });
        return;
    }

    const uTarget = getUsuario(targetJid);
    if (uTarget.clanId) {
        guardarClanes(clanes);
        await sock.sendMessage(jid, {
            text: `${WARN} \`${targetJid.split('@')[0]}\` ya pertenece a otro clan. Solicitud eliminada.`
        });
        return;
    }
    if (clan.miembros.length >= 20) {
        guardarClanes(clanes);
        await sock.sendMessage(jid, {
            text: `${ERR} El clan está lleno (20/20). No se puede aceptar a \`${targetJid.split('@')[0]}\`.`
        });
        return;
    }

    clan.miembros.push(targetJid);
    uTarget.clanId = u.clanId;
    guardarUsuario(targetJid, uTarget);
    guardarClanes(clanes);

    await sock.sendMessage(jid, {
        text: `${OK} \`${targetJid.split('@')[0]}\` fue aceptado en *${clan.nombre}*.\n\n${FI} Miembros » *${clan.miembros.length}/20*`
    });
}

async function cmdSalirClan(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    if (!u.clanId) {
        await sock.sendMessage(jid, { text: `${ERR} No perteneces a ningún clan.` });
        return;
    }
    const clanes = cargarClanes();
    const clan = clanes[u.clanId];
    if (clan) {
        if (clan.lider === senderJid && clan.miembros.length > 1) {
            await sock.sendMessage(jid, {
                text: `${ERR} Eres el líder. Transfiere el liderazgo con *#guildpromote @usuario lider* o disuelve el clan con *#disbandguild*.`
            });
            return;
        }
        clan.miembros  = clan.miembros.filter(m => m !== senderJid);
        clan.oficiales = (clan.oficiales || []).filter(m => m !== senderJid);
        if (clan.miembros.length === 0) {
            delete clanes[u.clanId];
        }
        guardarClanes(clanes);
    }
    const nombreClan = u.clanId;
    u.clanId = null;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `${OK} Saliste del clan *${nombreClan}*.` });
}

async function cmdInfoClan(sock, jid, senderJid, args) {
    const clanes = cargarClanes();
    const u = getUsuario(senderJid);
    const nombre = args.join(' ').trim();
    const clanId = nombre ? nombre.toLowerCase().replace(/\s+/g, '_') : u.clanId;
    if (!clanId) {
        await sock.sendMessage(jid, {
            text: `${ERR} No perteneces a ningún clan. Usa *#guildinfo [nombre]* para buscar uno.`
        });
        return;
    }
    const clan = clanes[clanId];
    if (!clan) {
        await sock.sendMessage(jid, { text: `${ERR} El clan no existe.` });
        return;
    }
    if (!clan.oficiales) clan.oficiales = [];
    if (clan.banco === undefined) clan.banco = 0;

    const descText = clan.descripcion ? `\n_${clan.descripcion}_` : '';
    const winRate  = clan.guerrasTotales
        ? `${Math.round((clan.guerrasGanadas || 0) * 100 / clan.guerrasTotales)}%`
        : 'N/A';

    const miembrosTexto = clan.miembros.map(m => {
        const rango = getRangoClan(clan, m);
        return `${F} ${rango} — \`${m.split('@')[0]}\``;
    }).join('\n');

    const txt =
        `${H(clan.nombre)}${descText}\n\n` +
        `${FC} Lider » \`${clan.lider.split('@')[0]}\`\n` +
        `${FI} Miembros » *${clan.miembros.length}/20*\n` +
        `${FS} XP » *${clan.xp}* | Nivel » *${clan.nivel}*\n` +
        `${FE} Banco del clan » *${safeInt(clan.banco).toLocaleString()} ⓃNC*\n` +
        `${FA} Guerras » *${clan.guerrasGanadas || 0}V / ${clan.guerrasTotales || 0}J* (${winRate} victorias)\n` +
        `${F} Fundado » ${new Date(clan.creado).toLocaleDateString()}\n\n` +
        `${SH('Miembros')}\n${miembrosTexto}`;

    if (clan.fotoUrl && fs.existsSync(clan.fotoUrl)) {
        try {
            const buf = fs.readFileSync(clan.fotoUrl);
            await sock.sendMessage(jid, { image: buf, caption: txt });
            return;
        } catch {}
    }
    await sock.sendMessage(jid, { text: txt });
}

async function cmdEditarClan(sock, jid, senderJid, args, msg) {
    const u = getUsuario(senderJid);
    if (!u.clanId) {
        await sock.sendMessage(jid, { text: `${ERR} No perteneces a ningún clan.` });
        return;
    }
    const clanes = cargarClanes();
    const clan = clanes[u.clanId];
    if (!clan) {
        await sock.sendMessage(jid, { text: `${ERR} Tu clan no existe.` });
        return;
    }
    if (!esRangoClan(clan, senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el *líder* u *oficiales* del clan pueden editarlo.` });
        return;
    }
    const sub = args[0]?.toLowerCase();
    if (sub === 'desc' || sub === 'descripcion' || sub === 'description') {
        const desc = args.slice(1).join(' ').trim();
        if (!desc) {
            await sock.sendMessage(jid, { text: `${ERR} Uso: *#editguild desc [descripción]*` });
            return;
        }
        if (desc.length > 100) {
            await sock.sendMessage(jid, { text: `${ERR} La descripción no puede superar 100 caracteres.` });
            return;
        }
        clan.descripcion = desc;
        guardarClanes(clanes);
        await sock.sendMessage(jid, { text: `${OK} Descripción del clan actualizada:\n_"${desc}"_` });
        return;
    }
    if (sub === 'foto' || sub === 'imagen') {
        if (!esLider(clan, senderJid)) {
            await sock.sendMessage(jid, { text: `${ERR} Solo el *líder* puede cambiar la foto del clan.` });
            return;
        }
        const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const imgMsg = msg?.message?.imageMessage || quoted?.imageMessage;
        if (!imgMsg) {
            await sock.sendMessage(jid, { text: `${ERR} Responde a una imagen con *#editguild foto*.` });
            return;
        }
        try {
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const stream = await downloadContentFromMessage(imgMsg, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            const fotoDir  = path.join(__dirname, '../data/clan_fotos');
            fs.ensureDirSync(fotoDir);
            const fotoPath = path.join(fotoDir, `${u.clanId}.jpg`);
            fs.writeFileSync(fotoPath, buffer);
            clan.fotoUrl = fotoPath;
            guardarClanes(clanes);
            await sock.sendMessage(jid, { text: `${OK} Foto del clan actualizada.` });
        } catch (err) {
            await sock.sendMessage(jid, { text: `${ERR} Error guardando la foto: ${err.message}` });
        }
        return;
    }
    await sock.sendMessage(jid, {
        text: `${ERR} Sub-comandos disponibles:\n${F} *#editguild desc [texto]* — Cambiar descripción\n${F} *#editguild foto* — Cambiar foto (responde imagen)`
    });
}

async function cmdGuerraClanes(sock, jid, senderJid, args) {
    const clanes = cargarClanes();
    const u = getUsuario(senderJid);
    if (!u.clanId || !clanes[u.clanId]) {
        await sock.sendMessage(jid, { text: `${ERR} Necesitas pertenecer a un clan para declarar guerra.` });
        return;
    }
    const nombre = args.join(' ').trim();
    if (!nombre) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#guildbattle [nombre del clan enemigo]*` });
        return;
    }
    const clanEnemigoId = nombre.toLowerCase().replace(/\s+/g, '_');
    if (!clanes[clanEnemigoId]) {
        await sock.sendMessage(jid, { text: `${ERR} El clan *${nombre}* no existe.` });
        return;
    }
    if (clanEnemigoId === u.clanId) {
        await sock.sendMessage(jid, { text: `${ERR} No puedes luchar contra tu propio clan.` });
        return;
    }
    const clanA = clanes[u.clanId];
    const clanB = clanes[clanEnemigoId];
    if (!clanA.oficiales) clanA.oficiales = [];
    if (!clanB.oficiales) clanB.oficiales = [];

    if (!esRangoClan(clanA, senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el *líder* u *oficiales* pueden declarar guerra.` });
        return;
    }

    const COOLDOWN_GUERRA = 4 * 60 * 60 * 1000;
    if (clanA.ultimaGuerra && Date.now() - clanA.ultimaGuerra < COOLDOWN_GUERRA) {
        const restante = COOLDOWN_GUERRA - (Date.now() - clanA.ultimaGuerra);
        const horas    = Math.floor(restante / 3600000);
        const minutos  = Math.floor((restante % 3600000) / 60000);
        await sock.sendMessage(jid, {
            text: `${WARN} Tu clan ya peleó recientemente. Próxima guerra disponible en *${horas}h ${minutos}m*.`
        });
        return;
    }

    const calcularPoder = (miembros) => miembros.reduce((acc, uid) => {
        const s = getUsuario(uid).stats || { fuerza: 10, defensa: 10, nivel: 1 };
        return acc + safeInt(s.fuerza) + safeInt(s.defensa) + safeInt(s.nivel) * 5;
    }, 0);

    const poderBaseA = calcularPoder(clanA.miembros);
    const poderBaseB = calcularPoder(clanB.miembros);
    const bonoClanA  = (clanA.nivel || 1) * 20;
    const bonoClanB  = (clanB.nivel || 1) * 20;
    const poderA = poderBaseA + bonoClanA + Math.random() * 80;
    const poderB = poderBaseB + bonoClanB + Math.random() * 80;

    const ganoA   = poderA > poderB;
    const ganador  = ganoA ? clanA : clanB;
    const perdedor = ganoA ? clanB : clanA;

    clanA.ultimaGuerra    = Date.now();
    clanA.guerrasTotales  = (clanA.guerrasTotales || 0) + 1;
    clanB.guerrasTotales  = (clanB.guerrasTotales || 0) + 1;
    if (ganoA) {
        clanA.guerrasGanadas = (clanA.guerrasGanadas || 0) + 1;
    } else {
        clanB.guerrasGanadas = (clanB.guerrasGanadas || 0) + 1;
    }

    const uSender = getUsuario(senderJid);
    if (!uSender.contadores) uSender.contadores = {};
    uSender.contadores.guerrasJugadas = (uSender.contadores.guerrasJugadas || 0) + 1;
    guardarUsuario(senderJid, uSender);

    const xpGanancia = 50 * ganador.miembros.length;
    ganador.xp = safeInt(ganador.xp) + xpGanancia;
    while (ganador.xp >= ganador.nivel * 1000) {
        ganador.xp -= ganador.nivel * 1000;
        ganador.nivel++;
    }

    const premioPorMiembro = 200 + (ganador.nivel || 1) * 50;
    ganador.miembros.forEach(uid => {
        const uu = getUsuario(uid);
        uu.monedas = safeInt(uu.monedas) + premioPorMiembro;
        if (!uu.contadores) uu.contadores = {};
        if (uid !== senderJid) uu.contadores.guerrasJugadas = (uu.contadores.guerrasJugadas || 0) + 1;
        guardarUsuario(uid, uu);
    });

    guardarClanes(clanes);

    const barraPoder = (p, max) => {
        const pct = Math.min(Math.round(p / max * 10), 10);
        return '▰'.repeat(pct) + '░'.repeat(10 - pct);
    };
    const maxPoder = Math.max(poderA, poderB);

    await sock.sendMessage(jid, {
        text:
            `${H('Guerra de Clanes')}\n\n` +
            `${FI} *${clanA.nombre}* Nv.${clanA.nivel}\n` +
            `| Poder: [${barraPoder(poderA, maxPoder)}] ${Math.round(poderA)}\n\n` +
            `${'▬'.repeat(18)}\n\n` +
            `${FI} *${clanB.nombre}* Nv.${clanB.nivel}\n` +
            `| Poder: [${barraPoder(poderB, maxPoder)}] ${Math.round(poderB)}\n\n` +
            `${'▬'.repeat(18)}\n` +
            `${FS} *${ganador.nombre} GANA*\n` +
            `${FE} Cada miembro gana *${premioPorMiembro} ⓃNexCoins*\n` +
            `${FC} +${xpGanancia} XP → Nv.*${ganador.nivel}*\n\n` +
            `${F} ${clanA.nombre}: ${clanA.guerrasGanadas || 0}V/${clanA.guerrasTotales || 0}J | ` +
            `${clanB.nombre}: ${clanB.guerrasGanadas || 0}V/${clanB.guerrasTotales || 0}J`
    });
}

async function cmdListaClanes(sock, jid, pagina = 1) {
    const { paginar, piePagina } = require('./paginator');
    const clanes = cargarClanes();
    const todos  = Object.values(clanes).sort((a, b) => (b.nivel * 1000 + b.xp) - (a.nivel * 1000 + a.xp));
    if (!todos.length) {
        await sock.sendMessage(jid, {
            text: `${INFO} No hay clanes registrados.\n_Crea uno con *#createguild [nombre]*_`
        });
        return;
    }
    const { items: lista, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    let txt = `${H('Top Clanes')}\n\n`;
    lista.forEach((c, i) => {
        const desc    = c.descripcion ? ` — _${c.descripcion.slice(0, 28)}${c.descripcion.length > 28 ? '...' : ''}_` : '';
        const winRate = c.guerrasTotales ? ` (${Math.round((c.guerrasGanadas || 0) * 100 / c.guerrasTotales)}% wins)` : '';
        txt += `${inicio + i + 1}. *${c.nombre}* Nv.${c.nivel} | ${c.miembros.length} miembros${winRate}${desc}\n`;
    });
    txt += piePagina(pag, totalPags, 'guildtop');
    await sock.sendMessage(jid, { text: txt });
}

async function cmdBancoClan(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    if (!u.clanId) {
        await sock.sendMessage(jid, { text: `${ERR} No perteneces a ningún clan.` });
        return;
    }
    const clanes = cargarClanes();
    const clan   = clanes[u.clanId];
    if (!clan) {
        await sock.sendMessage(jid, { text: `${ERR} Tu clan no existe.` });
        return;
    }
    if (clan.banco === undefined) clan.banco = 0;

    const log = (clan.logBanco || []).slice(-5).reverse();
    const logTxt = log.length
        ? log.map(l => `${F} ${l.tipo === 'dep' ? '▲' : '▼'} ${l.cantidad.toLocaleString()} ⓃNC — ${l.quien} (${new Date(l.fecha).toLocaleDateString()})`).join('\n')
        : '_Sin movimientos aún_';

    await sock.sendMessage(jid, {
        text:
            `${H(`Banco — ${clan.nombre}`)}\n\n` +
            `${FE} Saldo » *${safeInt(clan.banco).toLocaleString()} ⓃNexCoins*\n` +
            `${FS} Nivel del clan » *${clan.nivel}*\n\n` +
            `${SH('Ultimos movimientos')}\n${logTxt}\n\n` +
            `_Deposita con *#guilddeposit [cantidad]*_\n` +
            `_Oficiales/Líder: *#guildwithdraw [cantidad]*_`
    });
}

async function cmdDepositarClan(sock, jid, senderJid, args) {
    const u = getUsuario(senderJid);
    if (!u.clanId) {
        await sock.sendMessage(jid, { text: `${ERR} No perteneces a ningún clan.` });
        return;
    }
    const cantidad = parseInt(args[0]);
    if (isNaN(cantidad) || cantidad <= 0) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#guilddeposit [cantidad]*` });
        return;
    }
    if (safeInt(u.monedas) < cantidad) {
        await sock.sendMessage(jid, {
            text: `${ERR} No tienes suficientes ⓃNexCoins. Tienes *${(u.monedas || 0).toLocaleString()}*.`
        });
        return;
    }
    const clanes = cargarClanes();
    const clan   = clanes[u.clanId];
    if (!clan) {
        await sock.sendMessage(jid, { text: `${ERR} Tu clan no existe.` });
        return;
    }
    if (clan.banco === undefined) clan.banco = 0;

    u.monedas  -= cantidad;
    clan.banco  = safeInt(clan.banco) + cantidad;

    if (!clan.logBanco) clan.logBanco = [];
    clan.logBanco.push({ tipo: 'dep', cantidad, quien: u.pushName || senderJid.split('@')[0], fecha: Date.now() });
    if (clan.logBanco.length > 20) clan.logBanco = clan.logBanco.slice(-20);

    const xpBonus = Math.floor(cantidad / 100);
    if (xpBonus > 0) {
        clan.xp = safeInt(clan.xp) + xpBonus;
        while (clan.xp >= clan.nivel * 1000) {
            clan.xp -= clan.nivel * 1000;
            clan.nivel++;
        }
    }

    guardarUsuario(senderJid, u);
    guardarClanes(clanes);

    await sock.sendMessage(jid, {
        text:
            `${OK} *Donaste al banco del clan*\n\n` +
            `${FE} Depositado » *${cantidad.toLocaleString()} ⓃNC*\n` +
            `${FS} Banco del clan » *${clan.banco.toLocaleString()} ⓃNC*\n` +
            `${xpBonus > 0 ? `${FC} +${xpBonus} XP al clan\n` : ''}` +
            `${FI} Tu cartera » *${u.monedas.toLocaleString()} ⓃNC*`
    });
}

async function cmdRetirarClan(sock, jid, senderJid, args) {
    const u = getUsuario(senderJid);
    if (!u.clanId) {
        await sock.sendMessage(jid, { text: `${ERR} No perteneces a ningún clan.` });
        return;
    }
    const clanes = cargarClanes();
    const clan   = clanes[u.clanId];
    if (!clan) {
        await sock.sendMessage(jid, { text: `${ERR} Tu clan no existe.` });
        return;
    }
    if (!esRangoClan(clan, senderJid)) {
        await sock.sendMessage(jid, {
            text: `${ERR} Solo *líderes* u *oficiales* pueden retirar del banco del clan.`
        });
        return;
    }
    const cantidad = parseInt(args[0]);
    if (isNaN(cantidad) || cantidad <= 0) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#guildwithdraw [cantidad]*` });
        return;
    }
    if (clan.banco === undefined) clan.banco = 0;
    if (safeInt(clan.banco) < cantidad) {
        await sock.sendMessage(jid, {
            text: `${ERR} El banco del clan solo tiene *${(clan.banco || 0).toLocaleString()} ⓃNC*.`
        });
        return;
    }

    clan.banco -= cantidad;
    u.monedas   = safeInt(u.monedas) + cantidad;

    if (!clan.logBanco) clan.logBanco = [];
    clan.logBanco.push({ tipo: 'ret', cantidad, quien: u.pushName || senderJid.split('@')[0], fecha: Date.now() });
    if (clan.logBanco.length > 20) clan.logBanco = clan.logBanco.slice(-20);

    guardarUsuario(senderJid, u);
    guardarClanes(clanes);

    await sock.sendMessage(jid, {
        text:
            `${OK} *Retiro del banco del clan*\n\n` +
            `${FE} Retirado » *${cantidad.toLocaleString()} ⓃNC*\n` +
            `${FS} Banco del clan » *${clan.banco.toLocaleString()} ⓃNC*\n` +
            `${FI} Tu cartera » *${u.monedas.toLocaleString()} ⓃNC*`
    });
}

async function cmdPromoverMiembro(sock, jid, senderJid, args, mencionados) {
    const u = getUsuario(senderJid);
    if (!u.clanId) {
        await sock.sendMessage(jid, { text: `${ERR} No perteneces a ningún clan.` });
        return;
    }
    const clanes = cargarClanes();
    const clan   = clanes[u.clanId];
    if (!clan) {
        await sock.sendMessage(jid, { text: `${ERR} Tu clan no existe.` });
        return;
    }
    if (!esLider(clan, senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el *líder* puede ascender miembros.` });
        return;
    }
    if (!clan.oficiales) clan.oficiales = [];

    const objetivo = mencionados && mencionados.length > 0 ? mencionados[0] : null;
    if (!objetivo) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#guildpromote @usuario*` });
        return;
    }
    if (!esMiembro(clan, objetivo)) {
        await sock.sendMessage(jid, { text: `${ERR} Esa persona no está en tu clan.` });
        return;
    }
    if (esOficial(clan, objetivo)) {
        await sock.sendMessage(jid, { text: `${WARN} Ese miembro ya es Oficial.` });
        return;
    }
    if (clan.oficiales.length >= 4) {
        await sock.sendMessage(jid, { text: `${ERR} Ya hay 4 oficiales (máximo permitido).` });
        return;
    }

    clan.oficiales.push(objetivo);
    guardarClanes(clanes);

    await sock.sendMessage(jid, {
        text: `${OK} \`${objetivo.split('@')[0]}\` fue ascendido a *Oficial* del clan *${clan.nombre}*.\n_Ahora puede editar el clan, retirar del banco y declarar guerras._`
    });
}

async function cmdDemotarMiembro(sock, jid, senderJid, mencionados) {
    const u = getUsuario(senderJid);
    if (!u.clanId) {
        await sock.sendMessage(jid, { text: `${ERR} No perteneces a ningún clan.` });
        return;
    }
    const clanes = cargarClanes();
    const clan   = clanes[u.clanId];
    if (!clan) {
        await sock.sendMessage(jid, { text: `${ERR} Tu clan no existe.` });
        return;
    }
    if (!esLider(clan, senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el *líder* puede bajar de rango a miembros.` });
        return;
    }

    const objetivo = mencionados && mencionados.length > 0 ? mencionados[0] : null;
    if (!objetivo) {
        await sock.sendMessage(jid, { text: `${ERR} Uso: *#guilddepromote @usuario*` });
        return;
    }
    if (!esOficial(clan, objetivo)) {
        await sock.sendMessage(jid, { text: `${WARN} Esa persona no es Oficial.` });
        return;
    }

    clan.oficiales = clan.oficiales.filter(m => m !== objetivo);
    guardarClanes(clanes);

    await sock.sendMessage(jid, {
        text: `${OK} \`${objetivo.split('@')[0]}\` bajó a *Miembro* en el clan *${clan.nombre}*.`
    });
}

async function cmdDisolverClan(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    if (!u.clanId) {
        await sock.sendMessage(jid, { text: `${ERR} No perteneces a ningún clan.` });
        return;
    }
    const clanes = cargarClanes();
    const clan   = clanes[u.clanId];
    if (!clan) {
        await sock.sendMessage(jid, { text: `${ERR} Tu clan no existe.` });
        return;
    }
    if (!esLider(clan, senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el *líder* puede disolver el clan.` });
        return;
    }

    const nombreClan = clan.nombre;
    if (safeInt(clan.banco) > 0) {
        u.monedas = safeInt(u.monedas) + safeInt(clan.banco);
        guardarUsuario(senderJid, u);
    }

    for (const jidM of clan.miembros) {
        const m = getUsuario(jidM);
        m.clanId = null;
        guardarUsuario(jidM, m);
    }

    delete clanes[u.clanId];
    guardarClanes(clanes);

    await sock.sendMessage(jid, {
        text: `${OK} El clan *${nombreClan}* fue disuelto.${safeInt(clan.banco) > 0 ? `\n${FE} El saldo del banco (*${safeInt(clan.banco).toLocaleString()} ⓃNC*) fue devuelto al líder.` : ''}\n\n_Todos los miembros quedaron sin clan._`
    });
}

async function cmdKickClan(sock, jid, senderJid, mencionados) {
    const clanes = cargarClanes();
    const u = getUsuario(senderJid);

    if (!u.clanId || !clanes[u.clanId]) {
        await sock.sendMessage(jid, { text: `${ERR} No perteneces a ningún clan.` });
        return;
    }

    const clan = clanes[u.clanId];

    if (!esLider(clan, senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el *Líder* del clan puede expulsar miembros.` });
        return;
    }

    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, {
            text: `${ERR} Uso: *#clankick @usuario*\nMenciona al miembro que deseas expulsar.`
        });
        return;
    }

    const targetJid = mencionados[0];

    if (targetJid === senderJid) {
        await sock.sendMessage(jid, {
            text: `${ERR} No puedes expulsarte a ti mismo. Si quieres disolver el clan usa *#disbandguild*.`
        });
        return;
    }

    const esMiembroTarget = esMiembro(clan, targetJid);
    const esOficialTarget = esOficial(clan, targetJid);
    if (!esMiembroTarget && !esOficialTarget) {
        await sock.sendMessage(jid, {
            text: `${ERR} \`${targetJid.split('@')[0]}\` no es miembro de tu clan.`
        });
        return;
    }

    clan.miembros = (clan.miembros || []).filter(m => m !== targetJid);
    if (esOficialTarget) {
        clan.oficiales = (clan.oficiales || []).filter(o => o !== targetJid);
    }

    const uTarget = getUsuario(targetJid);
    uTarget.clanId = null;
    guardarUsuario(targetJid, uTarget);
    guardarClanes(clanes);

    const rangoTarget = esOficialTarget ? '✦ Oficial' : '◇ Miembro';
    await sock.sendMessage(jid, {
        text: `${OK} \`${targetJid.split('@')[0]}\` (${rangoTarget}) fue expulsado del clan *${clan.nombre}*.\n\n_El clan ahora tiene *${clan.miembros.length}* miembro(s)._`
    });
}

module.exports = {
    cmdCrearClan, cmdUnirClan, cmdSalirClan, cmdInfoClan, cmdEditarClan,
    cmdGuerraClanes, cmdListaClanes,
    cmdBancoClan, cmdDepositarClan, cmdRetirarClan,
    cmdPromoverMiembro, cmdDemotarMiembro, cmdDisolverClan,
    cmdKickClan,
    cmdVerSolicitudes, cmdGestionarSolicitud
};
