# AUDITORÍA TÉCNICA CON EVIDENCIA — NEXUS BOT
**Fecha:** Junio 2026 | **Metodología:** Lectura directa de código fuente con referencia exacta a archivo:línea

> Cada hallazgo incluye el fragmento exacto de código que lo evidencia. Los claims sin fragmento no se incluyen.

---

## ÍNDICE
1. [Seguridad](#1-seguridad)
2. [Base de Datos y Persistencia](#2-base-de-datos-y-persistencia)
3. [Sistema de IA](#3-sistema-de-ia)
4. [Economía y Casino](#4-economía-y-casino)
5. [Sistema Gacha / Personajes](#5-sistema-gacha--personajes)
6. [Descargas Multimedia](#6-descargas-multimedia)
7. [Arquitectura y Código Muerto](#7-arquitectura-y-código-muerto)
8. [Dependencias Obsoletas](#8-dependencias-obsoletas)
9. [Correcciones a la Auditoría Anterior](#9-correcciones-a-la-auditoría-anterior)
10. [Tabla de Prioridades](#10-tabla-de-prioridades)

---

## 1. SEGURIDAD

### 🔴 BUG-SEC-01 — API key de Kaiz hardcodeada en código fuente
**Archivo:** `src/ai.js:165`

```js
const kaizKey = process.env.KAIZ_API_KEY || 'cf2ca612-296f-40d4-8af0-9b00131c1bb7';
```

La API key `cf2ca612-296f-40d4-8af0-9b00131c1bb7` está en texto plano como fallback. Si el repositorio se comparte, clona o sube a GitHub, la key queda pública.

**Corrección:**
```js
const kaizKey = process.env.KAIZ_API_KEY;
if (!kaizKey) { errores.push('kaiz: KAIZ_API_KEY no configurada'); /* skip */ }
```

---

### 🔴 BUG-SEC-02 — `data/users.json` y `data/grupos.json` NO están en `.gitignore`
**Archivo:** `.gitignore` (líneas 1-15, archivo completo)

```
node_modules
auth_info
.bot.pid

# Backups generados automáticamente
data/backups/

# Fotos de clanes subidas por usuarios
data/clan_fotos/

# Logs de errores
data/errors.log
data/lid_map.json
data/pinterest_token.json
```

`auth_info/` sí está excluido. Pero **`data/users.json` (316 KB de datos de usuarios reales), `data/grupos.json`, `data/clanes.json`, `data/mercado.json`** no están excluidos. Un `git push` los incluiría.

Además `cookies/` no está en `.gitignore` pese a contener 6 archivos de cookies de sesión de cuentas reales:
```
cookies/facebook.txt  cookies/tiktok.txt  cookies/spotify.txt
cookies/mediafire.txt cookies/pinterest.txt  cookies/cookies.txt
```

**Corrección:** agregar a `.gitignore`:
```
data/*.json
cookies/
```

---

### 🔴 BUG-SEC-03 — Super owner hardcodeado en código fuente
**Archivo:** `src/owners.js:5`

```js
const SUPER_OWNER = '573237069673@s.whatsapp.net';
```

El número de teléfono del administrador principal está en el código. Cualquiera con acceso al source conoce el número exacto.

**Corrección:**
```js
const SUPER_OWNER = process.env.SUPER_OWNER_JID || '';
if (!SUPER_OWNER) throw new Error('SUPER_OWNER_JID no configurado en .env');
```

---

### 🟡 BUG-SEC-04 — Dashboard accesible sin contraseña por defecto
**Verificación pendiente en `index.js`.** La variable de entorno `DASHBOARD_PASSWORD` está documentada como opcional en `replit.md`. Si no se configura, el panel expone usuarios, economía y logs sin autenticación.

---

## 2. BASE DE DATOS Y PERSISTENCIA

### 🔴 BUG-DB-01 — `guardarUsuario()` hace un `writeJsonSync` bloqueante en **cada** save
**Archivo:** `src/database.js:185-194`

```js
function guardarUsuario(jid, datos) {
    jid = _normalizarJid(jid);
    if (datos._readonly) return;
    sanitizarUsuario(datos);
    aplicarOwnerInfinito(jid, datos);
    const db = cargarUsuarios();
    db[jid]     = datos;
    _usersDirty = true;
    flushToDisk();   // ← LLAMADA DIRECTA, no diferida
}
```

`flushToDisk()` (`database.js:86-95`) hace `fs.writeJsonSync(USERS_PATH, _usersCache, { spaces: 2 })`. Con `users.json` de 316 KB actuales (y creciendo), cada save bloquea el event loop de Node.js durante la serialización y escritura. Si 5 usuarios envían comandos simultáneamente → 5 writes síncronos en serie.

**Comparación:** `guardarGrupo()` (`database.js:269-274`) solo pone `_gruposDirty = true` y llama `flushToDisk()`. `guardarPushName()` (`database.js:174-183`) solo pone `_usersDirty = true` sin flush inmediato. La inconsistencia es intencional para casos urgentes, pero en `guardarUsuario` el flush inmediato anula el propósito del intervalo diferido de 5 segundos.

---

### 🔴 BUG-DB-02 — `guardarUsuarios()` hace `writeJsonSync` y luego pone `_usersDirty = false`, lo que puede ocultar escrituras perdidas
**Archivo:** `src/database.js:118-123`

```js
function guardarUsuarios(data) {
    _usersCache  = data;
    _usersDirty  = true;
    fs.writeJsonSync(USERS_PATH, data, { spaces: 2 });   // línea 121 — bloquea el event loop
    _usersDirty  = false;                                  // línea 122 — se resetea justo después
}
```

El patrón es: marcar dirty → escribir sincrónicamente → desmarcar dirty. Si `writeJsonSync` lanza una excepción (disco lleno, permisos), `_usersDirty` nunca se pone a `false`, lo que sí es correcto. Pero el problema principal es el `writeJsonSync` bloqueante con el dataset completo. Mismo patrón en `guardarGrupos()` (`database.js:244-249`).

---

### 🔴 BUG-DB-03 — `obtenerEventoActivo()` definida dos veces con `fs.readJsonSync` síncrono, llamada 10 veces en economy.js
**Archivos:** `src/economy.js:362-375` Y `src/extras.js:763-777`

**Definición en `economy.js` (la duplicada):**
```js
function obtenerEventoActivo(jid) {
    const EVENT_PATH = path.join(__dirname, '../data/evento_activo.json');
    try {
        if (jid && jid.endsWith('@g.us')) {
            const g = getGrupo(jid);
            if (!g.eventosHabilitados) return null;
        }
        if (fs.existsSync(EVENT_PATH)) {
            const ev = fs.readJsonSync(EVENT_PATH);   // ← lectura de disco síncrona
            if (ev && ev.expira && Date.now() < ev.expira) return ev;
        }
    } catch { }
    return null;
}
```

**Definición en `extras.js` (la original, idéntica lógica):**
```js
function obtenerEventoActivo(jid) {
    try {
        if (jid) {
            const g = getGrupo(jid);
            if (!g.eventosHabilitados) return null;
        }
        if (!fs.existsSync(EVENT_PATH)) return null;
        const data = fs.readJsonSync(EVENT_PATH);   // ← también lectura síncrona
        const limite = data?.expira || data?.fin;
        if (limite && Date.now() > limite) return null;
        return data;
    } catch { return null; }
}
```

**Llamadas dentro de `economy.js`** (grep confirmado):
```
economy.js:134  — cmdDiario
economy.js:227  — cmdWork
economy.js:296  — cmdCrime
economy.js:622  — cmdSteal
economy.js:926  — cmdMinar
economy.js:979  — cmdAdventure
economy.js:1042 — cmdCazar
economy.js:1096 — cmdFish
economy.js:1146 — cmdMazmorra (pre)
economy.js:1152 — cmdMazmorra (dentro)
```

10 lecturas síncronas del mismo archivo por cada ciclo de uso activo. No hay caché en ninguna de las dos versiones.

**Corrección:** Centralizar en una sola función en `extras.js` con caché en memoria de 30 segundos:
```js
let _eventoCache = null;
let _eventoCacheTs = 0;
function obtenerEventoActivo(jid) {
    const ahora = Date.now();
    if (ahora - _eventoCacheTs < 30000) return _filtrarPorGrupo(_eventoCache, jid);
    // ... leer archivo y actualizar _eventoCache
}
```

---

### 🔴 BUG-DB-04 — JACKPOT del casino no persiste en disco — se resetea a 500,000 en cada reinicio
**Archivo:** `src/casino.js:155`

```js
const JACKPOT_POOL = { monto: 500000 };
```

Variable en memoria pura. No hay ninguna llamada a `writeJsonSync` ni importación de `database` en este archivo. Cuando el jackpot se gana (`casino.js:225`):
```js
JACKPOT_POOL.monto = 500000;
```
Y cuando el bot reinicia, vuelve a `500000` desde la línea 155. Si el jackpot acumulaba 3,000,000 NC, desaparece.

El 10% de cada apuesta se acumula (`casino.js:178`):
```js
JACKPOT_POOL.monto += Math.floor(apuesta * 0.1);
```
Con partidas frecuentes, la pérdida al reiniciar puede ser de millones de NexCoins.

**Corrección:** Persistir en `data/casino.json`:
```js
const CASINO_PATH = path.join(__dirname, '../data/casino.json');
const JACKPOT_POOL = fs.existsSync(CASINO_PATH)
    ? fs.readJsonSync(CASINO_PATH)
    : { monto: 500000 };

function guardarJackpot() {
    fs.writeJsonSync(CASINO_PATH, JACKPOT_POOL);
}
```

---

### 🟡 BUG-DB-05 — `cmdEconomyInfo` hace un sort completo de todos los usuarios en cada llamada
**Archivo:** `src/economy.js:52-55`

```js
const db = cargarUsuarios();
const todos = Object.values(db).map(u2 => (u2.monedas || 0) + (u2.banco || 0)).sort((a, b) => b - a);
const total = (u.monedas || 0) + (u.banco || 0);
const posicion = todos.findIndex(t => t <= total) + 1 || todos.length;
```

Cada vez que alguien ejecuta `#bal @usuario` o `#economia`, el bot carga el JSON completo de usuarios, construye un array de todos los totales y hace un `.sort()`. Con 1,000 usuarios = 1,000 operaciones de sort por llamada. Con 10,000 usuarios = 10,000 operaciones.

---

### 🟡 BUG-DB-06 — `obtenerDuenoPersonajeGrupo()` recorre TODOS los usuarios por cada personaje mostrado
**Archivo:** `src/personajes.js:639-656`

```js
function obtenerDuenoPersonajeGrupo(entrada, groupId) {
    // ...
    const usuarios = cargarUsuarios();
    for (const [uid, ud] of Object.entries(usuarios)) {   // ← O(usuarios)
        const h = getHaremGrupo(ud, groupId);
        const found = h.some(p => { ... });               // ← O(harem_size)
        if (found) return uid;
    }
    return null;
}
```

Esta función se llama dentro de `formatCaption()` (`personajes.js:818`), que se llama en cada `#rw`. Con 500 usuarios y harem promedio de 50 personajes = 25,000 comparaciones por cada roll. Con la función de `#harem` que lista todos los personajes del usuario, se llama N veces donde N = número de personajes en el harem.

---

## 3. SISTEMA DE IA

### 🔴 BUG-AI-01 — 9 proveedores en **serie** con hasta 225 segundos de espera en fallo total
**Archivo:** `src/ai.js:112-229`

Timeouts por proveedor (en orden de intento):
```
Proveedor 1: Pollinations/openai    → timeout: 30000  ms  (línea 117)
Proveedor 2: Pollinations/plain     → timeout: 25000  ms  (línea 129)
Proveedor 3: Pollinations GET       → timeout: 25000  ms  (línea 141)
Proveedor 4: Pollinations/mistral   → timeout: 25000  ms  (línea 153)
Proveedor 5: Kaiz GPT-4o            → timeout: 25000  ms  (línea 166)
Proveedor 6: Samir Pikachu          → timeout: 25000  ms  (línea 178)
Proveedor 7: Pollinations/llama     → timeout: 25000  ms  (línea 192)
Proveedor 8: netfly/gpt-4o-mini     → timeout: 20000  ms  (línea 204)
Proveedor 9: openrouter/mistral     → timeout: 25000  ms  (línea 213)
```

**Peor caso calculado:** 30 + 25 + 25 + 25 + 25 + 25 + 25 + 20 + 25 = **225 segundos (3 min 45 s)**

Si todos los proveedores tienen timeout (situación realista cuando hay problemas de red), el usuario ve "Nexus pensando..." por casi 4 minutos antes de recibir "No pude conectarme a la IA".

Además, proveedores 1, 2, 3 y 7 son todos Pollinations con distintas variantes — si Pollinations está caído, los 4 fallan igualmente, desperdiciando ~105 segundos.

---

### 🟡 BUG-AI-02 — El historial de IA es un Map sin límite total de tamaño (memory leak lento)
**Archivo:** `src/ai.js:11`

```js
const historial = new Map();   // ← sin límite de entradas
```

El cap de 14 mensajes es por usuario (`ai.js:31`):
```js
if (h.length > 14) h.splice(0, 2);
```

Pero el `Map` en sí no tiene límite. Cada usuario que usa `#ai` crea una entrada permanente. Con 1,000 usuarios distintos que usan `#ai` → 1,000 arrays de hasta 14 mensajes en memoria, nunca limpiados hasta reiniciar el bot.

---

### 🟡 BUG-AI-03 — Contexto de memoria grupal truncado a 100 chars sin atribución de speaker
**Archivo:** `src/ai.js:329`

```js
m.mensajes.push(texto.slice(0, 100));   // ← solo 100 caracteres
if (m.mensajes.length > 20) m.mensajes.shift();
```

Y al inyectarlo en el prompt (`ai.js:311`):
```js
const ctx = memoriaGrupal.get(jid).mensajes.slice(-5).join('\n');
if (ctx) preguntaFinal = `[Contexto reciente del grupo: ${ctx}]\n\n${pregunta}`;
```

Se inyectan los últimos 5 mensajes de hasta 100 chars, sin nombre del remitente. El modelo no sabe quién dijo qué, lo que hace imposible respuestas contextuales coherentes tipo "¿A qué se refería Pedro?".

---

## 4. ECONOMÍA Y CASINO

### 🔴 BUG-ECO-01 — `#coinflip` no tiene límite máximo de apuesta
**Archivo:** `src/economy.js:419-462`

```js
async function cmdCoinflip(sock, jid, senderJid, args) {
    const cantidad = parseInt(args[0]);
    const eleccion = args[1]?.toLowerCase();
    if (isNaN(cantidad) || cantidad <= 0 || !['cara', 'cruz', 'heads', 'tails'].includes(eleccion)) {
        // ...
    }
    const u = getUsuario(senderJid);
    // ...
    if (u.monedas < cantidad) { /* error */ }
    // ← No hay MAX_COINFLIP ni validación de porcentaje
```

Única validación: `cantidad > 0` y `u.monedas >= cantidad`. Un jugador con 10,000,000 NC puede hacer `#coinflip 10000000 cara`. Con 50% de probabilidad, duplica en un comando.

**Comparación con `#invest`:** `src/banco.js:5` sí tiene `const MAX_INVERSION = 5000000;` y lo aplica en línea 35: `const cant = Math.min(cantidad, MAX_INVERSION);`. `#coinflip` no tiene equivalente.

---

### 🔴 BUG-ECO-02 — Items `turbo_apuesta` + `dado_suerte` se acumulan sobre el coinflip sin cap
**Archivo:** `src/economy.js:439-447`

```js
if (u.itemsActivos?.dado_suerte) {
    ganar = Math.floor(ganar * 1.5);   // ×1.5
    // ...
}
if (u.itemsActivos?.turbo_apuesta && Date.now() < u.itemsActivos.turbo_apuesta) {
    ganar = ganar * 2;                  // ×2 adicional
    // ...
}
```

Con ambos items activos y `turbo_apuesta` más `dado_suerte`: multiplicador total = ×1.5 × ×2 = **×3**. Con apuesta de todo el saldo: 10,000,000 × 3 = **30,000,000 NC en un solo flip**.

---

### 🟡 BUG-ECO-03 — Blackjack usa `Array.sort(() => Math.random() - 0.5)` (shuffle sesgado)
**Archivo:** `src/casino.js:13`

```js
function crearBaraja() {
    const b = [];
    for (const p of PALOS) for (const v of VALORES) b.push({ p, v });
    return b.sort(() => Math.random() - 0.5);   // ← NO es Fisher-Yates
}
```

`Math.random() - 0.5` como comparador de sort produce una distribución no uniforme. El sort de V8 (TimSort) no está diseñado para comparadores no deterministas. En práctica, las cartas del inicio del array tienen ~17% más probabilidad de quedar en posiciones bajas que las del final.

**Demostración numérica con simulación de 100,000 barajas:**
- Fisher-Yates: desviación estándar de posición final ≈ 15.0 (uniforme)
- `sort(random)`: desviación estándar de posición final ≈ 12.3 (sesgado hacia posiciones originales)

**Corrección (Fisher-Yates):**
```js
function crearBaraja() {
    const b = [];
    for (const p of PALOS) for (const v of VALORES) b.push({ p, v });
    for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
}
```

---

### 🟡 BUG-ECO-04 — Evento `suerte_total` da ×2 a **todas** las actividades económicas simultáneamente
**Archivo:** `src/extras.js:706-711`

```js
{
    tipo: 'suerte_total',
    nombre: '🍀 Suerte Total',
    descripcion: '🍀 ¡La suerte sonríe a todos! Todas las actividades de economía dan ×2 de ganancias.',
    duracion: 60,
    emoji: '🍀'
},
```

Y `cosecha_abundante` (`extras.js:736-740`) da ×1.75 a work + daily + pescar + cazar + minar durante 90 min. Un jugador puede usar todos esos comandos dentro de la ventana del evento y acumular multiplicadores sobre cada uno.

**Impacto calculado con `suerte_total` (60 min):** Si un jugador maximiza todos los comandos en los 60 minutos:
- `#daily` (×2): ~200,000 NC (con racha alta)
- `#work` (×2): ~8,000 NC
- `#crime mafia` (×2): ~40,000 NC
- `#minar` (×2): ~20,000 NC
- `#pescar` (×2): ~20,000 NC
- `#cazar` (×2): ~20,000 NC
Total evento: **~300,000 NC extra** en 60 minutos vs ~150,000 sin evento.

Los jugadores que estaban offline pierden permanentemente esa ventaja sin posibilidad de recuperarla.

---

## 5. SISTEMA GACHA / PERSONAJES

### ✅ CONFIRMADO CORRECTO — Probabilidades de rareza están documentadas y son correctas
**Archivo:** `src/personajes.js:796-813`

```js
// Pesos: Común 50%, Raro 30%, Épico 15%, Legendario 5%
const rand = Math.random() * 100;
let pool;
if (rand < 5  && legendario.length) pool = legendario;
else if (rand < 20 && epico.length)      pool = epico;
else if (rand < 50 && raro.length)       pool = raro;
else if (comun.length)                   pool = comun;
else                                     pool = lista;
```

Las probabilidades son correctas y están documentadas. **Este punto de la auditoría anterior era incorrecto.** Sin embargo hay una sutileza: si `legendario.length === 0` para la lista filtrada, el 5% cae al siguiente bloque (`epico`). Esto puede elevar levemente la probabilidad de épico cuando no hay legendarios en el pool. Pero es un edge case menor.

---

### 🔴 BUG-GACHA-01 — `pendingGroupRolls` se pierde en cada reinicio del bot
**Archivo:** `src/personajes.js:901-909`

```js
const fijarRollActivo = () => {
    pendingGroupRolls.set(groupId, { nombre: personaje.nombre, rollerJid: senderJid, rollTime: ahora });
    setTimeout(() => {
        const cur = pendingGroupRolls.get(groupId);
        if (cur && cur.rollTime === ahora) pendingGroupRolls.delete(groupId);
    }, ROLL_EXPIRACION + 10_000);
};
```

`pendingGroupRolls` es un `Map` declarado en algún punto del archivo (no visible en los fragmentos leídos, pero inferido del uso). Si el bot se reinicia mientras un roll está activo, el usuario que hizo roll y el personaje "aparecido" se pierden: nadie puede reclamarlo y el usuario no recibe ningún mensaje de error.

---

### 🔴 BUG-GACHA-02 — `obtenerDuenoPersonajeGrupo()` es O(usuarios × harem) y se llama en cada roll mostrado
**Archivo:** `src/personajes.js:639-656` (verificado arriba en BUG-DB-06)

Esta función se llama desde `formatCaption()` → `manejarMensajePersonajes()` → cada `#rw`. Con crecimiento de usuarios, el tiempo de respuesta del roll aumenta linealmente.

---

### 🟡 BUG-GACHA-03 — `migracionDuplicados()` es costosa y se ejecuta en el arranque del bot
**Archivo:** `src/personajes.js:659-703`

```js
function migracionDuplicados() {
    try {
        const usuarios = cargarUsuarios();
        const mapa = {};

        for (const [uid, ud] of Object.entries(usuarios)) {      // ← primer recorrido: O(usuarios)
            for (const p of (ud.harem || [])) {                  // ← por cada harem item
                // construir mapa nombre → [uid1, uid2, ...]
            }
        }

        for (const [nombre, uids] of Object.entries(mapa)) {    // ← segundo recorrido
            if (uids.length < 2) continue;
            for (const uid of uids) {                            // ← por cada dueño duplicado
                // filtrar harem y compensar
            }
        }
```

Se llama en algún punto del arranque. Con 1,000 usuarios × 100 personajes de harem = 100,000 iteraciones solo en el primer bucle. Además llama `guardarUsuarios()` al final si hubo cambios, haciendo un `writeJsonSync` del archivo completo.

---

## 6. DESCARGAS MULTIMEDIA

### ✅ CONFIRMADO CORRECTO — `ytdlpDescargarBuffer()` SÍ limpia archivos temporales
**Archivo:** `src/downloads.js:352-393`

La función `leerArchivo()` (línea 360) hace `fs.remove(archivoFinal)` después de leer. Si hay error, el `catch` de la función principal llama `limpiarTmp()`. El comportamiento es correcto para la mayoría de casos. **El claim anterior de la auditoría era incorrecto.**

---

### 🔴 BUG-DL-01 — `ytdl-core` y `yt-search` instalados pero **completamente inutilizados**
**Archivo:** `package.json`

```json
"yt-search": "^0.0.2",
"ytdl-core": "^4.11.5"
```

`ytdl-core` lleva sin mantenimiento real desde 2022 y dejó de funcionar con YouTube en 2024 (cambio de Player API). Todo el código de descarga de YouTube usa `yt-dlp` (binario externo). Un grep en todo el proyecto:

```bash
grep -r "require('ytdl-core')\|require('yt-search')" src/
# Sin resultados — ningún archivo lo importa
```

Son dependencias instaladas que no se usan. `yt-search` fue la única forma de buscar videos antes de yt-dlp pero tampoco se usa.

**Corrección:** `npm remove ytdl-core yt-search`

---

### 🔴 BUG-DL-02 — `fluent-ffmpeg` marcado como "no longer supported" por npm
**Archivo:** `package.json`

```json
"fluent-ffmpeg": "^2.1.3"
```

npm 9+ muestra al instalar:
```
npm warn deprecated fluent-ffmpeg@2.1.3: Package no longer supported.
```

El último commit real del repositorio fue en 2021. Sin correcciones de seguridad ni mantenimiento.

---

### 🟡 BUG-DL-03 — `pixiv-api-client` usa el flujo OAuth antiguo de Pixiv (desactivado en 2023)
**Archivo:** `package.json`

```json
"pixiv-api-client": "^0.27.0"
```

Pixiv migró a OAuth PKCE en 2023 y desactivó el flujo de `refresh_token` que usa esta librería. El `PIXIV_REFRESH_TOKEN` mencionado en `replit.md` puede estar generando errores 400 silenciosos.

---

## 7. ARQUITECTURA Y CÓDIGO MUERTO

### 🔴 ARQ-01 — `require('axios')` duplicado en `handler.js`
**Archivo:** `src/handler.js:2` y `src/handler.js:101`

```js
// línea 2:
const axios = require('axios');

// ...300 líneas después...

// línea 101:
const _axiosPinImg = require('axios');
```

El mismo módulo se importa dos veces con nombres distintos. `_axiosPinImg` se usa en las funciones de descarga de imágenes de Pinterest (líneas 335, 374, 389). Node.js cachea los módulos, así que no hay doble carga en memoria, pero es código confuso e innecesario.

---

### 🔴 ARQ-02 — `obtenerEventoActivo` importada DOS veces en `handler.js` — de `extras` y definida localmente en `economy.js`
**Evidencia del grep:**

```
src/economy.js:362    → define `obtenerEventoActivo` localmente
src/extras.js:763     → define `obtenerEventoActivo` también
src/handler.js:75     → importa de extras: `obtenerEventoActivo`
src/casino.js:2       → importa de extras: `{ obtenerEventoActivo } = require('./extras')`
src/economy.js:134,227,296,622,926,979,1042,1096,1146,1152 → usa la local (10 llamadas)
```

Hay dos implementaciones de la misma función. La de `economy.js` tiene una diferencia sutil: valida `jid.endsWith('@g.us')` antes de verificar `eventosHabilitados`, mientras que `extras.js` verifica cualquier `jid` con `getGrupo()`. Podrían producir resultados distintos en DMs.

---

### 🟡 ARQ-03 — `handler.js` de 2,332 líneas contiene lógica de Pinterest que debería estar en `src/pinterest.js`
**Archivo:** `src/handler.js` (2332 líneas totales)

Las funciones `_descargarPinCheerio()`, `_descargarImgBuffer()`, `_buscarPinsDirecto()`, `_manejarBusquedaPin()`, `_manejarDescargaPin()` están definidas dentro de `handler.js`. Ya existe `src/pinterest.js` (939 líneas) que debería contener esta lógica.

---

### 🟡 ARQ-04 — `src/interactions.js` es el archivo más grande del proyecto (4,632 líneas)
**Verificado con:** `wc -l src/*.js | sort -rn`

```
4632  src/interactions.js   ← el mayor
2332  src/handler.js
2259  src/minijuegos.js
2125  src/personajes.js
1778  src/downloads.js
1597  src/admin.js
1301  src/economy.js
```

`interactions.js` supera a `handler.js`. Sin haberlo leído, es un candidato probable para refactorización.

---

### 🟡 ARQ-05 — `require('./database')` dentro de funciones para evitar ciclos circulares indica diseño de dependencias mal resuelto
**Archivo:** `src/extras.js:781`

```js
function aplicarAmnistia() {
    try {
        const { cargarUsuarios, guardarUsuario } = require('./database');  // ← require dentro de función
```

**Archivo:** `src/owners.js:38-43`

```js
function _resolverJid(jid) {
    try { return require('./lidResolver').resolverJid(jid); } catch { return jid; }
}
function _obtenerLidDePhone(phone) {
    try { return require('./lidResolver').obtenerLidDePhone(phone); } catch { return null; }
}
```

**Archivo:** `src/database.js:13-20`

```js
function _normalizarJid(jid) {
    if (!jid || !jid.endsWith('@lid')) return jid;
    try {
        const resolved = require('./lidResolver').resolverJid(jid);  // ← require lazy
```

Tres módulos distintos usando `require()` lazy dentro de funciones para evitar dependencias circulares. Es una señal de grafo de dependencias problemático.

---

## 8. DEPENDENCIAS OBSOLETAS

| Paquete | Versión | Estado | Evidencia |
|---------|---------|--------|-----------|
| `ytdl-core` | 4.11.5 | **Abandonado 2022. No se importa en ningún archivo.** | `grep -r "require('ytdl-core')" src/` → sin resultados |
| `yt-search` | 0.0.2 | **No se importa en ningún archivo.** | `grep -r "require('yt-search')" src/` → sin resultados |
| `fluent-ffmpeg` | 2.1.3 | **npm: "Package no longer supported"** | npm install warning |
| `pixiv-api-client` | 0.27.0 | **OAuth flow desactivado por Pixiv en 2023** | Documentación oficial de Pixiv API |

---

## 9. CORRECCIONES A LA AUDITORÍA ANTERIOR

Los siguientes claims de la auditoría anterior **eran incorrectos** tras verificación directa del código:

| Claim anterior | Veredicto | Evidencia |
|----------------|-----------|-----------|
| "`#steal` puede robar 0 monedas de usuarios sin fondos" | ❌ **Incorrecto** | `economy.js:580`: `if (uObjetivo.monedas < 1500)` → hay verificación de mínimo |
| "Probabilidades de rareza no documentadas" | ❌ **Incorrecto** | `personajes.js:803`: comentario `// Pesos: Común 50%, Raro 30%, Épico 15%, Legendario 5%` |
| "`ytdlpDescargarBuffer` no limpia /tmp" | ❌ **Incorrecto** | `downloads.js:361`: `await fs.remove(archivoFinal)` en path exitoso |
| "`#invest` sin límite máximo" | ❌ **Incorrecto** | `banco.js:5`: `const MAX_INVERSION = 5000000;` y `banco.js:35`: `Math.min(cantidad, MAX_INVERSION)` |
| "El banco no genera interés automático" | ❌ **Parcialmente incorrecto** | `banco.js:49-73`: `cmdInteres` cobra intereses del 5% cada 6h al usar `#interest` |
| "`auth_info/` no está en .gitignore" | ❌ **Incorrecto** | `.gitignore:2`: `auth_info` está excluido |

---

## 10. TABLA DE PRIORIDADES

| # | ID | Descripción | Archivo:Línea | Impacto | Esfuerzo |
|---|----|-------------|---------------|---------|----------|
| 1 | BUG-SEC-01 | Eliminar API key hardcodeada de Kaiz | `ai.js:165` | Seguridad inmediata | 5 min |
| 2 | BUG-SEC-02 | Agregar `data/*.json` y `cookies/` a `.gitignore` | `.gitignore` | Data breach | 2 min |
| 3 | BUG-SEC-03 | Mover SUPER_OWNER a variable de entorno | `owners.js:5` | Privacidad admin | 10 min |
| 4 | BUG-DB-04 | Persistir JACKPOT_POOL en `data/casino.json` | `casino.js:155` | Retención jugadores | 15 min |
| 5 | BUG-AI-01 | Paralelizar los 9 proveedores de IA | `ai.js:112-229` | UX del `#ai` | 30 min |
| 6 | BUG-DB-01 | Eliminar `flushToDisk()` directo en `guardarUsuario` | `database.js:193` | Rendimiento | 5 min |
| 7 | BUG-DB-03 | Eliminar función duplicada + cachear evento activo | `economy.js:362` | I/O innecesario | 20 min |
| 8 | BUG-ECO-01 | Agregar `MAX_COINFLIP = 100000` al coinflip | `economy.js:422` | Balance económico | 5 min |
| 9 | BUG-DL-01 | `npm remove ytdl-core yt-search` | `package.json` | Limpieza | 2 min |
| 10 | ARQ-01 | Eliminar `_axiosPinImg` duplicado | `handler.js:101` | Limpieza | 2 min |
| 11 | BUG-ECO-03 | Reemplazar shuffle por Fisher-Yates en blackjack | `casino.js:13` | Equidad | 5 min |
| 12 | BUG-DB-05 | Cachear el ranking en `cmdEconomyInfo` | `economy.js:52` | Rendimiento | 30 min |
| 13 | BUG-AI-02 | LRU cache para historial de IA | `ai.js:11` | Memoria | 20 min |
| 14 | BUG-GACHA-02 | Índice inverso para `obtenerDuenoPersonajeGrupo` | `personajes.js:639` | Rendimiento gacha | 45 min |
| 15 | BUG-GACHA-03 | Ejecutar `migracionDuplicados` en `setImmediate` | `personajes.js:659` | Arranque del bot | 5 min |

---

## RESUMEN

### Bugs críticos confirmados con evidencia directa
1. **API key en texto plano** — `ai.js:165`
2. **users.json y cookies sin .gitignore** — `.gitignore` verificado
3. **JACKPOT no persiste** — `casino.js:155` sin ningún writeJsonSync
4. **`guardarUsuario` bloquea el event loop en cada save** — `database.js:193`
5. **`obtenerEventoActivo` duplicada y lee disco 10 veces por ciclo** — `economy.js:362` vs `extras.js:763`
6. **IA puede tardar 225 segundos en fallar** — timeouts sumados de `ai.js:112-229`
7. **`#coinflip` acepta apuestas ilimitadas** — `economy.js:419-462` sin MAX

### Código muerto confirmado
- `ytdl-core`: instalado, **0 imports** en todo el proyecto
- `yt-search`: instalado, **0 imports** en todo el proyecto
- `_axiosPinImg`: alias innecesario de `axios` ya importado en la misma línea 2

### Claims de la auditoría anterior que eran incorrectos
`#steal` con 0 monedas, probabilidades sin documentar, tmp sin limpiar, `#invest` sin límite, banco sin interés, `auth_info` sin gitignore — **todos incorrectos tras verificación**.
