const fs = require('fs-extra');
const path = require('path');

const OWNERS_PATH = path.join(__dirname, '../data/owners.json');

// Lee el número del super owner desde la variable de entorno.
// Acepta formato con o sin @s.whatsapp.net (ej: "573237069673" o "573237069673@s.whatsapp.net").
const _rawOwner = (process.env.SUPER_OWNER_JID || '').trim();
const SUPER_OWNER = _rawOwner
    ? (_rawOwner.includes('@') ? _rawOwner : `${_rawOwner}@s.whatsapp.net`)
    : '';

if (!SUPER_OWNER) {
    console.warn('⚠️  SUPER_OWNER_JID no configurado. Agrega SUPER_OWNER_JID=<número> en las variables de entorno.');
}

// Normaliza un JID quitando el sufijo @... para comparar solo el número/id
function normalizarJid(jid) {
    if (!jid) return '';
    return jid.replace(/:\d+@/, '@').split('@')[0];
}

// Cache en memoria — evita leer owners.json en cada mensaje
let _ownersCache = null;

function cargarOwners() {
    if (_ownersCache) return _ownersCache;
    if (!fs.existsSync(OWNERS_PATH)) {
        fs.writeJsonSync(OWNERS_PATH, SUPER_OWNER ? [SUPER_OWNER] : []);
    }
    const data = fs.readJsonSync(OWNERS_PATH);
    // Si la lista no tiene al SUPER_OWNER en ningún formato, lo agrega al frente
    if (SUPER_OWNER) {
        const tieneSuperOwner = data.some(o => normalizarJid(o) === normalizarJid(SUPER_OWNER));
        if (!tieneSuperOwner) data.unshift(SUPER_OWNER);
    }
    _ownersCache = data;
    return _ownersCache;
}

function guardarOwners(lista) {
    if (SUPER_OWNER) {
        const tieneSuperOwner = lista.some(o => normalizarJid(o) === normalizarJid(SUPER_OWNER));
        if (!tieneSuperOwner) lista.unshift(SUPER_OWNER);
    }
    fs.writeJsonSync(OWNERS_PATH, lista, { spaces: 2 });
    _ownersCache = lista;
}

// Helpers para resolución bidireccional LID ↔ phone
// Se importan de forma lazy para evitar dependencias circulares al inicio
function _resolverJid(jid) {
    try { return require('./lidResolver').resolverJid(jid); } catch { return jid; }
}
function _obtenerLidDePhone(phone) {
    try { return require('./lidResolver').obtenerLidDePhone(phone); } catch { return null; }
}

// Compara un JID entrante contra una entrada de owners considerando 4 casos:
//  1. Coincidencia directa (números iguales, cualquier dominio)
//  2. Entrada es @lid  → se resuelve a phone y se compara con el JID entrante
//  3. JID entrante es @lid sin resolver → se busca su phone y se compara con entrada @s.whatsapp.net
//  4. JID entrante es @lid sin resolver → se busca su LID equivalente para entries @s.whatsapp.net
function _coincide(jid, ownerEntry) {
    if (!jid || !ownerEntry) return false;
    const jidNorm   = normalizarJid(jid);
    const entryNorm = normalizarJid(ownerEntry);

    // Caso 1: comparación directa por número
    if (jidNorm === entryNorm) return true;

    // Caso 2: la entrada es @lid → resolver a phone y comparar
    if (ownerEntry.endsWith('@lid')) {
        const phone = _resolverJid(ownerEntry);
        if (phone !== ownerEntry && normalizarJid(phone) === jidNorm) return true;
    }

    // Casos 3 y 4: el JID entrante es @lid (no pudo resolverse antes)
    if (jid.endsWith('@lid')) {
        // Caso 3: resolver el JID entrante y comparar con entry @s.whatsapp.net
        const phoneJid = _resolverJid(jid);
        if (phoneJid !== jid && normalizarJid(phoneJid) === entryNorm) return true;

        // Caso 4: buscar el LID de la entry (si es phone) y comparar con el JID entrante
        if (ownerEntry.endsWith('@s.whatsapp.net')) {
            const lidEntry = _obtenerLidDePhone(ownerEntry);
            if (lidEntry && normalizarJid(lidEntry) === jidNorm) return true;
        }
    }

    return false;
}

// Verifica si un JID pertenece a cualquier owner (soporta @s.whatsapp.net y @lid)
function isOwner(jid) {
    if (!jid) return false;
    const owners = cargarOwners();
    return owners.some(o => _coincide(jid, o));
}

// Verifica si un JID es el owner principal (ignora el formato @lid vs @s.whatsapp.net)
function isSuperOwner(jid) {
    if (!jid) return false;
    // Comparar contra el SUPER_OWNER configurado en entorno
    if (SUPER_OWNER && _coincide(jid, SUPER_OWNER)) return true;
    // Comparar contra el primer elemento en owners.json (el principal almacenado)
    const owners = cargarOwners();
    if (owners.length > 0 && _coincide(jid, owners[0])) return true;
    return false;
}

function addOwner(jid) {
    const owners = cargarOwners();
    const jidNorm = normalizarJid(jid);
    if (owners.some(o => normalizarJid(o) === jidNorm)) return false;
    owners.push(jid);
    guardarOwners(owners);
    return true;
}

function removeOwner(jid) {
    if (SUPER_OWNER && isSuperOwner(jid)) return false;
    const owners = cargarOwners();
    const jidNorm = normalizarJid(jid);
    const idx = owners.findIndex(o => normalizarJid(o) === jidNorm);
    if (idx === -1) return false;
    owners.splice(idx, 1);
    guardarOwners(owners);
    return true;
}

function getOwners() {
    return cargarOwners();
}

module.exports = { isOwner, isSuperOwner, addOwner, removeOwner, getOwners, SUPER_OWNER };
