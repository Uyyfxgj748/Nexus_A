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

module.exports = {
    cmdTranslate,
    cmdWikipedia,
    cmdSsweb,
    cmdIpLookup,
    cmdCalc
};
