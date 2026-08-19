// ══════════════════════════════════════════════════════════════════════════
//  STICKERS DE TEXTO: #brat, #ttp, #attp, #wm
//  Usa @napi-rs/canvas para renderizar texto y reutiliza el pipeline de
//  conversión a webp/EXIF de sticker.js.
// ══════════════════════════════════════════════════════════════════════════
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');

const sharp = require('sharp');
const { imagenAWebpFull, inyectarExif, getBuffer } = require('./sticker');
const { getUsuario } = require('./database');

// ── Registro de fuentes (una sola vez) ──────────────────────────────────────
const FONT_PATH       = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const BRAT_FONT_PATH  = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';   // regular, sin bold
const EMOJI_FONT_PATH = path.join(__dirname, '..', 'fonts', 'NotoColorEmoji.ttf');
let fontRegistered = false;
let bratFontRegistered = false;
let emojiFontRegistered = false;
function ensureFont() {
    if (fontRegistered) return;
    try { GlobalFonts.registerFromPath(FONT_PATH, 'NexusSans'); } catch (e) {
        console.error('No se pudo registrar la fuente para stickers de texto:', e.message);
    }
    fontRegistered = true;
}
function ensureBratFont() {
    if (bratFontRegistered) return;
    try { GlobalFonts.registerFromPath(BRAT_FONT_PATH, 'NexusBrat'); } catch (e) {
        console.error('No se pudo registrar la fuente brat:', e.message);
    }
    bratFontRegistered = true;
}
function ensureEmojiFont() {
    if (emojiFontRegistered) return;
    try { GlobalFonts.registerFromPath(EMOJI_FONT_PATH, 'NexusEmoji'); } catch (e) {
        console.error('No se pudo registrar la fuente de emojis para stickers de texto:', e.message);
    }
    emojiFontRegistered = true;
}

function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const w of words) {
        const test = current ? `${current} ${w}` : w;
        if (current && ctx.measureText(test).width > maxWidth) {
            lines.push(current);
            current = w;
        } else {
            current = test;
        }
    }
    if (current) lines.push(current);
    return lines;
}

// ── Utilidades para texto con emojis (fuente separada a color) ─────────────
// Cubre emojis simples, secuencias con ZWJ (👨‍👩‍👧), variation selector (️)
// y banderas (regional indicators).
const EMOJI_RUN_RE = /(?:\p{Regional_Indicator}{2})|(?:(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F|\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})\uFE0F?)*)/gu;

function segmentEmoji(text) {
    const segments = [];
    let lastIndex = 0;
    let m;
    EMOJI_RUN_RE.lastIndex = 0;
    while ((m = EMOJI_RUN_RE.exec(text))) {
        if (m.index > lastIndex) segments.push({ text: text.slice(lastIndex, m.index), emoji: false });
        segments.push({ text: m[0], emoji: true });
        lastIndex = m.index + m[0].length;
    }
    if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), emoji: false });
    return segments;
}

function measureMixedWidth(ctx, text, textFont, emojiFont) {
    let w = 0;
    for (const seg of segmentEmoji(text)) {
        ctx.font = seg.emoji ? emojiFont : textFont;
        w += ctx.measureText(seg.text).width;
    }
    return w;
}

// Dibuja texto mixto y devuelve el ancho total dibujado.
// Usa baseline alphabetic en ambos tipos para alineación vertical correcta.
function drawMixedText(ctx, text, x, y, textFont, emojiFont, textColor) {
    let cx = x;
    for (const seg of segmentEmoji(text)) {
        ctx.font = seg.emoji ? emojiFont : textFont;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = seg.emoji ? '#000000' : textColor;
        ctx.fillText(seg.text, cx, y);
        cx += ctx.measureText(seg.text).width;
    }
    return cx - x;
}

function wrapTextMixed(measureWidth, text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const w of words) {
        const test = current ? `${current} ${w}` : w;
        if (current && measureWidth(test) > maxWidth) {
            lines.push(current);
            current = w;
        } else {
            current = test;
        }
    }
    if (current) lines.push(current);
    return lines;
}

// ── Helper: dibuja una línea con justificación completa (solo texto plano) ──
function drawJustifiedLine(ctx, line, x, y, maxWidth) {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length <= 1) {
        ctx.fillText(line, x, y);
        return;
    }
    const totalWordWidth = words.reduce((sum, w) => sum + ctx.measureText(w).width, 0);
    const spaceWidth = (maxWidth - totalWordWidth) / (words.length - 1);
    let cx = x;
    for (const word of words) {
        ctx.fillText(word, cx, y);
        cx += ctx.measureText(word).width + spaceWidth;
    }
}

// ── Helper: dibuja línea justificada con emojis ──────────────────────────────
function drawJustifiedMixedLine(ctx, laidOutWords, wordWidths, x, y, maxWidth, isLast, textFont, emojiFont, textColor) {
    if (laidOutWords.length === 0) return;
    const totalWordWidth = wordWidths.reduce((a, b) => a + b, 0);
    const spaceWidth = (!isLast && laidOutWords.length > 1)
        ? (maxWidth - totalWordWidth) / (laidOutWords.length - 1)
        : measureMixedWidth(ctx, ' ', textFont, emojiFont);
    let cx = x;
    for (let i = 0; i < laidOutWords.length; i++) {
        drawMixedText(ctx, laidOutWords[i].word, cx, y, textFont, emojiFont, textColor);
        cx += wordWidths[i];
        if (i < laidOutWords.length - 1) cx += spaceWidth;
    }
}

// ══════════════════════════════════════════
//  #brat — texto en bloque, estilo minimalista (fondo verde lima)
// ══════════════════════════════════════════
function renderBratCard(texto) {
    ensureBratFont();
    const size = 512;
    const bg = '#8ace00';
    const fg = '#000000';
    const margin = 20;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const maxWidth = size - margin * 2;
    const maxHeight = size - margin * 2;
    let fontSize = 80;
    let lines = [texto.toLowerCase()];
    while (fontSize > 20) {
        ctx.font = `${fontSize}px NexusBrat`;
        lines = wrapText(ctx, texto.toLowerCase(), maxWidth);
        const lineHeight = fontSize * 1.1;
        const fits = lines.every(l => ctx.measureText(l).width <= maxWidth);
        if (fits && lines.length * lineHeight <= maxHeight) break;
        fontSize -= 2;
    }

    ctx.font = `${fontSize}px NexusBrat`;
    ctx.fillStyle = fg;
    const lineHeight = fontSize * 1.1;
    const totalHeight = lines.length * lineHeight;
    let y = (size - totalHeight) / 2 + fontSize * 0.82;

    for (let i = 0; i < lines.length; i++) {
        const isLast = i === lines.length - 1;
        if (!isLast && lines.length > 1) {
            // Justificar líneas intermedias
            drawJustifiedLine(ctx, lines[i], margin, y, maxWidth);
        } else {
            // Centrar la última línea (o línea única)
            ctx.font = `${fontSize}px NexusBrat`;
            const lw = ctx.measureText(lines[i]).width;
            ctx.fillText(lines[i], (size - lw) / 2, y);
        }
        y += lineHeight;
    }

    return canvas.toBuffer('image/png');
}

async function cmdBrat(sock, jid, args) {
    const texto = args.join(' ').trim();
    if (!texto) {
        await sock.sendMessage(jid, { text: '❌ Escribe el texto para el sticker.\nEj: *#brat hola mundo*' });
        return;
    }
    try {
        const png = renderBratCard(texto.slice(0, 200));
        const blurred = await sharp(png).blur(1.2).toBuffer();
        const webp = await imagenAWebpFull(blurred);
        const final = await inyectarExif(webp, texto.slice(0, 30));
        await sock.sendMessage(jid, { sticker: final });
    } catch (e) {
        console.error('Error #brat:', e.message);
        await sock.sendMessage(jid, { text: '❌ No pude generar el sticker.' });
    }
}

// ══════════════════════════════════════════
//  #brat2 — igual que #brat pero fondo blanco / texto negro, con emojis
//  #brat3 — igual que #brat2 pero animado, revelando palabra por palabra
// ══════════════════════════════════════════
const BRAT2_BG = '#ffffff';
const BRAT2_FG = '#000000';
const BRAT2_SIZE = 512;
const BRAT2_MARGIN = 20;

// Calcula el tamaño de fuente óptimo y organiza las palabras en líneas con
// su posición X ya resuelta (justificada), para poder revelarlas
// progresivamente sin que el layout cambie entre cuadros (#brat3).
function layoutBrat2(ctx, texto) {
    ensureBratFont();
    ensureEmojiFont();
    const maxWidth = BRAT2_SIZE - BRAT2_MARGIN * 2;
    const maxHeight = BRAT2_SIZE - BRAT2_MARGIN * 2;
    const textoLower = texto.toLowerCase();

    let fontSize = 80;
    let wrappedLines = [textoLower];
    while (fontSize > 20) {
        const textFont = `${fontSize}px NexusBrat`;
        const emojiFont = `${fontSize}px NexusEmoji`;
        const measure = (t) => measureMixedWidth(ctx, t, textFont, emojiFont);
        wrappedLines = wrapTextMixed(measure, textoLower, maxWidth);
        const lineHeight = fontSize * 1.1;
        const fits = wrappedLines.every(l => measure(l) <= maxWidth);
        if (fits && wrappedLines.length * lineHeight <= maxHeight) break;
        fontSize -= 4;
    }

    const textFont = `${fontSize}px NexusBrat`;
    const emojiFont = `${fontSize}px NexusEmoji`;
    const spaceWidth = measureMixedWidth(ctx, ' ', textFont, emojiFont);
    const lineHeight = fontSize * 1.1;

    let globalIndex = 0;
    const lines = wrappedLines.map((lineText, lineIdx) => {
        const isLast = lineIdx === wrappedLines.length - 1;
        const words = lineText.split(/\s+/).filter(Boolean);

        // Calcular ancho de cada palabra
        const wordWidths = words.map(w => measureMixedWidth(ctx, w, textFont, emojiFont));
        const totalWordWidth = wordWidths.reduce((a, b) => a + b, 0);

        // Espaciado justificado (última línea usa espacio normal)
        const justifiedSpace = (!isLast && words.length > 1)
            ? (maxWidth - totalWordWidth) / (words.length - 1)
            : spaceWidth;

        // Posiciones X de cada palabra con el espaciado calculado
        let cx = 0;
        const laidOutWords = words.map((word, i) => {
            const w = { word, x: cx, index: globalIndex, width: wordWidths[i] };
            cx += wordWidths[i] + (i < words.length - 1 ? justifiedSpace : 0);
            globalIndex++;
            return w;
        });

        return { words: laidOutWords, isLast };
    });

    return { fontSize, textFont, emojiFont, lineHeight, lines, totalWords: globalIndex };
}

function renderBrat2Frame(layout, wordsShown = Infinity) {
    const canvas = createCanvas(BRAT2_SIZE, BRAT2_SIZE);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = BRAT2_BG;
    ctx.fillRect(0, 0, BRAT2_SIZE, BRAT2_SIZE);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const { lineHeight, lines, textFont, emojiFont, fontSize } = layout;
    const maxWidth = BRAT2_SIZE - BRAT2_MARGIN * 2;
    const totalHeight = lines.length * lineHeight;
    let y = (BRAT2_SIZE - totalHeight) / 2 + fontSize * 0.82;

    for (const line of lines) {
        if (line.isLast) {
            // Centrar la última línea (o línea única)
            const lineWidth = line.words.reduce((sum, w) => {
                if (w.index >= wordsShown) return sum;
                return sum + w.width;
            }, 0);
            const visibleWords = line.words.filter(w => w.index < wordsShown);
            const spaceW = visibleWords.length > 1
                ? measureMixedWidth(ctx, ' ', textFont, emojiFont)
                : 0;
            const totalW = lineWidth + spaceW * Math.max(0, visibleWords.length - 1);
            let cx = (BRAT2_SIZE - totalW) / 2;
            for (const w of visibleWords) {
                drawMixedText(ctx, w.word, cx, y, textFont, emojiFont, BRAT2_FG);
                cx += w.width + spaceW;
            }
        } else {
            // Palabras con posición X pre-justificada
            for (const w of line.words) {
                if (w.index < wordsShown) {
                    drawMixedText(ctx, w.word, BRAT2_MARGIN + w.x, y, textFont, emojiFont, BRAT2_FG);
                }
            }
        }
        y += lineHeight;
    }

    return canvas.toBuffer('image/png');
}

async function cmdBrat2(sock, jid, args) {
    const texto = args.join(' ').trim();
    if (!texto) {
        await sock.sendMessage(jid, { text: '❌ Escribe el texto para el sticker.\nEj: *#brat2 hola 👋*' });
        return;
    }
    try {
        const measureCtx = createCanvas(10, 10).getContext('2d');
        const layout = layoutBrat2(measureCtx, texto.slice(0, 200));
        const png = renderBrat2Frame(layout);
        const blurred = await sharp(png).blur(1.2).toBuffer();
        const webp = await imagenAWebpFull(blurred);
        const final = await inyectarExif(webp, texto.slice(0, 30));
        await sock.sendMessage(jid, { sticker: final });
    } catch (e) {
        console.error('Error #brat2:', e.message);
        await sock.sendMessage(jid, { text: '❌ No pude generar el sticker.' });
    }
}

async function cmdBrat3(sock, jid, args) {
    const texto = args.join(' ').trim();
    if (!texto) {
        await sock.sendMessage(jid, { text: '❌ Escribe el texto para el sticker.\nEj: *#brat3 hola mundo 🔥*' });
        return;
    }
    try {
        await sock.sendMessage(jid, { text: '⚙️ Generando sticker animado...' });
        const measureCtx = createCanvas(10, 10).getContext('2d');
        const layout = layoutBrat2(measureCtx, texto.slice(0, 200));

        const HOLD_FRAMES = 10;
        const totalFrames = layout.totalWords + HOLD_FRAMES;
        const frames = [];
        for (let i = 0; i < totalFrames; i++) {
            const wordsShown = Math.min(i + 1, layout.totalWords);
            frames.push(renderBrat2Frame(layout, wordsShown));
        }

        const webp = await framesToAnimatedWebp(frames, 5);
        const final = await inyectarExif(webp, texto.slice(0, 30));
        await sock.sendMessage(jid, { sticker: final });
    } catch (e) {
        console.error('Error #brat3:', e.message);
        await sock.sendMessage(jid, { text: '❌ No pude generar el sticker animado.' });
    }
}

// ══════════════════════════════════════════
//  #ttp / #attp — texto colorido letra por letra (estático / animado)
// ══════════════════════════════════════════
const TTP_COLORS = ['#ff3b3b', '#ff9f1c', '#ffe135', '#4be04b', '#37c6ff', '#7c5cff', '#ff5cd4'];

function renderTtpFrame(texto, frame = 0, totalFrames = 1) {
    ensureFont();
    const size = 512;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, size, size);

    const chars = texto.split('');
    let fontSize = 110;
    ctx.textBaseline = 'alphabetic';
    while (fontSize > 26) {
        ctx.font = `${fontSize}px NexusSans`;
        const totalWidth = chars.reduce((w, c) => w + ctx.measureText(c).width + 6, 0);
        if (totalWidth <= size - 60) break;
        fontSize -= 4;
    }
    ctx.font = `${fontSize}px NexusSans`;
    const totalWidth = chars.reduce((w, c) => w + ctx.measureText(c).width + 6, 0);
    let x = (size - totalWidth) / 2;
    const baseY = size / 2 + fontSize / 3;

    chars.forEach((c, i) => {
        const color = TTP_COLORS[i % TTP_COLORS.length];
        const phase = (frame / totalFrames) * Math.PI * 2 + i * 0.6;
        const bounce = totalFrames > 1 ? Math.sin(phase) * (fontSize * 0.18) : 0;
        ctx.fillStyle = color;
        ctx.fillText(c, x, baseY + bounce);
        x += ctx.measureText(c).width + 6;
    });

    return canvas.toBuffer('image/png');
}

async function framesToAnimatedWebp(frameBuffers, fps = 12) {
    const tmpDir = path.join(os.tmpdir(), `ttp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await fs.ensureDir(tmpDir);
    const outputPath = path.join(tmpDir, 'out.webp');
    try {
        await Promise.all(frameBuffers.map((buf, i) =>
            fs.writeFile(path.join(tmpDir, `f${String(i).padStart(3, '0')}.png`), buf)
        ));
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(path.join(tmpDir, 'f%03d.png'))
                .inputOptions([`-framerate ${fps}`])
                .outputOptions([
                    '-vcodec', 'libwebp',
                    '-loop', '0',
                    '-preset', 'default',
                    '-an',
                    '-vsync', '0',
                    '-pix_fmt', 'yuv420p'
                ])
                .toFormat('webp')
                .on('end', resolve)
                .on('error', reject)
                .save(outputPath);
        });
        return await fs.readFile(outputPath);
    } finally {
        await fs.remove(tmpDir).catch(() => {});
    }
}

async function cmdTtp(sock, jid, args) {
    const texto = args.join(' ').trim();
    if (!texto) {
        await sock.sendMessage(jid, { text: '❌ Escribe el texto para el sticker.\nEj: *#ttp hola*' });
        return;
    }
    try {
        const png = renderTtpFrame(texto.slice(0, 20), 0, 1);
        const webp = await imagenAWebpFull(png);
        const final = await inyectarExif(webp, texto.slice(0, 30));
        await sock.sendMessage(jid, { sticker: final });
    } catch (e) {
        console.error('Error #ttp:', e.message);
        await sock.sendMessage(jid, { text: '❌ No pude generar el sticker.' });
    }
}

async function cmdAttp(sock, jid, args) {
    const texto = args.join(' ').trim();
    if (!texto) {
        await sock.sendMessage(jid, { text: '❌ Escribe el texto para el sticker.\nEj: *#attp hola*' });
        return;
    }
    try {
        await sock.sendMessage(jid, { text: '⚙️ Generando sticker animado...' });
        const totalFrames = 16;
        const frames = [];
        for (let i = 0; i < totalFrames; i++) {
            frames.push(renderTtpFrame(texto.slice(0, 20), i, totalFrames));
        }
        const webp = await framesToAnimatedWebp(frames, 12);
        const final = await inyectarExif(webp, texto.slice(0, 30));
        await sock.sendMessage(jid, { sticker: final });
    } catch (e) {
        console.error('Error #attp:', e.message);
        await sock.sendMessage(jid, { text: '❌ No pude generar el sticker animado.' });
    }
}

// ══════════════════════════════════════════
//  #qc — tarjeta de chat citando un mensaje (quote card)
// ══════════════════════════════════════════
function extraerTextoCitado(quotedMsg) {
    if (!quotedMsg) return '';
    return quotedMsg.conversation
        || quotedMsg.extendedTextMessage?.text
        || quotedMsg.imageMessage?.caption
        || quotedMsg.videoMessage?.caption
        || '';
}

async function renderQcCard(nombre, texto, avatarBuffer) {
    ensureFont();
    const width = 640;
    const padding = 40;
    const avatarSize = 90;
    const textX = padding + avatarSize + 24;
    const maxTextWidth = width - textX - padding;

    const measure = createCanvas(10, 10).getContext('2d');
    measure.font = '32px NexusSans';
    const lines = wrapText(measure, texto.slice(0, 400), maxTextWidth);

    const lineHeight = 42;
    const nameHeight = 44;
    const height = Math.max(avatarSize + padding * 2, nameHeight + lines.length * lineHeight + padding * 2);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0b141a';
    ctx.fillRect(0, 0, width, height);

    // Avatar circular
    ctx.save();
    ctx.beginPath();
    ctx.arc(padding + avatarSize / 2, padding + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    let dibujadoAvatar = false;
    if (avatarBuffer) {
        try {
            const img = await loadImage(avatarBuffer);
            ctx.drawImage(img, padding, padding, avatarSize, avatarSize);
            dibujadoAvatar = true;
        } catch (e) {
            console.error('No se pudo dibujar avatar en #qc:', e.message);
        }
    }
    if (!dibujadoAvatar) {
        ctx.fillStyle = '#25d366';
        ctx.fillRect(padding, padding, avatarSize, avatarSize);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px NexusSans';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((nombre[0] || '?').toUpperCase(), padding + avatarSize / 2, padding + avatarSize / 2 + 4);
    }
    ctx.restore();

    // Nombre
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#00d9ff';
    ctx.font = 'bold 30px NexusSans';
    ctx.fillText(nombre.slice(0, 30), textX, padding + 32);

    // Texto citado
    ctx.fillStyle = '#e9edef';
    ctx.font = '32px NexusSans';
    lines.forEach((line, i) => {
        ctx.fillText(line, textX, padding + nameHeight + (i + 1) * lineHeight - 10);
    });

    return canvas.toBuffer('image/png');
}

async function cmdQc(sock, jid, msg, mencionados) {
    const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMsg = ctxInfo?.quotedMessage;
    if (!ctxInfo || !quotedMsg) {
        await sock.sendMessage(jid, { text: '❌ Responde a un mensaje de *texto* con *#qc* para crear la tarjeta.' });
        return;
    }

    const texto = extraerTextoCitado(quotedMsg);
    if (!texto) {
        await sock.sendMessage(jid, { text: '❌ El mensaje citado no tiene texto para mostrar.' });
        return;
    }

    try {
        const participantJid = (mencionados && mencionados[0])
            || ctxInfo.participant?.replace(/:\d+@/, '@')
            || jid;
        const u = getUsuario(participantJid);
        const nombre = u.pushName || u.nombre || participantJid.split('@')[0];

        let pfpUrl = null;
        try {
            pfpUrl = await Promise.race([
                sock.profilePictureUrl(participantJid, 'image'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
            ]);
        } catch { /* sin foto de perfil o privada */ }

        let avatarBuffer = null;
        if (pfpUrl) {
            try {
                const r = await axios.get(pfpUrl, { responseType: 'arraybuffer', timeout: 10000 });
                avatarBuffer = Buffer.from(r.data);
            } catch { /* fallback a iniciales */ }
        }

        const png = await renderQcCard(nombre, texto, avatarBuffer);
        const webp = await imagenAWebpFull(png);
        const final = await inyectarExif(webp, nombre);
        await sock.sendMessage(jid, { sticker: final });
    } catch (e) {
        console.error('Error #qc:', e.message);
        await sock.sendMessage(jid, { text: '❌ No pude generar la tarjeta de chat.' });
    }
}

// ══════════════════════════════════════════
//  #wm — cambiar pack/autor de un sticker citado
// ══════════════════════════════════════════
async function cmdWm(sock, jid, msg, args) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted?.stickerMessage) {
        await sock.sendMessage(jid, { text: '❌ Responde a un *sticker* con *#wm nombre del pack|autor* para renombrarlo.' });
        return;
    }

    const raw = args.join(' ').trim();
    if (!raw) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#wm nombre del pack|autor*\nEj: *#wm Mi Pack|Mi Nombre*' });
        return;
    }
    const [packRaw, authorRaw] = raw.split('|').map(s => s?.trim());
    if (!packRaw) {
        await sock.sendMessage(jid, { text: '❌ Uso: *#wm nombre del pack|autor*\nEj: *#wm Mi Pack|Mi Nombre*' });
        return;
    }
    const pack = packRaw.slice(0, 60);
    const author = (authorRaw || 'Nexus Bot').slice(0, 60);

    try {
        const buffer = await getBuffer(quoted.stickerMessage, 'sticker');
        const sticker = new Sticker(buffer, { pack, author, type: StickerTypes.FULL, quality: 90 });
        const final = await sticker.toBuffer();
        await sock.sendMessage(jid, { sticker: final });
    } catch (e) {
        console.error('Error #wm:', e.message);
        await sock.sendMessage(jid, { text: '❌ No pude cambiar el nombre del sticker.' });
    }
}

module.exports = { cmdBrat, cmdBrat2, cmdBrat3, cmdTtp, cmdAttp, cmdQc, cmdWm };
