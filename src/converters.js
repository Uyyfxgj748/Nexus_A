'use strict';

const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const { getBuffer } = require('./sticker');

// ══════════════════════════════════════════
//  IMAGEN → PDF
// ══════════════════════════════════════════
async function cmdConverPDF(sock, jid, msg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    // Aceptar imagen enviada directamente o respondida
    let imgBuffer = null;
    if (msg.message?.imageMessage) {
        imgBuffer = await getBuffer(msg.message.imageMessage, 'image');
    } else if (quoted?.imageMessage) {
        imgBuffer = await getBuffer(quoted.imageMessage, 'image');
    }

    if (!imgBuffer) {
        await sock.sendMessage(jid, {
            text: '❌ Responde a una *imagen* con *#converPDF* para convertirla.\n📌 También puedes enviar la imagen junto al comando.'
        });
        return;
    }

    await sock.sendMessage(jid, { text: '⚙️ Convirtiendo imagen a PDF...' });

    try {
        // Obtener dimensiones reales de la imagen
        const meta = await sharp(imgBuffer).metadata();
        const imgW = meta.width;
        const imgH = meta.height;

        // Convertir a PNG para que PDFKit la acepte sin problemas de formato
        const pngBuffer = await sharp(imgBuffer).png().toBuffer();

        // Crear PDF con el tamaño exacto de la imagen (en puntos; 1px ≈ 0.75pt)
        const ptW = imgW * 0.75;
        const ptH = imgH * 0.75;

        const pdfBuffer = await new Promise((resolve, reject) => {
            const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
            doc.addPage({ size: [ptW, ptH], margin: 0 });
            doc.image(pngBuffer, 0, 0, { width: ptW, height: ptH });

            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            doc.end();
        });

        await sock.sendMessage(jid, {
            document: pdfBuffer,
            mimetype: 'application/pdf',
            fileName: 'imagen.pdf'
        });

    } catch (e) {
        console.error('Error #converPDF:', e.message);
        await sock.sendMessage(jid, { text: '❌ No pude convertir la imagen. Asegúrate de que sea un formato válido (JPG, PNG, WebP).' });
    }
}

module.exports = { cmdConverPDF };
