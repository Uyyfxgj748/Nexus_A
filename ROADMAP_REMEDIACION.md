# ROADMAP DE REMEDIACIÓN — NEXUS BOT
**Fecha:** Junio 2026 | **Rol:** Arquitecto técnico principal
**Resumen del proyecto:** 28,262 líneas en ~35 archivos JS. Base de datos: JSON flat-file. Runtime: Node.js 20 single-process.

---

## CONTEXTO ARQUITECTÓNICO

Antes de dividir el trabajo en fases, hay que entender las **relaciones de dependencia** entre sistemas:

```
index.js
  └─► handler.js (manejarMensaje — 2332 líneas — punto de entrada de TODOS los comandos)
        ├─► database.js (capa de datos — afecta TODOS los módulos)
        ├─► economy.js ──► database.js, extras.js
        ├─► casino.js ──► extras.js (obtenerEventoActivo)
        ├─► personajes.js ──► database.js
        ├─► interactions.js (4632 líneas — independiente)
        ├─► downloads.js (yt-dlp — independiente)
        └─► ai.js ──► (proveedores externos)
```

**Principio de trabajo:** `database.js` es la raíz del árbol de dependencias. Cualquier cambio allí afecta todos los módulos. Siempre es lo primero que se corrige.

---

## FASE 1 — CORRECCIONES CRÍTICAS INMEDIATAS

> Criterio de inclusión: pérdida de datos, exposición de credenciales, corrupción de estado, caída del bot.
> Ninguna de estas correcciones requiere conocer el estado de otra para realizarse.

---

### T-001 — Eliminar API key de Kaiz hardcodeada
| Campo | Valor |
|-------|-------|
| **Prioridad** | CRÍTICA |
| **Impacto** | Seguridad: la key puede ser revocada por abuso si el repo se comparte |
| **Riesgo** | Muy bajo — solo reemplaza el fallback por un error explícito |
| **Tiempo estimado** | 5 minutos |
| **Dependencias** | Ninguna |
| **Bloquea a** | Ninguna |

**Archivo:** `src/ai.js:165`

**Código actual:**
```js
const kaizKey = process.env.KAIZ_API_KEY || 'cf2ca612-296f-40d4-8af0-9b00131c1bb7';
```

**Cambio requerido:**
```js
const kaizKey = process.env.KAIZ_API_KEY || null;
// En la llamada al proveedor Kaiz, verificar antes:
// if (!kaizKey) throw new Error('KAIZ_API_KEY no configurada');
```

**Por qué es crítica y no media:** Una API key hardcodeada en código queda en el historial de git aunque se elimine después. Si el repo se sube a GitHub (incluso privado), herramientas como GitGuardian la detectan en segundos.

---

### T-002 — Agregar `data/*.json` y `cookies/` a `.gitignore`
| Campo | Valor |
|-------|-------|
| **Prioridad** | CRÍTICA |
| **Impacto** | Seguridad: 316 KB de datos de usuarios reales + cookies de sesión activas |
| **Riesgo** | Ninguno |
| **Tiempo estimado** | 2 minutos |
| **Dependencias** | Ninguna |
| **Bloquea a** | Ninguna |

**Archivo:** `.gitignore`

**Código actual:**
```
auth_info
data/backups/
data/errors.log
data/lid_map.json
data/pinterest_token.json
```

**Cambio requerido (agregar al final):**
```
# Datos de usuarios — nunca subir al repositorio
data/*.json

# Cookies de sesión de cuentas externas
cookies/
```

**Nota:** `data/*.json` excluye los JSON de datos, pero los archivos ya trackeados (si se hizo `git add` antes) requieren `git rm --cached data/*.json`.

---

### T-003 — Mover `SUPER_OWNER` a variable de entorno
| Campo | Valor |
|-------|-------|
| **Prioridad** | CRÍTICA |
| **Impacto** | Privacidad: número de teléfono del admin expuesto en código |
| **Riesgo** | Bajo — cambio en un archivo, validación simple |
| **Tiempo estimado** | 10 minutos |
| **Dependencias** | Ninguna |
| **Bloquea a** | Ninguna |

**Archivo:** `src/owners.js:5`

**Código actual:**
```js
const SUPER_OWNER = '573237069673@s.whatsapp.net';
```

**Cambio requerido:**
```js
const _rawOwner = process.env.SUPER_OWNER_JID || '';
if (!_rawOwner) {
    console.error('⚠️  SUPER_OWNER_JID no configurado. El bot funcionará sin super-owner.');
}
const SUPER_OWNER = _rawOwner.includes('@') ? _rawOwner : (_rawOwner ? `${_rawOwner}@s.whatsapp.net` : '');
```

Agregar al `.env`:
```
SUPER_OWNER_JID=573237069673
```

---

### T-004 — Persistir `JACKPOT_POOL` en disco
| Campo | Valor |
|-------|-------|
| **Prioridad** | CRÍTICA |
| **Impacto** | Pérdida de datos: el jackpot acumulado desaparece en cada reinicio |
| **Riesgo** | Bajo — solo agrega lectura/escritura de un JSON nuevo |
| **Tiempo estimado** | 15 minutos |
| **Dependencias** | Ninguna (casino.js no depende de database.js actualmente) |
| **Bloquea a** | Ninguna |

**Archivo:** `src/casino.js:155`

**Código actual:**
```js
const JACKPOT_POOL = { monto: 500000 };
```

**Cambio requerido:**
```js
const CASINO_PATH = path.join(__dirname, '../data/casino.json');
const JACKPOT_POOL = fs.existsSync(CASINO_PATH)
    ? (fs.readJsonSync(CASINO_PATH) || { monto: 500000 })
    : { monto: 500000 };

function persistirJackpot() {
    try { fs.writeJsonSync(CASINO_PATH, JACKPOT_POOL); } catch (_) {}
}
```

Agregar `persistirJackpot()` después de cada modificación de `JACKPOT_POOL.monto` (líneas 178 y 225).

---

### T-005 — Eliminar dependencias muertas (`ytdl-core`, `yt-search`)
| Campo | Valor |
|-------|-------|
| **Prioridad** | CRÍTICA |
| **Impacto** | Seguridad: `ytdl-core` tiene CVEs conocidos sin parchar; superficie de ataque innecesaria |
| **Riesgo** | Ninguno — grep confirma 0 imports en todo el proyecto |
| **Tiempo estimado** | 2 minutos |
| **Dependencias** | Ninguna |
| **Bloquea a** | Ninguna |

**Comando:**
```bash
npm remove ytdl-core yt-search
```

**Verificación previa (ya realizada en auditoría):**
```bash
grep -r "require('ytdl-core')\|require('yt-search')" src/
# Sin resultados
```

---

### T-006 — Eliminar `flushToDisk()` directo en `guardarUsuario()`
| Campo | Valor |
|-------|-------|
| **Prioridad** | CRÍTICA |
| **Impacto** | Rendimiento y estabilidad: bloquea el event loop de Node.js en cada save de cualquier usuario |
| **Riesgo** | **MEDIO** — leer sección de riesgo abajo |
| **Tiempo estimado** | 10 minutos |
| **Dependencias** | Ninguna |
| **Bloquea a** | T-007 (la corrección de guardarGrupo sigue el mismo patrón) |

**Archivo:** `src/database.js:185-194`

**Código actual:**
```js
function guardarUsuario(jid, datos) {
    jid = _normalizarJid(jid);
    if (datos._readonly) return;
    sanitizarUsuario(datos);
    aplicarOwnerInfinito(jid, datos);
    const db = cargarUsuarios();
    db[jid]     = datos;
    _usersDirty = true;
    flushToDisk();   // ← ELIMINAR ESTA LÍNEA
}
```

**Cambio requerido:** Eliminar la línea `flushToDisk()`. La caché ya está actualizada en memoria (`db[jid] = datos`). El `setInterval(flushToDisk, 5000)` en línea 97 garantiza que se persiste cada 5 segundos. Los handlers de `process.on('SIGTERM')` y `process.on('exit')` en líneas 99-101 garantizan el flush al apagar.

**⚠️ Riesgo controlado:** Si el proceso muere por `kill -9` (SIGKILL) o crash de Node.js en los 5 segundos posteriores a un save, la transacción se pierde. Este riesgo ya existía (el crash podía ocurrir durante el writeJsonSync). Para mitigarlo: reducir `FLUSH_INTERVAL` de 5000ms a 2000ms en línea 27.

---

### T-007 — Eliminar `flushToDisk()` directo en `guardarGrupo()`
| Campo | Valor |
|-------|-------|
| **Prioridad** | Alta |
| **Impacto** | Rendimiento: grupos se guardan con tanta frecuencia como usuarios |
| **Riesgo** | Mismo patrón que T-006 |
| **Tiempo estimado** | 5 minutos |
| **Dependencias** | T-006 (para coherencia) |
| **Bloquea a** | Ninguna |

**Archivo:** `src/database.js:269-274`

**Código actual:**
```js
function guardarGrupo(jid, datos) {
    const db     = cargarGrupos();
    db[jid]      = datos;
    _gruposDirty = true;
    flushToDisk();   // ← ELIMINAR ESTA LÍNEA
}
```

---

### T-008 — Eliminar el `writeJsonSync` bloqueante de `guardarUsuarios()` y `guardarGrupos()`
| Campo | Valor |
|-------|-------|
| **Prioridad** | Alta |
| **Impacto** | Estas funciones (usadas en comandos de owner) bloquean el event loop con el JSON completo |
| **Riesgo** | Bajo — solo actualizan la caché y marcan dirty |
| **Tiempo estimado** | 5 minutos |
| **Dependencias** | T-006, T-007 (para coherencia) |
| **Bloquea a** | Ninguna |

**Archivo:** `src/database.js:118-123` y `src/database.js:244-249`

**Código actual (`guardarUsuarios`):**
```js
function guardarUsuarios(data) {
    _usersCache  = data;
    _usersDirty  = true;
    fs.writeJsonSync(USERS_PATH, data, { spaces: 2 });   // ← ELIMINAR
    _usersDirty  = false;                                  // ← ELIMINAR
}
```

**Cambio requerido:**
```js
function guardarUsuarios(data) {
    _usersCache = data;
    _usersDirty = true;
    // El intervalo de 5s (o 2s tras T-006) persistirá el cambio
}
```

Mismo cambio en `guardarGrupos()`.

---

## FASE 2 — RENDIMIENTO Y ESTABILIDAD

> Criterio: reduce lecturas/escrituras de disco innecesarias, elimina bloqueos, reduce uso de memoria.
> Las tareas de esta fase no deben implementarse hasta que la Fase 1 esté completa y estabilizada.

---

### T-009 — Unificar y cachear `obtenerEventoActivo()`
| Campo | Valor |
|-------|-------|
| **Prioridad** | Alta |
| **Impacto** | Elimina 10 lecturas síncronas de disco por ciclo de comandos de economía |
| **Riesgo** | Medio — cambio en economy.js (1301 líneas) y requires en casino.js |
| **Tiempo estimado** | 20 minutos |
| **Dependencias** | Ninguna de fase anterior |
| **Bloquea a** | Ninguna |

**Problema:** `obtenerEventoActivo()` está definida DOS veces:
- `src/economy.js:362` — versión local con `fs.readJsonSync` síncrono
- `src/extras.js:763` — versión original, también con `fs.readJsonSync` síncrono

Y se llama **10 veces dentro de `economy.js`** (líneas 134, 227, 296, 622, 926, 979, 1042, 1096, 1146, 1152).

**Cambio requerido:**

1. Eliminar la función duplicada de `economy.js:362-375`
2. En `economy.js:1`, agregar import: `const { obtenerEventoActivo } = require('./extras');`
3. En `extras.js:763`, agregar caché de 30 segundos:

```js
let _cachedEvento = undefined;
let _cachedEventoTs = 0;
const EVENTO_CACHE_TTL = 30000;

function obtenerEventoActivo(jid) {
    const ahora = Date.now();
    if (ahora - _cachedEventoTs < EVENTO_CACHE_TTL) {
        return _filtrarPorGrupo(_cachedEvento, jid);
    }
    // ... lectura de disco (solo cada 30s)
    _cachedEventoTs = ahora;
    return _filtrarPorGrupo(_cachedEvento, jid);
}

function _filtrarPorGrupo(ev, jid) {
    if (!ev) return null;
    if (jid?.endsWith('@g.us')) {
        const g = getGrupo(jid);
        if (!g.eventosHabilitados) return null;
    }
    return (ev.expira && Date.now() < ev.expira) ? ev : null;
}
```

4. Cuando el owner activa/desactiva un evento (`cmdEvento` en extras.js), invalidar la caché: `_cachedEventoTs = 0`.

---

### T-010 — Cachear el ranking global en `cmdEconomyInfo()`
| Campo | Valor |
|-------|-------|
| **Prioridad** | Media |
| **Impacto** | Elimina un `.sort()` sobre todos los usuarios por cada llamada a `#bal @usuario` |
| **Riesgo** | Bajo — el ranking puede estar desactualizado hasta 60s |
| **Tiempo estimado** | 15 minutos |
| **Dependencias** | Ninguna |
| **Bloquea a** | Ninguna |

**Archivo:** `src/economy.js:52-55`

**Problema:**
```js
const db = cargarUsuarios();
const todos = Object.values(db).map(u2 => (u2.monedas || 0) + (u2.banco || 0)).sort((a, b) => b - a);
```

Cada llamada a `#economia` o `#bal` hace un sort completo. Con 1,000 usuarios = 1,000 comparaciones + deserialización del JSON × número de llamadas simultáneas.

**Solución:** Caché del ranking global con TTL de 60 segundos, invalidada tras operaciones de dinero mayores.

---

### T-011 — Agregar LRU limit al historial de IA
| Campo | Valor |
|-------|-------|
| **Prioridad** | Media |
| **Impacto** | Previene crecimiento ilimitado del Map en memoria en bots con muchos usuarios |
| **Riesgo** | Muy bajo — solo afecta la memoria del historial, no la lógica de IA |
| **Tiempo estimado** | 15 minutos |
| **Dependencias** | Ninguna |
| **Bloquea a** | Ninguna |

**Archivo:** `src/ai.js:11`

**Problema:**
```js
const historial = new Map();   // crece indefinidamente
```

**Solución:** LRU-cache con máximo 500 usuarios:
```js
const MAX_HISTORIAL_USUARIOS = 500;
function limpiarHistorialViejo() {
    if (historial.size > MAX_HISTORIAL_USUARIOS) {
        const primerasClaves = [...historial.keys()].slice(0, 50);
        primerasClaves.forEach(k => historial.delete(k));
    }
}
// Llamar limpiarHistorialViejo() cada vez que se agrega una entrada nueva
```

---

### T-012 — Paralelizar los 9 proveedores de IA (o al menos agrupar por disponibilidad)
| Campo | Valor |
|-------|-------|
| **Prioridad** | Media |
| **Impacto** | Reduce el peor caso de 225s a ~30s (timeout del primer proveedor que responda) |
| **Riesgo** | **Alto** — cambio en la lógica central de IA. Requiere testing cuidadoso |
| **Tiempo estimado** | 45 minutos |
| **Dependencias** | Ninguna de fase anterior, pero debe hacerse con pruebas |
| **Bloquea a** | Ninguna |

**Archivo:** `src/ai.js:112-229`

**Estrategia recomendada (carrera con grupos):**
- Grupo A (más rápidos/confiables): Proveedores 1-3 (todos Pollinations)
- Grupo B (fallback): Proveedores 4-6
- Grupo C (último recurso): Proveedores 7-9

```js
async function llamarGrupo(proveedores, pregunta, contexto) {
    return Promise.any(proveedores.map(p => p(pregunta, contexto)));
}

try { return await llamarGrupo(GRUPO_A, pregunta, ctx); } catch (_) {}
try { return await llamarGrupo(GRUPO_B, pregunta, ctx); } catch (_) {}
try { return await llamarGrupo(GRUPO_C, pregunta, ctx); } catch (_) {}
```

**Nota de riesgo:** `Promise.any` con múltiples proveedores puede generar más requests simultáneos de lo esperado. Añadir un semáforo de concurrencia máxima (2 requests por grupo).

---

### T-013 — Construir índice inverso para `obtenerDuenoPersonajeGrupo()`
| Campo | Valor |
|-------|-------|
| **Prioridad** | Media |
| **Impacto** | Reduce `#rw` de O(usuarios × harem) a O(1) con lookup en Map |
| **Riesgo** | **Alto** — requiere mantener el índice sincronizado con todos los claims/trades/abandonos |
| **Tiempo estimado** | 60 minutos |
| **Dependencias** | Ninguna de fase anterior |
| **Bloquea a** | Ninguna |

**Archivo:** `src/personajes.js:639-656`

**Estrategia:**
```js
// Índice: Map<`${groupId}::${nombrePersonaje}`, ownerJid>
const indicePersonajeOwner = new Map();

function reconstruirIndice() {
    indicePersonajeOwner.clear();
    const usuarios = cargarUsuarios();
    for (const [uid, ud] of Object.entries(usuarios)) {
        for (const p of (ud.harem || [])) {
            indicePersonajeOwner.set(`${p.groupId}::${p.nombre}`, uid);
        }
    }
}
```

Llamar `reconstruirIndice()` en startup y actualizar en cada claim/trade/abandon en lugar de recalcular.

**Por qué es Alta en riesgo:** Hay al menos 8 operaciones en `personajes.js` que modifican el harem (claim, abandon, trade, gift, etc.). Olvidar actualizar el índice en una sola de ellas crea inconsistencias silenciosas.

---

### T-014 — Ejecutar `migracionDuplicados()` de forma diferida al arranque
| Campo | Valor |
|-------|-------|
| **Prioridad** | Baja |
| **Impacto** | Reduce el tiempo de arranque del bot cuando hay muchos usuarios |
| **Riesgo** | Muy bajo — cambio de 1 línea |
| **Tiempo estimado** | 5 minutos |
| **Dependencias** | Ninguna |
| **Bloquea a** | Ninguna |

**Cambio requerido:** Envolver la llamada a `migracionDuplicados()` en un `setImmediate()` o `setTimeout(..., 5000)` para que el bot termine de arrancar y conectarse a WhatsApp antes de ejecutar la migración costosa.

---

## FASE 3 — BALANCE Y ECONOMÍA

> Criterio: mecánicas explotables, pérdida de equidad entre jugadores, capacidad de acumular dinero infinito.
> Estas correcciones deben discutirse con el propietario del bot antes de aplicarse — afectan a jugadores existentes.

---

### Mapa de mecánicas explotables (de más a menos grave)

| # | Mecánica | Exploit posible | Gravedad |
|---|----------|-----------------|----------|
| 1 | `#coinflip` | Apostar todo el saldo sin límite | 🔴 Alta |
| 2 | Items `turbo_apuesta` + `dado_suerte` sobre coinflip | Multiplicador ×3 total | 🔴 Alta |
| 3 | Evento `suerte_total` (×2 todo) | Maximizar comandos en ventana de 60min | 🟡 Media |
| 4 | Blackjack con shuffle sesgado | Barajas no uniformes | 🟡 Media |
| 5 | Jackpot acumulable + no persiste | Reset en reinicio (bug, no exploit) | 🔴 Cubierto en Fase 1 |
| 6 | `#daily` streak alto + evento | Ganancias desproporcionadas | 🟢 Baja |

---

### T-015 — Limitar `#coinflip` con cap proporcional al saldo
| Campo | Valor |
|-------|-------|
| **Prioridad** | Alta |
| **Impacto** | Previene duplicar saldos grandes en un solo comando |
| **Riesgo** | Bajo — jugadores con saldos altos verán un tope; comunicar antes del cambio |
| **Tiempo estimado** | 10 minutos |
| **Dependencias** | Ninguna |
| **Bloquea a** | Ninguna |

**Archivo:** `src/economy.js:419-428`

**Cambio requerido:**
```js
const MAX_COINFLIP = 500000;  // Hard cap absoluto
// Alternativa más elegante: cap proporcional (10% del saldo)
const capProporcional = Math.floor(u.monedas * 0.10);
const limite = Math.min(MAX_COINFLIP, Math.max(capProporcional, 10000));
if (cantidad > limite) {
    return sock.sendMessage(jid, {
        text: `❌ Límite de apuesta: *${limite.toLocaleString()} ⓃNexCoins*\n_(máx 10% de tu cartera o ${MAX_COINFLIP.toLocaleString()})_`
    });
}
```

---

### T-016 — Agregar cap total a multiplicadores de items en `#coinflip`
| Campo | Valor |
|-------|-------|
| **Prioridad** | Alta |
| **Impacto** | Evita multiplicador ×3 con dos items activos simultáneamente |
| **Riesgo** | Bajo — afecta solo a jugadores con ambos items |
| **Tiempo estimado** | 10 minutos |
| **Dependencias** | T-015 recomendado primero |
| **Bloquea a** | Ninguna |

**Archivo:** `src/economy.js:437-447`

**Cambio requerido:**
```js
let multiplicador = 1;
if (u.itemsActivos?.dado_suerte) {
    multiplicador *= 1.5;
    delete u.itemsActivos.dado_suerte;
    dadoMsg = '\n🎲 *¡Dado de la suerte! ×1.5*';
}
if (u.itemsActivos?.turbo_apuesta && Date.now() < u.itemsActivos.turbo_apuesta) {
    multiplicador *= 2;
    dadoMsg += '\n🚀 *¡Turbo-Apuesta! ×2*';
}
const MAX_MULTIPLICADOR = 2.5;
multiplicador = Math.min(multiplicador, MAX_MULTIPLICADOR);
const ganar = Math.floor(cantidad * multiplicador);
```

---

### T-017 — Reemplazar shuffle de blackjack por Fisher-Yates
| Campo | Valor |
|-------|-------|
| **Prioridad** | Media |
| **Impacto** | Equidad matemática en las partidas — no es un exploit explotable activamente |
| **Riesgo** | Muy bajo — cambio de 4 líneas, sin estado compartido |
| **Tiempo estimado** | 5 minutos |
| **Dependencias** | Ninguna |
| **Bloquea a** | Ninguna |

**Archivo:** `src/casino.js:13`

**Código actual:**
```js
return b.sort(() => Math.random() - 0.5);
```

**Cambio requerido:**
```js
for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
}
return b;
```

---

### T-018 — Agregar cooldown al evento `suerte_total` para limitar el farming
| Campo | Valor |
|-------|-------|
| **Prioridad** | Baja |
| **Impacto** | Reduce la asimetría entre jugadores activos e inactivos durante eventos |
| **Riesgo** | Medio — cambio de mecánica que puede generar quejas de jugadores |
| **Tiempo estimado** | 30 minutos |
| **Dependencias** | Discutir con propietario del bot antes de implementar |
| **Bloquea a** | Ninguna |

**Estrategia:** Limitar el bonus de evento a un número máximo de usos por usuario por evento (por ejemplo, máximo 3 usos de `#daily` con bonus de evento, registrado en `u.eventoUsos`).

---

## FASE 4 — GACHA Y PERSONAJES

> Nota: `personajes.js` tiene 2125 líneas con múltiples sistemas entrelazados (rolls, claims, trades, harem, títulos). Los cambios aquí tienen riesgo de regresión alto.

---

### T-019 — Persistir `pendingGroupRolls` en disco (o en estado del bot)
| Campo | Valor |
|-------|-------|
| **Prioridad** | Alta |
| **Impacto** | Los rolls activos ya no se pierden al reiniciar el bot |
| **Riesgo** | Medio — hay que definir TTL apropiado para considerar un roll "expirado" tras reinicio |
| **Tiempo estimado** | 20 minutos |
| **Dependencias** | T-004 (patrón de persistencia en JSON) |
| **Bloquea a** | Ninguna |

**Estrategia:** Al guardar un roll activo en `pendingGroupRolls`, también escribir en `data/rolls_activos.json`. Al arrancar el bot, cargar los rolls no expirados. Los rolls con `rollTime` > `ROLL_EXPIRACION` milisegundos atrás se descartan automáticamente.

---

### T-020 — Índice inverso de personajes (implementación)
| Campo | Valor |
|-------|-------|
| **Prioridad** | Media |
| **Impacto** | Rolls y listados de harem pasan de O(usuarios × harem) a O(1) |
| **Riesgo** | **Alto** — ver análisis en T-013 |
| **Tiempo estimado** | 60 minutos |
| **Dependencias** | T-013 (diseño del índice) |
| **Bloquea a** | Ninguna |

**Orden de implementación dentro de T-020:**
1. Implementar `reconstruirIndice()` y llamarla al startup
2. Reemplazar `obtenerDuenoPersonajeGrupo()` con lookup del índice
3. Actualizar el índice en `cmdClaim`, `cmdAbandon`, `cmdTrade` (accept), `cmdGift`
4. Verificar que `migracionDuplicados()` también actualiza el índice

---

### T-021 — Límite de harem por usuario
| Campo | Valor |
|-------|-------|
| **Prioridad** | Media |
| **Impacto** | Controla el crecimiento de `users.json` y el tiempo de operaciones O(harem) |
| **Riesgo** | Medio — jugadores con harem grande verán un tope. Requiere comunicación |
| **Tiempo estimado** | 15 minutos |
| **Dependencias** | Ninguna |
| **Bloquea a** | Ninguna |

**Implementación:** Constante `MAX_HAREM = 200` en `personajes.js`. Verificar en `cmdClaim` antes de agregar al harem.

---

### T-022 — Validar expiración de `ROLL_EXPIRACION` más agresivamente
| Campo | Valor |
|-------|-------|
| **Prioridad** | Baja |
| **Impacto** | Actualmente los rolls expirados en grupos quedan en el Map hasta que se hace otro roll |
| **Riesgo** | Muy bajo |
| **Tiempo estimado** | 10 minutos |
| **Dependencias** | T-019 |
| **Bloquea a** | Ninguna |

---

## FASE 5 — ARQUITECTURA

> ⚠️ Esta fase tiene el mayor riesgo de regresión. NUNCA se debe abordar hasta que las fases 1-4 estén completas y el bot haya funcionado establemente durante al menos 1 semana.

---

### Análisis de archivos candidatos a división

| Archivo | Líneas | Problema | Urgencia de refactor |
|---------|--------|----------|----------------------|
| `src/interactions.js` | 4,632 | 4 sistemas distintos mezclados | Media |
| `src/handler.js` | 2,332 | Lógica de Pinterest incrustada + router monolítico | Media |
| `src/minijuegos.js` | 2,259 | Aceptable por ahora | Baja |
| `src/personajes.js` | 2,125 | Sistema único coherente | Baja |
| `src/economy.js` | 1,301 | Manejable tras T-009 | Baja |

---

### T-023 — Dividir `interactions.js` en 4 módulos
| Campo | Valor |
|-------|-------|
| **Prioridad** | Media |
| **Impacto** | Mantenibilidad — actualmente nadie puede leer interactions.js de una vez |
| **Riesgo** | **Alto** — 4,632 líneas, múltiples exports usados en handler.js |
| **Tiempo estimado** | 3-4 horas |
| **Dependencias** | Todo lo anterior debe estar estable |
| **Bloquea a** | Nada |

**División propuesta:**
```
src/interactions.js (4632 líneas)
  └─► src/sfw.js        — cmdInteraccion, TODO_SFW, obtenerMediaLocal (~800 líneas)
  └─► src/imageboards.js — cmdImageboard, cmdTopRandom, buscarBooru* (~1500 líneas)
  └─► src/nsfw_content.js — cmdNsfw, cmdNsfwAccion, buscarRule34, buscarE621 (~1800 líneas)
  └─► src/waifu.js       — cmdWaifu, encontrarWaifu, buscarWaifuImagen (~530 líneas)
```

**Riesgo específico:** `handler.js` importa 7 nombres de `interactions.js`. Cada uno debe redirigirse al nuevo módulo. Si se usa un barrel file (`interactions.js` re-exporta todo), el riesgo baja significativamente.

---

### T-024 — Extraer la lógica de Pinterest de `handler.js` a `src/pinterest.js`
| Campo | Valor |
|-------|-------|
| **Prioridad** | Media |
| **Impacto** | handler.js baja de 2,332 a ~2,000 líneas; pinterest.js ya existe (939 líneas) |
| **Riesgo** | Medio — las funciones a mover (`_manejarDescargaPin`, `_descargarImgBuffer`, `_buscarPinsDirecto`, `_manejarBusquedaPin`, `_descargarPinCheerio`, `manejarPin`) usan `_axiosPinImg` que es el duplicate de `axios` |
| **Tiempo estimado** | 90 minutos |
| **Dependencias** | Ninguna (puede hacerse antes de T-023) |
| **Bloquea a** | Elimina el duplicate `_axiosPinImg` como subproducto |

---

### T-025 — Refactorizar `manejarMensaje()` en `handler.js` como router delegador
| Campo | Valor |
|-------|-------|
| **Prioridad** | Baja |
| **Impacto** | handler.js de 2,332 líneas es difícil de mantener |
| **Riesgo** | **Muy Alto** — es el punto de entrada de todos los comandos. Un error aquí rompe el bot completo |
| **Tiempo estimado** | 8-10 horas |
| **Dependencias** | T-023, T-024 deben estar completos y estables |
| **Bloquea a** | Nada |

**Estrategia:** `manejarMensaje()` debe volverse un router puro que solo llama a handlers por categoría:
```js
async function manejarMensaje(sock, msg, groupMetadata) {
    // ... validaciones comunes (antispam, cooldown, mantenimiento)
    if (await economyRouter(sock, msg, cmd, ...)) return;
    if (await casinoRouter(sock, msg, cmd, ...)) return;
    if (await gacharRouter(sock, msg, cmd, ...)) return;
    // ...
}
```

---

## TABLA MAESTRA DE PRIORIDADES

Ordenada de más importante a menos importante, con todas las variables:

| # | Tarea | Prioridad | Impacto | Riesgo | Tiempo | Depende de |
|---|-------|-----------|---------|--------|--------|------------|
| 1 | T-001 — Eliminar API key hardcodeada | 🔴 CRÍTICA | Seguridad inmediata | Ninguno | 5 min | — |
| 2 | T-002 — `.gitignore` para `data/` y `cookies/` | 🔴 CRÍTICA | Prevenir data breach | Ninguno | 2 min | — |
| 3 | T-005 — Eliminar ytdl-core y yt-search | 🔴 CRÍTICA | CVEs innecesarios | Ninguno | 2 min | — |
| 4 | T-003 — SUPER_OWNER a variable de entorno | 🔴 CRÍTICA | Privacidad del admin | Bajo | 10 min | — |
| 5 | T-004 — Persistir JACKPOT_POOL | 🔴 CRÍTICA | Pérdida de datos | Bajo | 15 min | — |
| 6 | T-006 — Eliminar flushToDisk() en guardarUsuario | 🔴 CRÍTICA | Bloqueo event loop | Medio | 10 min | — |
| 7 | T-007 — Eliminar flushToDisk() en guardarGrupo | 🔴 Alta | Rendimiento DB | Bajo | 5 min | T-006 |
| 8 | T-008 — Eliminar writeJsonSync en guardarUsuarios/Grupos | 🔴 Alta | Bloqueo event loop | Bajo | 5 min | T-006 |
| 9 | T-015 — Cap a `#coinflip` | 🟠 Alta | Balance económico | Bajo | 10 min | — |
| 10 | T-016 — Cap a multiplicadores de items | 🟠 Alta | Balance económico | Bajo | 10 min | T-015 |
| 11 | T-019 — Persistir pendingGroupRolls | 🟠 Alta | UX del gacha | Medio | 20 min | T-004 |
| 12 | T-009 — Cachear obtenerEventoActivo() | 🟠 Alta | I/O y rendimiento | Medio | 20 min | — |
| 13 | T-017 — Fisher-Yates en blackjack | 🟡 Media | Equidad | Ninguno | 5 min | — |
| 14 | T-010 — Cachear ranking global | 🟡 Media | Rendimiento | Bajo | 15 min | — |
| 15 | T-011 — LRU en historial de IA | 🟡 Media | Memoria | Bajo | 15 min | — |
| 16 | T-014 — migracionDuplicados() diferida | 🟡 Media | Tiempo arranque | Ninguno | 5 min | — |
| 17 | T-021 — Límite de harem | 🟡 Media | Crecimiento DB | Medio | 15 min | — |
| 18 | T-012 — Paralelizar proveedores IA | 🟡 Media | UX del `#ai` | Alto | 45 min | — |
| 19 | T-020 — Índice inverso personajes | 🟡 Media | Rendimiento gacha | Alto | 60 min | T-013 |
| 20 | T-018 — Cooldown de farming en eventos | 🟢 Baja | Balance | Medio | 30 min | Discutir |
| 21 | T-022 — Expiración de rolls | 🟢 Baja | UX | Bajo | 10 min | T-019 |
| 22 | T-013 — Diseño índice inverso | 🟢 Baja | Arquitectura | Alto | 60 min | — |
| 23 | T-024 — Extraer Pinterest a su módulo | 🟢 Baja | Mantenibilidad | Medio | 90 min | — |
| 24 | T-023 — Dividir interactions.js | 🟢 Baja | Mantenibilidad | Alto | 4h | Todo estable |
| 25 | T-025 — Refactorizar manejarMensaje() | 🟢 Baja | Mantenibilidad | Muy alto | 8h | T-023, T-024 |

---

## CHECKLIST EJECUTABLE

### ▶ FASE 1 — Críticas (sin dependencias entre sí — pueden hacerse en un día)

- [ ] **T-001** `src/ai.js:165` — Eliminar `'cf2ca612-...'` hardcodeada, requerir `KAIZ_API_KEY` del entorno
- [ ] **T-002** `.gitignore` — Agregar `data/*.json` y `cookies/`
- [ ] **T-005** `package.json` — `npm remove ytdl-core yt-search`
- [ ] **T-003** `src/owners.js:5` — `SUPER_OWNER = process.env.SUPER_OWNER_JID`
- [ ] **T-004** `src/casino.js:155` — Persistir `JACKPOT_POOL` en `data/casino.json`
- [ ] **T-006** `src/database.js:193` — Eliminar `flushToDisk()` de `guardarUsuario()`; bajar `FLUSH_INTERVAL` a 2000ms
- [ ] **T-007** `src/database.js:273` — Eliminar `flushToDisk()` de `guardarGrupo()`
- [ ] **T-008** `src/database.js:121,247` — Eliminar `writeJsonSync` de `guardarUsuarios()` y `guardarGrupos()`
- [ ] Reiniciar bot y verificar que saves de usuarios ocurren correctamente

### ▶ FASE 2 — Rendimiento (en orden)

- [ ] **T-009** `src/economy.js:362` + `src/extras.js:763` — Eliminar duplicado, agregar caché de 30s
- [ ] **T-017** `src/casino.js:13` — Reemplazar `sort(random)` por Fisher-Yates
- [ ] **T-014** — Envolver `migracionDuplicados()` en `setTimeout(..., 5000)`
- [ ] **T-010** `src/economy.js:52-55` — Caché del ranking con TTL 60s
- [ ] **T-011** `src/ai.js:11` — LRU con máximo 500 usuarios en historial
- [ ] **T-012** `src/ai.js:112-229` — Grupos paralelos de proveedores de IA

### ▶ FASE 3 — Balance económico

- [x] **T-015** `src/economy.js` — `MAX_COINFLIP = 500000` + cap proporcional (10% saldo, mín 10k)
- [x] **T-016** `src/economy.js` — `MAX_MULTIPLICADOR = 2.5` en coinflip y ruleta
- [ ] **T-018** (Opcional, discutir) — Cooldown de farming en eventos

### ▶ FASE 4 — Gacha

- [x] **T-019** `src/personajes.js` — Persistir `pendingGroupRolls` en `data/rolls_activos.json`
- [ ] **T-021** `src/personajes.js` — Constante `MAX_HAREM = 200`
- [ ] **T-022** — Expiración más agresiva de rolls activos
- [ ] **T-013** — Diseño del índice inverso
- [ ] **T-020** — Implementar índice inverso (cuando el diseño esté aprobado)

### ▶ FASE 5 — Arquitectura (solo cuando el bot lleve 1 semana estable en Fases 1-4)

- [ ] **T-024** — Extraer Pinterest de handler.js a pinterest.js (elimina `_axiosPinImg` como efecto secundario)
- [ ] **T-023** — Dividir interactions.js en 4 módulos
- [ ] **T-025** — Refactorizar manejarMensaje() como router delegador

---

## ORDEN DE EJECUCIÓN COMO DESARROLLADOR PRINCIPAL

Este sería el orden exacto que seguiría, con las justificaciones de cada agrupación:

**Día 1 (mañana) — Seguridad primero, sin excepciones:**
```
T-001 → T-002 → T-005 → T-003
```
Ninguno de estos requiere probar el bot. Se pueden hacer en 20 minutos.
Commit: `"fix(security): remove hardcoded credentials and dead deps"`

**Día 1 (tarde) — Base de datos:**
```
T-004 → T-006 → T-007 → T-008
```
T-004 primero porque es independiente. T-006/007/008 en ese orden porque son el mismo sistema.
Después del commit: **monitorear el bot durante 2 horas** para confirmar que los saves siguen funcionando correctamente con solo el intervalo de 2 segundos.
Commit: `"fix(database): defer disk writes to interval, persist jackpot"`

**Día 2 — Rendimiento de alto impacto:**
```
T-009 → T-014 → T-017
```
T-009 primero porque elimina 10 lecturas síncronas por ciclo (el cambio de mayor impacto en I/O).
T-014 es un cambio de 1 línea sin riesgo.
T-017 es un cambio de 4 líneas sin riesgo.
Commit: `"perf: cache active event, defer migration, fix blackjack shuffle"`

**Día 3 — Balance económico:**
```
T-015 → T-016
```
**Comunicar a los jugadores activos ANTES de activar estos cambios.** Un cap inesperado genera frustración.
Commit: `"balance: add coinflip max bet and item multiplier cap"`

**Semana 2 — Rendimiento complementario:**
```
T-010 → T-011 → T-019 → T-021
```
Estos son mejoras de rendimiento que no cambian comportamiento visible para el usuario.
Commit separado por cada tarea.

**Semana 3+ — IA y gacha avanzado:**
```
T-012 → T-022 → T-013 → T-020
```
T-012 (paralelizar IA) requiere testing extensivo. Correr en staging si es posible.
T-013 y T-020 (índice inverso) son la tarea más compleja del roadmap en términos de mantener consistencia.

**Mes 2+ — Arquitectura:**
```
T-024 → T-023 → T-025
```
Solo después de que el bot haya operado sin incidentes durante semanas.
T-025 (refactorizar manejarMensaje) es la tarea de mayor riesgo del proyecto completo y requiere regresión manual de todos los comandos.

---

## MÉTRICAS DE ÉXITO

Al completar Fase 1, se debe verificar:
- [ ] `grep -r "cf2ca612" src/` → sin resultados
- [ ] `git check-ignore -v data/users.json` → marcado como ignorado
- [ ] `npm ls ytdl-core` → "not found"
- [ ] El bot arranca, recibe comandos y persiste datos durante 10 minutos de uso normal
- [ ] Verificar `data/casino.json` existe tras usar `#slots`

Al completar Fase 2:
- [ ] Un `#daily` en un grupo con evento no hace más de 1 lectura de `evento_activo.json`
- [ ] El tiempo de respuesta del `#ai` en el peor caso no supera 35 segundos
- [ ] El bot lleva 24h corriendo sin reiniciar y el uso de memoria es estable

Al completar Fase 3:
- [ ] `#coinflip 999999999` retorna error de límite de apuesta
- [ ] `#bj 999999` con ambos items activos no produce multiplicador > 2.5x
