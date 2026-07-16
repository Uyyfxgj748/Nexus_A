const fs = require('fs-extra');
const path = require('path');
const { SUPER_OWNER } = require('./owners');

const USERS_PATH  = path.join(__dirname, '../data/users.json');
const GRUPOS_PATH = path.join(__dirname, '../data/grupos.json');

const OWNER_INFINITE = 999_999_999;

// ── Resolución de @lid → @s.whatsapp.net ──────────────────────────────────
// Se importa de forma lazy para evitar dependencias circulares al inicio.
// Si el lid_map no tiene el mapeo todavía, devuelve el jid original sin cambios.
function _normalizarJid(jid) {
    if (!jid || !jid.endsWith('@lid')) return jid;
    try {
        const resolved = require('./lidResolver').resolverJid(jid);
        if (resolved && resolved !== jid) return resolved;
    } catch {}
    return jid;
}

let _usersCache  = null;
let _gruposCache = null;
let _usersDirty  = false;
let _gruposDirty = false;

const FLUSH_INTERVAL = 2000;

// ── Helpers de seguridad ───────────────────────────────────────────────────
function safeInt(val, fallback = 0) {
    const n = typeof val === 'number' ? val : parseInt(val, 10);
    if (isNaN(n) || !isFinite(n)) return fallback;
    return Math.max(-999_999_999, Math.min(999_999_999, n));
}

function sanitizarUsuario(u) {
    if (!u) return u;
    u.monedas      = safeInt(u.monedas, 0);
    u.banco        = safeInt(u.banco,   0);
    u.experiencia  = safeInt(u.experiencia, 0);
    u.nivel        = Math.max(1, safeInt(u.nivel, 1));
    u.mensajes     = safeInt(u.mensajes, 0);
    u.advertencias = safeInt(u.advertencias, 0);
    if (u.monedas     < 0) u.monedas     = 0;
    if (u.banco       < 0) u.banco       = 0;
    if (u.experiencia < 0) u.experiencia = 0;
    return u;
}

// ── Carga segura con respaldo ante JSON corrupto ───────────────────────────
function cargarJsonSeguro(rutaPrincipal, fallbackVacio = {}) {
    if (!fs.existsSync(rutaPrincipal)) {
        fs.writeJsonSync(rutaPrincipal, fallbackVacio);
        return fallbackVacio;
    }
    try {
        return fs.readJsonSync(rutaPrincipal);
    } catch (errPrimario) {
        console.error(`⚠️  JSON corrupto en ${path.basename(rutaPrincipal)}: ${errPrimario.message}`);
        const backupDir  = path.join(__dirname, '../data/backups');
        const backupDirs = fs.existsSync(backupDir)
            ? fs.readdirSync(backupDir)
                .filter(e => fs.statSync(path.join(backupDir, e)).isDirectory())
                .sort()
                .reverse()
            : [];

        const basename = path.basename(rutaPrincipal);
        for (const dir of backupDirs) {
            const candidato = path.join(backupDir, dir, basename);
            if (!fs.existsSync(candidato)) continue;
            try {
                const data = fs.readJsonSync(candidato);
                console.log(`✅ Recuperado ${basename} desde backup ${dir}`);
                fs.writeJsonSync(rutaPrincipal, data, { spaces: 2 });
                return data;
            } catch {}
        }

        console.error(`❌ No se pudo recuperar ${basename}. Iniciando vacío.`);
        fs.writeJsonSync(rutaPrincipal, fallbackVacio);
        return fallbackVacio;
    }
}

function flushToDisk() {
    if (_usersDirty && _usersCache) {
        try { fs.writeJsonSync(USERS_PATH, _usersCache, { spaces: 2 }); } catch (_) {}
        _usersDirty = false;
    }
    if (_gruposDirty && _gruposCache) {
        try { fs.writeJsonSync(GRUPOS_PATH, _gruposCache, { spaces: 2 }); } catch (_) {}
        _gruposDirty = false;
    }
}

setInterval(flushToDisk, FLUSH_INTERVAL).unref();

process.on('exit',    flushToDisk);
process.on('SIGINT',  () => { flushToDisk(); process.exit(0); });
process.on('SIGTERM', () => { flushToDisk(); process.exit(0); });

// ── Usuarios ───────────────────────────────────────────────────────────────
function aplicarOwnerInfinito(jid, u) {
    if (jid === SUPER_OWNER && u) {
        u.monedas = OWNER_INFINITE;
        u.banco   = OWNER_INFINITE;
    }
    return u;
}

function cargarUsuarios() {
    if (_usersCache) return _usersCache;
    _usersCache = cargarJsonSeguro(USERS_PATH, {});
    return _usersCache;
}

function guardarUsuarios(data) {
    _usersCache = data;
    _usersDirty = true;
    // La escritura a disco la maneja el intervalo de FLUSH_INTERVAL ms
}

function getUsuario(jid) {
    jid = _normalizarJid(jid);
    const db = cargarUsuarios();
    if (!jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast')) {
        return {
            nombre: jid?.split('@')[0] || 'unknown', pushName: null,
            monedas: 0, banco: 0, ultimoDiario: null, ultimoTrabajo: null,
            inventario: [], nivel: 1, experiencia: 0, mensajes: 0,
            pareja: null, parejaNombre: null, cumpleanos: null,
            genero: null, descripcion: null, advertencias: 0, _readonly: true
        };
    }
    if (!db[jid]) {
        db[jid] = {
            nombre:       jid.split('@')[0],
            pushName:     null,
            monedas:      200,
            banco:        0,
            ultimoDiario: null,
            ultimoTrabajo:null,
            inventario:   [],
            nivel:        1,
            experiencia:  0,
            mensajes:     0,
            pareja:       null,
            parejaNombre: null,
            cumpleanos:   null,
            genero:       null,
            descripcion:  null,
            advertencias: 0
        };
        _usersDirty = true;
    }
    const u = db[jid];
    if (u.banco         === undefined) u.banco         = 0;
    if (u.ultimoTrabajo === undefined) u.ultimoTrabajo = null;
    if (u.mensajes      === undefined) u.mensajes      = 0;
    if (u.pareja        === undefined) u.pareja        = null;
    if (u.parejaNombre  === undefined) u.parejaNombre  = null;
    if (u.pushName      === undefined) u.pushName      = null;
    if (u.cumpleanos    === undefined) u.cumpleanos    = null;
    if (u.genero        === undefined) u.genero        = null;
    if (u.descripcion   === undefined) u.descripcion   = null;
    if (u.advertencias  === undefined) u.advertencias  = 0;
    sanitizarUsuario(u);
    aplicarOwnerInfinito(jid, u);
    return u;
}

function guardarPushName(jid, pushName) {
    jid = _normalizarJid(jid);
    if (!pushName) return;
    const db = cargarUsuarios();
    if (!db[jid]) getUsuario(jid);
    if (db[jid] && db[jid].pushName !== pushName) {
        db[jid].pushName = pushName;
        _usersDirty = true;
    }
}

function guardarUsuario(jid, datos) {
    jid = _normalizarJid(jid);
    if (datos._readonly) return;
    sanitizarUsuario(datos);
    aplicarOwnerInfinito(jid, datos);
    const db = cargarUsuarios();
    db[jid]     = datos;
    _usersDirty = true;
    // El intervalo de 2s persiste el cambio; SIGTERM/exit hacen flush inmediato
}

function agregarMonedas(jid, cantidad) {
    jid = _normalizarJid(jid);
    const cant = safeInt(cantidad, 0);
    if (cant <= 0) return 0;
    const u = getUsuario(jid);
    if (jid === SUPER_OWNER) return OWNER_INFINITE;
    u.monedas = safeInt(u.monedas) + cant;
    guardarUsuario(jid, u);
    return u.monedas;
}

function quitarMonedas(jid, cantidad) {
    jid = _normalizarJid(jid);
    const cant = safeInt(cantidad, 0);
    if (cant <= 0) return false;
    const u = getUsuario(jid);
    if (jid === SUPER_OWNER) return true;
    if (safeInt(u.monedas) < cant) return false;
    u.monedas -= cant;
    guardarUsuario(jid, u);
    return true;
}

function agregarExp(jid, cantidad) {
    jid = _normalizarJid(jid);
    const u = getUsuario(jid);
    u.experiencia    = safeInt(u.experiencia) + safeInt(cantidad, 5);
    u.mensajes       = safeInt(u.mensajes) + 1;
    u.mensajesSemana = safeInt(u.mensajesSemana) + 1;
    const nivelAnterior    = u.nivel;
    const expParaSiguiente = u.nivel * 100;
    let leveledUp = false;
    if (u.experiencia >= expParaSiguiente) {
        u.experiencia -= expParaSiguiente;
        u.nivel       += 1;
        leveledUp      = true;
    }
    guardarUsuario(jid, u);
    return { leveledUp, nivelAnterior, nivelNuevo: u.nivel, expActual: u.experiencia };
}

// ── Grupos ─────────────────────────────────────────────────────────────────
function cargarGrupos() {
    if (_gruposCache) return _gruposCache;
    _gruposCache = cargarJsonSeguro(GRUPOS_PATH, {});
    return _gruposCache;
}

function guardarGrupos(data) {
    _gruposCache = data;
    _gruposDirty = true;
    // La escritura a disco la maneja el intervalo de FLUSH_INTERVAL ms
}

function getGrupo(jid) {
    const db = cargarGrupos();
    if (!db[jid]) {
        db[jid] = {
            bienvenida:       false,
            mensajeBienvenida:'╭─ 💬 Bienvenido/a ─╮\n👋 ¡Hey! @usuario, qué bueno verte por aquí\n\nSoy Nexus ⚡ tu bot compañero\npara ayudarte, entretenerte\ny sacarte de cualquier apuro 😄\n\n💡 Escribe #menu y explora todo lo que tengo para ti\n\n╰─ Hecho para pasarla bien ─╯',
            despedida:        false,
            mensajeDespedida: '╭─ 💭 Despedida ─╮\n👋 @usuario, fue un gusto tenerte por aquí\n\n✨ Cuídate y nos vemos pronto\n\n╰─ Nexus siempre estará aquí ─╯',
            soloAdmin:        false,
            limiteAdvertencias: 3,
            eventosHabilitados: true,
            anunciosNivel:    true
        };
        _gruposDirty = true;
    }
    return db[jid];
}

function guardarGrupo(jid, datos) {
    const db     = cargarGrupos();
    db[jid]      = datos;
    _gruposDirty = true;
    // El intervalo de 2s persiste el cambio; SIGTERM/exit hacen flush inmediato
}

// ── Estadísticas para el panel web ────────────────────────────────────────
function getStats() {
    const users  = cargarUsuarios();
    const grupos = cargarGrupos();
    const uList  = Object.values(users);
    const total  = uList.reduce((acc, u) => acc + safeInt(u.monedas) + safeInt(u.banco), 0);
    const top5   = Object.entries(users)
        .map(([jid, u]) => ({ jid, nombre: u.pushName || jid.split('@')[0], total: safeInt(u.monedas) + safeInt(u.banco) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
    return {
        totalUsuarios:  uList.length,
        totalGrupos:    Object.keys(grupos).length,
        totalMonedas:   total,
        topEconomia:    top5,
    };
}

// ── Migración @lid → @s.whatsapp.net ─────────────────────────────────────────
// Recibe el Map { lid → phone } y fusiona las cuentas @lid con las @phone.
// Llama a esta función después de que contacts.upsert rellena el mapa.
function migrarCuentasLid(lidMap) {
    const db = cargarUsuarios();
    const lidKeys = Object.keys(db).filter(k => k.endsWith('@lid'));
    if (lidKeys.length === 0) return;

    let cambio = false;
    for (const lidJid of lidKeys) {
        const phoneJid = lidMap.get(lidJid);
        if (!phoneJid) continue; // sin mapeo todavía, se intentará en el próximo contacts.upsert

        const lidData   = db[lidJid];
        const phoneData = db[phoneJid]; // puede no existir

        if (!phoneData) {
            // Solo renombrar: mover la cuenta @lid a @phone
            db[phoneJid] = lidData;
        } else {
            // Fusionar: tomar el mejor valor de cada campo
            phoneData.monedas      = (lidData.monedas  || 0) + (phoneData.monedas  || 0);
            phoneData.banco        = (lidData.banco     || 0) + (phoneData.banco    || 0);
            phoneData.nivel        = Math.max(lidData.nivel || 1,        phoneData.nivel || 1);
            phoneData.experiencia  = Math.max(lidData.experiencia || 0,  phoneData.experiencia || 0);
            phoneData.mensajes     = (lidData.mensajes  || 0) + (phoneData.mensajes || 0);

            // Harem: concatenar evitando duplicados por nombre
            const haremBase = Array.isArray(lidData.harem) ? lidData.harem : [];
            const haremFone = Array.isArray(phoneData.harem) ? phoneData.harem : [];
            const nombresYa = new Set(haremFone.map(p => p.nombre));
            for (const p of haremBase) {
                if (!nombresYa.has(p.nombre)) { haremFone.push(p); nombresYa.add(p.nombre); }
            }
            phoneData.harem = haremFone;

            // Inventario: sumar cantidades por item
            const invBase = Array.isArray(lidData.inventario) ? lidData.inventario : [];
            const invFone = Array.isArray(phoneData.inventario) ? phoneData.inventario : [];
            for (const item of invBase) {
                const existing = invFone.find(i => i.id === item.id || i.nombre === item.nombre);
                if (existing) existing.cantidad = (existing.cantidad || 1) + (item.cantidad || 1);
                else invFone.push({ ...item });
            }
            phoneData.inventario = invFone;

            // Cooldowns: quedarse con el más reciente (mayor número = más tarde)
            for (const campo of ['ultimoDiario','ultimoTrabajo','ultimoCrimen','ultimoSlut',
                                  'ultimoMinar','ultimoAventura','ultimoCazar','ultimoPescar',
                                  'ultimoMazmorra','ultimoInversion']) {
                const a = lidData[campo] || 0;
                const b = phoneData[campo] || 0;
                if (a > b) phoneData[campo] = a;
            }

            // Campos personales: preferir el valor del @lid si el @phone tiene el default
            if (!phoneData.pushName && lidData.pushName) phoneData.pushName = lidData.pushName;
            if (!phoneData.pareja   && lidData.pareja)   { phoneData.pareja = lidData.pareja; phoneData.parejaNombre = lidData.parejaNombre; }
            if (!phoneData.cumpleanos && lidData.cumpleanos) phoneData.cumpleanos = lidData.cumpleanos;
            if (!phoneData.genero     && lidData.genero)     phoneData.genero     = lidData.genero;
            if (!phoneData.descripcion && lidData.descripcion) phoneData.descripcion = lidData.descripcion;

            phoneData.advertencias = Math.max(lidData.advertencias || 0, phoneData.advertencias || 0);
            db[phoneJid] = phoneData;
        }

        delete db[lidJid];
        cambio = true;
        console.log(`[MIGRACIÓN] Fusioné ${lidJid} → ${phoneJid}`);
    }

    if (cambio) {
        guardarUsuarios(db);
        console.log(`[MIGRACIÓN] Cuentas @lid migradas correctamente.`);
    }
}

function resetarMensajesSemana() {
    const db = cargarUsuarios();
    let cambio = false;
    for (const u of Object.values(db)) {
        if (u.mensajesSemana) { u.mensajesSemana = 0; cambio = true; }
    }
    if (cambio) guardarUsuarios(db);
}

// ── Limpieza de duplicados @lid al arrancar ────────────────────────────────
// Usa el lid_map persistido en disco para fusionar entradas @lid que ya tengan
// su equivalente @s.whatsapp.net en la BD. Se llama una vez al inicio del bot,
// antes de aceptar mensajes, para limpiar duplicados creados en sesiones previas.
function limpiarDuplicadosLid() {
    try {
        const { getLidMap } = require('./lidResolver');
        const lidMap = getLidMap();
        if (!lidMap || lidMap.size === 0) return;
        migrarCuentasLid(lidMap);
    } catch (e) {
        console.error('[limpiarDuplicadosLid] Error:', e.message);
    }
}

module.exports = {
    getUsuario, guardarUsuario, agregarMonedas, quitarMonedas,
    cargarUsuarios, guardarUsuarios, agregarExp, guardarPushName,
    getGrupo, guardarGrupo, cargarGrupos, getStats, flushToDisk, safeInt,
    migrarCuentasLid, resetarMensajesSemana, limpiarDuplicadosLid
};
