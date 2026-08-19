/**
 * style.js — Guía de estilo visual de Nexus-Bot
 * Todos los caracteres decorativos centralizados aquí.
 * REGLA: cero emojis, solo caracteres especiales + markdown WhatsApp (* _ ` ~)
 */

// ── Encabezados ──────────────────────────────────────────────────────────────
const H  = (txt) => `◤ *${txt}* ◢`;           // Header principal
const SH = (txt) => `「 ${txt} 」`;             // Subheader / sección

// ── Prefijos de campo ─────────────────────────────────────────────────────────
const F  = '✦ »';   // info general
const FS = '☆ »';   // stats / nivel / xp
const FL = '♡ »';   // social / pareja / harem
const FI = '◈ »';   // importante / destacado
const FC = '◆ »';   // objeto / categoría
const FA = '⚔ »';   // combate
const FP = '⛨ »';   // protección / admin
const FT = '◉ »';   // estado / toggle
const FR = '➥ »';   // redirección / tip / uso
const FE = '❖ »';   // economía / monedas / recompensa

// ── Resultados ────────────────────────────────────────────────────────────────
const OK  = '✓';    // éxito
const ERR = '✗';    // error
const WARN = '⊗';   // advertencia / bloqueo
const INFO = '《◇》'; // respuesta de estado informativa

// ── Decorativos ───────────────────────────────────────────────────────────────
const DIV = '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';   // separador de línea
const DOT = '·';
const ARR = '»';
const BUL = '◇';

// ── Barra de progreso ─────────────────────────────────────────────────────────
/**
 * @param {number} actual
 * @param {number} total
 * @param {number} [slots=10]
 */
function barra(actual, total, slots = 10) {
    const llenos = Math.round((actual / total) * slots);
    const vacios = slots - llenos;
    return '▰'.repeat(Math.max(0, llenos)) + '░'.repeat(Math.max(0, vacios));
}

// ── Niveles ───────────────────────────────────────────────────────────────────
const NIVELES = [
    { min: 1,  max: 9,  nombre: 'Novato',      icono: '⊹'  },
    { min: 10, max: 24, nombre: 'Explorador',   icono: '◇'  },
    { min: 25, max: 49, nombre: 'Guerrero',     icono: '◆'  },
    { min: 50, max: 99, nombre: 'Maestro',      icono: '◈'  },
    { min: 100,max: Infinity, nombre: 'Legendario', icono: '𖤐' },
];

function nivelInfo(nivel) {
    return NIVELES.find(n => nivel >= n.min && nivel <= n.max)
        || NIVELES[NIVELES.length - 1];
}

// ── Nombre de usuario (sin @mencionar) ───────────────────────────────────────
/**
 * Devuelve el nombre formateado con backtick de WhatsApp: `Nombre`
 * Usa pushName si está disponible, si no el número limpio.
 * @param {string} jid  - JID del usuario (573xxx@s.whatsapp.net)
 * @param {string} [pushName] - Nombre push de WhatsApp
 */
function nombre(jid, pushName) {
    const fallback = jid.replace(/[@:].*/g, '').replace(/\D/g, '').slice(-10);
    const n = (pushName && pushName.trim()) ? pushName.trim() : fallback;
    return `\`${n}\``;
}

module.exports = { H, SH, F, FS, FL, FI, FC, FA, FP, FT, FR, FE, OK, ERR, WARN, INFO, DIV, DOT, ARR, BUL, barra, nivelInfo, NIVELES, nombre };
