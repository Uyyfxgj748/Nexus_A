// Mapeo en memoria: LID → JID de teléfono (@s.whatsapp.net)
// Baileys 7.x usa @lid como identificador interno de Meta.
const fs   = require('fs-extra');
const path = require('path');

const LID_MAP_FILE = path.join(__dirname, '../data/lid_map.json');

const lidToPhone = new Map();

// Cargar mapa persistido al arrancar
(function _cargarMapa() {
    try {
        if (fs.existsSync(LID_MAP_FILE)) {
            const obj = JSON.parse(fs.readFileSync(LID_MAP_FILE, 'utf8'));
            for (const [lid, phone] of Object.entries(obj)) {
                lidToPhone.set(lid, phone);
            }
            if (lidToPhone.size > 0) {
                console.log(`[LID] ${lidToPhone.size} mapeo(s) cargado(s) desde disco.`);
            }
        }
    } catch (e) {
        // Si el archivo está corrupto, arrancamos con mapa vacío
    }
})();

function _persistir() {
    try {
        fs.ensureDirSync(path.dirname(LID_MAP_FILE));
        const obj = {};
        for (const [k, v] of lidToPhone.entries()) obj[k] = v;
        fs.writeFileSync(LID_MAP_FILE, JSON.stringify(obj, null, 2));
    } catch (e) {}
}

// Extrae el par { phone, lid } de un objeto contacto en cualquiera de los
// formatos que Baileys 7.x puede enviar:
//   Formato A: { id: '573...@s.whatsapp.net', lid: '202...@lid' }
//   Formato B: { id: '202...@lid', phoneNumber: '573...' }
//   Formato C: { id: '202...@lid', phone: '573...' }
//   Formato D: { id: '573...@s.whatsapp.net', jidType: ..., lid: '202...@lid' }
//   (participante de grupo) { id: '573...@s.whatsapp.net', lid: '202...@lid', admin: null }
function _extraerPareja(c) {
    if (!c || !c.id) return null;

    const rawId = String(c.id).replace(/:\d+@/, '@');

    // Formato A / D / participante de grupo con lid
    if (c.lid) {
        const rawLid = String(c.lid).replace(/:\d+@/, '@');
        if (rawId.endsWith('@s.whatsapp.net') && rawLid.endsWith('@lid')) {
            return { phone: rawId, lid: rawLid };
        }
        // invertido (raro, pero defensivo)
        if (rawLid.endsWith('@s.whatsapp.net') && rawId.endsWith('@lid')) {
            return { phone: rawLid, lid: rawId };
        }
    }

    // Formato B / C: id es @lid y viene el número en otro campo
    if (rawId.endsWith('@lid')) {
        const rawPhone = c.phoneNumber || c.phone || c.verifiedName || null;
        if (rawPhone) {
            const digits = String(rawPhone).replace(/\D/g, '');
            if (digits.length >= 7) {
                const phone = `${digits}@s.whatsapp.net`;
                return { phone, lid: rawId };
            }
        }
    }

    return null;
}

function registrarContacto(contacto) {
    const par = _extraerPareja(contacto);
    if (!par) return false;
    if (lidToPhone.get(par.lid) !== par.phone) {
        lidToPhone.set(par.lid, par.phone);
        _persistir();
        return true;
    }
    return false;
}

function registrarContactos(lista) {
    if (!Array.isArray(lista)) return 0;
    let registrados = 0;
    for (const c of lista) {
        const par = _extraerPareja(c);
        if (!par) continue;
        if (lidToPhone.get(par.lid) !== par.phone) {
            lidToPhone.set(par.lid, par.phone);
            registrados++;
        }
    }
    if (registrados > 0) _persistir();
    return registrados;
}

// Extrae mapeos LID→phone desde los participantes de un groupMetadata de Baileys.
// Devuelve cuántos mapeos nuevos se registraron.
function registrarParticipantes(participants) {
    if (!Array.isArray(participants)) return 0;
    return registrarContactos(participants);
}

// Si el JID es @lid y tenemos el mapeo, devuelve el JID de teléfono.
// Si no, devuelve el JID original sin cambios.
function resolverJid(jid) {
    if (!jid) return jid;
    if (!jid.endsWith('@lid')) return jid;
    return lidToPhone.get(jid) || jid;
}

function getLidMap() {
    return lidToPhone;
}

// Búsqueda inversa: dado un JID de teléfono, devuelve su @lid si está mapeado
function obtenerLidDePhone(phoneJid) {
    if (!phoneJid) return null;
    const norm = phoneJid.replace(/:\d+@/, '@');
    for (const [lid, phone] of lidToPhone.entries()) {
        if (phone === norm) return lid;
    }
    return null;
}

module.exports = { registrarContactos, registrarContacto, registrarParticipantes, resolverJid, getLidMap, obtenerLidDePhone };
