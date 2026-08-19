'use strict';

const axios = require('axios');

// ════════════════════════════════════════════════════
//  TRANSLATE — Google Translate (gratuito, sin API key)
//  Sintaxis: #translate <texto>           → traduce al español
//            #translate <lang> <texto>    → traduce al idioma indicado (código BCP-47)
// ════════════════════════════════════════════════════
async function cmdTranslate(sock, jid, args) {
    if (!args.length) {
        await sock.sendMessage(jid, {
            text: '🌐 *Uso:* `#translate <texto>` (→ español)\no bien `#translate en texto` para especificar destino.'
        });
        return;
    }

    let targetLang = 'es';
    let textoBruto = args.join(' ');

    // Si el primer arg es un código de idioma (2-5 letras, sin espacios)
    if (/^[a-z]{2,5}(-[A-Z]{2,4})?$/.test(args[0]) && args.length > 1) {
        targetLang = args[0];
        textoBruto = args.slice(1).join(' ');
    }

    if (!textoBruto.trim()) {
        await sock.sendMessage(jid, { text: '❌ No ingresaste texto para traducir.' });
        return;
    }

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(textoBruto)}`;
        const res = await axios.get(url, { timeout: 10000 });
        const data = res.data;

        if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('Respuesta inesperada');

        const traducido = data[0].map(x => (Array.isArray(x) ? x[0] : '')).join('');
        const idiomaOrigen = data[2] || 'auto';

        const texto =
`🌐 *Traducción*

📝 *Original* (${idiomaOrigen}):
${textoBruto}

✏️ *Traducido* (${targetLang}):
${traducido}`;

        await sock.sendMessage(jid, { text: texto });
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Error al traducir: ${err.message}` });
    }
}

// ════════════════════════════════════════════════════
//  WIKIPEDIA — API REST de Wikipedia (gratuita)
//  Sintaxis: #wiki <consulta>         → busca en español
//            #wiki en:<consulta>      → busca en inglés
// ════════════════════════════════════════════════════
async function cmdWikipedia(sock, jid, args) {
    if (!args.length) {
        await sock.sendMessage(jid, {
            text: '📖 *Uso:* `#wiki <consulta>`\nPrefija `en:` para buscar en inglés. Ej: `#wiki en:Black hole`'
        });
        return;
    }

    let lang = 'es';
    let consulta = args.join(' ');

    if (consulta.startsWith('en:')) {
        lang = 'en';
        consulta = consulta.slice(3).trim();
    }

    if (!consulta) {
        await sock.sendMessage(jid, { text: '❌ Ingresa una consulta después del prefijo de idioma.' });
        return;
    }

    try {
        // Primero buscamos el título exacto via search API
        const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(consulta)}&limit=1&format=json`;
        const searchRes = await axios.get(searchUrl, { timeout: 10000 });
        const titulos = searchRes.data[1];

        if (!titulos || !titulos.length) {
            await sock.sendMessage(jid, { text: `❌ No se encontraron resultados para *${consulta}* en Wikipedia.` });
            return;
        }

        const titulo = titulos[0];

        // Luego obtenemos el resumen via REST API
        const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titulo)}`;
        const summaryRes = await axios.get(summaryUrl, { timeout: 10000 });
        const page = summaryRes.data;

        const extracto = page.extract
            ? (page.extract.length > 800 ? page.extract.slice(0, 800) + '…' : page.extract)
            : 'Sin descripción disponible.';

        const texto =
`📖 *Wikipedia — ${page.title}*

${extracto}

🔗 ${page.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(titulo)}`}`;

        if (page.thumbnail?.source) {
            try {
                await sock.sendMessage(jid, {
                    image: { url: page.thumbnail.source },
                    caption: texto
                });
                return;
            } catch { /* si falla la imagen, manda texto solo */ }
        }

        await sock.sendMessage(jid, { text: texto });
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Error al consultar Wikipedia: ${err.message}` });
    }
}

// ════════════════════════════════════════════════════
//  SSWEB — Screenshot de página web via thum.io (gratuito)
//  Sintaxis: #ssweb <url>
// ════════════════════════════════════════════════════
async function cmdSsweb(sock, jid, args) {
    const url = (args[0] || '').trim();

    if (!url || !/^https?:\/\/.+/.test(url)) {
        await sock.sendMessage(jid, {
            text: '📸 *Uso:* `#ssweb <url>`\nEjemplo: `#ssweb https://github.com`'
        });
        return;
    }

    await sock.sendMessage(jid, { text: `📸 Tomando screenshot de *${url}*… ⏳` });

    try {
        const screenshotUrl = `https://image.thum.io/get/fullpage/width/1280/${encodeURIComponent(url)}`;
        const res = await axios.get(screenshotUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const buffer = Buffer.from(res.data);

        await sock.sendMessage(jid, {
            image: buffer,
            caption: `📸 *Screenshot de:* ${url}`
        });
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ No se pudo tomar el screenshot: ${err.message}` });
    }
}

// ════════════════════════════════════════════════════
//  IP — Geolocalización via ip-api.com (gratuito)
//  Sintaxis: #ip <dirección IP o dominio>
// ════════════════════════════════════════════════════
async function cmdIpLookup(sock, jid, args) {
    const target = (args[0] || '').trim();

    if (!target) {
        await sock.sendMessage(jid, {
            text: '🌐 *Uso:* `#ip <IP o dominio>`\nEjemplo: `#ip 8.8.8.8`'
        });
        return;
    }

    try {
        const res = await axios.get(
            `http://ip-api.com/json/${encodeURIComponent(target)}?fields=status,message,country,countryCode,regionName,city,district,zip,lat,lon,timezone,isp,org,as,mobile,hosting,query`,
            { timeout: 10000 }
        );
        const d = res.data;

        if (d.status !== 'success') {
            await sock.sendMessage(jid, { text: `❌ No se pudo geolocalizar *${target}*: ${d.message || 'Sin respuesta'}` });
            return;
        }

        const texto =
`🌐 *Geolocalización de IP*

🔍 *IP/Host:* ${d.query}
🌍 *País:* ${d.country} (${d.countryCode})
🏙️ *Región:* ${d.regionName}
🏘️ *Ciudad:* ${d.city}${d.district ? ` — ${d.district}` : ''}
📮 *Código postal:* ${d.zip || 'N/A'}
🕐 *Timezone:* ${d.timezone}
📡 *ISP:* ${d.isp}
🏢 *Organización:* ${d.org || 'N/A'}
📶 *AS:* ${d.as || 'N/A'}
📱 *Móvil:* ${d.mobile ? 'Sí' : 'No'}
🖥️ *Hosting/VPN:* ${d.hosting ? 'Sí' : 'No'}
📍 *Coords:* ${d.lat}, ${d.lon}
> 🔗 https://maps.google.com/maps?q=${d.lat},${d.lon}`;

        await sock.sendMessage(jid, { text: texto });
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Error al consultar la IP: ${err.message}` });
    }
}

// ════════════════════════════════════════════════════
//  CALCULADORA — Evaluador matemático seguro
//  Soporta: + - * / ^ % ()  y  constantes: pi, e
//  Sintaxis: #calc <expresión>
// ════════════════════════════════════════════════════
function evaluarExpresion(expr) {
    // Normalizar
    let e = expr
        .replace(/\s+/g, '')
        .replace(/[×x]/g, '*')
        .replace(/[÷]/g, '/')
        .replace(/\bpi\b/gi, String(Math.PI))
        .replace(/\be\b/gi, String(Math.E))
        .replace(/\^/g, '**');

    // Solo caracteres seguros
    if (!/^[\d+\-*/%.() ]+$/.test(e.replace(/\*\*/g, '__POW__').replace(/__POW__/g, '**'))) {
        throw new Error('Expresión contiene caracteres no permitidos');
    }

    // Longitud máxima
    if (e.length > 200) throw new Error('Expresión demasiado larga');

    // Paréntesis balanceados
    let depth = 0;
    for (const ch of e) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (depth < 0) throw new Error('Paréntesis no balanceados');
    }
    if (depth !== 0) throw new Error('Paréntesis no balanceados');

    // Evaluar de forma segura
    // eslint-disable-next-line no-new-func
    const resultado = Function(`"use strict"; return (${e})`)();

    if (typeof resultado !== 'number' || !isFinite(resultado)) {
        throw new Error('Resultado inválido (división por cero o desbordamiento)');
    }

    // Redondear si hay punto flotante espurio
    const redondeado = Math.round(resultado * 1e10) / 1e10;
    return redondeado;
}

async function cmdCalc(sock, jid, args) {
    const expresion = args.join(' ').trim();

    if (!expresion) {
        await sock.sendMessage(jid, {
            text: '🔢 *Uso:* `#calc <expresión>`\nEjemplo: `#calc (15 * 3 + 7) / 2`\nSoporta: `+ - * / ^ % ()` y constantes `pi`, `e`'
        });
        return;
    }

    try {
        const resultado = evaluarExpresion(expresion);
        const exprLegible = expresion
            .replace(/\*\*/g, '^')
            .replace(/Math\.PI/g, 'π')
            .replace(/Math\.E/g, 'e');

        await sock.sendMessage(jid, {
            text: `🔢 *Calculadora*\n\n📝 *Expresión:* \`${exprLegible}\`\n💡 *Resultado:* *${resultado.toLocaleString('es')}*`
        });
    } catch (err) {
        await sock.sendMessage(jid, {
            text: `❌ Error en la expresión: ${err.message}\n_Usa solo números, operadores y paréntesis._`
        });
    }
}

// ════════════════════════════════════════════════════
//  QR — Genera O lee un código QR
//  Generar: #qr <texto o URL>
//  Leer:    responde a una imagen con #qr (sin texto)
// ════════════════════════════════════════════════════
async function cmdQr(sock, jid, msg, args) {
    const texto = args.join(' ').trim();
    const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imagenDirecta = msg?.message?.imageMessage;
    const imagenCitada  = quoted?.imageMessage;

    // ── MODO LEER: imagen citada o enviada junto al comando ──────────────
    if (!texto && (imagenDirecta || imagenCitada)) {
        try {
            await sock.sendMessage(jid, { text: '🔍 _Leyendo QR de la imagen..._' });
            const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
            const msgContent = imagenDirecta || imagenCitada;
            const stream = await downloadContentFromMessage(msgContent, 'image');
            let imgBuffer = Buffer.from([]);
            for await (const chunk of stream) imgBuffer = Buffer.concat([imgBuffer, chunk]);

            const sharp = require('sharp');
            const { data, info } = await sharp(imgBuffer)
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true });

            const jsQR = require('jsqr');
            const result = jsQR(data, info.width, info.height);

            if (!result) {
                await sock.sendMessage(jid, { text: '❌ No se encontró ningún código QR en la imagen.\n_Asegúrate de que el QR sea nítido y visible._' });
                return;
            }
            await sock.sendMessage(jid, {
                text: `✅ *QR decodificado:*\n\n\`\`\`${result.data}\`\`\``
            });
        } catch (err) {
            await sock.sendMessage(jid, { text: `❌ Error al leer el QR: ${err.message}` });
        }
        return;
    }

    // ── MODO GENERAR: texto como argumento ───────────────────────────────
    if (!texto) {
        await sock.sendMessage(jid, {
            text: '📱 *QR — Generador y Lector*\n\n' +
                  '*Generar QR:* `#qr <texto o link>`\n' +
                  '_Ejemplo:_ `#qr https://github.com`\n\n' +
                  '*Leer QR:* responde a una imagen QR con `#qr` (sin texto)\n' +
                  '_También funciona si envías la imagen junto al comando._'
        });
        return;
    }

    try {
        const QRCode = require('qrcode');
        const buffer = await QRCode.toBuffer(texto, {
            width: 512, margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
        });
        await sock.sendMessage(jid, {
            image: buffer,
            caption: `📱 *Código QR generado*\n\n📝 _${texto.length > 60 ? texto.slice(0, 57) + '...' : texto}_`
        });
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ No se pudo generar el QR: ${err.message}` });
    }
}

// ════════════════════════════════════════════════════
//  MANGA — Info de mangas vía API de Jikan (MyAnimeList)
//  Sintaxis: #manga <nombre>
// ════════════════════════════════════════════════════
async function cmdManga(sock, jid, args) {
    const query = args.join(' ').trim();
    if (!query) {
        await sock.sendMessage(jid, {
            text: '📚 *Buscador de Manga*\n\n*Uso:* `#manga <nombre>`\n_Ejemplo:_ `#manga Berserk`\n\n_Datos proporcionados por MyAnimeList (Jikan API)_'
        });
        return;
    }
    try {
        await sock.sendMessage(jid, { text: '🔍 _Buscando manga..._' });
        const res = await axios.get(
            `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(query)}&limit=1`,
            { timeout: 12000 }
        );
        const manga = res.data?.data?.[0];
        if (!manga) {
            await sock.sendMessage(jid, { text: `❌ No se encontró ningún manga con "*${query}*".\n_Prueba con otro nombre o en inglés._` });
            return;
        }

        const score  = manga.score ? `⭐ ${manga.score}/10 _(${(manga.scored_by || 0).toLocaleString('es')} votos)_` : 'N/A';
        const generos = manga.genres?.map(g => g.name).join(', ') || 'N/A';
        const autores = manga.authors?.map(a => a.name).join(', ') || 'N/A';
        const sinopsis = manga.synopsis
            ? (manga.synopsis.length > 600 ? manga.synopsis.slice(0, 597) + '...' : manga.synopsis)
            : '_Sin sinopsis disponible._';
        const titulo = manga.title_english || manga.title;
        const tituloAlt = manga.title_japanese ? `_(${manga.title_japanese})_` : '';

        const texto =
`📚 *${titulo}* ${tituloAlt}

◇ *Tipo:* ${manga.type || 'N/A'}
◇ *Estado:* ${manga.status || 'N/A'}
◇ *Capítulos:* ${manga.chapters || '?'} │ *Volúmenes:* ${manga.volumes || '?'}
◇ *Puntuación:* ${score}
◇ *Popularidad:* #${manga.popularity || '?'} │ *Ranking:* #${manga.rank || '?'}
◇ *Géneros:* ${generos}
◇ *Autores:* ${autores}
◇ *Publicado:* ${manga.published?.string || 'N/A'}

📝 *Sinopsis:*
${sinopsis}

🔗 ${manga.url}`;

        const imgUrl = manga.images?.jpg?.large_image_url || manga.images?.jpg?.image_url;
        if (imgUrl) {
            await sock.sendMessage(jid, { image: { url: imgUrl }, caption: texto });
        } else {
            await sock.sendMessage(jid, { text: texto });
        }
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ Error al buscar el manga: ${err.message}` });
    }
}

// ══════════════════════════════════════════
//  EMOJI KITCHEN (#emojimix)
//  Mezcla dos emojis usando la API de Tenor Emoji Kitchen
// ══════════════════════════════════════════
const { H, SH, FI, FC, OK, ERR, WARN, INFO, DIV } = require('./style');

const TENOR_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';

async function cmdEmojimix(sock, jid, args) {
    const input = args.join(' ').trim();
    const separador = input.includes('&') ? '&' : input.includes('+') ? '+' : null;
    if (!separador || !input.includes(separador)) {
        await sock.sendMessage(jid, {
            text: `${WARN} Uso: *#emojimix* emoji1*&*emoji2\n_Ejemplo: #emojimix 🐱&🔥_`
        });
        return;
    }

    const [e1, e2] = input.split(separador).map(s => s.trim());
    if (!e1 || !e2) {
        await sock.sendMessage(jid, { text: `${ERR} Debes proporcionar dos emojis separados por &.` });
        return;
    }

    const query = `${encodeURIComponent(e1)}_${encodeURIComponent(e2)}`;
    const url = `https://tenor.googleapis.com/v2/featured?key=${TENOR_KEY}&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v5&q=${query}`;

    let results;
    try {
        const res = await axios.get(url);
        results = res.data?.results;
    } catch {
        await sock.sendMessage(jid, { text: `${ERR} No se pudo conectar a Emoji Kitchen.` });
        return;
    }

    if (!results?.length) {
        await sock.sendMessage(jid, {
            text: `${WARN} No existe mezcla para ${e1} + ${e2}.\n_Intenta con otra combinacion._`
        });
        return;
    }

    // Enviar hasta 3 resultados como stickers
    const limite = Math.min(results.length, 3);
    for (let i = 0; i < limite; i++) {
        const imgUrl = results[i].url;
        try {
            const img = await axios.get(imgUrl, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(img.data);
            await sock.sendMessage(jid, {
                sticker: buffer
            });
        } catch { /* si una falla, continua con la siguiente */ }
    }
}

// ══════════════════════════════════════════
//  CORREO TEMPORAL (#tempmail)
//  Crea un email desechable usando dropmail.me
// ══════════════════════════════════════════
// sesiones en memoria: senderJid -> { email, id, expiresAt }
const _tmSesiones = new Map();

async function cmdTempmail(sock, jid, senderJid, args) {
    const sub = (args[0] || '').toLowerCase();

    // Verificar inbox de sesion existente
    if (sub === 'inbox' || sub === 'bandeja' || sub === 'ver') {
        const ses = _tmSesiones.get(senderJid);
        if (!ses) {
            await sock.sendMessage(jid, {
                text: `${WARN} No tienes un correo activo.\nUsa *#tempmail* para crear uno.`
            });
            return;
        }
        await sock.sendMessage(jid, { text: `${INFO} Revisando bandeja de *${ses.email}*...` });
        try {
            const qUrl = `https://dropmail.me/api/graphql/nexus-bot?query=query(%24id%3AID!)%7Bsession(id%3A%24id)%7Baddresses%7Baddress%7D%2Cmails%7BfromAddr%2CheaderSubject%2Ctext%7D%7D%7D&variables=%7B%22id%22%3A%22${ses.id}%22%7D`;
            const res  = await axios.get(qUrl);
            const mails = res.data?.data?.session?.mails || [];
            if (!mails.length) {
                await sock.sendMessage(jid, {
                    text: `${INFO} Bandeja vacia en *${ses.email}*.\n_Espera unos segundos y vuelve a revisar._`
                });
                return;
            }
            let txt = `${H('Bandeja — ' + ses.email)}\n${DIV}\n\n`;
            mails.slice(-5).forEach((m, i) => {
                txt += `${FC} Correo ${i + 1}\n`;
                txt += `De: *${m.fromAddr || '—'}*\n`;
                txt += `Asunto: *${m.headerSubject || '(sin asunto)'}*\n`;
                txt += `Contenido:\n_${(m.text || '').slice(0, 400)}_\n\n`;
            });
            await sock.sendMessage(jid, { text: txt.trim() });
        } catch {
            await sock.sendMessage(jid, { text: `${ERR} No pude consultar la bandeja. Intenta de nuevo.` });
        }
        return;
    }

    // Crear nueva sesion (o mostrar la existente)
    if (_tmSesiones.has(senderJid)) {
        const ses = _tmSesiones.get(senderJid);
        await sock.sendMessage(jid, {
            text: `${INFO} Ya tienes un correo activo:\n\n${FI} *${ses.email}*\n\nUsa *#tempmail inbox* para revisar mensajes.\nUsa *#tempmail nuevo* para crear uno distinto.`
        });
        if (sub !== 'nuevo' && sub !== 'new') return;
    }

    await sock.sendMessage(jid, { text: `${INFO} Generando correo temporal...` });
    try {
        const mutation = 'https://dropmail.me/api/graphql/nexus-bot?query=mutation%7BintroduceSession%7Bid%2CexpiresAt%2Caddresses%7Baddress%7D%7D%7D';
        const res  = await axios.get(mutation);
        const data = res.data?.data?.introduceSession;
        if (!data) throw new Error('sin datos');

        const email = data.addresses[0]?.address;
        const id    = data.id;
        const exp   = data.expiresAt;

        _tmSesiones.set(senderJid, { email, id, expiresAt: exp });

        // Limpiar despues de 10 min
        setTimeout(() => _tmSesiones.delete(senderJid), 10 * 60 * 1000);

        await sock.sendMessage(jid, {
            text: `${H('Correo Temporal')}\n${DIV}\n\n${FI} *${email}*\n\n_Expira en aprox. 10 minutos._\nUsa *#tempmail inbox* para ver mensajes recibidos.`
        });
    } catch {
        await sock.sendMessage(jid, { text: `${ERR} No pude crear el correo temporal. Intenta de nuevo.` });
    }
}

// ══════════════════════════════════════════
//  INSPECCIONAR GRUPO POR LINK (#inspect)
//  Muestra info de un grupo sin unirse
// ══════════════════════════════════════════
async function cmdInspectGrupo(sock, jid, args) {
    const input = args.join(' ').trim();
    const match = input.match(/chat\.whatsapp\.com\/(?:invite\/)?([0-9A-Za-z]{20,24})/i);
    if (!match) {
        await sock.sendMessage(jid, {
            text: `${WARN} Uso: *#inspect* <link del grupo>\n_Ejemplo: #inspect https://chat.whatsapp.com/XXXXXX_`
        });
        return;
    }
    const code = match[1];
    try {
        const info = await sock.groupGetInviteInfo(code);
        if (!info) throw new Error('sin respuesta');

        const creacion = info.creation
            ? new Date(info.creation * 1000).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';
        const ownerNum = info.owner ? info.owner.split('@')[0] : '—';
        const total    = info.participants?.length ?? '—';

        let txt = `${H('Inspeccion de Grupo')}\n${DIV}\n\n`;
        txt += `${FC} Nombre: *${info.subject || '—'}*\n`;
        txt += `${FC} Participantes: *${total}*\n`;
        txt += `${FC} Creado: *${creacion}*\n`;
        txt += `${FC} Owner: *+${ownerNum}*\n`;
        if (info.desc) txt += `${FC} Descripcion:\n_${info.desc}_\n`;
        txt += `\n${FI} Link: https://chat.whatsapp.com/${code}`;

        // Intentar foto de perfil del grupo
        let pp;
        try { pp = await sock.profilePictureUrl(info.id, 'image'); } catch {}

        if (pp) {
            await sock.sendMessage(jid, {
                image: { url: pp },
                caption: txt
            });
        } else {
            await sock.sendMessage(jid, { text: txt });
        }
    } catch (err) {
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('invalid') || msg.includes('404') || msg.includes('not-found')) {
            await sock.sendMessage(jid, { text: `${ERR} Link invalido o el grupo ya no existe.` });
        } else {
            await sock.sendMessage(jid, { text: `${ERR} No pude obtener info del grupo.\n_${err.message}_` });
        }
    }
}

// ══════════════════════════════════════════
//  BUSCAR EN NPM (#npmjs)
//  Consulta el registro publico de npm
// ══════════════════════════════════════════
async function cmdNpmjs(sock, jid, args) {
    const query = args.join(' ').trim();
    if (!query) {
        await sock.sendMessage(jid, { text: `${WARN} Uso: *#npmjs* <nombre del paquete>` });
        return;
    }
    try {
        const res  = await axios.get(`https://registry.npmjs.com/-/v1/search?text=${encodeURIComponent(query)}&size=5`);
        const pkgs = res.data?.objects;
        if (!pkgs?.length) {
            await sock.sendMessage(jid, { text: `${WARN} No se encontraron paquetes para *${query}*.` });
            return;
        }
        let txt = `${H('npm — ' + query)}\n${DIV}\n\n`;
        for (const { package: p } of pkgs) {
            txt += `${FC} *${p.name}* v${p.version}\n`;
            if (p.description) txt += `_${p.description.slice(0, 100)}_\n`;
            txt += `${FI} ${p.links?.npm || 'https://npmjs.com/package/' + p.name}\n\n`;
        }
        await sock.sendMessage(jid, { text: txt.trim() });
    } catch {
        await sock.sendMessage(jid, { text: `${ERR} No pude conectarme al registro de npm.` });
    }
}

// ══════════════════════════════════════════
//  IDENTIFICAR CANCION (#shazam)
//  Reconoce audio/video usando node-shazam
// ══════════════════════════════════════════
const path_sh = require('path');
const os_sh   = require('os');
const fs_sh   = require('fs-extra');
const { downloadContentFromMessage: dlc_sh } = require('@whiskeysockets/baileys');

async function cmdShazam(sock, jid, msg) {
    // Detectar audio o video en el mensaje directo o citado
    const ctx    = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    const audioMsg = msg.message?.audioMessage || quoted?.audioMessage;
    const videoMsg = msg.message?.videoMessage  || quoted?.videoMessage;
    const target   = audioMsg ?? videoMsg;

    if (!target) {
        await sock.sendMessage(jid, {
            text: `${WARN} Responde a un audio o video con *#shazam* para identificar la cancion.`
        });
        return;
    }

    await sock.sendMessage(jid, { text: `${INFO} Identificando cancion...` });

    const tipo  = audioMsg ? 'audio' : 'video';
    const ext   = audioMsg ? 'mp3' : 'mp4';
    const id    = Date.now();
    const tmpDir = os_sh.tmpdir();
    const tmpPath = path_sh.join(tmpDir, `shazam_${id}.${ext}`);

    try {
        // Descargar
        const stream = await dlc_sh(target, tipo);
        const chunks = [];
        for await (const c of stream) chunks.push(c);
        const buffer = Buffer.concat(chunks);
        await fs_sh.writeFile(tmpPath, buffer);

        // Importar node-shazam (ESM) dinamicamente
        const { Shazam } = await import('node-shazam');
        const shazam = new Shazam();

        const result = tipo === 'audio'
            ? await shazam.fromFilePath(tmpPath, false, 'en')
            : await shazam.fromVideoFile(tmpPath, false, 'en');

        if (!result?.track) {
            await sock.sendMessage(jid, { text: `${WARN} No se pudo identificar la cancion.` });
            return;
        }

        const { title, subtitle, genres, images, sections } = result.track;
        const letra = sections?.find(s => s.type === 'LYRICS')?.text?.slice(0, 3).join('\n') || null;

        let txt = `${H('Cancion Identificada')}\n${DIV}\n\n`;
        txt += `${FC} Titulo: *${title || '—'}*\n`;
        txt += `${FC} Artista: *${subtitle || '—'}*\n`;
        txt += `${FC} Genero: *${genres?.primary || '—'}*\n`;
        if (letra) txt += `\n${FI} Letra (fragmento):\n_${letra}_`;

        const coverUrl = images?.coverart;
        if (coverUrl) {
            await sock.sendMessage(jid, { image: { url: coverUrl }, caption: txt });
        } else {
            await sock.sendMessage(jid, { text: txt });
        }
    } catch (err) {
        const msg_err = String(err?.message || '').toLowerCase();
        if (msg_err.includes('not found') || msg_err.includes('unrecognized')) {
            await sock.sendMessage(jid, { text: `${WARN} No se pudo identificar la cancion.` });
        } else {
            await sock.sendMessage(jid, { text: `${ERR} Error al usar Shazam: ${err.message}` });
        }
    } finally {
        try { await fs_sh.remove(tmpPath); } catch {}
    }
}

module.exports = {
    cmdTranslate,
    cmdWikipedia,
    cmdSsweb,
    cmdIpLookup,
    cmdCalc,
    cmdQr,
    cmdManga,
    cmdEmojimix,
    cmdTempmail,
    cmdInspectGrupo,
    cmdNpmjs,
    cmdShazam
};
