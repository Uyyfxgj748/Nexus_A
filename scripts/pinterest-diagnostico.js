'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  DIAGNÓSTICO COMPLETO — Pinterest API v5
//  Uso: node scripts/pinterest-diagnostico.js
//  Requiere: data/pinterest_token.json  +  env PINTEREST_APP_ID / PINTEREST_APP_SECRET
// ══════════════════════════════════════════════════════════════════════════════

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const TOKEN_FILE = path.join(__dirname, '..', 'data', 'pinterest_token.json');
const BASE       = 'https://api.pinterest.com/v5';

// ── Colores ANSI ──────────────────────────────────────────────────────────────
const green  = (s) => `\x1b[32m✅ ${s}\x1b[0m`;
const red    = (s) => `\x1b[31m❌ ${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m⚠️  ${s}\x1b[0m`;
const header = (s) => `\n\x1b[1m\x1b[36m═══ ${s} ═══\x1b[0m`;
const sep    = ()  => console.log('\x1b[90m' + '─'.repeat(72) + '\x1b[0m');

function prettyJson(obj, maxLen = 3000) {
    const s = JSON.stringify(obj, null, 2);
    return s.length > maxLen ? s.slice(0, maxLen) + '\n  … (truncado)' : s;
}

async function apiGet(token, endpoint, params) {
    const url  = endpoint.startsWith('http') ? endpoint : `${BASE}${endpoint}`;
    const qs   = params ? new URLSearchParams(params).toString() : '';
    const full = qs ? `${url}?${qs}` : url;

    console.log(`\x1b[90m  → GET ${full}\x1b[0m`);
    try {
        const res = await axios.get(full, {
            timeout : 20000,
            headers : { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        console.log(`\x1b[90m  ← HTTP ${res.status}\x1b[0m`);
        return { status: res.status, data: res.data, error: null, body: res.data };
    } catch (e) {
        const status = e.response?.status ?? 'NETWORK';
        const body   = e.response?.data   ?? null;
        console.log(`\x1b[31m  ← HTTP ${status}\x1b[0m`);
        if (body) console.log(`\x1b[31m  Cuerpo error:\n${prettyJson(body)}\x1b[0m`);
        return { status, data: null, error: e.message, body };
    }
}

async function main() {

    // ── 0. TOKEN ──────────────────────────────────────────────────────────────
    console.log(header('0. TOKEN Y CREDENCIALES'));
    sep();

    let tokenData;
    try {
        tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
        console.log(green(`Archivo de token: ${TOKEN_FILE}`));
    } catch (e) {
        console.log(red(`No se puede leer ${TOKEN_FILE}: ${e.message}`));
        process.exit(1);
    }

    const now     = Math.floor(Date.now() / 1000);
    const diffSec = (tokenData.expires_at || 0) - now;
    const diffDay = Math.round(diffSec / 86400);

    console.log(`  access_token  : ${tokenData.access_token?.slice(0, 20)}… (${tokenData.access_token?.length} chars)`);
    console.log(`  refresh_token : ${tokenData.refresh_token?.slice(0, 20)}… (${tokenData.refresh_token?.length} chars)`);
    console.log(`  expires_at    : ${tokenData.expires_at} → ${new Date((tokenData.expires_at||0)*1000).toISOString()}`);
    console.log(diffSec > 0 ? green(`Token VÁLIDO — expira en ${diffDay} días`) : red(`Token EXPIRADO hace ${Math.abs(diffDay)} días`));

    const APP_ID     = (process.env.PINTEREST_APP_ID     || '').trim();
    const APP_SECRET = (process.env.PINTEREST_APP_SECRET || '').trim();
    console.log(`  PINTEREST_APP_ID     : ${APP_ID     ? green(APP_ID.slice(0,8)+'…') : red('NO DEFINIDA')}`);
    console.log(`  PINTEREST_APP_SECRET : ${APP_SECRET ? green('••••••••')             : red('NO DEFINIDA')}`);

    const TOKEN = tokenData.access_token;
    if (!TOKEN) { console.log(red('Sin access_token. Abortando.')); return; }

    // ── 1. VALIDAR TOKEN ──────────────────────────────────────────────────────
    console.log(header('1. AUTENTICACIÓN — GET /v5/user_account'));
    sep();

    const r1 = await apiGet(TOKEN, '/user_account');
    let s1status = r1.status;
    if (r1.status === 200 && r1.data) {
        console.log(green('Autenticación correcta'));
        console.log(`  username     : ${r1.data.username}`);
        console.log(`  account_type : ${r1.data.account_type}`);
        console.log(`\n  Respuesta completa:\n${prettyJson(r1.data)}`);
    } else {
        console.log(red(`Fallo de autenticación — HTTP ${r1.status}`));
        console.log(yellow('El token puede estar inválido o revocado aunque no haya expirado según el archivo.'));
    }

    // ── 2. REFRESH TOKEN ──────────────────────────────────────────────────────
    console.log(header('2. RENOVACIÓN DEL TOKEN — POST /v5/oauth/token'));
    sep();

    if (!APP_ID || !APP_SECRET) {
        console.log(yellow('PINTEREST_APP_ID o PINTEREST_APP_SECRET no definidos — saltando refresh test.'));
    } else if (!tokenData.refresh_token) {
        console.log(yellow('Sin refresh_token en el archivo — saltando.'));
    } else {
        const creds = Buffer.from(`${APP_ID}:${APP_SECRET}`).toString('base64');
        const body  = `grant_type=refresh_token&refresh_token=${encodeURIComponent(tokenData.refresh_token)}`;
        console.log(`  → POST ${BASE}/oauth/token`);
        console.log(`    grant_type=refresh_token, refresh_token=${tokenData.refresh_token.slice(0,20)}...`);
        try {
            const rr = await axios.post(`${BASE}/oauth/token`, body, {
                timeout : 20000,
                headers : { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            });
            console.log(`\x1b[90m  ← HTTP ${rr.status}\x1b[0m`);
            console.log(green(`Refresh token funciona. Nuevo token: ${rr.data.access_token?.slice(0,20)}…`));
            console.log(`  expires_in: ${rr.data.expires_in}s (~${Math.round(rr.data.expires_in/86400)} días)`);
            console.log(`  scope: ${rr.data.scope || '(no enviado en respuesta)'}`);
        } catch (re) {
            const rs = re.response?.status ?? 'NETWORK';
            const rb = re.response?.data   ?? null;
            console.log(`\x1b[31m  ← HTTP ${rs}\x1b[0m`);
            console.log(red(`Refresh falló: ${re.message}`));
            if (rb) console.log(`  Respuesta:\n${prettyJson(rb)}`);
        }
    }

    // ── 3. TABLEROS ───────────────────────────────────────────────────────────
    console.log(header('3. TABLEROS — GET /v5/boards'));
    sep();

    const r3 = await apiGet(TOKEN, '/boards', { page_size: 5 });
    let firstBoardId = null;
    if (r3.status === 200 && r3.data) {
        const items = r3.data.items || [];
        console.log(green(`${items.length} tableros obtenidos (page_size=5)`));
        items.forEach((b, i) => {
            console.log(`  [${i+1}] id=${b.id}  name="${b.name}"  privacy=${b.privacy}`);
            if (!firstBoardId) firstBoardId = b.id;
        });
    } else {
        console.log(red(`GET /v5/boards → HTTP ${r3.status}`));
        console.log(yellow('Verificar scope: boards:read'));
    }

    // ── 4. PINS DE UN TABLERO ─────────────────────────────────────────────────
    console.log(header('4. PINS DE UN TABLERO — GET /v5/boards/{id}/pins'));
    sep();

    if (firstBoardId) {
        const r4 = await apiGet(TOKEN, `/boards/${firstBoardId}/pins`, { page_size: 3 });
        if (r4.status === 200 && r4.data) {
            const items = r4.data.items || [];
            console.log(green(`${items.length} pins del tablero ${firstBoardId}`));
            items.forEach((p, i) => {
                const imgUrl =
                    p.media?.images?.['1200x']?.url ||
                    p.media?.images?.['600x']?.url  ||
                    p.media?.images?.['400x300']?.url || '(sin imagen)';
                console.log(`  [${i+1}] id=${p.id}  title="${(p.title||'').slice(0,40)}"  img=${imgUrl.slice(0,80)}`);
            });
            if (items.length > 0)
                console.log(`\n  Primer pin (estructura completa):\n${prettyJson(items[0], 1200)}`);
        } else {
            console.log(red(`GET /v5/boards/${firstBoardId}/pins → HTTP ${r4.status}`));
        }
    } else {
        console.log(yellow('Sin tableros disponibles, saltando.'));
    }

    // ── 5. TODOS LOS ENDPOINTS DE BÚSQUEDA ───────────────────────────────────
    console.log(header('5. ENDPOINTS DE BÚSQUEDA — todos los formatos posibles'));
    sep();

    const searchVariants = [
        ['/search/pins',   { query: 'cat', page_size: 5 }],
        ['/pins/search',   { query: 'cat', page_size: 5 }],
        ['/search/boards', { query: 'cat', page_size: 5 }],
        ['/pins',          { page_size: 5 }],
    ];

    const searchWorking = {};
    for (const [ep, params] of searchVariants) {
        const r = await apiGet(TOKEN, ep, params);
        if (r.status === 200 && r.data) {
            const items = r.data.items || r.data.data || (Array.isArray(r.data) ? r.data : []);
            console.log(green(`${ep} → HTTP 200, ${items.length} items`));
            searchWorking[ep] = true;
            if (items.length > 0) console.log(`  Primer item:\n${prettyJson(items[0], 600)}`);
        } else if (r.status === 404) {
            console.log(red(`${ep} → HTTP 404 — endpoint NO DISPONIBLE en este tier/cuenta`));
        } else if (r.status === 403) {
            console.log(red(`${ep} → HTTP 403 — Scope insuficiente`));
        } else {
            console.log(yellow(`${ep} → HTTP ${r.status}`));
        }
    }

    // ── 6. BÚSQUEDAS DE PRUEBA ────────────────────────────────────────────────
    console.log(header('6. BÚSQUEDAS DE PRUEBA — /v5/search/pins'));
    sep();

    const QUERIES = ['anime', 'anime girl', 'cat', 'dog', 'landscape', 'meme', 'roxy', 'girl'];

    for (const q of QUERIES) {
        process.stdout.write(`\n  🔍 "${q}" ... `);
        const r = await apiGet(TOKEN, '/search/pins', { query: q, page_size: 10 });

        if (r.status === 200 && r.data) {
            const items = r.data.items || r.data.data || [];
            if (items.length > 0) {
                const first  = items[0];
                const imgUrl =
                    first.media?.images?.['1200x']?.url ||
                    first.media?.images?.['600x']?.url  ||
                    first.media?.images?.['400x300']?.url ||
                    first.media?.images?.['236x']?.url  || '(sin imagen en respuesta)';
                console.log(green(`${items.length} resultados`));
                console.log(`    id     : ${first.id}`);
                console.log(`    title  : ${(first.title||'(vacío)').slice(0,80)}`);
                console.log(`    img_url: ${imgUrl.slice(0,100)}`);
                console.log(`    link   : https://www.pinterest.com/pin/${first.id}/`);
            } else {
                console.log(yellow('0 resultados (respuesta OK pero array vacío)'));
                console.log(`    Respuesta completa:\n${prettyJson(r.data)}`);
            }
        } else if (r.status === 404) {
            console.log(red('HTTP 404 — /search/pins no disponible en este tier'));
            console.log(yellow('Conclusión: la cuenta no tiene acceso al endpoint de búsqueda pública.'));
            console.log(`    Respuesta:\n${prettyJson(r.body, 600)}`);
            break;
        } else if (r.status === 403) {
            console.log(red(`HTTP 403 — scope insuficiente para "${q}"`));
            console.log(`    Respuesta:\n${prettyJson(r.body, 600)}`);
            break;
        } else {
            console.log(red(`HTTP ${r.status} para "${q}"`));
        }
    }

    // ── 7. ESTRUCTURA REAL DE UN PIN VÍA /v5/pins/{id} ───────────────────────
    console.log(header('7. ESTRUCTURA DE PIN — GET /v5/pins/{pin_id}'));
    sep();

    // Usar un pin ID conocido públicamente
    const testPinId = '155374255890109592';
    console.log(`  Probando con pin_id conocido: ${testPinId}`);
    const r7 = await apiGet(TOKEN, `/pins/${testPinId}`);
    if (r7.status === 200 && r7.data) {
        console.log(green('Pin obtenido correctamente'));
        const p = r7.data;
        const imgUrl =
            p.media?.images?.['1200x']?.url ||
            p.media?.images?.['600x']?.url  ||
            p.media?.images?.['400x300']?.url || '(no en respuesta)';
        console.log(`  id     : ${p.id}`);
        console.log(`  title  : ${p.title || '(vacío)'}`);
        console.log(`  img_url: ${imgUrl}`);
        console.log(`\n  Estructura completa del pin:\n${prettyJson(p, 1500)}`);
    } else {
        console.log(red(`GET /v5/pins/${testPinId} → HTTP ${r7.status}`));
        console.log(yellow('Si da 404, el pin no existe públicamente o requiere autenticación del dueño.'));
    }

    // ── 8. PINS PROPIOS ───────────────────────────────────────────────────────
    console.log(header('8. PINS PROPIOS — GET /v5/pins'));
    sep();

    const r8 = await apiGet(TOKEN, '/pins', { page_size: 5 });
    if (r8.status === 200 && r8.data) {
        const items = r8.data.items || [];
        console.log(green(`${items.length} pins propios del usuario`));
        items.slice(0, 3).forEach((p, i) => {
            const img = p.media?.images?.['600x']?.url || p.media?.images?.['400x300']?.url || '(sin img)';
            console.log(`  [${i+1}] id=${p.id}  title="${(p.title||'').slice(0,40)}"  img=${img.slice(0,80)}`);
        });
    } else {
        console.log(red(`GET /v5/pins → HTTP ${r8.status}`));
    }

    // ── INFORME FINAL ─────────────────────────────────────────────────────────
    console.log(header('INFORME FINAL'));
    sep();

    console.log(`
  ESTADO DE COMPONENTES:
  ─────────────────────────────────────────────
  Token válido               : ${diffSec > 0 ? '✅ SÍ (' + diffDay + ' días restantes)' : '❌ EXPIRADO'}
  Autenticación (/user_account): ${s1status === 200 ? '✅ OK' : '❌ FALLO HTTP ' + s1status}
  Tableros (/boards)         : ${r3.status === 200 ? '✅ OK' : '❌ HTTP ' + r3.status}
  Búsqueda /search/pins      : ${searchWorking['/search/pins'] ? '✅ DISPONIBLE' : '❌ NO DISPONIBLE en este tier'}
  Búsqueda /search/boards    : ${searchWorking['/search/boards'] ? '✅ DISPONIBLE' : '❌ HTTP no 200'}
  Pins propios (/pins)       : ${r8.status === 200 ? '✅ OK' : '❌ HTTP ' + r8.status}

  ANÁLISIS SOBRE /v5/search/pins:
  ─────────────────────────────────────────────
  La API de búsqueda pública de Pinterest (/v5/search/pins) tiene niveles de acceso:

  Tier Standard (cuenta normal de desarrollador):
    → Solo busca dentro de los PROPIOS pins/boards del usuario autenticado.
    → Para búsqueda PÚBLICA del catálogo completo de Pinterest se requiere:
       • Aprobación como "Verified Merchant" o "Media Partner"
       • O acceso a través del programa de socios aprobados por Pinterest

  Referencias oficiales:
    https://developers.pinterest.com/docs/api/v5/#tag/search
    https://developers.pinterest.com/docs/getting-started/overview/

  CONCLUSIÓN:
  ─────────────────────────────────────────────
  Si /search/pins devuelve HTTP 404: Pinterest no tiene ese endpoint habilitado
  para tu cuenta → la búsqueda pública NO es posible con Standard Access.

  Si devuelve resultados pero vacíos: el endpoint funciona pero solo tiene
  acceso a tus propios pins/boards (que pueden ser 0 si la cuenta es nueva).
`);
}

main().catch(e => {
    console.error('\x1b[31mError fatal en diagnóstico:\x1b[0m', e.message);
    if (e.stack) console.error(e.stack);
    process.exit(1);
});
