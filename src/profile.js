const { getUsuario, guardarUsuario, cargarUsuarios, agregarMonedas, resetarMensajesSemana } = require('./database');
const { enviarMediaLocal } = require('./mediaUtils');
const { H, FI, FS, FC, INFO, OK, ERR, WARN, DIV } = require('./style');

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TOP_SEMANAL_RESULTADOS_PATH = path.join(__dirname, '../data/topSemanalResultados.json');

const MARRY_GIFS = [
    'https://media.tenor.com/x-VcN-mO3s0AAAAC/wedding-rings.gif',
    'https://media.tenor.com/OgzPZaLqFPkAAAAC/marry-me-proposal.gif',
    'https://media.tenor.com/VGmcCPumQqsAAAAC/anime-couple-anime-kiss.gif',
    'https://media.tenor.com/Xg0cG4nCXHMAAAAC/wedding-couple.gif',
];

const DIVORCE_GIFS = [
    'https://media.tenor.com/ZJZJqeW_IFIAAAAC/divorce-signing.gif',
    'https://media.tenor.com/e08_M2m4NAAAAAAC/breakup-sad.gif',
    'https://media.tenor.com/hbdFN5NkjT8AAAAC/sad-anime.gif',
    'https://media.tenor.com/7pJxiSH2sHgAAAAC/crying-sad.gif',
];

async function cmdPerfil(sock, jid, senderJid, mencionados) {
    const objetivo = mencionados && mencionados.length > 0 ? mencionados[0] : senderJid;
    const u = getUsuario(objetivo);

    let parejaText = '𖹭 _Soltero/a_';
    if (u.pareja) {
        const uPareja = getUsuario(u.pareja);
        const nombrePareja = uPareja.pushName || u.parejaNombre || u.pareja.split('@')[0];
        parejaText = `𖹭 *${nombrePareja}*`;
    }

    const favText = u.favorito ? `_${u.favorito}_` : '_Sin definir_';
    const logrosCount = (u.logros || []).length;
    const clanText = u.clanId ? ` *${u.clanId}*` : '_Sin clan_';
    const mascotaText = u.mascota ? `${u.mascota.emoji} *${u.mascota.nombre}* (Nv.${u.mascota.nivel})` : '_Sin mascota_';
    const repText = u.reputacion ?? 0;

    const nivel = u.nivel || 1;
    const expActual = u.experiencia || 0;
    const expSig = nivel * 100;
    const progreso = Math.min(Math.floor((expActual / expSig) * 10), 10);
    const barra = '▰'.repeat(progreso) + '░'.repeat(10 - progreso);
    const nombre = u.pushName || objetivo.split('@')[0];
    const rango = obtenerRango(nivel);

const texto =
`「✦」 Perfil ◤ ${nombre} ◢

≡ Usuario » \`${objetivo.split('@')[0]}\`
≡ Nombre » ${nombre}
≡ Género » ${u.genero ? `${u.genero}`: 'No definido'}
≡ Cumple » ${u.cumpleanos ? `${u.cumpleanos}` : 'No definido'}
≡ Favorito » ${favText}
≡ Pareja » ${parejaText}
≡ Bio » ${u.descripcion ? `"${u.descripcion}"` : 'Sin descripción'}

◇ Nivel » ${nivel}
◇ Rango » ${rango.nombre} ${rango.emoji}
◇ XP » ${expActual} / ${expSig}
${barra}

◆ Mensajes » ${u.mensajes || 0}
◆ Logros » ${logrosCount}
◆ Reputación » ${repText}

◈ Cartera » ${(u.monedas || 0).toLocaleString()} ⓃNC
◈ Banco » ${(u.banco || 0).toLocaleString()} ⓃNC

◈ Clan » ${clanText}
◈ Mascota » ${mascotaText}`;
    // Normalizar JID: quitar sufijo de dispositivo (:N@) que rompe profilePictureUrl
    const objetivoNorm = objetivo.replace(/:\d+@/, '@');
    let pfpUrl = null;
    try {
        pfpUrl = await Promise.race([
            sock.profilePictureUrl(objetivoNorm, 'image'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
        ]);
    } catch {}

    if (pfpUrl) {
        try {
            const img = await axios.get(pfpUrl, { responseType: 'arraybuffer', timeout: 15000 });
            await sock.sendMessage(jid, {
                image: Buffer.from(img.data),
                caption: texto,
                mentions: [objetivo]
            });
            return;
        } catch {}
    }
    await sock.sendMessage(jid, { text: texto });
}

async function cmdSetbirth(sock, jid, senderJid, args) {
    const fecha = args[0];
    if (!fecha || !/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) {
        await sock.sendMessage(jid, { text: ' ✗ Uso: #setbirth DD/MM/AAAA\nEjemplo: #setbirth 15/03/2000' });
        return;
    }
    const u = getUsuario(senderJid);
    u.cumpleanos = fecha;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `ꕥ Cumpleaños establecido: *${fecha}*` });
}

async function cmdDelbirth(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    u.cumpleanos = null;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: '✓ Tu fecha de cumpleaños fue eliminada.' });
}

async function cmdSetdesc(sock, jid, senderJid, args) {
    const desc = args.join(' ');
    if (!desc) {
        await sock.sendMessage(jid, { text: '✗ Uso: #setdesc [descripción]' });
        return;
    }
    const u = getUsuario(senderJid);
    u.descripcion = desc;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `✓ Descripción actualizada: _${desc}_` });
}

async function cmdSetgenre(sock, jid, senderJid, args) {
    const genero = args[0]?.toLowerCase();
    if (!genero || !['hombre', 'mujer'].includes(genero)) {
        await sock.sendMessage(jid, { text: '✗ Uso: #setgenre hombre | mujer' });
        return;
    }
    const u = getUsuario(senderJid);
    u.genero = genero;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `✓ Género establecido: *${genero}*` });
}

async function cmdDelgenre(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    u.genero = null;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: '✓ Tu género fue eliminado.' });
}

async function cmdSetfav(sock, jid, senderJid, args) {
    const personaje = args.join(' ');
    if (!personaje) {
        await sock.sendMessage(jid, { text: '✗ Uso: #setfav [nombre del personaje]' });
        return;
    }
    const u = getUsuario(senderJid);
    u.favorito = personaje;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, { text: `☆ Personaje favorito establecido: *${personaje}*` });
}

async function cmdMarry(sock, jid, senderJid, mencionados) {
    if (!mencionados || mencionados.length === 0) {
        await sock.sendMessage(jid, { text: '✗ Uso: #marry @usuario' });
        return;
    }
    const objetivo = mencionados[0];
    if (objetivo === senderJid) {
        await sock.sendMessage(jid, { text: '✗ No puedes casarte contigo mismo.' });
        return;
    }
    const uSender = getUsuario(senderJid);
    const uObjetivo = getUsuario(objetivo);
    if (uSender.pareja) {
        await sock.sendMessage(jid, { text: `✗ Ya estás casado/a con \`${uSender.pareja.split('@')[0]}\`. Usa #divorce primero.` });
        return;
    }
    if (uObjetivo.pareja) {
        await sock.sendMessage(jid, { text: `✗ \`${objetivo.split('@')[0]}\` ya está casado/a.` });
        return;
    }
    uSender.pareja = objetivo;
    uSender.parejaNombre = uObjetivo.pushName || objetivo.split('@')[0];
    uObjetivo.pareja = senderJid;
    uObjetivo.parejaNombre = uSender.pushName || senderJid.split('@')[0];
    guardarUsuario(senderJid, uSender);
    guardarUsuario(objetivo, uObjetivo);

    const caption = `✦ \`${senderJid.split('@')[0]}\` y \`${objetivo.split('@')[0]}\` ahora están casados.\n\n_¡Que sean muy felices!_`;
    const enviado = await enviarMediaLocal(sock, jid, 'media/marry', caption, [], true);
    if (!enviado) {
        const gifUrl = MARRY_GIFS[Math.floor(Math.random() * MARRY_GIFS.length)];
        try {
            await sock.sendMessage(jid, { video: { url: gifUrl }, caption, gifPlayback: true });
        } catch {
            await sock.sendMessage(jid, { text: caption });
        }
    }
}

async function cmdDivorce(sock, jid, senderJid) {
    const u = getUsuario(senderJid);
    if (!u.pareja) {
        await sock.sendMessage(jid, { text: '✗ No estás casado/a.' });
        return;
    }
    const exPareja = u.pareja;
    const uEx = getUsuario(exPareja);
    u.pareja = null;
    uEx.pareja = null;
    guardarUsuario(senderJid, u);
    guardarUsuario(exPareja, uEx);

    const caption = `𖣘 @${senderJid.split('@')[0]} se divorció de @${exPareja.split('@')[0]}`;
    const mentions = [senderJid, exPareja];
    const enviado = await enviarMediaLocal(sock, jid, 'media/divorce', caption, mentions, true);
    if (!enviado) {
        const gifUrl = DIVORCE_GIFS[Math.floor(Math.random() * DIVORCE_GIFS.length)];
        try {
            await sock.sendMessage(jid, { video: { url: gifUrl }, caption, gifPlayback: true, mentions });
        } catch {
            await sock.sendMessage(jid, { text: caption, mentions });
        }
    }
}

function obtenerRango(nivel) {
    if (nivel >= 41) return { nombre: 'Legendario', emoji: '𖤐' };
    if (nivel >= 31) return { nombre: 'Maestro', emoji: '◈' };
    if (nivel >= 21) return { nombre: 'Guerrero', emoji: '◆ ' };
    if (nivel >= 11) return { nombre: 'Explorador', emoji: '◇' };
    return { nombre: 'Novato', emoji: '⊹' };
}

async function cmdRango(sock, jid, senderJid, mencionados) {
    const objetivo = mencionados && mencionados.length > 0 ? mencionados[0] : senderJid;
    const u = getUsuario(objetivo);
    const nivel = u.nivel || 1;
    const rango = obtenerRango(nivel);

    const texto =
`「✦」 ◤ Sistema de rangos ◢

⊹ Novato      » Nivel 1 - 10
◇ Explorador » Nivel 11 - 20
◆ Guerrero   » Nivel 21 - 30
◈ Maestro    » Nivel 31 - 40
𖤐 Legendario » Nivel 41+

≡ Usuario » @${objetivo.split('@')[0]}
❂ Nivel » ${nivel}
✦ Rango » ${rango.nombre} ${rango.emoji}

✧ Sube de nivel enviando mensajes en el grupo.`;

    await sock.sendMessage(jid, { text: texto, mentions: [objetivo] });
}

async function cmdLevel(sock, jid, senderJid, mencionados) {
    const objetivo = mencionados && mencionados.length > 0 ? mencionados[0] : senderJid;
    const u = getUsuario(objetivo);
    const nivel = u.nivel || 1;
    const expActual = u.experiencia || 0;
    const expSig = nivel * 100;
    const faltan = Math.max(0, expSig - expActual);
    const progreso = Math.min(Math.floor((expActual / expSig) * 12), 12);
    const barra = '█'.repeat(progreso) + '░'.repeat(12 - progreso);
    const rango = obtenerRango(nivel);
    const nombre = u.nombre || objetivo.split('@')[0];

const texto =
`「✦」 Nivel ◤ ${nombre} ◢

𖠌 Usuario » @${objetivo.split('@')[0]}

❂ Nivel » ${nivel}
❂ Rango » ${rango.nombre} ${rango.emoji}

❂ Progreso » ${expActual} / ${expSig} XP
${barra}

❂ Restante » ${faltan} XP
`;

    await sock.sendMessage(jid, { text: texto, mentions: [objetivo] });
}

async function cmdLeaderboard(sock, jid, groupMetadata, pagina = 1) {
    const { paginar, piePagina, emblema } = require('./paginator');
    const db = cargarUsuarios();
    let entries = Object.entries(db).filter(([key, u]) =>
        key.includes('@') && !key.endsWith('@g.us')
    );

    const esGrupo = !!groupMetadata?.participants?.length;
    if (esGrupo) {
        const { resolverJid: _resolverJid } = require('./lidResolver');
        const memberIds = new Set();
        for (const p of groupMetadata.participants) {
            const raw = (p.id || '').replace(/:\d+@/, '@');
            memberIds.add(raw);
            const res = _resolverJid(raw);
            if (res !== raw) memberIds.add(res);
        }
        const filtrado = entries.filter(([key]) => memberIds.has(key));
        if (filtrado.length > 0) entries = filtrado;
    }

    const todos = entries
        .map(([ujid, u]) => ({ jid: ujid, nivel: u.nivel || 1, exp: u.experiencia || 0 }))
        .sort((a, b) => b.nivel !== a.nivel ? b.nivel - a.nivel : b.exp - a.exp);

    const { items: usuarios, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    const titulo = esGrupo ? 'Top Niveles — Grupo' : 'Leaderboard';
    let texto = `${H(titulo)}\n\n`;
    for (let i = 0; i < usuarios.length; i++) {
        const u = usuarios[i];
        const rango = obtenerRango(u.nivel);
        texto += `${emblema(inicio + i)} \`${u.jid.split('@')[0]}\` — Nv.*${u.nivel}* ${rango.nombre}\n`;
    }
    if (esGrupo) texto += `\n_Solo miembros de este grupo_\n_Usa *#rankglobal* para el ranking mundial_`;
    texto += piePagina(pag, totalPags, 'leaderboard');
    await sock.sendMessage(jid, { text: texto });
}

async function cmdCumpleanos(sock, jid) {
    const db = cargarUsuarios();
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const proximos = Object.entries(db)
        .filter(([, u]) => u.cumpleanos)
        .map(([jid, u]) => {
            const [d, m] = u.cumpleanos.split('/');
            return { jid, dia: d, mes: m, cumpleanos: u.cumpleanos };
        })
        .filter(u => u.mes === mes);
    if (proximos.length === 0) {
        await sock.sendMessage(jid, { text: `${INFO} No hay cumpleaños este mes.` });
        return;
    }
    let texto = `${H('Cumpleaños')}\n\n`;
    for (const u of proximos) {
        const esHoy = u.dia === dia ? ' ← HOY' : '';
        texto += `◈ \`${u.jid.split('@')[0]}\` — ${u.cumpleanos}${esHoy}\n`;
    }
    await sock.sendMessage(jid, { text: texto });
}

async function cmdAllBirthdays(sock, jid, pagina = 1) {
    const { paginar, piePagina } = require('./paginator');
    const db = cargarUsuarios();
    const lista = Object.entries(db)
        .filter(([, u]) => u.cumpleanos)
        .map(([jid, u]) => ({ jid, cumpleanos: u.cumpleanos }))
        .sort((a, b) => {
            const [da, ma] = a.cumpleanos.split('/').map(Number);
            const [db2, mb] = b.cumpleanos.split('/').map(Number);
            return ma !== mb ? ma - mb : da - db2;
        });
    if (lista.length === 0) {
        await sock.sendMessage(jid, { text: `${INFO} Nadie ha registrado su cumpleaños aún.` });
        return;
    }
    const { items: todos, pag, totalPags } = paginar(lista, pagina, 20);
    let texto = `${H('Todos los Cumpleaños')}\n\n`;
    for (const u of todos) {
        texto += `◈ \`${u.jid.split('@')[0]}\` — ${u.cumpleanos}\n`;
    }
    texto += piePagina(pag, totalPags, 'allbirthdays');
    await sock.sendMessage(jid, { text: texto });
}

async function cmdGrupoInfo(sock, jid, groupMetadata) {
    if (!groupMetadata) {
        await sock.sendMessage(jid, { text: '✗ Este comando solo funciona en grupos.' });
        return;
    }
    const admins = groupMetadata.participants.filter(p => p.admin).length;
    const texto = `${H('Info Grupo')}
${FS} *${groupMetadata.subject}*
${FI} Miembros: *${groupMetadata.participants.length}*
${FC} Admins: *${admins}*
${FI} ID: \`${jid}\`
${FI} Creado: *${new Date(groupMetadata.creation * 1000).toLocaleDateString('es-ES')}*
${FI} Desc: _${groupMetadata.desc || 'Sin descripción'}_`;
    await sock.sendMessage(jid, { text: texto });
}

async function cmdRacha(sock, jid, senderJid, mencionados) {
    const objetivo = mencionados?.length ? mencionados[0] : senderJid;
    const u        = getUsuario(objetivo);
    const nombre   = u.pushName || objetivo.split('@')[0];
    const esProp   = objetivo === senderJid;

    const racha    = u.racha    || 0;
    const rachaMax = u.rachaMax || 0;
    const c        = u.contadores || {};

    const totalVictorias =
        (c.ganadosTrivia   || 0) +
        (c.ganadosMath     || 0) +
        (c.ganadosPpt      || 0) +
        (c.ganadosAhorcado || 0) +
        (c.ganadosScramble || 0) +
        (c.ganadosQuien    || 0);

    // Barra de racha (cada bloque = 1 victoria, máx 10 visibles)
    const bloques  = Math.min(racha, 10);
    const barra    = '𖤍'.repeat(bloques) + '⬜'.repeat(10 - bloques);

    // Nivel de racha
    const nivelRacha =
        racha === 0  ? '𖦹 Sin racha activa' :
        racha < 3    ? '𖤍 Calentando motores' :
        racha < 5    ? '𖤍 En racha' :
        racha < 10   ? '𖤍 ¡Imparable!' :
        racha < 20   ? '𖤍 ¡Legendario!' :
                       '𖤍 ¡DIOS DE LOS JUEGOS!';

    const SEP  = '─'.repeat(28);
    let texto  = `${H('Sistema de Rachas')}\n\n`;
    texto     += `◈ *${nombre}*\n${SEP}\n`;
    texto     += `${barra}\n`;
    texto     += `${FI} *Racha actual:* ${racha} ${racha === 1 ? 'victoria' : 'victorias'}\n`;
    texto     += `${FI} *Racha máxima:* ${rachaMax} ${rachaMax === 1 ? 'victoria' : 'victorias'}\n`;
    texto     += `${FI} *Estado:* ${nivelRacha}\n`;
    texto     += `${SEP}\n`;
    texto     += `${FI} *Victorias por juego:*\n`;
    texto     += `  ◇ Trivia:   *${c.ganadosTrivia   || 0}*\n`;
    texto     += `  ◇ Mates:    *${c.ganadosMath     || 0}*\n`;
    texto     += `  ◇ PPT:      *${c.ganadosPpt      || 0}*\n`;
    texto     += `  ◇ Ahorcado: *${c.ganadosAhorcado || 0}*\n`;
    texto     += `  ◇ Scramble: *${c.ganadosScramble || 0}*\n`;
    texto     += `  ◇ ¿Quién?:  *${c.ganadosQuien   || 0}*\n`;
    texto     += `${SEP}\n`;
    texto     += `◈ *Total de victorias:* *${totalVictorias}*\n`;

    if (racha >= 3 && esProp) {
        texto += `\n_¡Sigue así! Una derrota reiniciará tu racha._`;
    } else if (racha === 0 && esProp) {
        texto += `\n_Juega y gana seguido para acumular tu racha._`;
    }

    await sock.sendMessage(jid, { text: texto });
}

// ══════════════════════════════════════════
//  🎂 SCHEDULER DE CUMPLEAÑOS AUTOMÁTICO
// ══════════════════════════════════════════
// ── Top Semanal ─────────────────────────────────────────────────────────────
async function cmdTopWeekly(sock, jid, groupMetadata, pagina = 1) {
    const { paginar, piePagina, emblema } = require('./paginator');
    const db = cargarUsuarios();
    let entries = Object.entries(db).filter(([k]) => k.includes('@') && !k.endsWith('@g.us'));

    const esGrupo = !!groupMetadata?.participants?.length;
    if (esGrupo) {
        const { resolverJid: _resolverJid } = require('./lidResolver');
        const memberIds = new Set();
        for (const p of groupMetadata.participants) {
            const raw = (p.id || '').replace(/:\d+@/, '@');
            memberIds.add(raw);
            const res = _resolverJid(raw);
            if (res !== raw) memberIds.add(res);
        }
        const filtrado = entries.filter(([k]) => memberIds.has(k));
        if (filtrado.length > 0) entries = filtrado;
    }

    const todos = entries
        .map(([ujid, u]) => ({ jid: ujid, pts: u.mensajesSemana || 0 }))
        .filter(u => u.pts > 0)
        .sort((a, b) => b.pts - a.pts);

    if (todos.length === 0) {
        return sock.sendMessage(jid, { text: `${INFO} Aún no hay actividad registrada esta semana.\n\n_Cada mensaje cuenta como punto. El lunes se dan premios al top 3._` });
    }

    const { items, pag, totalPags, inicio } = paginar(todos, pagina, 10);
    const PREMIOS = ['✦ 15,000', '◈ 8,000', '◇ 4,000'];
    let texto = `${H('Top Semanal')}\n\n`;
    for (let i = 0; i < items.length; i++) {
        const u = items[i];
        const pos = inicio + i;
        const med = pos < 3 ? PREMIOS[pos].split(' ')[0] : `${pos + 1}.`;
        texto += `${med} \`${u.jid.split('@')[0]}\` — *${u.pts}* msgs\n`;
    }
    texto += `\n${INFO} Premios lunes: ✦15k · ◈8k · ◇4k ⓃNC`;
    texto += piePagina(pag, totalPags, 'topweekly');
    await sock.sendMessage(jid, { text: texto });
}

async function _premiarTopSemanal(sock, obtenerGrupos) {
    try {
        const db = cargarUsuarios();
        const entries = Object.entries(db).filter(([k]) => k.includes('@') && !k.endsWith('@g.us'));
        const ranking = entries
            .map(([jid, u]) => ({ jid, pts: u.mensajesSemana || 0 }))
            .filter(u => u.pts > 0)
            .sort((a, b) => b.pts - a.pts);

        if (ranking.length === 0) return;

        const PREMIOS = [15000, 8000, 4000];
        const ganadores = ranking.slice(0, 3);

        // Dar premios
        for (let i = 0; i < ganadores.length; i++) {
            agregarMonedas(ganadores[i].jid, PREMIOS[i]);
        }

        // Guardar resultados a disco — ya no se anuncia en masa por grupos/privados,
        // solo se consulta bajo demanda con el comando #topsemanalresultados.
        const resultados = {
            fecha: Date.now(),
            ganadores: ganadores.map((g, i) => ({ jid: g.jid, pts: g.pts, premio: PREMIOS[i] })),
        };
        try {
            fs.writeFileSync(TOP_SEMANAL_RESULTADOS_PATH, JSON.stringify(resultados, null, 2));
        } catch (e) {
            console.error('[Top Semanal] No se pudo guardar resultados:', e.message);
        }

        // Resetear contadores
        resetarMensajesSemana();
        console.log('[Top Semanal] Premios entregados y contadores reseteados (sin anuncio automático).');
    } catch (e) {
        console.error('[Top Semanal] Error:', e.message);
    }
}

// ── Resultados del último Top Semanal (bajo demanda, ya no se anuncia en masa) ─
async function cmdTopSemanalResultados(sock, jid) {
    let resultados = null;
    try {
        if (fs.existsSync(TOP_SEMANAL_RESULTADOS_PATH)) {
            resultados = JSON.parse(fs.readFileSync(TOP_SEMANAL_RESULTADOS_PATH, 'utf8'));
        }
    } catch {}

    if (!resultados || !resultados.ganadores?.length) {
        return sock.sendMessage(jid, { text: `${INFO} Aún no hay resultados del Top Semanal. Se generan cada lunes.` });
    }

    const MEDALLAS = ['✦', '◈', '◇'];
    let texto = `${H('Resultados del Top Semanal')}\n\n`;
    resultados.ganadores.forEach((g, i) => {
        texto += `${MEDALLAS[i] || '•'} \`${g.jid.split('@')[0]}\` — *${g.pts} msgs* → +${g.premio.toLocaleString()} ⓃNC\n`;
    });
    const fechaStr = resultados.fecha ? new Date(resultados.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
    texto += `\n${INFO} Última entrega de premios: *${fechaStr}*`;
    await sock.sendMessage(jid, { text: texto });
}

let _cumpleanosTimeout  = null;
let _cumpleanosInterval = null;

function iniciarSchedulerCumpleanos(sock, obtenerGrupos) {
    // Limpiar timers previos para evitar acumulación en reconexiones
    if (_cumpleanosTimeout)  { clearTimeout(_cumpleanosTimeout);   _cumpleanosTimeout  = null; }
    if (_cumpleanosInterval) { clearInterval(_cumpleanosInterval); _cumpleanosInterval = null; }

    let _lunesResetHecho = -1; // evitar doble ejecución el mismo lunes

    const chequearCumpleanos = async () => {
        try {
            const hoy     = new Date();
            const diaHoy  = String(hoy.getDate()).padStart(2, '0');
            const mesHoy  = String(hoy.getMonth() + 1).padStart(2, '0');
            const hoyStr  = `${diaHoy}/${mesHoy}/${hoy.getFullYear()}`;
            const db      = cargarUsuarios();
            const festejados = [];

            for (const [jid, u] of Object.entries(db)) {
                if (!u.cumpleanos) continue;
                const [d, m] = u.cumpleanos.split('/');
                if (d !== diaHoy || m !== mesHoy) continue;
                if (u.ultimoCumpleanosAvisado === hoyStr) continue;
                festejados.push({ jid, u, hoyStr });
            }

            // Reset y premios del top semanal cada lunes
            const diaSemana = hoy.getDay(); // 0=Dom 1=Lun
            const lunesKey  = `${hoy.getFullYear()}-W${diaHoy}${mesHoy}`;
            if (diaSemana === 1 && _lunesResetHecho !== lunesKey) {
                _lunesResetHecho = lunesKey;
                await _premiarTopSemanal(sock, obtenerGrupos);
            }

            if (festejados.length === 0) return;

            const grupos = obtenerGrupos();

            // Pre-cargar metadata de todos los grupos activos (una sola vez por ciclo)
            const metaCache = {};
            for (const [gid, g] of Object.entries(grupos)) {
                if (g.botActivo === false) continue;
                try {
                    const meta = await sock.groupMetadata(gid);
                    metaCache[gid] = meta;
                } catch { /* grupo inaccesible, omitir */ }
            }

            for (const { jid: userJid, u, hoyStr: hs } of festejados) {
                const bonus   = 100000;
                const xpBonus = 500;
                u.monedas      = (u.monedas      || 0) + bonus;
                u.experiencia  = (u.experiencia   || 0) + xpBonus;
                u.ultimoCumpleanosAvisado = hs;
                guardarUsuario(userJid, u);

                const nombre = u.pushName || userJid.split('@')[0];
                const msg =
`${H('Feliz Cumpleanos')}

◈ Hoy es el día especial de *${nombre}*.

${FI} *+${bonus.toLocaleString()} ⓃNexCoins*
${FI} *+${xpBonus} XP*

_¡Que la pases increíble!_`;

                // Normalizar JID del cumpleañero para comparación
                const userJidBase = userJid.split('@')[0];

                for (const [gid, meta] of Object.entries(metaCache)) {
                    // Solo enviar si el cumpleañero está en ese grupo
                    const esMiembro = meta?.participants?.some(p => {
                        const pBase = (p.id || '').split('@')[0].split(':')[0];
                        return pBase === userJidBase;
                    });
                    if (!esMiembro) continue;

                    try {
                        await sock.sendMessage(gid, { text: msg });
                        await new Promise(r => setTimeout(r, 2500 + Math.floor(Math.random() * 2000)));
                    } catch {}
                }
            }
        } catch (e) {
            console.error('[Cumpleaños] Error en chequeo automático:', e.message);
        }
    };

    const msHasta9am = () => {
        const ahora = new Date();
        const prox  = new Date(ahora);
        prox.setHours(9, 0, 0, 0);
        if (prox <= ahora) prox.setDate(prox.getDate() + 1);
        return prox.getTime() - ahora.getTime();
    };

    _cumpleanosTimeout = setTimeout(async () => {
        _cumpleanosTimeout = null;
        await chequearCumpleanos();
        _cumpleanosInterval = setInterval(chequearCumpleanos, 24 * 60 * 60 * 1000);
    }, msHasta9am());

    console.log('🎂 Scheduler de cumpleaños activo.');
}

module.exports = {
    cmdPerfil, cmdSetbirth, cmdDelbirth, cmdSetdesc, cmdSetgenre, cmdDelgenre,
    cmdSetfav, cmdMarry, cmdDivorce, cmdLevel, cmdLeaderboard,
    cmdCumpleanos, cmdAllBirthdays, cmdGrupoInfo, cmdRango, obtenerRango,
    cmdRacha, iniciarSchedulerCumpleanos, cmdTopWeekly, cmdTopSemanalResultados
};
