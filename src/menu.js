const { isOwner } = require('./owners');
const { downloadContentFromMessage, getUrlInfo } = require('@whiskeysockets/baileys');
const { OK, ERR, WARN, INFO } = require('./style');
const fs = require('fs-extra');
const path = require('path');
const { TODO_SFW, TODO_NSFW_IMG, TODO_NSFW_ACCION, TODO_IMAGEBOARDS, TODO_IMAGEBOARDS_VIDEO } = require('./interactions');
const { TODO_NSFW_DOWNLOADS } = require('./nsfwdownloads');

const MENU_IMAGE_PATH = path.join(__dirname, '../data/menu_image.jpg');
const MENU_MEDIA_META = path.join(__dirname, '../data/menu_media.json');
const NSFW_MENU_MEDIA_META = path.join(__dirname, '../data/nsfw_menu_media.json');

const CANAL_OFICIAL = 'https://whatsapp.com/channel/0029Vb7MdipBqbrEwYtefB21';
const CANAL_INVITE_CODE = '0029Vb7MdipBqbrEwYtefB21';
let _canalNewsletterCache = null; // { id, name }
/**
 * Resuelve el JID real del canal oficial (a partir del código de invitación)
 * para poder marcar el #menu como "reenviado desde el canal" — esto es lo
 * que hace que WhatsApp confíe en la miniatura grande del linkPreview
 * (mismo truco que usan Yuki-Bot/Yotsuba-Bot).
 */
async function resolverCanalOficial(sock) {
    if (_canalNewsletterCache) return _canalNewsletterCache;
    try {
        const meta = await sock.newsletterMetadata('invite', CANAL_INVITE_CODE);
        if (meta?.id) {
            _canalNewsletterCache = { id: meta.id, name: meta.name || 'Nexus•System' };
        }
    } catch (e) {
        console.error('No se pudo resolver el canal oficial:', e.message);
    }
    return _canalNewsletterCache;
}
const DIVISOR = '╰ׅ͜─֟͜─͜─ٞ͜─͜─๊͜─͜─๋͜─⃔═̶፝֟͜═̶⃔─๋͜─͜─͜─๊͜─ٞ͜─͜─֟͜┈ࠢ͜╯ׅ';

// ── Categorías del #menu (para #menu <categoria>) ───────────────────────────
// Cada entrada mapea un id corto + alias que el usuario puede escribir hacia
// el título EXACTO tal cual aparece en construirMenu() (línea "◈ *TITULO*").
// No duplicamos el contenido: el texto completo se genera una sola vez con
// construirMenu() y luego se recorta la sección pedida.
const CATEGORIAS_MENU = [
    { id: 'perfil', titulo: 'PERFIL Y USUARIO', aliases: ['perfil', 'usuario', 'usuarios', 'profile'] },
    { id: 'economia', titulo: 'ECONOMÍA', aliases: ['economia', 'eco', 'dinero', 'banco', 'bank'] },
    { id: 'rpg', titulo: 'RPG Y PROGRESIÓN', aliases: ['rpg', 'progresion', 'clan', 'clanes', 'mercado', 'combate', 'pvp'] },
    { id: 'gacha', titulo: 'GACHA Y COLECCIÓN', aliases: ['gacha', 'coleccion', 'waifu', 'waifus', 'harem', 'pokemon'] },
    { id: 'diversion', titulo: 'DIVERSIÓN', aliases: ['diversion', 'fun', 'juegos', 'minijuegos', 'casino', 'interacciones', 'interaccion'] },
    { id: 'ia', titulo: 'NEXUS IA', aliases: ['ia', 'ai', 'nexusia', 'nexus'] },
    { id: 'multimedia', titulo: 'MULTIMEDIA', aliases: ['multimedia', 'stickers', 'sticker', 'descargas', 'downloads'] },
    { id: 'utilidades', titulo: 'UTILIDADES', aliases: ['utilidades', 'utilidad', 'utils', 'herramientas'] },
    { id: 'admin', titulo: 'ADMINISTRACIÓN', aliases: ['admin', 'administracion', 'moderacion', 'mod', 'mods'] },
    { id: 'sistema', titulo: 'SISTEMA / OWNER', aliases: ['sistema', 'owner', 'root'] },
    { id: 'subbots', titulo: 'SUBBOTS', aliases: ['subbots', 'subbot', 'serbot'] }
];

function _normalizarTexto(s) {
    return (s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

// Divide el texto completo de construirMenu() en { header, secciones, footer }.
// secciones: [{ titulo, texto }] — texto incluye la línea "◈ *TITULO* ..." y
// todo el cuerpo de esa categoría hasta el próximo DIVISOR.
function _parsearSeccionesMenu(menuCompleto) {
    const partes = menuCompleto.split(DIVISOR);
    const header = (partes[0] || '').trim();
    const footer = (partes[partes.length - 1] || '').trim();
    const secciones = [];
    for (let i = 1; i < partes.length - 1; i++) {
        const bloque = partes[i].trim();
        const m = bloque.match(/^◈\s*\*(.+?)\*/);
        if (m) secciones.push({ titulo: m[1].trim(), texto: bloque });
    }
    return { header, secciones, footer };
}

function _resolverCategoria(query) {
    const q = _normalizarTexto(query);
    if (!q) return null;

    // 1) Coincidencia exacta contra id, alias o título normalizado — siempre
    // gana, sin importar el orden del array, para evitar que una categoría
    // "más corta" (ej. "ia") le robe el match a otra que la contiene como
    // substring (ej. "economIA", "multimedIA").
    const exacto = CATEGORIAS_MENU.find(c =>
        c.id === q || c.aliases.includes(q) || _normalizarTexto(c.titulo) === q
    );
    if (exacto) return exacto;

    // 2) Si no hay match exacto, buscar coincidencias por prefijo (el alias
    // empieza con lo escrito, o lo escrito empieza con el alias) — evita el
    // problema de substrings en cualquier posición ("ia" dentro de
    // "economia"). Si más de una categoría califica, se considera ambiguo
    // y no se resuelve nada (mejor pedir que sea más específico).
    const candidatas = CATEGORIAS_MENU.filter(c =>
        c.aliases.some(a => a.startsWith(q) || q.startsWith(a)) ||
        _normalizarTexto(c.titulo).startsWith(q)
    );
    if (candidatas.length === 1) return candidatas[0];
    return null;
}

// Lista legible de categorías disponibles, para mostrarla cuando el usuario
// escribe una categoría que no existe.
function _listaCategoriasTexto() {
    return CATEGORIAS_MENU.map(c => `\`#menu ${c.id}\` — ${c.titulo}`).join('\n');
}

// Construye el menú de una sola categoría, reutilizando el mismo header
// (banner/dev/version/hora/users/canal) y footer que el menú completo, para
// que #menu <categoria> se vea exactamente igual de "vestido" que #menu.
// Devuelve null si la categoría no existe.
function construirMenuCategoria(pushName, totalUsers, senderPhone, categoriaQuery) {
    const categoria = _resolverCategoria(categoriaQuery);
    if (!categoria) return null;

    const menuCompleto = construirMenu(pushName, totalUsers, senderPhone);
    const { header, secciones, footer } = _parsearSeccionesMenu(menuCompleto);
    const seccion = secciones.find(s => _normalizarTexto(s.titulo) === _normalizarTexto(categoria.titulo));
    if (!seccion) return null;

    const otras = CATEGORIAS_MENU.filter(c => c.id !== categoria.id).map(c => `\`#menu ${c.id}\``).join(' · ');

    const texto = `${header}

${DIVISOR}

${seccion.texto}

${DIVISOR}

*Otras categorías:* ${otras}
_Usa \`#menu\` para ver la lista completa._

${DIVISOR}

${footer}`;

    return { texto, categoria };
}

// Lee metadatos de la media del menú: { tipo: 'image'|'video'|'gif', path }
function leerMenuMedia() {
    try {
        if (fs.existsSync(MENU_MEDIA_META)) {
            const meta = JSON.parse(fs.readFileSync(MENU_MEDIA_META, 'utf8'));
            if (meta && meta.path && fs.existsSync(meta.path)) return meta;
        }
    } catch {}
    if (fs.existsSync(MENU_IMAGE_PATH)) {
        return { tipo: 'image', path: MENU_IMAGE_PATH };
    }
    return null;
}

function guardarMenuMedia(meta) {
    fs.ensureDirSync(path.dirname(MENU_MEDIA_META));
    fs.writeFileSync(MENU_MEDIA_META, JSON.stringify(meta, null, 2));
}

function borrarMenuMedia() {
    try {
        if (fs.existsSync(MENU_MEDIA_META)) {
            const meta = JSON.parse(fs.readFileSync(MENU_MEDIA_META, 'utf8'));
            if (meta && meta.path && fs.existsSync(meta.path) && meta.path !== MENU_IMAGE_PATH) {
                fs.removeSync(meta.path);
            }
            fs.removeSync(MENU_MEDIA_META);
        }
    } catch {}
    if (fs.existsSync(MENU_IMAGE_PATH)) fs.removeSync(MENU_IMAGE_PATH);
}

// ── Media global del menú NSFW ────────────────────────────────────────────────
function leerNsfwMenuMedia() {
    try {
        if (fs.existsSync(NSFW_MENU_MEDIA_META)) {
            const meta = JSON.parse(fs.readFileSync(NSFW_MENU_MEDIA_META, 'utf8'));
            if (meta && meta.path && fs.existsSync(meta.path)) return meta;
        }
    } catch {}
    return null;
}

function guardarNsfwMenuMedia(meta) {
    fs.ensureDirSync(path.dirname(NSFW_MENU_MEDIA_META));
    fs.writeFileSync(NSFW_MENU_MEDIA_META, JSON.stringify(meta, null, 2));
}

function borrarNsfwMenuMedia() {
    try {
        if (fs.existsSync(NSFW_MENU_MEDIA_META)) {
            const meta = JSON.parse(fs.readFileSync(NSFW_MENU_MEDIA_META, 'utf8'));
            if (meta && meta.path && fs.existsSync(meta.path)) fs.removeSync(meta.path);
            fs.removeSync(NSFW_MENU_MEDIA_META);
        }
    } catch {}
}

function comandosVertical(lista) {
    return [...new Set(lista)].map(cmd => `\`#${cmd}\``).join('\n');
}

function formatHora() {
    try {
        return new Date().toLocaleTimeString('es-CO', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: true, timeZone: 'America/Bogota'
        });
    } catch {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    }
}

// ── Construye el texto completo del menú principal ─────────────────────────
function construirMenu(pushName, totalUsers, senderPhone) {
    const hora = formatHora();
    const nombreVisible = pushName ? `${pushName}` : senderPhone;

    const header =
`> 𖧧 ¡Hola! *${nombreVisible}*, Soy *Nexus-Bot*, aquí tienes la lista de comandos

╭┈ࠢ͜͜┅ࠦ͜͜╾݊͜─ؕ͜─ׄ͜─֬͜─֟͜─֫͜─ׄ͜─ؕ͜─݊͜┈ࠦ͜┅ࠡ͜͜┈࠭͜͜۰۰͜۰
│✿ *ᴅᴇᴠᴇʟᴏᴘᴇʀ ::* Alejx_h
│⸙ *ᴠᴇʀsɪᴏɴ ::* Nexus•System
│○ *ʜᴏʀᴀ ::* ${hora}
│𓏸 *ᴜsᴇʀs ::* ${totalUsers}
│○ *ᴄᴀɴᴀʟ ::* ${CANAL_OFICIAL}
╰ׅ┈ࠢ͜─ׄ͜─ׄ֟፝͜─ׄ͜─ׄ͜╴ ⋱࣭ ᩴ  ⋮֔   ᩴ ⋰╶͜─ׄ͜─ׄ֟፝͜─ׄ͜─ׄ͜┈ࠢ͜╯ׅ

*Busca un comando rápido:*
\`#searchcmd <texto>\`
  Muestra todos los comandos que contienen ese texto.
`;

    return `${header}
${DIVISOR}

◈ *PERFIL Y USUARIO*
Tu identidad, progreso, fama y vida social en el bot.

\`#perfil\` \`#profile\` _<@usuario>_
> Ver perfil completo
\`#racha\` \`#streak\` _<@usuario>_
> Tu racha de victorias y estadísticas de juegos
\`#level\` \`#lvl\`
> Tu nivel actual y XP
\`#leaderboard\` \`#top\` \`#lboard\`
> Ranking de niveles del grupo
\`#topweekly\` \`#topsemanal\`
> Top mensajes de la semana (premios cada lunes)
\`#topsemanalresultados\` \`#semanalresultados\`
> Últimos ganadores y premios del Top Semanal
\`#rankglobal\` \`#globalrank\` \`#topglobal\`
> Ranking global de todos los usuarios
\`#pfp\` \`#getpic\` _<@u>_
> Ver foto de perfil de alguien
\`#marry\` \`#casarse\` _[@usuario]_
> Casarse con alguien
\`#divorce\`
> Divorciarte de tu pareja
\`#setbirth\` _[DD/MM/AAAA]_
> Establecer cumpleaños
\`#delbirth\`
> Quitar tu fecha de cumpleaños
\`#setdesc\` \`#setdescription\` _[texto]_
> Establecer descripción de perfil
\`#setgenre\` _[m/f/nb]_ · \`#delgenre\`
> Género del perfil
\`#setfav\` \`#setfavourite\` _[anime/personaje]_
> Establecer tu favorito
\`#birthdays\` \`#cumpleaños\`
> Cumpleaños del mes
\`#allbirthdays\` \`#allbirths\`
> Todos los cumpleaños registrados
\`#rep\` \`#+rep\` _[@usuario]_
> Dar punto de reputación
\`#reputation\` \`#reputacion\` _<@usuario>_
> Ver reputación de alguien
\`#reptop\` \`#toprep\`
> Ranking de reputación
\`#rango\` \`#rank\` _<@usuario>_
> Ver tu rango actual y tabla de rangos
\`#afk\` \`#ausente\` _[razón]_
> Marcarte ausente del chat
\`#afklist\` \`#listaafk\`
> Ver usuarios AFK del grupo
\`#afkdel\` \`#volver\` \`#noafk\`
> Quitarte del modo AFK manualmente

${DIVISOR}

◈ *ECONOMÍA*
Gana, pierde, invierte y conviértete en el magnate del grupo.

\`#balance\` \`#bal\` \`#saldo\` \`#coins\`
> Ver tus ⓃNexCoins
\`#einfo\` \`#economyinfo\`
> Tu estado económico completo
\`#daily\` \`#diario\`
> Recompensa diaria
\`#semanal\` \`#weeklybonus\`
> Recompensa semanal
\`#mensual\` \`#monthlybonus\`
> Recompensa mensual
\`#work\` \`#w\` \`#trabajar\`
> Trabajar (cd: 2h)
\`#crime\` \`#crimen\` _[simple|banco|mafia]_
> Crimen por niveles de riesgo
\`#slut\`
> Ganar de otra manera (cd: 45min)
\`#steal\` \`#rob\` \`#robar\` _[@usuario]_
> Robar monedas (cd: 30min)
\`#pay\` \`#transferir\` \`#givecoins\` _[@u] [cantidad]_
> Dar ⓃNexCoins a otro
\`#baltop\` \`#economyboard\`
> Ranking de riqueza del grupo
\`#richtop\` \`#toprico\` \`#wealthtop\`
> Ranking global de riqueza (todos los usuarios)
\`#richtopg\` \`#richtopgrupo\`
> Ranking de riqueza del grupo actual
\`#leveltop\` \`#topnivel\` \`#globallevel\`
> Ranking global de niveles (todos los usuarios)
\`#leveltopg\` \`#leveltopgrupo\`
> Ranking de niveles del grupo actual
\`#minar\` \`#mine\`
> Picar minerales (cd: 30min)
\`#adventure\` \`#aventura\`
> Aventura épica (cd: 1h)
\`#cazar\` \`#hunt\`
> Cazar presas (cd: 25min)
\`#fish\` \`#pescar\`
> Pescar peces (cd: 20min)
\`#mazmorra\` \`#dungeon\`
> Vencer monstruos (cd: 1h30)
\`#tienda\` / \`#comprar\` _[id]_ / \`#inventario\`
> Tienda clásica con ítems

◇ *Banco avanzado*
Guarda, retira, invierte y pide préstamos con tus ⓃNexCoins.

\`#deposit\` \`#dep\` \`#depositar\` _[cantidad|all]_
> Depositar al banco
\`#withdraw\` \`#with\` \`#retirar\` _[cantidad|all]_
> Retirar del banco
\`#invest\` \`#invertir\` _[cantidad]_
> Invertir con 5% cada 6h
\`#interest\` \`#interes\`
> Cobrar intereses acumulados
\`#loan\` \`#prestamo\` _[cantidad]_
> Pedir préstamo
\`#payloan\` \`#pagarprestamo\`
> Pagar tu préstamo
\`#bankinfo\` \`#bank\` \`#banco\`
> Estado completo de tu banco

${DIVISOR}

◈ *RPG Y PROGRESIÓN*
Sube de nivel, lucha, completa misiones y desbloquea logros.

\`#fight\` \`#pelear\` \`#pvp\` \`#battle\` _[@usuario]_
> Lucha 1v1 contra otro usuario
\`#stats\` \`#combate\` _<@usuario>_
> Ver estadísticas de combate
\`#train\` \`#entrenar\`
> Entrenar para subir stats (cd: 1h)
\`#missions\` \`#misiones\` \`#quest\`
> Misiones activas del día y progreso
\`#claimmission\` \`#completar\`
> Reclamar recompensa de misión diaria
\`#weeklymissions\` \`#misionessemanales\` \`#weekly\`
> Misiones semanales (premios mayores)
\`#claimweekly\` \`#reclamarsemanales\`
> Reclamar misiones semanales completadas
\`#achievements\` \`#logros\`
> Logros desbloqueados
\`#achievementlist\` \`#listlogros\`
> Todos los logros disponibles

◇ *Clanes*
Crea o únete a un clan, compite y domina el ranking de grupos.

\`#createguild\` \`#crearclan\` _[nombre]_
> Crear clan (cuesta 1000 ⓃNC)
\`#joinguild\` \`#unirclan\` _[nombre]_
> Solicitar ingreso (requiere aprobación del líder)
\`#leaveguild\` \`#salirclan\`
> Salir de tu clan
\`#guildinfo\` \`#infoclan\` \`#miclan\` _<nombre>_
> Ver info y miembros
\`#editguild\` \`#editclan\` _desc/foto_
> Editar clan (líder/oficial)
\`#guildbattle\` \`#guerraclan\` _[clan]_
> Declarar guerra entre clanes
\`#guildtop\` \`#topclanes\`
> Ranking de clanes
\`#guildbankinfo\` \`#gbanco\`
> Banco del clan y movimientos
\`#guilddeposit\` _[cantidad]_
> Depositar ⓃNC al banco del clan
\`#guildwithdraw\` _[cantidad]_
> Retirar del banco (líder/oficial)
\`#guildpromote\` _[@usuario]_
> Ascender miembro a Oficial
\`#guilddepromote\` _[@usuario]_
> Bajar Oficial a Miembro
\`#clankick\` \`#guildkick\` \`#expulsarclan\` _[@usuario]_
> Expulsar miembro del clan (líder/oficial)
\`#disbandguild\`
> Disolver el clan (solo líder)
\`#guildpending\` \`#pendientesclan\`
> Ver solicitudes pendientes (líder/oficial)
\`#guildaccept\` _[@usuario]_
> Aceptar solicitud de ingreso (líder/oficial)
\`#guilddeny\` _[@usuario]_
> Rechazar solicitud de ingreso (líder/oficial)

◇ *Mercado de usuarios*
Compra y vende ítems entre jugadores en tiempo real.

\`#mercado\` \`#market\`
> Ver todas las ofertas activas
\`#listar\` _[item] [cantidad] [precio]_
> Poner ítem a la venta (máx 3 ofertas)
\`#comprarof\` _[id]_
> Comprar una oferta del mercado
\`#cancelaroferta\` _[id]_
> Cancelar y recuperar tu oferta

${DIVISOR}

◈ *GACHA Y COLECCIÓN*
Colecciona personajes, intercambia y cría tu Pokémon.

◇ *Gacha (waifus / husbandos)*:

\`#roll\` \`#rw\` \`#rollwaifu\`
> Personaje aleatorio (cd 5min, expira 3min)
\`#claim\` \`#c\` \`#reclamar\` _[nombre/responder roll]_
> Reclamar el personaje (cd 3min)
\`#harem\` \`#waifus\` _<@usuario>_
> Ver tus personajes (o de otro)
\`#charinfo\` \`#winfo\` _[nombre]_
> Info completa del personaje
\`#charimage\` \`#cimage\` _[nombre]_
> Imagen SFW del personaje
\`#charvideo\` \`#cvideo\` _[nombre]_
> Video del personaje
\`#givechar\` \`#regalar\` _[@u] [nombre]_
> Regalar personaje
\`#sell\` \`#vender\` _[precio] [nombre]_
> Poner personaje en venta
\`#haremshop\` \`#wshop\`
> Personajes en venta
\`#removesale\` \`#removerventa\` _[nombre]_
> Quitar personaje de la venta
\`#trade\` \`#intercambiar\` _[@u] [tuChar] / [Char2]_
> Proponer intercambio (requiere aceptación)
\`#accepttrade\` \`#aceptartrade\`
> Aceptar propuesta de intercambio
\`#canceltrade\` \`#cancelartrade\`
> Rechazar o cancelar intercambio
\`#favtop\` _<nombre>_
> Ver favoritos / marcar favorito
\`#delwaifu\` \`#delchar\` _[nombre]_
> Eliminar personaje
\`#gachainfo\` \`#ginfo\`
> Tu info de gacha
\`#waifusboard\` \`#wtop\`
> Top de personajes
\`#favoritetop\`
> Top de favoritos del bot
\`#vote\` \`#votar\` _[nombre]_
> Votar a un personaje
\`#serieinfo\` \`#ainfo\` _[nombre]_
> Info de anime/serie
\`#serielist\` \`#slist\`
> Listar series del bot
\`#coleccion\` \`#catalog\` _[serie]_
> Ver qué personajes de una serie tienes en tu harem
\`#buychar\` \`#buyc\` _[nombre]_
> Comprar personaje en venta

◇ *Pokémon (mascotas)*
Adopta, alimenta y cuida tu Pokémon favorito con hasta 5 niveles de rareza.

\`#adoptpet\` \`#adoptpokemon\` \`#pokemon\` _<nombre>_
> Adoptar Pokémon (800 ⓃNC, 5 rarezas)
\`#petinfo\` \`#mipet\`
> Ver stats de tu Pokémon
\`#petfeed\` \`#feed\`
> Alimentar (30 ⓃNC, cd: 30min)
\`#petplay\` \`#jugar\`
> Jugar (cd: 1h)
\`#changepet\` \`#newpet\` _<nombre>_
> Cambiar de Pokémon (800 ⓃNC)
\`#abandopet\` \`#delpet\`
> Liberar Pokémon (cd: 1h)

${DIVISOR}

◈ *DIVERSIÓN*
Minijuegos, casino, eventos, cofres y caos divertido.

◇ *Minijuegos*
Pon a prueba tu ingenio y suerte en distintos juegos grupales.

\`#trivia\` \`#quiz\`
> Trivia con recompensa
\`#math\` _[facil|normal|dificil]_
> Reto matemático
\`#ppt\` \`#rps\` _[piedra|papel|tijera] [apuesta]_
> Piedra, papel o tijera vs bot
\`#guess\` \`#adivinar\`
> Adivina el número secreto
\`#wordchain\` \`#palabras\`
> Cadena de palabras sin repetir
\`#ahorcado\` \`#hangman\`
> Adivina la palabra letra por letra
\`#scramble\` \`#descifra\`
> Descifra la palabra revuelta
\`#quien\` \`#personaje\`
> Adivina el personaje con pistas
\`#tsquiz\` \`#taylorswift\`
> Trivia exclusiva de Taylor Swift
\`#completa\` \`#lyrics\`
> Completa la letra de la canción
\`#vof\` \`#verdaderofalso\`
> Verdadero o Falso
\`#emojiadivina\` \`#emojiquiz\`
> Adivina la peli/canción/anime con emojis
\`#8ball\` _[pregunta]_
> La Bola 8 responde tu destino
\`#stopgame\` \`#endgame\`
> Terminar minijuego activo
\`#sopa\` \`#sopadepalabras\` \`#wordsearch\`
> Sopa de letras 16×16, indica fila+columna donde inicia la palabra
\`#ttt\` \`#tictactoe\` \`#gato\` _<@usuario>_
> Tres en raya contra otro usuario
\`#t\` \`#mover\` _[casilla]_
> Mover en la partida de tres en raya activa
\`#tttabandonar\` \`#abandottt\`
> Abandonar/rendirte en tres en raya

◇ *Casino*
Apuesta tus ⓃNexCoins y prueba tu suerte en juegos de azar.

\`#coinflip\` \`#cf\` _[cantidad] [cara|cruz]_
> Lanzar moneda
\`#ruleta\` \`#rt\` _[rojo|negro] [cantidad]_
> Ruleta de colores
\`#blackjack\` \`#bj\` \`#21\` _[cantidad]_
> Blackjack clásico
\`#hit\` / \`#stand\`
> Pedir / Plantarse en BJ
\`#slots\` \`#tragamonedas\` _[cantidad]_
> Tragamonedas
\`#jackpot\` \`#pozo\`
> Ver pozo acumulado

◇ *Cofres y eventos*
Suelta cofres con recompensas para el grupo y reclama los activos.

\`#givechest\` \`#darcofre\` \`#dropcofre\` \`#cofre\` _[cantidad]_
> Soltar cofre con ⓃNC (admin/owner)
\`#claimchest\` \`#abrircofre\`
> Reclamar cofre activo
\`#event\` \`#evento\`
> Ver evento activo en este chat
\`#eventos\` \`#catalogo\`
> Ver todos los eventos y sus efectos
\`#eventoson\`
> Activar eventos en este grupo/chat (admin)
\`#eventosoff\`
> Desactivar eventos en este grupo/chat (admin)
\`#eventostop\` \`#stopevento\` \`#detenerevento\`
> Cortar de inmediato el evento activo (admin)
\`#levelnotif on/off\`
> Activar o desactivar anuncios de subida de nivel (admin)

◇ *Tienda de ítems*
Compra y usa objetos especiales con efectos únicos en el juego.

\`#shop\` \`#store\` \`#tiendaitems\`
> Tienda especial
\`#buyitem\` \`#buyi\` _[id]_
> Comprar ítem
\`#useitem\` \`#usar\` \`#usei\` _[id]_
> Usar ítem del inventario
\`#inv\` \`#inventory\` \`#mochila\`
> Ver tu inventario

◇ *Social y trolleo*
Encuestas, verdad o reto, memes y diversas interacciones grupales.

\`#poll\` \`#encuesta\` _[Pregunta] | [Op1] | [Op2]_
> Crear encuesta
\`#pollvote\` _[número]_
> Votar en la encuesta activa
\`#pollresults\` \`#resultados\`
> Ver resultados
\`#truth\` \`#verdad\` / \`#dare\` \`#reto\` / \`#tod\` _<@u>_
> Verdad · Reto · Verdad o Reto
\`#ship\` _[@u1] [@u2]_
> Compatibilidad amorosa
\`#meme\` \`#memes\` _[categoría]_
> Meme aleatorio · categorías: anime | shitpost | dank | español | gaming | wholesome | dark | programacion | random
\`#frase\` \`#quote\` \`#cita\` _[tipo]_
> Frase aleatoria · tipos: motivacional | sarcastica | filosofica | humor | amor | dark
\`#toprand\` \`#toprandom\` _[tema]_
> Top aleatorio del grupo
\`#hack\` \`#hackear\` _<@u>_
> Hackear a alguien (modo troll)
\`#loot\` \`#recoger\` \`#pickup\`
> Recoger loot del grupo

◇ *Interacciones anime (SFW)* —
soportan @menciones:

${comandosVertical(TODO_SFW)}

${DIVISOR}

◈ *NEXUS IA*
Habla, experimenta y desafía la mente de la IA.

\`#ai\` \`#nexus\` \`#gpt\` \`#ask\` _[pregunta]_
> Hacer una pregunta a Nexus
\`#ai persona\` _[nexus|sarcastico|sabio|troll|tsundere]_
> Cambiar la personalidad
\`#ai memory on|off\`
> Activar/desactivar memoria del grupo
\`#ai roast\` _[@usuario]_
> Roast creativo con IA
\`#ai reset\`
> Borrar historial de conversación
\`#clearmemory\` \`#resetai\`
> Limpiar memoria IA (solo admin)

${DIVISOR}

◈ *MULTIMEDIA*
Stickers y descargas de múltiples plataformas.

◇ *Stickers*
Crea stickers estáticos o animados y busca packs de la comunidad.

\`#sticker\` \`#s\`
> Crear sticker (responde imagen/video)
\`#ss\` _[búsqueda]_
> Buscar 1 sticker animado
\`#ss\` _A[n] [búsqueda]_
> Buscar n stickers animados (máx 5)
\`#ss\` _F[n] [búsqueda]_
> Buscar n stickers estáticos (máx 5)
\`#again\`
> Repetir búsqueda anterior del grupo
\`#toimage\` \`#toimg\`
> Convertir sticker a imagen
\`#tovideo\` \`#tov\` \`#tomp4\`
> Convertir sticker animado a video MP4
\`#brat\` _[texto]_
> Sticker estilo brat (fondo verde, texto minimalista)
\`#brat2\` _[texto]_
> Igual que #brat pero fondo blanco y texto negro (con emojis)
\`#brat3\` _[texto]_
> Igual que #brat2 pero animado, palabra por palabra
\`#ttp\` _[texto]_
> Sticker de texto colorido estático
\`#attp\` _[texto]_
> Sticker de texto colorido animado
\`#qc\` _(responde a un texto)_
> Tarjeta de chat con el mensaje citado
\`#wm\` _[pack]|[autor]_ _(responde a un sticker)_
> Cambiar el nombre/autor de un sticker

◇ *Descargas*
Descarga videos y audio de YouTube, TikTok, Instagram y más.

\`#yt\` \`#mp4\` \`#ytmp4\` _[url]_
> Descargar video de YouTube
\`#ytv\` \`#ytvideo\` \`#ytdescargar\` _[url]_
> Descargar video YT (alterno HD)
\`#play\` \`#mp3\` \`#ytaudio\` _[url]_
> Descargar audio de YouTube
\`#ytsearch\` \`#search\` _[búsqueda]_
> Buscar en YouTube
\`#tiktok\` \`#tt\` _[url]_
> Descargar video de TikTok
\`#ttplay\` \`#tiktokmp3\` \`#ttaudio\` _[url]_
> Descargar audio de TikTok
\`#ttfotos\` _[url]_
> Descargar fotos/carrusel de TikTok
\`#instagram\` \`#ig\` \`#reel\` _[url]_
> Descargar video Instagram/Reels
\`#facebook\` \`#fb\` \`#fvideo\` _[url]_
> Descargar video de Facebook
\`#twitter\` \`#x\` _[url]_
> Descargar video Twitter/X
\`#pin\` \`#pinterest\` _[búsqueda o link]_
> Buscar imágenes en Pinterest
\`#img\` _[búsqueda]_
> Buscar imágenes en internet
\`#mediafire\` \`#mf\` _[url]_
> Descargar archivo de MediaFire
\`#pixiv\` \`#px\` _[búsqueda]_
> Buscar imágenes en Pixiv
\`#tts\` \`#ttsticker\` \`#tiktoksticker\` _[voz] [texto]_
> Generar audio con voces de TikTok TTS y enviarlo como sticker de voz
\`#spotify\` \`#sp\` _[url]_
> Descargar canción de Spotify
\`#soundcloud\` \`#sc\` _[url]_
> Descargar audio de SoundCloud
\`#threads\` \`#thread\` _[url]_
> Descargar de Threads (Meta)
\`#apk\` \`#apkpure\` _[nombre]_
> Buscar y descargar APK
\`#drive\` \`#gdrive\` _[url]_
> Descargar archivo público de Drive
\`#mega\` _[url]_
> Descargar archivo de Mega.nz
\`#terabox\` _[url]_
> Descargar archivo de Terabox (requiere cookies configuradas por el owner)
\`#gitclone\` \`#gitdl\` _[url del repo]_
> Descargar un repositorio de GitHub como .zip
\`#dl\` \`#aio\` _[url]_
> Descargador universal: detecta la plataforma automáticamente

◇ *Efectos de audio*
Responde a un audio o nota de voz con cualquiera de estos comandos.

\`#bass\` \`#blown\` \`#deep\` \`#earrape\` \`#fast\` \`#fat\` \`#nightcore\` \`#reverse\` \`#robot\` \`#slow\` \`#tupai\`
> Efectos clásicos de tono y velocidad
\`#echo\` \`#chorus\` \`#flanger\` \`#vibrato\` \`#tremolo\` \`#phaser\`
> Efectos de modulación y espacio
\`#compressor\` \`#distortion\` \`#underwater\` \`#telephone\` \`#radio\` \`#cave\` \`#whisper\` \`#demon\`
> Efectos de ambiente y voz

${DIVISOR}

◈ *UTILIDADES*
Diagnóstico, info, búsqueda y comandos secundarios.

\`#searchcmd\` \`#sc\` \`#buscarcmd\` _[texto]_
> Buscar comandos dentro del menú
\`#translate\` \`#traducir\` \`#tr\` _[idioma] [texto]_
> Traducir texto a otro idioma
\`#wiki\` \`#wikipedia\` _[búsqueda]_
> Buscar en Wikipedia
\`#ssweb\` \`#screenshot\` _[url]_
> Captura de pantalla de una página web
\`#ip\` \`#iplookup\` \`#ipinfo\` _[ip/dominio]_
> Ver información de una IP o dominio
\`#calculadora\` \`#calc\` _[operación]_
> Calculadora
\`#qr\` _[texto]_ (o responde a una imagen con QR)
> Generar o leer un código QR
\`#ping\` \`#p\`
> Ver latencia del bot
\`#status\` \`#botinfo\` \`#infobot\`
> Estado e info del bot
\`#del\` \`#delete\`
> Borrar mensaje del bot (responde)
\`#suggest\` \`#sug\` \`#add\` _[texto]_
> Sugerir algo al owner
\`#report\` \`#bug\` _[texto]_
> Reportar un bug al owner
\`#gif\` \`#togif\` \`#mp4togif\` (responde video)
> Convertir video corto (máx 30s) a GIF animado
\`#hd\` \`#enhance\` \`#remini\` (responde imagen)
> Mejorar/escalar imagen ×2
\`#read\` \`#rvo\` \`#readviewonce\` (responde view-once)
> Leer mensaje de visualización única
\`#bots\` \`#sockets\`
> Detectar bots en el grupo
\`#invite\`
> Link de invitación del grupo
\`#leave\` \`#salir\`
> Salir del grupo automáticamente (el bot te saca sin que tengas que irte tú)
\`#testwelcome\` / \`#testgoodbye\`
> Probar bienvenida o despedida
\`#gp\` \`#groupinfo\` \`#infogrupo\`
> Info del grupo
\`#waifu\` _[nombre]_
> Imagen SFW de personaje
\`#downloaddiag\` \`#diagdescargas\`
> Diagnóstico de descargas 403/429
\`#logs\` \`#verlogs\` \`#errorlogs\`
> Ver los últimos logs del bot
\`#setprimary\`
> Establecer cuenta primaria
\`#hitomi\` / \`#nhentai\` / \`#vmp\`
> Lectores de manga (en desarrollo)
\`#manga\` \`#buscarman\` _[nombre]_
> Buscar información de un manga (MyAnimeList)
\`#npmjs\` \`#npm\` _[paquete]_
> Buscar un paquete en npm
\`#emojimix\` \`#emojikitchen\` _emoji1&emoji2_
> Mezclar dos emojis y recibir el resultado como sticker
\`#tempmail\` \`#correotemporal\`
> Generar un correo temporal desechable
\`#inspect\` \`#inspectgroup\` _[link de grupo]_
> Ver info de un grupo desde su link sin unirte
\`#shazam\` \`#identificarcancion\` (responde audio/video)
> Identificar una canción y recibirla desde YouTube
\`#autojoin\` _<config>_
> Auto-unirse a grupos (owner)
\`#setbotcurrency\` / \`#setbotowner\`
> Configuración del bot (owner)
\`#menunsfw\` \`#nsfwmenu\` \`#menu18\`
> Abrir menú NSFW (+18)

${DIVISOR}

◈ *ADMINISTRACIÓN* _(solo admins)_
Control total del grupo: orden, reglas y poder absoluto.

\`#welcome enable|disable\`
> Activar/desactivar bienvenida
\`#setwelcome\` _[texto]_
> Personalizar mensaje de bienvenida
\`#resetwelcome\`
> Restablecer bienvenida al texto predeterminado
\`#setwelcomeimage\` \`#welcomeimg\`
> Imagen de bienvenida (responde imagen)
\`#setmultimediawelcome\` \`#setwelcomemedia\` \`#setwelcomevideo\` \`#setwelcomegif\`
> Imagen / GIF / video (máx 60s) bienvenida
\`#delwelcomeimage\` \`#delwelcomemedia\`
> Quitar media de bienvenida
\`#goodbye enable|disable\`
> Activar/desactivar despedida
\`#setgoodbye\` _[texto]_
> Personalizar mensaje de despedida
\`#resetgoodbye\`
> Restablecer despedida al texto predeterminado
\`#setgoodbyeimage\` \`#goodbyeimg\`
> Imagen de despedida (responde imagen)
\`#setmultimediagoodbye\` \`#setgoodbyemedia\` \`#setgoodbyevideo\` \`#setgoodbyegif\`
> Imagen / GIF / video (máx 60s) despedida
\`#delgoodbyeimage\` \`#delgoodbyemedia\`
> Quitar media de despedida
\`#modlog\` _[n]_
> Historial de moderación del grupo (últimas 15 acciones, o #modlog 30)
\`#clearmodlog\`
> Limpiar el historial de moderación del grupo
\`#kick\` / \`#promote\` / \`#demote\` _[@u]_
> Expulsar / Promover / Degradar
\`#fijar\` / \`#pinar\` (cita el mensaje)
> Fijar un mensaje en el grupo (requiere citar el mensaje)
\`#desfijar\` / \`#unpinmsg\` (cita el mensaje)
> Quitar el mensaje fijado del grupo
\`#tempban\` _[@u] [tiempo]_
> Expulsar temporalmente (ej: #tempban @u 1h30m / 2d / 30m)
\`#tempbans\`
> Ver todos los tempbans activos del grupo con tiempo restante
\`#untempban\` _[@u]_
> Cancelar un tempban activo y reincorporar al usuario
\`#mutebot\` / \`#unmutebot\` _[@u]_
> Silenciar/Activar al usuario para el bot (ignora comandos y XP)
\`#mutedlist\`
> Ver usuarios silenciados en el grupo
\`#warn\` / \`#delwarn\` / \`#warns\` _[@u]_
> Advertir / Quitar / Ver avisos (por grupo)
\`#resetwarns\` _[@u]_
> Resetear todas las advertencias de un usuario en este grupo
\`#warnslist\`
> Ver todos los usuarios con advertencias activas en el grupo
\`#setwarnlimit\` _[n]_
> Límite de advertencias antes del kick automático
\`#open\` / \`#close\`
> Abrir o cerrar el grupo
\`#antilink\` \`#antienlace\` _enable|disable_
> Bloquear links en el grupo
\`#anticall\` \`#antillamada\` _enable|disable_
> Rechazar llamadas automáticamente en el grupo
\`#onlyadmin\` \`#onlyadmins\` _enable|disable_
> Solo admins pueden hablar
\`#economy\` \`#economia\` _enable|disable_
> Activar/desactivar economía
\`#nsfw\` _enable|disable_
> Activar NSFW (+18) en el grupo
\`#gacha\` _enable|disable_
> Activar/desactivar gacha
\`#alerts\` \`#alertas\` _enable|disable_
> Alertas de promote/demote
\`#topmensajes\` \`#topmessages\`
> Top de usuarios con más mensajes
\`#topinactive\` \`#topinactivos\`
> Usuarios más inactivos del grupo
\`#inactivos\` \`#fantasmas\`
> Listar usuarios inactivos (fantasmas) del grupo
\`#kickinactivos\` \`#kickfantasmas\`
> Expulsar a todos los usuarios inactivos
\`#cleanup\` \`#limpiar\`
> Limpiar usuarios sin actividad
\`#tagall\` \`#tag\` \`#hidetag\` \`#tagsay\` _[mayus|minus]_
> Mencionar a todos
\`#settag\` \`#tagmode\` _todos|admins_
> Elegir quién puede usar el #tag (solo admins)
\`#groupimage\` \`#setgpbaner\` \`#setgroupimage\`
> Cambiar imagen del grupo
\`#setgpname\` \`#setgroupname\` _[texto]_
> Cambiar nombre del grupo
\`#setgpdesc\` \`#setgroupdesc\` _[texto]_
> Cambiar descripción del grupo
\`#msgcount\` \`#count\` \`#mensajes\` _<@u>_
> Contar mensajes del grupo o usuario
\`#config\` \`#settings\` \`#ajustes\`
> Ver todos los ajustes actuales del grupo (cualquier miembro)

${DIVISOR}

◈ *SISTEMA / OWNER*
Control absoluto del bot, sólo para owners.

\`#botinfo\` \`#status\`
> Información y estado del bot
\`#stats\` \`#botstats\` \`#estadisticas\`
> Estadísticas detalladas del bot (mensajes, comandos, uptime)
\`#backup\`
> Crear copia de seguridad manual de los datos
\`#stats\` \`#botstats\` \`#estadisticas\`
> Estadísticas detalladas del bot (mensajes, comandos, uptime, top comandos)
\`#logs\` \`#verlogs\` \`#errorlogs\`
> Ver los últimos errores registrados por el bot
\`#join\` _[link grupo]_
> Unirse a un grupo por link
\`#logout\`
> Cerrar sesión del bot
\`#reload\`
> Reiniciar el bot
\`#on\` / \`#off\`
> Encender o apagar el bot
\`#mantenimiento\` / \`#maint\`
> Activar/desactivar modo mantenimiento (bloquea el bot para no-owners)
\`#setmaint\` _[mensaje]_
> Personalizar el mensaje que ven los usuarios durante el mantenimiento
\`#grupos\` / \`#misgrupos\`
> Listar todos los grupos donde está el bot con nombre y cantidad de miembros
\`#kickbot\` _[link grupo]_
> Sacar el bot de un grupo (desde el grupo o por link)
\`#broadcast\` / \`#bc\` _[mensaje]_
> Enviar un aviso a todos los grupos donde está el bot
\`#setprefix\` _[carácter]_
> Cambiar prefijo (metadata)
\`#setchannel\` _[link]_
> Definir canal oficial
\`#setlink\` _[link]_
> Definir link público
\`#setpfp\` \`#setbotpic\` (responde imagen)
> Cambiar foto de perfil del bot
\`#setusername\` \`#setbotname\` _[nombre]_
> Cambiar nombre/about del bot
\`#darcoins\` \`#dardinero\` _[@u] [cantidad]_
> Dar ⓃNexCoins a un usuario
\`#quitarcoins\` \`#quitardinero\` _[@u] [cantidad|all] [banco]_
> Quitar ⓃNC (cartera, banco, o todo con all)
\`#addchar\` \`#addwaifu\` _[@u] [nombre]_
> Agregar personaje al harem de un usuario
\`#removechar\` \`#quitarchar\` \`#delchar\` _[@u] [nombre]_
> Quitar un personaje específico del harem de un usuario
\`#deleteharem\` \`#haremdel\` _[@u]_
> Borrar harem de un usuario (requiere confirmación)
\`#addowner\` / \`#delowner\` / \`#owners\` / \`#ownerlist\`
> Gestión de owners
\`#mediainfo\` \`#medialist\` _[sfw|nsfw]_
> Info de archivos media cargados en el bot
\`#sfwprecalentar\` \`#sfwwarmup\`
> Precalentar caché de imágenes SFW
\`#setmenuimage\` \`#menuimage\`
> Imagen del menú (responde imagen)
\`#setmultimediamenu\` \`#setmenumedia\` \`#setmenuvideo\` \`#setmenugif\`
> Imagen / GIF / video (máx 60s) del menú
\`#delmenuimage\` \`#delmenumedia\`
> Quitar media del menú
\`#setnsfwmedia\`
> Imagen / GIF / video para el #menunsfw
\`#delnsfwmedia\`
> Quitar media del #menunsfw
\`#upload\` \`#uploadnsfw\` _<carpeta>_
> Subir imagen/gif/video a una carpeta NSFW
\`#uploadsfw\` \`#subirsfw\` _<carpeta>_
> Subir imagen/gif/video a una carpeta SFW

${DIVISOR}

◈ *SUBBOTS*
Vincula tu propio número como un bot adicional que responde igual que Nexus.

\`#subbots\`
> Ver estado (activado/desactivado) y lista de Sub-Bots conectados
\`#subbots on\` / \`#subbots off\` _(solo owners)_
> Activar o desactivar la función de Sub-Bots — viene desactivada por defecto
\`#serbot\` _[número]_
> Vincular tu número (o el indicado) como Sub-Bot — el código llega por privado. Solo funciona si *#subbots* está activado, y solo puedes tener un Sub-Bot vinculado a la vez.
\`#delbot\`
> Desvincular TU Sub-Bot (envíalo desde esa misma sesión)
\`#delsubbot\` _[número]_ _(solo owners)_
> Forzar la desvinculación de cualquier Sub-Bot
\`#activatebot\` / \`#desactivatebot\`
> Un Sub-Bot puede activar o desactivar el bot en el chat donde está presente, enviándolo desde su propia sesión

_El código expira a los pocos minutos; si no lo usas a tiempo, vuelve a pedirlo con *#serbot*._

${DIVISOR}

◈ El bot está en fase de pruebas — algunas funciones pueden fallar. Seguimos mejorándolo.

Si experimentas un error, repórtalo con *#report*.

_Usa *#menunsfw* para comandos NSFW (+18)._

_Nexus•System — by Alejx_h_`;
}

async function enviarMenu(sock, jid, pushName, groupMetadata, senderJid, categoriaQuery) {
    const senderId = senderJid || jid;
    const senderPhone = (senderId || '').split('@')[0];
    const totalUsers = groupMetadata?.participants?.length ?? '∞';

    let menu;
    if (categoriaQuery) {
        const resultado = construirMenuCategoria(pushName, totalUsers, senderPhone, categoriaQuery);
        if (!resultado) {
            await sock.sendMessage(jid, {
                text: `${ERR} No encontré la categoría *"${categoriaQuery}"*.\n\n*Categorías disponibles:*\n${_listaCategoriasTexto()}`
            });
            return;
        }
        menu = resultado.texto;
    } else {
        menu = construirMenu(pushName, totalUsers, senderPhone);
    }

    const mentions = [];
    try { if (senderId) mentions.push(senderId); } catch {}

    const media = leerMenuMedia();
    if (media) {
        try {
            const buf = fs.readFileSync(media.path);
            const base = { caption: menu, mentions };
            if (media.tipo === 'image') {
                // ── Miniatura clickeable estilo "link preview" ──
                // La tarjeta grande solo la genera WhatsApp cuando el
                // link apunta a una página REAL con meta og:image que de
                // verdad sirve esa imagen (así funcionan Nekos Club/Yuki-Bot).
                // Por eso usamos nuestro propio endpoint /menu-preview en vez
                // de un thumbnail local inventado o del link del canal.
                const dominio = process.env.REPLIT_DEV_DOMAIN || (process.env.REPLIT_DOMAINS || '').split(',')[0];
                const previewUrl = dominio ? `https://${dominio}/menu-preview` : null;

                let linkPreview;
                if (previewUrl) {
                    try {
                        // IMPORTANTE: Baileys solo rellena thumbnailWidth /
                        // thumbnailHeight / mediaKey en el extendedTextMessage
                        // cuando urlInfo.highQualityThumbnail existe (ver
                        // generateWAMessageContent en Utils/messages.js) — y
                        // eso solo se genera pasando `uploadImage`. Sin esos
                        // campos, WhatsApp SIEMPRE renderiza la tarjeta chica
                        // (icono + texto) sin importar la calidad del
                        // jpegThumbnail embebido. Por eso usamos uploadImage
                        // aquí aunque sea más lento: es la única forma de
                        // conseguir la tarjeta grande estilo Nekos Club.
                        linkPreview = await getUrlInfo(previewUrl, {
                            thumbnailWidth: 480,
                            fetchOpts: { timeout: 15000 },
                            uploadImage: sock.waUploadToServer
                        });
                        if (!linkPreview?.jpegThumbnail || !linkPreview?.highQualityThumbnail) {
                            console.error('linkPreview del menú generado sin thumbnail completo:', linkPreview && Object.keys(linkPreview));
                            linkPreview = null;
                        }
                    } catch (e) {
                        console.error('No se pudo generar el linkPreview (uploadImage) del menú:', e.stack || e.message);
                        // Fallback: intentar sin uploadImage (tarjeta chica,
                        // pero al menos con imagen embebida) en vez de nada.
                        try {
                            linkPreview = await getUrlInfo(previewUrl, {
                                thumbnailWidth: 256,
                                fetchOpts: { timeout: 8000 }
                            });
                        } catch (e2) {
                            console.error('Fallback de linkPreview también falló:', e2.stack || e2.message);
                            linkPreview = null;
                        }
                    }
                }

                // NOTA: antes marcábamos el mensaje como "reenviado desde el
                // canal oficial" (isForwarded + forwardedNewsletterMessageInfo)
                // por branding, pero eso hace que WhatsApp reemplace el banner
                // con la UI nativa "Reenviado... Ver canal" e ignore por
                // completo el linkPreview con imagen. Se quita para que el
                // banner grande se muestre.
                const contextInfo = { mentionedJid: mentions };

                if (linkPreview) {
                    // El texto del mensaje DEBE contener literalmente la URL
                    // usada para generar el linkPreview (matched-text) — si no
                    // aparece en el cuerpo, WhatsApp no ancla ninguna tarjeta
                    // y el mensaje se ve como texto plano sin imagen.
                    //
                    // IMPORTANTE: cualquier URL de whatsapp.com (el link del
                    // canal oficial) presente en el mismo texto hace que
                    // WhatsApp active su manejo nativo de "whatsapp.com" y
                    // descarte la tarjeta grande, aunque matched-text apunte
                    // a nuestro propio dominio. Por eso se oculta ese link
                    // (con espacios de ancho cero) SOLO en la versión con
                    // preview de imagen — el texto sigue siendo legible.
                    const menuSinLinkCanal = menu.replace(
                        CANAL_OFICIAL,
                        CANAL_OFICIAL.replace(/\./g, '.\u200b')
                    );
                    const menuConPreview = `${menuSinLinkCanal}\n\n${previewUrl}`;
                    await sock.sendMessage(jid, { text: menuConPreview, linkPreview, contextInfo });
                } else {
                    // Sin preview generado (ej. dominio no disponible): enviar
                    // la imagen adjunta como fallback en vez de texto plano.
                    await sock.sendMessage(jid, { image: buf, caption: menu, mentions });
                }
            } else if (media.tipo === 'gif') {
                await sock.sendMessage(jid, { ...base, video: buf, gifPlayback: true });
            } else if (media.tipo === 'video') {
                await sock.sendMessage(jid, { ...base, video: buf });
            } else {
                await sock.sendMessage(jid, { text: menu, mentions });
            }
            return;
        } catch (err) {
            console.error('Menu media error:', err.message);
        }
    }
    await sock.sendMessage(jid, { text: menu, mentions });
}

async function enviarMenuNsfw(sock, jid, g) {
    const nsfw = g?.nsfw === true;
    const estadoNsfw = nsfw ? `${OK} ACTIVADO` : `${ERR} DESACTIVADO`;
    const hora = formatHora();

    const menu = `> 𖧧 Menú *+18*, contenido explícito para adultos

╭┈ࠢ͜͜┅ࠦ͜͜╾݊͜─ؕ͜─ׄ͜─֬͜─֟͜─֫͜─ׄ͜─ؕ͜─݊͜┈ࠦ͜┅ࠡ͜͜┈࠭͜͜۰۰͜۰
│✿ *ᴅᴇᴠᴇʟᴏᴘᴇʀ ::* Alejx_h
│⸙ *ᴠᴇʀsɪᴏɴ ::* Nexus•System
│○ *ʜᴏʀᴀ ::* ${hora}
│❁ *ɴsғᴡ ::* ${estadoNsfw}
│○ *ᴄᴀɴᴀʟ ::* ${CANAL_OFICIAL}
╰ׅ┈ࠢ͜─ׄ͜─ׄ֟፝͜─ׄ͜─ׄ͜╴ ⋱࣭ ᩴ  ⋮֔   ᩴ ⋰╶͜─ׄ͜─ׄ֟፝͜─ׄ͜─ׄ͜┈ࠢ͜╯ׅ

${DIVISOR}

◈ *IMÁGENES NSFW*
_Envía una imagen +18 al instante según la categoría_

✧ \`#hentai\`
> Hentai general explícito
✧ \`#hentaigif\`
> Hentai en GIF animado
✧ \`#ass\` \`#poto\`
> Culos explícitos
✧ \`#pussy\`
> Coños explícitos
✧ \`#boobs\` \`#tetas\`
> Tetas / paizuri
✧ \`#neko\` \`#nekomimi\`
> Chicas neko (orejas de gato)
✧ \`#loli\`
> Loli (flat chest)
✧ \`#milf\`
> Milfs maduras
✧ \`#ecchi\`
> Lencería y ropa interior
✧ \`#ero\`
> Contenido ero / underwear
✧ \`#creampie\`
> Creampie
✧ \`#trap\`
> Trap / crossdresser
✧ \`#femdom\`
> Dominación femenina

${DIVISOR}
◈ *ACCIONES NSFW* _(soportan @menciones)_
_Con o sin mención — el bot siempre reacciona_

✧ \`#anal\` <mención>
> Hacer un anal
✧ \`#blowjob\` \`#mamada\` \`#bj\` <mención>
> Dar una mamada
✧ \`#boobjob\` <mención>
> Hacer una rusa
✧ \`#cum\` <mención>
> Venirse encima de alguien
✧ \`#cummouth\` <mención>
> Acabar en la boca de alguien
✧ \`#cumshot\` <mención>
> Disparar semen a alguien
✧ \`#fap\` \`#paja\` <mención>
> Hacerse una paja (pensando en alguien)
✧ \`#footjob\` <mención>
> Paja con los pies
✧ \`#fuck\` \`#coger\` <mención>
> Follarte a alguien
✧ \`#grabboobs\` <mención>
> Agarrar las tetas de alguien
✧ \`#grope\` <mención>
> Manosear a alguien
✧ \`#handjob\` <mención>
> Hacer una paja con la mano
✧ \`#lickass\` <mención>
> Lamer el culo de alguien
✧ \`#lickdick\` <mención>
> Lamer un pene
✧ \`#lickpussy\` <mención>
> Comer el coño de alguien
✧ \`#sixnine\` \`#69\` <mención>
> Hacer un 69 con alguien
✧ \`#spank\` \`#nalgada\` <mención>
> Darle una nalgada a alguien
✧ \`#suckboobs\` <mención>
> Chupar las tetas de alguien
✧ \`#undress\` \`#encuerar\` <mención>
> Desnudar a alguien
✧ \`#yuri\` \`#tijeras\` <mención>
> Hacer tijeras con alguien

${DIVISOR}
◈ *IMAGEBOARDS & DESCARGAS NSFW*

◇ _Busca por tags en booruboards_

✧ \`#rule34\` \`#r34\` <tag>
> Busca en Rule34 (imagen)
✧ \`#danbooru\` \`#dbooru\` <tag>
> Busca en Danbooru (imagen)
✧ \`#gelbooru\` \`#gbooru\` \`#booru\` <tag>
> Busca en Gelbooru (imagen)
✧ \`#e621\` <tag>
> Busca en e621 (imagen)
✧ \`#rule34video\` \`#r34video\` <tag>
> Busca en Rule34 (video/GIF)
✧ \`#gelboorovideo\` \`#gboorovideo\` <tag>
> Busca en Gelbooru (video/GIF)
  _Ej: #r34 miku · #danbooru rem · #r34video catgirl_

◇ _Doujins, mangas y vídeos +18_

✧ \`#hitomila\` \`#hitomi\` <link|código>
> Descarga galería/PDF de Hitomi.la
✧ \`#nhentai\` \`#nh\` \`#nhdl\` <ID>
> Descarga un doujin de nhentai
✧ \`#vermangasporno\` \`#vmp\` <URL/ID>
> Descarga un manga de VerMangasPorno
✧ \`#xnxx\` <link>
> Descarga un vídeo de XNXX
✧ \`#pornhub\` \`#ph\` <link>
> Descarga un vídeo de Pornhub

${DIVISOR}
_Todos los comandos NSFW requieren NSFW activado en el grupo._`;

    const nsfwMedia = leerNsfwMenuMedia();
    if (nsfwMedia) {
        try {
            const buf = fs.readFileSync(nsfwMedia.path);
            if (nsfwMedia.tipo === 'image') {
                // Mismo truco de "link preview" grande que usa el #menu
                // normal: apuntamos a una página real con og:image propia.
                const dominio = process.env.REPLIT_DEV_DOMAIN || (process.env.REPLIT_DOMAINS || '').split(',')[0];
                const previewUrl = dominio ? `https://${dominio}/menu18-preview` : null;

                let linkPreview;
                if (previewUrl) {
                    try {
                        linkPreview = await getUrlInfo(previewUrl, {
                            thumbnailWidth: 480,
                            fetchOpts: { timeout: 15000 },
                            uploadImage: sock.waUploadToServer
                        });
                        if (!linkPreview?.jpegThumbnail || !linkPreview?.highQualityThumbnail) {
                            console.error('linkPreview del menú18 generado sin thumbnail completo:', linkPreview && Object.keys(linkPreview));
                            linkPreview = null;
                        }
                    } catch (e) {
                        console.error('No se pudo generar el linkPreview (uploadImage) del menú18:', e.stack || e.message);
                        try {
                            linkPreview = await getUrlInfo(previewUrl, {
                                thumbnailWidth: 256,
                                fetchOpts: { timeout: 8000 }
                            });
                        } catch (e2) {
                            console.error('Fallback de linkPreview (menú18) también falló:', e2.stack || e2.message);
                            linkPreview = null;
                        }
                    }
                }

                if (linkPreview) {
                    // Igual que el #menu normal: cualquier link whatsapp.com
                    // en el mismo texto hace que WhatsApp descarte la tarjeta
                    // grande, por eso se oculta con espacios de ancho cero.
                    const menuSinLinkCanal = menu.replace(
                        CANAL_OFICIAL,
                        CANAL_OFICIAL.replace(/\./g, '.\u200b')
                    );
                    const menuConPreview = `${menuSinLinkCanal}\n\n${previewUrl}`;
                    await sock.sendMessage(jid, { text: menuConPreview, linkPreview });
                } else {
                    await sock.sendMessage(jid, { image: buf, caption: menu });
                }
            } else if (nsfwMedia.tipo === 'gif') {
                await sock.sendMessage(jid, { video: buf, caption: menu, gifPlayback: true });
            } else if (nsfwMedia.tipo === 'video') {
                await sock.sendMessage(jid, { video: buf, caption: menu });
            } else {
                await sock.sendMessage(jid, { text: menu });
            }
            return;
        } catch (err) {
            console.error('[NSFW MENU] Error enviando media:', err.message);
        }
    }
    await sock.sendMessage(jid, { text: menu });
}

// ── Búsqueda de comandos dentro del menú (#searchcmd) ──────────────────────
async function cmdSearchCmd(sock, jid, args) {
    const query = (args || []).join(' ').trim().toLowerCase();
    if (!query) {
        await sock.sendMessage(jid, {
            text: `${INFO} *Uso:* \`#searchcmd <texto>\`\n_Ejemplos:_\n• \`#searchcmd waifu\`\n• \`#searchcmd banco\`\n• \`#searchcmd descargar\``
        });
        return;
    }
    const menuTxt = construirMenu(null, '∞', '0000');
    const lineas = menuTxt.split('\n');

    const resultados = [];
    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        if (!linea.includes('`#')) continue;
        if (linea.toLowerCase().includes(query)) {
            const desc = (lineas[i + 1] || '').trim();
            const descLimpia = desc.startsWith('|') ? desc : '';
            resultados.push(descLimpia ? `${linea.trim()}\n  ${descLimpia}` : linea.trim());
        }
    }
    if (!resultados.length) {
        await sock.sendMessage(jid, {
            text: `${ERR} No encontré comandos con: *${query}*\n_Prueba con otra palabra (ej: bal, rol, sticker, owner, etc.)_`
        });
        return;
    }
    const limit = 40;
    const total = resultados.length;
    const lista = resultados.slice(0, limit).join('\n\n');
    const sufijo = total > limit ? `\n\n_…y ${total - limit} más. Refina tu búsqueda._` : '';
    const respuesta =
        `${INFO} *Resultados para:* "${query}"\n` +
        `◇ Encontré *${total}* comando(s):\n` +
        `${DIVISOR}\n\n${lista}${sufijo}`;
    await sock.sendMessage(jid, { text: respuesta });
}

// ── Comandos de imagen/multimedia del menú (solo owner) ─────────────────────
async function _guardarMenuMediaCmd(sock, jid, senderJid, msg, soloImagen) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el owner puede establecer la media del menú.` });
        return;
    }
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    let tipo = null, mediaMsg = null;
    if (msg.message?.imageMessage) { tipo = 'image'; mediaMsg = msg.message.imageMessage; }
    else if (quoted?.imageMessage) { tipo = 'image'; mediaMsg = quoted.imageMessage; }
    else if (msg.message?.videoMessage) {
        const m = msg.message.videoMessage;
        tipo = m.gifPlayback ? 'gif' : 'video'; mediaMsg = m;
    } else if (quoted?.videoMessage) {
        const m = quoted.videoMessage;
        tipo = m.gifPlayback ? 'gif' : 'video'; mediaMsg = m;
    }
    if (!mediaMsg) {
        const ej = soloImagen ? `${ERR} Responde a una *imagen* con *#setmenuimage*`
            : `${ERR} Responde a una *imagen / gif / video (máx 1 min)* con *#setmultimediamenu*`;
        await sock.sendMessage(jid, { text: ej });
        return;
    }
    if (soloImagen && tipo !== 'image') {
        await sock.sendMessage(jid, { text: `${ERR} Este comando solo acepta *imágenes*. Para gif/video usa *#setmultimediamenu*.` });
        return;
    }
    if (tipo === 'video' || tipo === 'gif') {
        const segs = Number(mediaMsg.seconds || 0);
        if (segs && segs > 60) {
            await sock.sendMessage(jid, { text: `${ERR} El video dura *${segs}s*. El máximo permitido es *60 segundos*.` });
            return;
        }
    }
    try {
        const tipoBaileys = tipo === 'image' ? 'image' : 'video';
        const stream = await downloadContentFromMessage(mediaMsg, tipoBaileys);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        fs.ensureDirSync(path.dirname(MENU_IMAGE_PATH));
        const ext = tipo === 'image' ? 'jpg' : 'mp4';
        const destino = path.join(path.dirname(MENU_IMAGE_PATH), `menu_media.${ext}`);
        borrarMenuMedia();
        fs.writeFileSync(destino, buffer);
        guardarMenuMedia({ tipo, path: destino });
        const tipoTxt = tipo === 'image' ? 'imagen' : (tipo === 'gif' ? 'GIF' : 'video');
        await sock.sendMessage(jid, { text: `${OK} ${tipoTxt} del menú establecida. Se mostrará al usar *#menu*.` });
    } catch (err) {
        await sock.sendMessage(jid, { text: `${ERR} No pude guardar la media: ${err.message}` });
    }
}

async function cmdSetMenuImage(sock, jid, senderJid, msg) {
    return _guardarMenuMediaCmd(sock, jid, senderJid, msg, true);
}
async function cmdSetMultimediaMenu(sock, jid, senderJid, msg) {
    return _guardarMenuMediaCmd(sock, jid, senderJid, msg, false);
}

async function cmdDelMenuImage(sock, jid, senderJid) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: `${ERR} Solo el owner puede eliminar la media del menú.` });
        return;
    }
    if (!leerMenuMedia()) {
        await sock.sendMessage(jid, { text: `${ERR} No hay media de menú configurada.` });
        return;
    }
    borrarMenuMedia();
    await sock.sendMessage(jid, { text: `${OK} Media del menú eliminada.` });
}

module.exports = {
    enviarMenu, enviarMenuNsfw, cmdSetMenuImage, cmdDelMenuImage,
    cmdSetMultimediaMenu, cmdSearchCmd,
    leerNsfwMenuMedia, guardarNsfwMenuMedia, borrarNsfwMenuMedia,
    leerMenuMedia, construirMenuCategoria
};
