'use strict';
// ══════════════════════════════════════════════════════════════════════════════
//  EFECTOS DE AUDIO — Nexus Bot
//  24 efectos FFmpeg aplicados sobre audios/notas de voz citados
// ══════════════════════════════════════════════════════════════════════════════
const path       = require('path');
const os         = require('os');
const fs         = require('fs-extra');
const ffmpeg     = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { ERR, WARN, INFO } = require('./style');

// ── Tabla de efectos: [flag_ffmpeg, valor_filtro] ─────────────────────────
// Cada par se pasa directamente a outputOptions() de fluent-ffmpeg.
const EFECTOS = {
    bass:       ['-af', 'equalizer=f=94:width_type=o:width=2:g=30'],
    blown:      ['-af', 'acrusher=.1:1:64:0:log'],
    deep:       ['-af', 'atempo=4/4,asetrate=44500*2/3'],
    earrape:    ['-af', 'volume=12'],
    fast:       ['-filter:a', 'atempo=1.63,asetrate=44100'],
    fat:        ['-filter:a', 'atempo=1.6,asetrate=22100'],
    nightcore:  ['-filter:a', 'atempo=1.06,asetrate=44100*1.25'],
    reverse:    ['-filter_complex', 'areverse'],
    robot:      ['-filter_complex', "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75"],
    slow:       ['-filter:a', 'atempo=0.7,asetrate=44100'],
    tupai:      ['-filter:a', 'atempo=0.5,asetrate=65100'],
    echo:       ['-af', 'aecho=0.8:0.9:1000:0.3'],
    chorus:     ['-af', 'chorus=0.5:0.9:50|60|40:0.4|0.32|0.3:0.25|0.4|0.3:2|2.3|1.3'],
    flanger:    ['-af', 'flanger'],
    vibrato:    ['-af', 'vibrato=f=5:d=0.5'],
    tremolo:    ['-af', 'tremolo=f=3:d=0.9'],
    phaser:     ['-af', 'aphaser=in_gain=0.4'],
    compressor: ['-af', 'acompressor'],
    distortion: ['-af', 'overdrive=20:20'],
    underwater: ['-af', 'lowpass=f=300,highpass=f=50'],
    telephone:  ['-af', 'lowpass=f=3000,highpass=f=300'],
    radio:      ['-af', 'equalizer=f=3000:width_type=o:width=2:g=15,highpass=f=300'],
    cave:       ['-af', 'aecho=0.8:0.88:60:0.4'],
    whisper:    ['-af', 'volume=0.3,highpass=f=1000'],
    demon:      ['-af', 'asetrate=22050,atempo=0.8,volume=2'],
};

const TODO_EFECTOS_AUDIO = Object.keys(EFECTOS);

// ── Detecta y descarga el audio del mensaje directo o citado ──────────────
async function _obtenerAudio(msg) {
    const ctx    = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    const audioMsg =
        msg.message?.audioMessage ||
        quoted?.audioMessage;
    const videoMsg =
        msg.message?.videoMessage ||
        quoted?.videoMessage;

    const target = audioMsg ?? videoMsg;
    if (!target) return null;

    const tipo   = audioMsg ? 'audio' : 'video';
    const stream = await downloadContentFromMessage(target, tipo);
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

// ── Aplica el efecto y responde con el audio procesado ────────────────────
async function cmdEfectoAudio(sock, jid, msg, cmd) {
    const opts = EFECTOS[cmd];
    if (!opts) {
        await sock.sendMessage(jid, { text: `${ERR} Efecto desconocido: *${cmd}*.` });
        return;
    }

    const buffer = await _obtenerAudio(msg);
    if (!buffer?.length) {
        await sock.sendMessage(jid, {
            text: `${WARN} Responde a un audio o nota de voz con *#${cmd}*.`
        });
        return;
    }

    await sock.sendMessage(jid, { text: `${INFO} Aplicando efecto *${cmd}*...` });

    const id      = Date.now();
    const tmpDir  = os.tmpdir();
    const inPath  = path.join(tmpDir, `efx_in_${id}.mp3`);
    const outPath = path.join(tmpDir, `efx_out_${id}.mp3`);

    try {
        await fs.writeFile(inPath, buffer);

        await new Promise((resolve, reject) => {
            ffmpeg(inPath)
                .outputOptions(opts)
                .output(outPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        const out = await fs.readFile(outPath);
        await sock.sendMessage(jid, {
            audio:    out,
            mimetype: 'audio/mpeg',
            fileName: `${cmd}.mp3`,
            ptt:      false
        }, { quoted: msg });

    } finally {
        for (const f of [inPath, outPath]) {
            try { await fs.remove(f); } catch {}
        }
    }
}

module.exports = { cmdEfectoAudio, TODO_EFECTOS_AUDIO };
