# 📊 NEXUS-BOT vs YOTSUBA-BOT — AUDIT REPORT
> Análisis exhaustivo · Junio 2026

---

## 1. RESUMEN EJECUTIVO

| Criterio | Nexus-Bot | YotsubaBot-MD |
|---|---|---|
| **Arquitectura** | CJS monolítico (`handler.js` ~2250 líneas) | ESM plugin-per-file (120+ plugins) |
| **Base de datos** | JSON sharded (`data/usuarios.json`, etc.) | lowdb unificado (`database.json`) |
| **Sistema de economía** | ✅ Completo + banco + inversiones + ítems | ✅ Básico + streaks daily/weekly/monthly |
| **Sistema de clanes** | ✅ Completo (solicitudes, banco, guerras) | ❌ No tiene |
| **Sistema de gacha** | ✅ Completo (series, votos, trading, mercado) | ✅ Básico (colectar, vender, top) |
| **Misiones / logros** | ✅ Misiones diarias + semanales + achievements | ❌ No tiene |
| **Sistema de niveles** | ✅ EXP + niveles logarítmicos | ✅ Curva matemática `lib/levelling.js` |
| **Minijuegos** | ✅ 13 juegos (trivia, hangman, scramble…) | ✅ 5 juegos (slots animados, ruleta…) |
| **Dashboard web** | ✅ `/dashboard` puerto 5000 | ❌ No tiene |
| **Anti-ban** | ✅ Riesgo dinámico + cooldowns por comando | ❌ Solo limpieza de `/tmp` cada 30s |
| **Modlog / Tempban** | ✅ Registro de acciones + baneos temporales | ❌ No tiene |
| **Downloads** | ✅ YT, TikTok, IG, FB, Pinterest, MEGA, Spotify… | ✅ Mismo set + Aptoide APK |
| **NSFW imageboards** | ✅ r34, danbooru, gelbooru, e621 | ✅ Mismo set |
| **Herramientas misc** | ❌ Faltaban translate/wiki/ssweb/ip/calc | ✅ Todas presentes |

---

## 2. TABLA COMPARATIVA COMPLETA

### 2.1 Economía & RPG

| Comando | Nexus | Yotsuba | Observación |
|---|---|---|---|
| `#daily` / `#diario` | ✅ Streaks 30d + eventos especiales | ✅ Streaks básico | Nexus superior |
| `#work` / `#trabajar` | ✅ 45m cooldown | ✅ Similar | Par |
| `#crime` | ✅ Con nivel escalable | ✅ Básico | Nexus superior |
| `#slut` | ✅ 30m cooldown | ✅ 5m cooldown | Nexus mensajes más apropiados |
| `#coinflip` | ✅ | ✅ | Par |
| `#ruleta` | ✅ | ✅ | Par |
| `#slots` | ✅ Estático | ✅ **ANIMADO** (edita mensaje en tiempo real) | Yotsuba superior en UX |
| `#blackjack` | ✅ | ❌ | Nexus exclusivo |
| `#minar` / `#cazar` / `#pescar` | ✅ | ✅ | Par |
| `#aventura` / `#mazmorra` | ✅ | ✅ | Par |
| `#robar` / `#steal` | ✅ | ✅ | Par |
| `#semanal` (coins) | ❌ **→ ✅ AÑADIDO** | ✅ Streak 30 semanas | — |
| `#mensual` (coins) | ❌ **→ ✅ AÑADIDO** | ✅ Streak 8 meses | — |
| `#banco` / `#invest` / `#prestamo` | ✅ Sistema completo | ❌ No tiene | Nexus exclusivo |
| `#misiones` (diarias+semanales) | ✅ | ❌ No tiene | Nexus exclusivo |
| `#logros` / `#achievements` | ✅ | ❌ No tiene | Nexus exclusivo |
| `#rep` / `#reputacion` | ✅ | ❌ No tiene | Nexus exclusivo |
| `#mercado` (marketplace P2P) | ✅ | ❌ No tiene | Nexus exclusivo |
| `#clan` (sistema completo) | ✅ | ❌ No tiene | Nexus exclusivo |
| `#chest` / `#cofre` | ✅ | ❌ No tiene | Nexus exclusivo |

### 2.2 Herramientas / Utilidades

| Comando | Nexus | Yotsuba | Observación |
|---|---|---|---|
| `#translate` / `#traducir` | ❌ **→ ✅ AÑADIDO** | ✅ Google Translate | — |
| `#wiki` / `#wikipedia` | ❌ **→ ✅ AÑADIDO** | ✅ Wikipedia REST | — |
| `#ssweb` / `#ss` | ❌ **→ ✅ AÑADIDO** | ✅ thum.io screenshot | — |
| `#ip` | ❌ **→ ✅ AÑADIDO** | ✅ ip-api.com | — |
| `#calculadora` / `#calc` | ❌ **→ ✅ AÑADIDO** | ✅ `#cal` evaluador | `#calculo` de Nexus es un juego |
| `#ping` | ✅ | ✅ | Par |
| `#sticker` | ✅ | ✅ | Par |
| `#hd` / `#remini` | ✅ Dual-engine | ✅ Dual-engine | Par |
| `#readviewonce` | ✅ | ✅ | Par |
| `#toimage` / `#togif` | ✅ | ✅ | Par |
| `#tenor` (GIFs álbum) | ❌ | ✅ | Omitido — requiere API key Tenor |
| `#whatmusic` / `#shazam` | ❌ | ✅ ACRCloud | Omitido — requiere API paga ACRCloud |

### 2.3 Descargas

| Comando | Nexus | Yotsuba | Observación |
|---|---|---|---|
| `#yt` / `#tiktok` / `#instagram` / `#fb` | ✅ | ✅ | Par |
| `#twitter` / `#x` | ✅ | ✅ | Par |
| `#pinterest` | ✅ OAuth completo | ✅ Básico | Nexus superior |
| `#spotify` / `#mediafire` / `#mega` | ✅ | ✅ | Par |
| `#apkpure` | ✅ APKPure | ✅ Aptoide | Distintas fuentes |
| `#soundcloud` / `#threads` / `#drive` | ✅ | ❌ | Nexus exclusivo |
| `#xnxx` / `#pornhub` | ✅ | ✅ / ❌ | Nexus tiene más |
| `#xvideos` | ❌ **→ ✅ AÑADIDO** | ✅ | — |
| `#nhentai` / `#hitomi` | ✅ | ✅ | Par |

### 2.4 NSFW Imageboards

| Comando | Nexus | Yotsuba | Observación |
|---|---|---|---|
| `#r34` / `#danbooru` / `#gelbooru` | ✅ | ✅ | Par |
| `#e621` | ✅ | ❌ | Nexus exclusivo |
| `#r34video` / `#gelboorovideo` | ✅ | ❌ | Nexus exclusivo |

### 2.5 Administración de Grupos

| Comando | Nexus | Yotsuba | Observación |
|---|---|---|---|
| `#kick` / `#promote` / `#demote` | ✅ | ✅ | Par |
| `#warn` / `#delwarn` / `#setwarnlimit` | ✅ Configurable | ✅ 3 warns = kick fijo | Nexus más flexible |
| `#antilink` / `#tempban` / `#modlog` | ✅ | ❌ | Nexus exclusivo |
| `#open` / `#close` | ✅ | ✅ | Par |
| `#welcome` / `#goodbye` + media | ✅ Con imagen/video | ✅ Solo texto | Nexus superior |
| `#inactivos` / `#fantasmas` | ❌ **→ ✅ AÑADIDO** | ✅ | — |
| `#kickinactivos` / `#kickfantasmas` | ❌ **→ ✅ AÑADIDO** | ✅ | — |
| `#topmensajes` / `#topinactivos` | ✅ | ❌ | Nexus exclusivo |

### 2.6 Gacha / Personajes

| Comando | Nexus | Yotsuba | Observación |
|---|---|---|---|
| `#gacha` / `#invocar` | ✅ Completo con series | ✅ Básico | Nexus muy superior |
| `#harem` / `#trade` / `#waifutop` | ✅ | ✅ | Par |
| `#robwaifu` | ❌ | ✅ | Omitido — código obfuscado malicioso |

---

## 3. MEJORAS IMPLEMENTADAS EN NEXUS

### ✅ 1. `#translate` / `#trad` / `#traducir`
Traducción automática via Google Translate gratuito. Detecta idioma fuente automáticamente.
- Sintaxis: `#translate <texto>` (→ español) o `#translate en texto` (→ idioma destino)
- Sin API key necesaria · **Módulo**: `src/utiltools.js`

### ✅ 2. `#wiki` / `#wikipedia`
Búsqueda en Wikipedia con resumen y URL. Por defecto en español; prefija `en:` para inglés.
- Sintaxis: `#wiki Albert Einstein` / `#wiki en:Quantum mechanics`
- Sin API key · **Módulo**: `src/utiltools.js`

### ✅ 3. `#ssweb` / `#ss`
Screenshot de cualquier página web usando thum.io (servicio gratuito, sin API key).
- Sintaxis: `#ssweb https://github.com`
- **Módulo**: `src/utiltools.js`

### ✅ 4. `#ip`
Geolocalización de IPs/dominios: país, ciudad, ISP, coordenadas, timezone.
- Sintaxis: `#ip 8.8.8.8`
- Via ip-api.com (gratuito) · **Módulo**: `src/utiltools.js`

### ✅ 5. `#calculadora` / `#calc` / `#calz`
Evaluador matemático seguro. Soporta `+ - * / ^ % ()`, constantes `pi` y `e`.
- El `#calculo` de Nexus es un **juego**, no una calculadora. Esta es la herramienta real.
- **Módulo**: `src/utiltools.js`

### ✅ 6. `#semanal` / `#weeklybonus`
Recompensa semanal con racha de hasta 30 semanas. Cooldown 7 días.
- Recompensa: 40.000 ⓃNC base + 5.000 por semana de racha (máx 185.000)
- **Módulo**: `src/economy.js`

### ✅ 7. `#mensual` / `#monthlybonus`
Recompensa mensual con racha de hasta 8 meses. Cooldown 30 días.
- Recompensa: 60.000 ⓃNC base + 5.000 por mes de racha (máx 95.000)
- **Módulo**: `src/economy.js`

### ✅ 8. `#inactivos` / `#fantasmas`
Lista miembros del grupo sin mensajes registrados en el bot.
- `#kickinactivos` / `#kickfantasmas` — elimina masivamente (solo admins + botAdmin)
- Basado en `u.mensajes` ya rastreado en `src/database.js`
- **Módulo**: `src/admin.js`

### ✅ 9. `#xvideos`
Descarga videos de XVideos por URL directa usando yt-dlp (ya instalado en Nexus).
- **Módulo**: `src/nsfwdownloads.js`

---

## 4. CARACTERÍSTICAS OMITIDAS Y POR QUÉ

| Característica Yotsuba | Razón de omisión |
|---|---|
| `#whatmusic` / `#shazam` | Requiere cuenta ACRCloud (API paga) |
| `#robwaifu` | Código JS completamente obfuscado; verifica hardcoded contra repo externo (YukiBot). Riesgo de seguridad. |
| `#tenor` GIF álbum | Requiere API key Tenor; álbum de WhatsApp es formato frágil |
| `#google` search | Usa API privada "Delirius" del autor de Yotsuba, sin alternativa gratuita confiable |
| Plugin hot-reload | Nexus es CJS monolítico; migrar requeriría reescritura total de arquitectura |
| Jadibot (sub-bots) | Experimental, requiere múltiples números de teléfono |
| `#slut` mensajes explícitos | Nexus ya tiene `#slut` con contenido más apropiado |

---

## 5. ARQUITECTURA COMPARADA

```
NEXUS-BOT                          YOTSUBABOT-MD
──────────────────────────────     ──────────────────────────────
index.js                           index.js
  └─ HTTP server (port 5000)         └─ socket + plugin loader
  └─ Baileys connection
src/handler.js (~2250 líneas)      handler.js (~800 líneas)
  └─ switch monolítico               └─ m.quoted, m.react, m.reply
  └─ 200+ comandos                   └─ plugin.before/after hooks
src/*.js (30 módulos)              plugins/*.js (120+ plugins)
  economy, casino, combate,          rpg-*, tools-*, downloads-*,
  clanes, gacha, misiones...         group-*, nsfw-*, anime-*

VENTAJA NEXUS: anti-ban, modlog,   VENTAJA YOTSUBA: hot-reload,
dashboard, 3× más features         fácil añadir plugins nuevos
de grupo y economía
```

---

## 6. HISTORIAL DE AUDITORÍAS

### Auditoría 1 (2026-06-05) — Bugs de código
Seis bugs corregidos incluyendo uno crítico (`ReferenceError` en descargas de audio), fugas de archivos temporales en Spotify/SoundCloud, cache en owners.js, y autenticación del dashboard.

### Auditoría 2 (Junio 2026) — Comparación vs YotsubaBot-MD
Análisis exhaustivo de 120+ plugins de YotsubaBot contra los 200+ comandos de Nexus. Se identificaron e implementaron 9 mejoras genuinas. Ver sección 3 para detalles.

---

## 7. CONCLUSIÓN

**Nexus-Bot es el sistema más completo de los dos** con sistemas exclusivos de gran valor (clanes, misiones, logros, banco avanzado, marketplace, anti-ban, modlog, dashboard). Las características de Yotsuba genuinamente superiores o faltantes han sido integradas:

- 🔧 **Utilidades**: translate, wikipedia, screenshot web, IP lookup, calculadora
- 💰 **Economía**: recompensas semanales y mensuales con racha
- 👥 **Grupos**: detección y kick de miembros inactivos
- 🔞 **NSFW**: descarga de XVideos

El bot resultante combina lo mejor de ambos mundos.
