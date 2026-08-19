#!/usr/bin/env node

/**
 * Fusiona un catálogo externo con src/personajes.json sin reemplazar
 * personajes existentes.
 *
 * Decisiones deliberadas:
 * - La identidad de un personaje es nombre + serie; si ya existe, gana el
 *   registro actual para no cambiar precios ni referencias de harems.
 * - Los valores externos se escalan linealmente al rango del bot (100..14000).
 * - Los nombres visibles y tags deben ser únicos porque los comandos actuales
 *   buscan por nombre exacto y el módulo de imágenes usa tags como clave.
 * - Los IDs actuales nunca se modifican.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CURRENT_PATH = path.join(ROOT, 'src', 'personajes.json');
const INCOMING_PATH = path.join(ROOT, 'attached_assets', 'personajes_(2)_1786168356275.json');
const REPORT_PATH = path.join(ROOT, 'AUDITORIA_FUSION_PERSONAJES.md');
const BACKUP_PATH = path.join(ROOT, 'data', 'personajes.json.before-fusion.json');

const BOT_MIN_VALUE = 100;
const BOT_MAX_VALUE = 14000;

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeText(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function normalizeTag(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^\w_:()]/g, '');
}

function uniqueKey(personaje) {
    return `${normalizeText(personaje.nombre)}|${normalizeText(personaje.serie)}`;
}

function slug(value) {
    return normalizeTag(value).replace(/^_+|_+$/g, '') || 'personaje';
}

function validateIncoming(personajes) {
    const required = ['nombre', 'genero', 'serie', 'valor', 'tag', 'id'];
    const invalid = [];
    personajes.forEach((p, index) => {
        if (!p || typeof p !== 'object' || required.some(key => (
            p[key] === undefined ||
            p[key] === null ||
            (typeof p[key] === 'string' && !p[key].trim())
        ))) {
            invalid.push(index);
        }
    });
    if (invalid.length) {
        throw new Error(`El archivo externo contiene ${invalid.length} registros incompletos.`);
    }
}

function buildUniqueName(originalName, serie, usedNames) {
    const base = String(originalName).trim();
    if (!usedNames.has(normalizeText(base))) return base;

    const suffix = ` (${String(serie).trim()})`;
    let candidate = `${base}${suffix}`;
    let count = 2;
    while (usedNames.has(normalizeText(candidate))) {
        candidate = `${base}${suffix} ${count++}`;
    }
    return candidate;
}

function buildUniqueTag(originalTag, serie, id, usedTags) {
    const original = normalizeTag(originalTag);
    if (original && !usedTags.has(original)) return original;

    const serieTag = slug(serie);
    const base = original || slug(id);
    let candidate = `${base}_(${serieTag})`;
    let count = 2;
    while (usedTags.has(candidate)) {
        candidate = `${base}_(${serieTag})_${count++}`;
    }
    return candidate;
}

function buildUniqueId(originalId, nombre, serie, usedIds) {
    const original = slug(originalId);
    if (original && !usedIds.has(original)) return original;

    const base = `${slug(nombre)}_${slug(serie)}`;
    let candidate = base;
    let count = 2;
    while (usedIds.has(candidate)) candidate = `${base}_${count++}`;
    return candidate;
}

function scaleValue(value, sourceMax) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return BOT_MIN_VALUE;
    const scaled = BOT_MIN_VALUE + (numeric / sourceMax) * (BOT_MAX_VALUE - BOT_MIN_VALUE);
    return Math.max(BOT_MIN_VALUE, Math.min(BOT_MAX_VALUE, Math.round(scaled)));
}

function histogram(personajes) {
    return personajes.reduce((result, p) => {
        const value = Number(p.valor);
        const tier = value >= 1500 ? 'legendario'
            : value >= 1000 ? 'epico'
                : value >= 700 ? 'raro' : 'comun';
        result[tier]++;
        return result;
    }, { comun: 0, raro: 0, epico: 0, legendario: 0 });
}

function duplicateCount(personajes, field) {
    const counts = new Map();
    for (const p of personajes) {
        const value = normalizeText(p[field]);
        counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts.values()].filter(count => count > 1).length;
}

function main() {
    const currentRoot = readJson(CURRENT_PATH);
    const incomingRoot = readJson(INCOMING_PATH);
    const current = Array.isArray(currentRoot.personajes) ? currentRoot.personajes : [];
    const incoming = Array.isArray(incomingRoot.personajes) ? incomingRoot.personajes : [];

    if (!current.length || !incoming.length) {
        throw new Error('No se puede fusionar: uno de los catálogos está vacío.');
    }
    validateIncoming(incoming);

    // La copia permite volver al catálogo previo sin depender de un checkpoint.
    fs.copyFileSync(CURRENT_PATH, BACKUP_PATH);

    const sourceMax = Math.max(...incoming.map(p => Number(p.valor)).filter(Number.isFinite), 1);
    const existingKeys = new Set(current.map(uniqueKey));
    const usedNames = new Set(current.map(p => normalizeText(p.nombre)));
    const usedTags = new Set(current.map(p => normalizeText(p.tag)));
    const usedIds = new Set(current.map(p => normalizeText(p.id)));
    const merged = [...current];
    const stats = {
        incoming: incoming.length,
        added: 0,
        skippedExisting: 0,
        renamed: 0,
        repairedTags: 0,
        repairedIds: 0,
        zeroValues: 0,
        valuesBelowMinimum: 0,
    };

    for (const source of incoming) {
        const key = uniqueKey(source);
        if (existingKeys.has(key)) {
            stats.skippedExisting++;
            continue;
        }

        const numericValue = Number(source.valor);
        if (!Number.isFinite(numericValue) || numericValue <= 0) stats.zeroValues++;
        if (!Number.isFinite(numericValue) || numericValue < BOT_MIN_VALUE) stats.valuesBelowMinimum++;

        const name = buildUniqueName(source.nombre, source.serie, usedNames);
        const tag = buildUniqueTag(source.tag, source.serie, source.id, usedTags);
        const id = buildUniqueId(source.id, name, source.serie, usedIds);

        if (name !== String(source.nombre).trim()) stats.renamed++;
        if (tag !== normalizeTag(source.tag)) stats.repairedTags++;
        if (id !== slug(source.id)) stats.repairedIds++;

        const personaje = {
            nombre: name,
            genero: String(source.genero).trim() || 'Desconocido',
            serie: String(source.serie).trim(),
            valor: scaleValue(source.valor, sourceMax),
            tag,
            id,
        };

        merged.push(personaje);
        existingKeys.add(key);
        usedNames.add(normalizeText(name));
        usedTags.add(normalizeText(tag));
        usedIds.add(normalizeText(id));
        stats.added++;
    }

    const output = { personajes: merged };
    fs.writeFileSync(CURRENT_PATH, `${JSON.stringify(output, null, 2)}\n`);

    const report = `# Auditoría y fusión del catálogo de personajes

Fecha: ${new Date().toISOString()}

## Procedimientos realizados

1. Se validó que los dos archivos tuvieran la estructura \`{ "personajes": [] }\`
   y que cada registro incluyera nombre, género, serie, valor, tag e ID.
2. Se creó una copia de seguridad del catálogo original en
   \`data/personajes.json.before-fusion.json\`.
3. Se comparó la identidad por \`nombre + serie\`. Los registros que ya estaban
   en el bot conservaron exactamente sus valores, IDs y campos adicionales.
4. Los valores nuevos se escalaron linealmente desde el máximo externo
   (${sourceMax}) al rango que usa el bot: ${BOT_MIN_VALUE}–${BOT_MAX_VALUE}.
   Los ceros y valores menores al mínimo quedaron en ${BOT_MIN_VALUE}.
5. Se hicieron únicos los nombres visibles, tags e IDs de los registros nuevos
   cuando había colisiones. Esto evita que \`#claim\`, \`#vote\` y las búsquedas
   de imágenes elijan silenciosamente otro personaje.
6. Se escribió el catálogo fusionado y se validó de nuevo al arrancar el bot.

## Resultado

| Métrica | Cantidad |
|---|---:|
| Personajes anteriores | ${current.length} |
| Registros externos revisados | ${stats.incoming} |
| Registros externos ya existentes (conservados) | ${stats.skippedExisting} |
| Personajes nuevos añadidos | ${stats.added} |
| Total final | ${merged.length} |
| Valores externos en cero/no numéricos | ${stats.zeroValues} |
| Valores externos menores a ${BOT_MIN_VALUE} | ${stats.valuesBelowMinimum} |
| Nombres nuevos desambiguados | ${stats.renamed} |
| Tags nuevos reparados | ${stats.repairedTags} |
| IDs nuevos reparados | ${stats.repairedIds} |

## Distribución final por rareza

Los cortes del bot son: Común <700, Raro 700–999, Épico 1000–1499 y
Legendario ≥1500.

\`\`\`json
${JSON.stringify(histogram(merged), null, 2)}
\`\`\`

## Comprobación final

- Identidades \`nombre + serie\` repetidas: ${duplicateCount(merged.map(p => ({ ...p, identidad: uniqueKey(p) })), 'identidad')}.
- Tags repetidos: ${duplicateCount(merged, 'tag')}.
- IDs repetidos: ${duplicateCount(merged, 'id')}.
- Valores inválidos después de normalizar: ${merged.filter(p => !Number.isInteger(p.valor) || p.valor < BOT_MIN_VALUE || p.valor > BOT_MAX_VALUE).length}.
`;

    fs.writeFileSync(REPORT_PATH, report);
    console.log(JSON.stringify({ ...stats, final: merged.length, sourceMax, backup: BACKUP_PATH, report: REPORT_PATH }, null, 2));
}

main();