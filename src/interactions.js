const axios = require('axios');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const { logRequestError, encodeBooruTags } = require('./utils');

// Usar el ffmpeg del sistema (Nix) que es más compatible que el bundled de @ffmpeg-installer
function resolverFfmpegPath() {
    try {
        return execSync('which ffmpeg', { encoding: 'utf8' }).trim();
    } catch {
        // Fallback al bundled si el sistema no tiene ffmpeg
        return require('@ffmpeg-installer/ffmpeg').path;
    }
}
ffmpeg.setFfmpegPath(resolverFfmpegPath());

const HUMAN_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/'
};

// Headers específicos para Rule34 (incluye User-Agent NexusBot/1.0 obligatorio)
const NEXUS_R34_HEADERS = {
    'User-Agent': 'NexusBot/1.0',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://rule34.xxx/'
};

axios.defaults.headers.common = { ...axios.defaults.headers.common, ...HUMAN_HEADERS };

// ══════════════════════════════════════════
//  MEDIA LOCAL — busca archivos en interactions/sfw o interactions/nsfw
// ══════════════════════════════════════════
const LOCAL_MEDIA_EXTS = new Set(['.gif', '.mp4', '.webm', '.jpg', '.jpeg', '.png', '.webp']);


// Alias → carpeta canónica para acciones NSFW
const NSFW_ACCION_CARPETA = {
    mamada:      'blowjob',
    bj:          'blowjob',
    paja:        'fap',
    coger:       'fuck',
    '69':        'sixnine',
    nalgada:     'spank',
    encuerar:    'undress',
    tijeras:     'yuri',
    futa:        'futanari',
    orgia:       'orgy',
    squirt:      'squirting',
};

// ── YukiBot CDN — videos NSFW pre-hosteados (MP4), enviados directamente sin descarga ──
// Fuente: cdn.yuki-wabot.my.id — CDN dedicado, no bloquea IPs de servidor.
const YUKI_CDN_NSFW = {
    spank:      ['https://cdn.yuki-wabot.my.id/files/1Sve.mp4','https://cdn.yuki-wabot.my.id/files/b8M6.mp4','https://cdn.yuki-wabot.my.id/files/yBjF.mp4','https://cdn.yuki-wabot.my.id/files/FI0k.mp4','https://cdn.yuki-wabot.my.id/files/KLdv.mp4','https://cdn.yuki-wabot.my.id/files/12LT.mp4','https://cdn.yuki-wabot.my.id/files/C9nx.mp4','https://cdn.yuki-wabot.my.id/files/Xb5O.mp4','https://cdn.yuki-wabot.my.id/files/1IyF.mp4','https://cdn.yuki-wabot.my.id/files/rw8p.mp4'],
    undress:    ['https://cdn.yuki-wabot.my.id/files/p2g1.mp4','https://cdn.yuki-wabot.my.id/files/nELt.mp4','https://cdn.yuki-wabot.my.id/files/hezG.mp4','https://cdn.yuki-wabot.my.id/files/qJgu.mp4','https://cdn.yuki-wabot.my.id/files/iK0Z.mp4','https://cdn.yuki-wabot.my.id/files/NlVS.mp4','https://cdn.yuki-wabot.my.id/files/LUxZ.mp4','https://cdn.yuki-wabot.my.id/files/IshD.mp4','https://cdn.yuki-wabot.my.id/files/bWd6.mp4','https://cdn.yuki-wabot.my.id/files/ATwj.mp4'],
    yuri:       ['https://cdn.yuki-wabot.my.id/files/2GIM.mp4','https://cdn.yuki-wabot.my.id/files/tVgt.mp4','https://cdn.yuki-wabot.my.id/files/taNu.mp4','https://cdn.yuki-wabot.my.id/files/ClhY.mp4','https://cdn.yuki-wabot.my.id/files/7EUX.mp4','https://cdn.yuki-wabot.my.id/files/BWHd.mp4','https://cdn.yuki-wabot.my.id/files/OqMl.mp4','https://cdn.yuki-wabot.my.id/files/qkZl.mp4','https://cdn.yuki-wabot.my.id/files/WqgZ.mp4','https://cdn.yuki-wabot.my.id/files/pnrb.mp4'],
    sixnine:    ['https://cdn.yuki-wabot.my.id/files/kkqs.mp4','https://cdn.yuki-wabot.my.id/files/QnUE.mp4','https://cdn.yuki-wabot.my.id/files/aJSH.mp4','https://cdn.yuki-wabot.my.id/files/APVc.mp4','https://cdn.yuki-wabot.my.id/files/LbgB.mp4','https://cdn.yuki-wabot.my.id/files/BUsd.mp4','https://cdn.yuki-wabot.my.id/files/huUB.mp4','https://cdn.yuki-wabot.my.id/files/5jdW.mp4','https://cdn.yuki-wabot.my.id/files/X0y9.mp4','https://cdn.yuki-wabot.my.id/files/JmEn.mp4'],
    anal:       ['https://cdn.yuki-wabot.my.id/files/8d8D.mp4','https://cdn.yuki-wabot.my.id/files/g8Mm.mp4','https://cdn.yuki-wabot.my.id/files/jcsM.mp4','https://cdn.yuki-wabot.my.id/files/gdFO.mp4','https://cdn.yuki-wabot.my.id/files/hM41.mp4','https://cdn.yuki-wabot.my.id/files/g2wJ.mp4','https://cdn.yuki-wabot.my.id/files/tTYb.mp4','https://cdn.yuki-wabot.my.id/files/0jaS.mp4','https://cdn.yuki-wabot.my.id/files/S5du.mp4','https://cdn.yuki-wabot.my.id/files/dr91.mp4'],
    fuck:       ['https://cdn.yuki-wabot.my.id/files/GWLs.mp4','https://cdn.yuki-wabot.my.id/files/cCQZ.mp4','https://cdn.yuki-wabot.my.id/files/MRqC.mp4','https://cdn.yuki-wabot.my.id/files/lHcW.mp4','https://cdn.yuki-wabot.my.id/files/cUyl.mp4','https://cdn.yuki-wabot.my.id/files/VUrC.mp4','https://cdn.yuki-wabot.my.id/files/PYJc.mp4','https://cdn.yuki-wabot.my.id/files/rAN7.mp4','https://cdn.yuki-wabot.my.id/files/weKv.mp4','https://cdn.yuki-wabot.my.id/files/k7ZM.mp4'],
    suckboobs:  ['https://cdn.yuki-wabot.my.id/files/3bV7.mp4','https://cdn.yuki-wabot.my.id/files/BT7m.mp4','https://cdn.yuki-wabot.my.id/files/yb93.mp4','https://cdn.yuki-wabot.my.id/files/dnrt.mp4','https://cdn.yuki-wabot.my.id/files/PT3X.mp4','https://cdn.yuki-wabot.my.id/files/VesN.mp4','https://cdn.yuki-wabot.my.id/files/Stxs.mp4','https://cdn.yuki-wabot.my.id/files/kLxW.mp4','https://cdn.yuki-wabot.my.id/files/Sy1C.mp4','https://cdn.yuki-wabot.my.id/files/7eVv.mp4'],
    cummouth:   ['https://cdn.yuki-wabot.my.id/files/LnRN.mp4','https://cdn.yuki-wabot.my.id/files/h7YA.mp4','https://cdn.yuki-wabot.my.id/files/sWFb.mp4','https://cdn.yuki-wabot.my.id/files/kjvQ.mp4','https://cdn.yuki-wabot.my.id/files/JcyG.mp4','https://cdn.yuki-wabot.my.id/files/IVVq.mp4','https://cdn.yuki-wabot.my.id/files/hqRy.mp4','https://cdn.yuki-wabot.my.id/files/5Y7z.mp4','https://cdn.yuki-wabot.my.id/files/Di2q.mp4','https://cdn.yuki-wabot.my.id/files/Z9BJ.mp4'],
    cumshot:    ['https://cdn.yuki-wabot.my.id/files/vkSu.mp4','https://cdn.yuki-wabot.my.id/files/rj61.mp4','https://cdn.yuki-wabot.my.id/files/2w4x.mp4','https://cdn.yuki-wabot.my.id/files/7ZXk.mp4','https://cdn.yuki-wabot.my.id/files/Up8w.mp4','https://cdn.yuki-wabot.my.id/files/U1vT.mp4','https://cdn.yuki-wabot.my.id/files/nNjD.mp4','https://cdn.yuki-wabot.my.id/files/X09N.mp4','https://cdn.yuki-wabot.my.id/files/EAa7.mp4','https://cdn.yuki-wabot.my.id/files/ickC.mp4'],
    cum:        ['https://cdn.yuki-wabot.my.id/files/WgY8.mp4','https://cdn.yuki-wabot.my.id/files/Sfg2.mp4','https://cdn.yuki-wabot.my.id/files/oAQ7.mp4','https://cdn.yuki-wabot.my.id/files/3kV8.mp4','https://cdn.yuki-wabot.my.id/files/9siz.mp4','https://cdn.yuki-wabot.my.id/files/qb94.mp4','https://cdn.yuki-wabot.my.id/files/xOqF.mp4','https://cdn.yuki-wabot.my.id/files/vvCu.mp4','https://cdn.yuki-wabot.my.id/files/9Hjn.mp4'],
    lickpussy:  ['https://cdn.yuki-wabot.my.id/files/YOkd.mp4','https://cdn.yuki-wabot.my.id/files/8Ztq.mp4','https://cdn.yuki-wabot.my.id/files/kHLQ.mp4','https://cdn.yuki-wabot.my.id/files/qzH1.mp4','https://cdn.yuki-wabot.my.id/files/cMfm.mp4','https://cdn.yuki-wabot.my.id/files/cDrL.mp4','https://cdn.yuki-wabot.my.id/files/D9kS.mp4','https://cdn.yuki-wabot.my.id/files/apfo.mp4','https://cdn.yuki-wabot.my.id/files/VNOn.mp4','https://cdn.yuki-wabot.my.id/files/JrAi.mp4'],
    lickdick:   ['https://cdn.yuki-wabot.my.id/files/Q3Wi.mp4','https://cdn.yuki-wabot.my.id/files/XAwW.mp4','https://cdn.yuki-wabot.my.id/files/87WD.mp4','https://cdn.yuki-wabot.my.id/files/eWnU.mp4','https://cdn.yuki-wabot.my.id/files/ppYP.mp4','https://cdn.yuki-wabot.my.id/files/XA6T.mp4','https://cdn.yuki-wabot.my.id/files/Hc3Y.mp4','https://cdn.yuki-wabot.my.id/files/jEir.mp4','https://cdn.yuki-wabot.my.id/files/Ywlz.mp4','https://cdn.yuki-wabot.my.id/files/A4hZ.mp4'],
    lickass:    ['https://cdn.yuki-wabot.my.id/files/1IHj.mp4','https://cdn.yuki-wabot.my.id/files/9uiB.mp4','https://cdn.yuki-wabot.my.id/files/6zJk.mp4','https://cdn.yuki-wabot.my.id/files/mv59.mp4','https://cdn.yuki-wabot.my.id/files/v9Bq.mp4','https://cdn.yuki-wabot.my.id/files/6XJX.mp4','https://cdn.yuki-wabot.my.id/files/YSSs.mp4','https://cdn.yuki-wabot.my.id/files/WCMq.mp4','https://cdn.yuki-wabot.my.id/files/iEW3.mp4'],
    handjob:    ['https://cdn.yuki-wabot.my.id/files/vARz.mp4','https://cdn.yuki-wabot.my.id/files/huzl.mp4','https://cdn.yuki-wabot.my.id/files/WXu1.mp4','https://cdn.yuki-wabot.my.id/files/A3ic.mp4','https://cdn.yuki-wabot.my.id/files/9Afv.mp4','https://cdn.yuki-wabot.my.id/files/suDf.mp4','https://cdn.yuki-wabot.my.id/files/rsbC.mp4','https://cdn.yuki-wabot.my.id/files/DP6O.mp4','https://cdn.yuki-wabot.my.id/files/loC3.mp4','https://cdn.yuki-wabot.my.id/files/p0yY.mp4'],
    grope:      ['https://cdn.yuki-wabot.my.id/files/R66C.mp4','https://cdn.yuki-wabot.my.id/files/x751.mp4','https://cdn.yuki-wabot.my.id/files/tvd0.mp4','https://cdn.yuki-wabot.my.id/files/PN18.mp4','https://cdn.yuki-wabot.my.id/files/sxoz.mp4','https://cdn.yuki-wabot.my.id/files/Z0dG.mp4','https://cdn.yuki-wabot.my.id/files/oKHl.mp4','https://cdn.yuki-wabot.my.id/files/gb2X.mp4','https://cdn.yuki-wabot.my.id/files/JISx.mp4','https://cdn.yuki-wabot.my.id/files/0WbV.mp4'],
    grabboobs:  ['https://cdn.yuki-wabot.my.id/files/0U8R.mp4','https://cdn.yuki-wabot.my.id/files/BadN.mp4','https://cdn.yuki-wabot.my.id/files/SMmv.mp4','https://cdn.yuki-wabot.my.id/files/SOkx.mp4','https://cdn.yuki-wabot.my.id/files/O958.mp4','https://cdn.yuki-wabot.my.id/files/s4zG.mp4','https://cdn.yuki-wabot.my.id/files/mgVE.mp4','https://cdn.yuki-wabot.my.id/files/KTIn.mp4','https://cdn.yuki-wabot.my.id/files/XBpu.mp4','https://cdn.yuki-wabot.my.id/files/swW3.mp4'],
    blowjob:    ['https://cdn.yuki-wabot.my.id/files/3YNF.mp4','https://cdn.yuki-wabot.my.id/files/ld7h.mp4','https://cdn.yuki-wabot.my.id/files/pGys.mp4','https://cdn.yuki-wabot.my.id/files/lRah.mp4','https://cdn.yuki-wabot.my.id/files/7l5P.mp4','https://cdn.yuki-wabot.my.id/files/qGVz.mp4','https://cdn.yuki-wabot.my.id/files/ThGu.mp4','https://cdn.yuki-wabot.my.id/files/UQn3.mp4','https://cdn.yuki-wabot.my.id/files/GFvh.mp4','https://cdn.yuki-wabot.my.id/files/2KEZ.mp4'],
    boobjob:    ['https://cdn.yuki-wabot.my.id/files/wNm2.mp4','https://cdn.yuki-wabot.my.id/files/mtsj.mp4','https://cdn.yuki-wabot.my.id/files/MJQZ.mp4','https://cdn.yuki-wabot.my.id/files/me3J.mp4','https://cdn.yuki-wabot.my.id/files/8nSG.mp4','https://cdn.yuki-wabot.my.id/files/dvJL.mp4','https://cdn.yuki-wabot.my.id/files/PIQ0.mp4','https://cdn.yuki-wabot.my.id/files/5D03.mp4','https://cdn.yuki-wabot.my.id/files/ykpZ.mp4','https://cdn.yuki-wabot.my.id/files/rwyB.mp4'],
    fap:        ['https://cdn.yuki-wabot.my.id/files/VuiC.mp4','https://cdn.yuki-wabot.my.id/files/7j6s.mp4','https://cdn.yuki-wabot.my.id/files/dwhV.mp4','https://cdn.yuki-wabot.my.id/files/9bDa.mp4','https://cdn.yuki-wabot.my.id/files/B6GC.mp4','https://cdn.yuki-wabot.my.id/files/ZTnN.mp4','https://cdn.yuki-wabot.my.id/files/EGBJ.mp4','https://cdn.yuki-wabot.my.id/files/LWta.mp4','https://cdn.yuki-wabot.my.id/files/Z6ri.mp4','https://cdn.yuki-wabot.my.id/files/xVrs.mp4'],
    footjob:    ['https://cdn.yuki-wabot.my.id/files/0Yf0.mp4','https://cdn.yuki-wabot.my.id/files/OsoL.mp4','https://cdn.yuki-wabot.my.id/files/oIyN.mp4','https://cdn.yuki-wabot.my.id/files/2nMl.mp4','https://cdn.yuki-wabot.my.id/files/bTCa.mp4','https://cdn.yuki-wabot.my.id/files/D8Sw.mp4','https://cdn.yuki-wabot.my.id/files/viYl.mp4','https://cdn.yuki-wabot.my.id/files/x5N5.mp4','https://cdn.yuki-wabot.my.id/files/2ob2.mp4','https://cdn.yuki-wabot.my.id/files/ZLo7.mp4'],
    fingering:  ['https://cdn.yuki-wabot.my.id/files/pw4t.mp4','https://cdn.yuki-wabot.my.id/files/wclJ.mp4','https://cdn.yuki-wabot.my.id/files/u2NI.mp4','https://cdn.yuki-wabot.my.id/files/R6ul.mp4','https://cdn.yuki-wabot.my.id/files/lhQJ.mp4','https://cdn.yuki-wabot.my.id/files/LAzh.mp4','https://cdn.yuki-wabot.my.id/files/kyuG.mp4','https://cdn.yuki-wabot.my.id/files/FPoS.mp4','https://cdn.yuki-wabot.my.id/files/IQcQ.mp4','https://cdn.yuki-wabot.my.id/files/N7GS.mp4'],
    creampie:   ['https://cdn.yuki-wabot.my.id/files/2i3e.mp4','https://cdn.yuki-wabot.my.id/files/H26A.mp4','https://cdn.yuki-wabot.my.id/files/wcgE.mp4','https://cdn.yuki-wabot.my.id/files/OmPi.mp4','https://cdn.yuki-wabot.my.id/files/muwD.mp4','https://cdn.yuki-wabot.my.id/files/4tfx.mp4'],
    facesitting:['https://cdn.yuki-wabot.my.id/files/gVMP.mp4','https://cdn.yuki-wabot.my.id/files/uWys.mp4','https://cdn.yuki-wabot.my.id/files/0SHB.mp4','https://cdn.yuki-wabot.my.id/files/YwMe.mp4','https://cdn.yuki-wabot.my.id/files/mqIn.mp4','https://cdn.yuki-wabot.my.id/files/tFi1.mp4','https://cdn.yuki-wabot.my.id/files/X7Oe.mp4','https://cdn.yuki-wabot.my.id/files/e705.mp4','https://cdn.yuki-wabot.my.id/files/PEBc.mp4','https://cdn.yuki-wabot.my.id/files/3k4E.mp4'],
    futanari:   ['https://cdn.yuki-wabot.my.id/files/sRkO.mp4','https://cdn.yuki-wabot.my.id/files/j0ry.mp4','https://cdn.yuki-wabot.my.id/files/mJKc.mp4','https://cdn.yuki-wabot.my.id/files/68ra.mp4','https://cdn.yuki-wabot.my.id/files/KLrR.mp4','https://cdn.yuki-wabot.my.id/files/NN5A.mp4','https://cdn.yuki-wabot.my.id/files/tJcB.mp4','https://cdn.yuki-wabot.my.id/files/PB8i.mp4','https://cdn.yuki-wabot.my.id/files/65Xn.mp4','https://cdn.yuki-wabot.my.id/files/lLMd.mp4'],
    pegging:    ['https://cdn.yuki-wabot.my.id/files/J6pL.mp4','https://cdn.yuki-wabot.my.id/files/lvZG.mp4','https://cdn.yuki-wabot.my.id/files/gpHC.mp4','https://cdn.yuki-wabot.my.id/files/d4ta.mp4','https://cdn.yuki-wabot.my.id/files/gaWM.mp4','https://cdn.yuki-wabot.my.id/files/pjJP.mp4','https://cdn.yuki-wabot.my.id/files/23bo.mp4','https://cdn.yuki-wabot.my.id/files/SF64.mp4','https://cdn.yuki-wabot.my.id/files/9xLd.mp4','https://cdn.yuki-wabot.my.id/files/3kgZ.mp4'],
    bondage:    ['https://cdn.yuki-wabot.my.id/files/LByq.mp4','https://cdn.yuki-wabot.my.id/files/h5bF.mp4','https://cdn.yuki-wabot.my.id/files/aPHQ.mp4','https://cdn.yuki-wabot.my.id/files/QIrq.mp4','https://cdn.yuki-wabot.my.id/files/Yox4.mp4','https://cdn.yuki-wabot.my.id/files/l8IQ.mp4','https://cdn.yuki-wabot.my.id/files/p4jt.mp4','https://cdn.yuki-wabot.my.id/files/ijIr.mp4','https://cdn.yuki-wabot.my.id/files/R0iD.mp4','https://cdn.yuki-wabot.my.id/files/7RgY.mp4'],
    deepthroat: ['https://cdn.yuki-wabot.my.id/files/1Nog.mp4','https://cdn.yuki-wabot.my.id/files/gEfE.mp4','https://cdn.yuki-wabot.my.id/files/L26C.mp4','https://cdn.yuki-wabot.my.id/files/w9qF.mp4','https://cdn.yuki-wabot.my.id/files/Tnjq.mp4','https://cdn.yuki-wabot.my.id/files/46Zs.mp4','https://cdn.yuki-wabot.my.id/files/QSSi.mp4','https://cdn.yuki-wabot.my.id/files/oixe.mp4','https://cdn.yuki-wabot.my.id/files/VQFb.mp4','https://cdn.yuki-wabot.my.id/files/BwL8.mp4'],
    thighjob:   ['https://cdn.yuki-wabot.my.id/files/XHTZ.mp4','https://cdn.yuki-wabot.my.id/files/ZaiI.mp4','https://cdn.yuki-wabot.my.id/files/DOzT.mp4','https://cdn.yuki-wabot.my.id/files/H423.mp4','https://cdn.yuki-wabot.my.id/files/XKu4.mp4','https://cdn.yuki-wabot.my.id/files/ivl5.mp4','https://cdn.yuki-wabot.my.id/files/pqw9.mp4','https://cdn.yuki-wabot.my.id/files/Xkgy.mp4','https://cdn.yuki-wabot.my.id/files/6UJC.mp4','https://cdn.yuki-wabot.my.id/files/4AeC.mp4'],
    yaoi:       ['https://cdn.yuki-wabot.my.id/files/4saj.mp4','https://cdn.yuki-wabot.my.id/files/q67x.mp4','https://cdn.yuki-wabot.my.id/files/HjE8.mp4','https://cdn.yuki-wabot.my.id/files/ofP5.mp4','https://cdn.yuki-wabot.my.id/files/JlLl.mp4','https://cdn.yuki-wabot.my.id/files/gUXB.mp4','https://cdn.yuki-wabot.my.id/files/4uxr.mp4','https://cdn.yuki-wabot.my.id/files/z7I9.mp4','https://cdn.yuki-wabot.my.id/files/m2ld.mp4','https://cdn.yuki-wabot.my.id/files/8CVI.mp4'],
    bukkake:    ['https://cdn.yuki-wabot.my.id/files/wDKv.mp4','https://cdn.yuki-wabot.my.id/files/TGjj.mp4','https://cdn.yuki-wabot.my.id/files/Af58.mp4','https://cdn.yuki-wabot.my.id/files/dMZg.mp4','https://cdn.yuki-wabot.my.id/files/Nd1W.mp4','https://cdn.yuki-wabot.my.id/files/ZKnj.mp4','https://cdn.yuki-wabot.my.id/files/3Czz.mp4','https://cdn.yuki-wabot.my.id/files/oj4E.mp4','https://cdn.yuki-wabot.my.id/files/cWWo.mp4','https://cdn.yuki-wabot.my.id/files/MAgj.mp4'],
    orgy:       ['https://cdn.yuki-wabot.my.id/files/W3lc.mp4','https://cdn.yuki-wabot.my.id/files/hIvF.mp4','https://cdn.yuki-wabot.my.id/files/ypTG.mp4','https://cdn.yuki-wabot.my.id/files/65A2.mp4','https://cdn.yuki-wabot.my.id/files/Tnma.mp4','https://cdn.yuki-wabot.my.id/files/DodD.mp4','https://cdn.yuki-wabot.my.id/files/5U8K.mp4','https://cdn.yuki-wabot.my.id/files/l30j.mp4','https://cdn.yuki-wabot.my.id/files/heWq.mp4','https://cdn.yuki-wabot.my.id/files/LYGn.mp4'],
    squirting:  ['https://cdn.yuki-wabot.my.id/files/j0in.mp4','https://cdn.yuki-wabot.my.id/files/zRAF.mp4','https://cdn.yuki-wabot.my.id/files/pEAr.mp4','https://cdn.yuki-wabot.my.id/files/6Q5l.mp4','https://cdn.yuki-wabot.my.id/files/u2vg.mp4','https://cdn.yuki-wabot.my.id/files/GbnK.mp4','https://cdn.yuki-wabot.my.id/files/mxPV.mp4','https://cdn.yuki-wabot.my.id/files/LEqS.mp4','https://cdn.yuki-wabot.my.id/files/zsWG.mp4','https://cdn.yuki-wabot.my.id/files/rs9t.mp4'],
};

// Alias → carpeta canónica para imágenes NSFW
const NSFW_IMG_CARPETA = {
    poto:      'ass',
    boobs:     'paizuri',
    tetas:     'paizuri',
    hentaigif: 'hentai',
    nekomimi:  'neko',
};

// ── LRU anti-repetición de URLs SFW ─────────────────────────────────────────
// Evita que el bot envíe la misma URL dos veces seguidas por endpoint.
const SFW_URL_HISTORY = new Map(); // endpoint → string[]
const SFW_HISTORY_MAX = 30;

function sfwRecordUrl(endpoint, url) {
    if (!url) return;
    const arr = SFW_URL_HISTORY.get(endpoint) || [];
    if (!arr.includes(url)) arr.push(url);
    if (arr.length > SFW_HISTORY_MAX) arr.shift();
    SFW_URL_HISTORY.set(endpoint, arr);
}

function sfwFilterUrls(endpoint, urls) {
    if (!urls.length) return urls;
    const seen = new Set(SFW_URL_HISTORY.get(endpoint) || []);
    if (!seen.size) return urls;
    const fresh = urls.filter(u => !seen.has(u));
    return fresh.length >= 3 ? fresh : urls;
}

/**
 * Busca un archivo multimedia aleatorio en interactions/{categoria}/{carpeta}/.
 * Solo sirve archivos colocados manualmente — no escribe nada automáticamente.
 * Devuelve { buffer, isVideo } o null si no hay archivos.
 */
function obtenerMediaLocal(categoria, carpeta) {
    if (!carpeta) return null;
    try {
        const dir = path.join(__dirname, '..', 'interactions', categoria, carpeta);
        if (!fs.existsSync(dir)) return null;
        const archivos = fs.readdirSync(dir).filter(f => {
            const ext = path.extname(f).toLowerCase();
            return LOCAL_MEDIA_EXTS.has(ext) && !f.startsWith('.');
        });
        if (!archivos.length) return null;

        // Barajar aleatoriamente y devolver el primero que se pueda leer
        const shuffled = [...archivos].sort(() => Math.random() - 0.5);
        for (const archivo of shuffled) {
            const filePath = path.join(dir, archivo);
            const ext = path.extname(archivo).toLowerCase();
            const isVideo = ext === '.mp4' || ext === '.webm';
            try {
                const buffer = fs.readFileSync(filePath);
                if (buffer.length < 100) continue;
                return { buffer, isVideo };
            } catch { continue; }
        }
        return null;
    } catch {
        return null;
    }
}

// ══════════════════════════════════════════
//  DICCIONARIO DE TRADUCCIÓN R34 (ES → tags booru)
// ══════════════════════════════════════════
const R34_TAG_DICT = {
    // Cuerpo
    'tetas': 'breasts', 'pechos': 'breasts', 'senos': 'breasts',
    'tetas grandes': 'big_breasts', 'tetona': 'big_breasts', 'tetonas': 'big_breasts',
    'tetas pequeñas': 'small_breasts', 'plana': 'flat_chest', 'planas': 'flat_chest',
    'culo': 'ass', 'poto': 'ass', 'nalgas': 'ass', 'trasero': 'ass', 'pompas': 'ass',
    'culo grande': 'large_ass', 'coño': 'pussy', 'vagina': 'pussy', 'pene': 'penis',
    'polla': 'penis', 'pito': 'penis', 'piernas': 'legs', 'muslos': 'thighs',
    'muslos gruesos': 'thick_thighs', 'cintura': 'waist', 'cadera': 'hips',
    'ombligo': 'navel', 'pies': 'feet', 'axilas': 'armpits',
    // Cabello
    'rubia': 'blonde_hair', 'rubio': 'blonde_hair',
    'pelirroja': 'red_hair', 'pelirrojo': 'red_hair',
    'morena': 'brown_hair', 'moreno': 'brown_hair',
    'negra': 'black_hair', 'cabello negro': 'black_hair',
    'azul': 'blue_hair', 'cabello azul': 'blue_hair',
    'rosa': 'pink_hair', 'cabello rosa': 'pink_hair',
    'verde': 'green_hair', 'plateada': 'silver_hair', 'blanca': 'white_hair',
    'morada': 'purple_hair', 'arcoiris': 'multicolored_hair',
    // Ojos
    'ojos azules': 'blue_eyes', 'ojos rojos': 'red_eyes', 'ojos verdes': 'green_eyes',
    'ojos rosas': 'pink_eyes', 'ojos morados': 'purple_eyes',
    // Tipo de personaje
    'neko': 'catgirl', 'gata': 'catgirl', 'catgirl': 'catgirl',
    'elfa': 'elf', 'demonio': 'demon_girl', 'angel': 'angel',
    'succubus': 'succubus', 'bruja': 'witch', 'maid': 'maid',
    'ninja': 'ninja', 'vikinga': 'viking', 'guerrera': 'warrior',
    'sirena': 'mermaid', 'hada': 'fairy', 'coneja': 'bunny_girl', 'conejita': 'bunny_girl',
    'zorra': 'fox_girl', 'lobo': 'wolf_girl', 'dragona': 'dragon_girl',
    'milf': 'milf', 'madre': 'milf', 'maestra': 'teacher', 'enfermera': 'nurse',
    'policia': 'police', 'idol': 'idol', 'bruja': 'witch',
    'futanari': 'futanari', 'futa': 'futanari', 'trap': 'femboy', 'femboy': 'femboy',
    // Ropa y lencería
    'desnuda': 'nude', 'desnudo': 'nude', 'sin ropa': 'nude',
    'lenceria': 'lingerie', 'lencería': 'lingerie', 'ropa interior': 'lingerie',
    'bikini': 'bikini', 'tanga': 'thong', 'calzones': 'panties', 'panties': 'panties',
    'calcetas': 'socks', 'medias': 'thighhighs', 'leggings': 'leggings',
    'vestido': 'dress', 'falda': 'skirt', 'minifalta': 'miniskirt', 'uniforme': 'school_uniform',
    'colegiala': 'school_uniform', 'pijama': 'pajamas', 'kimono': 'kimono',
    'armadura': 'armor', 'bata': 'open_clothes', 'sueter': 'sweater', 'suéter': 'sweater',
    // Acciones / situaciones
    'hentai': 'sex', 'sexo': 'sex', 'follar': 'sex', 'coger': 'sex',
    'mamada': 'blowjob', 'chupar': 'blowjob', 'lamer': 'cunnilingus',
    'creampie': 'creampie', 'corrida': 'cum', 'correrse': 'cum',
    'anal': 'anal', 'doble': 'double_penetration', 'dp': 'double_penetration',
    'masturbacion': 'masturbation', 'masturbación': 'masturbation', 'paja': 'handjob',
    'beso': 'kiss', 'abuso': 'rape', 'atada': 'bondage', 'bondage': 'bondage',
    'sumisa': 'submissive', 'dominatrix': 'femdom', 'dominacion': 'femdom',
    'grupo': 'group_sex', 'orgia': 'orgy', 'yuri': 'yuri', 'yaoi': 'yaoi',
    // Cantidad de personajes
    'sola': '1girl', 'solo': '1girl', 'dos chicas': '2girls', 'pareja': 'hetero',
    // Otras
    'anime': '1girl', 'ecchi': 'ecchi', 'tentaculo': 'tentacle', 'tentáculos': 'tentacle',
    'magia': 'magic', 'playa': 'beach', 'piscina': 'pool', 'ducha': 'shower', 'baño': 'bath',
    'gordita': 'chubby', 'curvilínea': 'curvy', 'delgada': 'slim', 'musculosa': 'muscular',
    'embarazada': 'pregnant', 'lactando': 'lactation', 'leche': 'lactation',
    'cosplay': 'cosplay', 'gamer': 'gamer_girl', 'bailando': 'dancing'
};

function traducirTagsR34(input) {
    const palabras = String(input || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    const traducidas = palabras.map(p => R34_TAG_DICT[p] || p);
    return traducidas.join('+');
}

function parsearInputR34(queryRaw) {
    const raw = String(queryRaw || '').trim();
    const normaliz = s => s.toLowerCase()
        .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e')
        .replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u');
    const palabras = raw.toLowerCase().split(/\s+/).filter(Boolean);
    let waifuTag = null;
    let restoIdx = 0;
    for (let n = Math.min(3, palabras.length); n >= 1; n--) {
        const candidato = palabras.slice(0, n).join(' ');
        const w = encontrarWaifu(candidato);
        if (w?.tag) {
            const normCand = normaliz(candidato).replace(/\s/g, '');
            const normKey  = normaliz(w.key || '').replace(/\s/g, '');
            if (normCand === normKey) {
                waifuTag = String(w.tag).toLowerCase();
                restoIdx = n;
                break;
            }
        }
    }
    const restoPalabras = palabras.slice(restoIdx);
    const tagsExtra = restoPalabras.map(p => R34_TAG_DICT[p] || p.replace(/\s+/g, '_')).filter(Boolean);
    const todosTags = waifuTag ? [waifuTag, ...tagsExtra] : (tagsExtra.length ? tagsExtra : [palabras.join('_')]);
    const hayTraduccion = restoPalabras.some((p, i) => (R34_TAG_DICT[p] || p) !== restoPalabras[i]);
    return { tags: todosTags.join('+'), waifuTag, tagsExtra, labelOriginal: raw, hayTraduccion };
}

function sugerenciasR34() {
    const pares = [
        ['rubia', 'blonde_hair'], ['morena', 'brown_hair'], ['pelirroja', 'red_hair'],
        ['desnuda', 'nude'], ['bikini', 'bikini'], ['colegiala', 'school_uniform'],
        ['lenceria', 'lingerie'], ['neko', 'catgirl'], ['milf', 'milf'],
        ['maid', 'maid'], ['medias', 'thighhighs'], ['futa', 'futanari'],
        ['yuri', 'yuri'], ['conejita', 'bunny_girl'], ['creampie', 'creampie'],
    ];
    const elegidos = pares.sort(() => Math.random() - 0.5).slice(0, 5);
    return elegidos.map(([es, en]) => `_${es}_ → \`${en}\``).join('\n');
}

function pidRandomR34() {
    return Math.floor(Math.random() * 51); // 0..50
}

// waifuDB + encontrarWaifu extraídos a src/waifu_db.js
const { waifuDB, encontrarWaifu } = require('./waifu_db');
const { getUsuario } = require('./database');
// SFW_ACCIONES extraído a src/sfw_acciones.js
const { SFW_ACCIONES } = require('./sfw_acciones');

// ══════════════════════════════════════════
//  NSFW - IMÁGENES
// ══════════════════════════════════════════
const NSFW_CMDS = {
    neko:      'neko',
    hentai:    'hentai',
    ass:       'ass',
    poto:      'ass',
    pussy:     'pussy',
    boobs:     'paizuri',
    tetas:     'paizuri',
    hentaigif: 'hentai',
    loli:      'loli',
    nekomimi:  'neko',
    milf:      'milf',
    ecchi:     'ecchi',
    ero:       'ero',
    creampie:  'creampie',
    trap:      'trap',
    femdom:    'femdom',
};

// Tags específicos para cada tipo NSFW (Gelbooru/Danbooru)
const NSFW_TAGS = {
    ass:      '1girl+ass+rating:explicit',
    pussy:    '1girl+pussy+rating:explicit',
    neko:     'cat_ears+cat_tail+nude+rating:explicit',
    hentai:   '1girl+nude+rating:explicit',
    loli:     '1girl+flat_chest+rating:explicit',
    blowjob:  '1girl+fellatio+rating:explicit',
    boobs:    '1girl+large_breasts+rating:explicit',
    paizuri:  '1girl+paizuri+rating:explicit',
    cum:      '1girl+cum+rating:explicit',
    anal:     '1girl+anal+rating:explicit',
    yuri:     '2girls+yuri+rating:explicit',
    milf:     '1girl+milf+rating:explicit',
    ecchi:    '1girl+ecchi+rating:sensitive',
    ero:      '1girl+underwear+rating:sensitive',
    creampie: '1girl+creampie+rating:explicit',
    trap:     'trap+rating:explicit',
    femdom:   'femdom+rating:explicit',
};

// ══════════════════════════════════════════
//  NSFW - ACCIONES (texto)
// ══════════════════════════════════════════
const NSFW_ACCIONES = {
    anal: {
        emoji: '🍑',
        mencion: [
            'le hizo un anal a *@dest*',
            'penetró el culito de *@dest* sin pedir permiso',
            'le metió por atrás a *@dest* bien rico',
            'le rompió el culo a *@dest* sin compasión',
        ],
        solo: [
            'quiere hacerle un anal a alguien del grupo',
            'anda buscando un culito que penetrar',
            'quiere meter por atrás sin pedir permiso',
            'está cachondo y quiere romper culos',
        ],
    },
    blowjob: {
        emoji: '💦',
        mencion: [
            'le dio una mamada a *@dest*',
            'se arrodilló ante *@dest* y se la mamó entera',
            'le chupó el pene a *@dest* con ganas',
            'se metió a *@dest* en la boca hasta el fondo',
        ],
        solo: [
            'está dando mamadas a quien quiera',
            'anda de rodillas buscando a quien mamar',
            'tiene la boca lista para el primero que quiera',
            'quiere chupar a alguien del grupo ahora mismo',
        ],
    },
    mamada: {
        emoji: '💦',
        mencion: [
            'le dio una mamada a *@dest*',
            'se arrodilló ante *@dest* y se la mamó entera',
            'le chupó el pene a *@dest* con ganas',
            'se metió a *@dest* en la boca hasta el fondo',
        ],
        solo: [
            'está dando mamadas a quien quiera',
            'anda de rodillas buscando a quien mamar',
            'tiene la boca lista para el primero que quiera',
            'quiere chupar a alguien del grupo ahora mismo',
        ],
    },
    bj: {
        emoji: '💦',
        mencion: [
            'le dio una mamada a *@dest*',
            'se arrodilló ante *@dest* y se la mamó entera',
            'le chupó el pene a *@dest* con ganas',
            'se metió a *@dest* en la boca hasta el fondo',
        ],
        solo: [
            'está dando mamadas a quien quiera',
            'anda de rodillas buscando a quien mamar',
            'tiene la boca lista para el primero que quiera',
            'quiere chupar a alguien del grupo ahora mismo',
        ],
    },
    boobjob: {
        emoji: '🍈',
        mencion: [
            'le hizo una rusa a *@dest*',
            'le apretó las tetas alrededor de la polla a *@dest*',
            'le ofreció sus pechos a *@dest* para una rusa',
            'metió la polla de *@dest* entre sus tetas y empezó a moverse',
        ],
        solo: [
            'está haciendo rusas a quien quiera',
            'quiere apretar una polla entre sus tetas',
            'anda ofreciendo rusas gratis en el grupo',
            'tiene los pechos listos para complacer a alguien',
        ],
    },
    cum: {
        emoji: '💦',
        mencion: [
            'se vino encima de *@dest*',
            'acabó todo encima de *@dest* sin avisar',
            'le llenó la cara de leche a *@dest*',
            'se corrió sobre *@dest* a chorro',
        ],
        solo: [
            'se vino encima de todos',
            'acabó sin avisarle a nadie',
            'se corrió a lo bestia y roció a todo el grupo',
            'se vino solo como un campeón',
        ],
    },
    cummouth: {
        emoji: '💦',
        mencion: [
            'acabó en la boca de *@dest*',
            'se corrió directo en la boca de *@dest*',
            'le llenó la boca de leche a *@dest*',
            'le hizo tragar todo a *@dest*',
        ],
        solo: [
            'acabó en la boca de alguien del grupo',
            'quiere acabar en la boca de alguien',
            'se corrió buscando una boca abierta',
            'quiere que alguien le trague hasta la última gota',
        ],
    },
    cumshot: {
        emoji: '💦',
        mencion: [
            'le disparó semen a *@dest*',
            'regó a *@dest* de leche de arriba a abajo',
            'le salpicó la cara a *@dest* sin compasión',
            'acabó a distancia sobre *@dest*',
        ],
        solo: [
            'disparó semen sin apuntar a nadie',
            'regó a todos sin avisar',
            'se corrió a lo bestia y salpicó a todo el grupo',
            'disparó su carga al aire libre',
        ],
    },
    fap: {
        emoji: '💦',
        mencion: [
            'se hizo una paja pensando en *@dest*',
            'se pajeó mirando las fotos de *@dest*',
            'acabó imaginándose a *@dest*',
            'se masturbó sin parar pensando en *@dest*',
        ],
        solo: [
            'se está haciendo una paja... qué rico',
            'está en el baño haciéndose una paja',
            'se masturbó solo como de costumbre',
            'anda de pajero por el grupo',
        ],
    },
    paja: {
        emoji: '💦',
        mencion: [
            'se hizo una paja pensando en *@dest*',
            'se pajeó mirando las fotos de *@dest*',
            'acabó imaginándose a *@dest*',
            'se masturbó sin parar pensando en *@dest*',
        ],
        solo: [
            'se está haciendo una paja... qué rico',
            'está en el baño haciéndose una paja',
            'se masturbó solo como de costumbre',
            'anda de pajero por el grupo',
        ],
    },
    footjob: {
        emoji: '🦶',
        mencion: [
            'le hizo una paja con los pies a *@dest*',
            'usó sus pies para complacer a *@dest*',
            'apretó la polla de *@dest* entre sus pies despacito',
            'le dio una footjob de lujo a *@dest*',
        ],
        solo: [
            'está dando pajas con los pies a quien quiera',
            'anda ofreciendo footjobs gratis en el grupo',
            'quiere usar sus pies con alguien del grupo',
            'tiene los pies listos para complacer al primero que pida',
        ],
    },
    fuck: {
        emoji: '🔥',
        mencion: [
            'se cogió a *@dest*',
            'se tiró a *@dest* sin pensarlo dos veces',
            'le metió la polla a *@dest* hasta el fondo',
            'folló a *@dest* sin parar hasta acabar',
        ],
        solo: [
            'se cogió a todos los del grupo',
            'anda queriendo coger con quien sea',
            'se tiró a todo el grupo de una vez',
            'está cachondo y quiere follar a todos',
        ],
    },
    coger: {
        emoji: '🔥',
        mencion: [
            'se cogió a *@dest*',
            'se tiró a *@dest* sin pensarlo dos veces',
            'le metió la polla a *@dest* hasta el fondo',
            'folló a *@dest* sin parar hasta acabar',
        ],
        solo: [
            'se cogió a todos los del grupo',
            'anda queriendo coger con quien sea',
            'se tiró a todo el grupo de una vez',
            'está cachondo y quiere follar a todos',
        ],
    },
    grabboobs: {
        emoji: '🍈',
        mencion: [
            'le agarró las tetas a *@dest*',
            'apretó los pechos de *@dest* con las dos manos',
            'le metió mano a las tetas a *@dest* sin pedir permiso',
            'le sobó los senos a *@dest* bien rico',
        ],
        solo: [
            'anda agarrando tetas por ahí sin permiso',
            'quiere agarrarle las tetas a alguien del grupo',
            'está con las manos listas para apretar pechos',
            'anda de pillo agarrando todo lo que puede',
        ],
    },
    grope: {
        emoji: '🙈',
        mencion: [
            'manoseó a *@dest*',
            'le metió mano a *@dest* por todos lados',
            'tocó a *@dest* donde no debía',
            'le agarró el culo a *@dest* sin avisar',
        ],
        solo: [
            'está manoseando a alguien del grupo',
            'anda tocando lo que no debe por ahí',
            'metió mano sin pedir permiso',
            'está de manoseo libre por todo el grupo',
        ],
    },
    handjob: {
        emoji: '💦',
        mencion: [
            'le hizo una paja a *@dest*',
            'le agarró la polla a *@dest* y empezó a moverla',
            'le dio placer con la mano a *@dest* hasta el final',
            'le sacudió la polla a *@dest* sin parar',
        ],
        solo: [
            'le está haciendo una paja a alguien por ahí',
            'anda ofreciendo pajas con la mano gratis',
            'tiene las manos listas para complacer a quien quiera',
            'quiere hacerle una paja a alguien del grupo',
        ],
    },
    lickass: {
        emoji: '🍑',
        mencion: [
            'le lamió el culo a *@dest*',
            'enterró la cara en el trasero de *@dest*',
            'le comió el culo a *@dest* rico rico',
            'le pasó la lengua por el ano a *@dest* despacito',
        ],
        solo: [
            'está lamiendo culos por ahí',
            'quiere comer el culo de alguien del grupo',
            'anda buscando un culito que lamer',
            'tiene la lengua lista para comer culos',
        ],
    },
    lickdick: {
        emoji: '💦',
        mencion: [
            'le lamió el pene a *@dest*',
            'le pasó la lengua por toda la polla a *@dest*',
            'le chupó la punta a *@dest* despacito',
            'adoró el pene de *@dest* con la lengua de arriba a abajo',
        ],
        solo: [
            'anda lamiendo penes por ahí',
            'quiere lamer la polla de alguien del grupo',
            'tiene la lengua lista para un pene',
            'está buscando una polla que lamer ahora mismo',
        ],
    },
    lickpussy: {
        emoji: '💦',
        mencion: [
            'le lamió el coño a *@dest*',
            'le comió el coño a *@dest* con ganas',
            'enterró la cara entre las piernas de *@dest*',
            'le pasó la lengua por el clítoris a *@dest* sin parar',
        ],
        solo: [
            'está lamiendo coños por ahí',
            'quiere comer el coño de alguien del grupo',
            'tiene la lengua lista para un coño rico',
            'anda buscando a quién comerle el coño',
        ],
    },
    sixnine: {
        emoji: '🔥',
        mencion: [
            'hizo un 69 con *@dest*',
            'se puso en 69 con *@dest* a la vez',
            'se comió a *@dest* mientras *@dest* se lo comía',
            'montó un 69 bien húmedo con *@dest*',
        ],
        solo: [
            'quiere hacer un 69 con alguien del grupo',
            'anda buscando pareja para un 69',
            'quiere comerse a alguien mientras le comen',
            'tiene ganas de un buen 69 mutuo ahora mismo',
        ],
    },
    '69': {
        emoji: '🔥',
        mencion: [
            'hizo un 69 con *@dest*',
            'se puso en 69 con *@dest* a la vez',
            'se comió a *@dest* mientras *@dest* se lo comía',
            'montó un 69 bien húmedo con *@dest*',
        ],
        solo: [
            'quiere hacer un 69 con alguien del grupo',
            'anda buscando pareja para un 69',
            'quiere comerse a alguien mientras le comen',
            'tiene ganas de un buen 69 mutuo ahora mismo',
        ],
    },
    spank: {
        emoji: '🍑',
        mencion: [
            'le dio una nalgada a *@dest*',
            'le azotó el culo a *@dest* sin avisar',
            'le dejó la marca de la mano en el culo a *@dest*',
            'le cacheteó las nalgas a *@dest* con fuerza',
        ],
        solo: [
            'anda dando nalgadas por ahí sin permiso',
            'está azotando culos sin pedir permiso',
            'quiere darle una nalgada a alguien del grupo',
            'tiene el brazo listo para nalgadas',
        ],
    },
    nalgada: {
        emoji: '🍑',
        mencion: [
            'le dio una nalgada a *@dest*',
            'le azotó el culo a *@dest* sin avisar',
            'le dejó la marca de la mano en el culo a *@dest*',
            'le cacheteó las nalgas a *@dest* con fuerza',
        ],
        solo: [
            'anda dando nalgadas por ahí sin permiso',
            'está azotando culos sin pedir permiso',
            'quiere darle una nalgada a alguien del grupo',
            'tiene el brazo listo para nalgadas',
        ],
    },
    suckboobs: {
        emoji: '🍈',
        mencion: [
            'le chupó las tetas a *@dest*',
            'se metió los pezones de *@dest* en la boca',
            'mamó los pechos de *@dest* con ganas',
            'le chupó los pezones a *@dest* despacito',
        ],
        solo: [
            'está chupando tetas sin parar',
            'quiere chupar las tetas de alguien del grupo',
            'anda buscando pechos que mamar',
            'tiene la boca lista para unas tetas ricas',
        ],
    },
    undress: {
        emoji: '👗',
        mencion: [
            'desnudó a *@dest*',
            'le quitó toda la ropa a *@dest* de un jalón',
            'dejó a *@dest* en cueros sin que se lo esperara',
            'le arrancó la ropa a *@dest* despacito pieza por pieza',
        ],
        solo: [
            'está desnudando a alguien del grupo',
            'anda quitándole la ropa a quien pueda',
            'quiere dejar a alguien del grupo en cueros',
            'tiene ganas de ver a alguien completamente desnudo',
        ],
    },
    encuerar: {
        emoji: '👗',
        mencion: [
            'desnudó a *@dest*',
            'le quitó toda la ropa a *@dest* de un jalón',
            'dejó a *@dest* en cueros sin que se lo esperara',
            'le arrancó la ropa a *@dest* despacito pieza por pieza',
        ],
        solo: [
            'está desnudando a alguien del grupo',
            'anda quitándole la ropa a quien pueda',
            'quiere dejar a alguien del grupo en cueros',
            'tiene ganas de ver a alguien completamente desnudo',
        ],
    },
    yuri: {
        emoji: '🌸',
        mencion: [
            'hizo tijeras con *@dest*',
            'se frotó bien rico con *@dest*',
            'montó unas tijeras apretadas con *@dest*',
            'se restregó con *@dest* hasta que las dos se vinieron',
        ],
        solo: [
            'quiere hacer tijeras con alguien del grupo',
            'anda buscando con quién frotarse',
            'está lista para unas ricas tijeras',
            'quiere montar tijeras con quien quiera ahora',
        ],
    },
    fingering: {
        emoji: '💦',
        mencion: [
            'le metió los dedos a *@dest*',
            'dejó a *@dest* sin aliento con sus dedos',
            'le hizo sentir algo especial a *@dest* con los dedos',
            'le exploró los rincones a *@dest* con mucho cuidado',
        ],
        solo: [
            'se está metiendo los dedos sin aviso',
            'anda jugando con sus dedos de forma inapropiada',
            'tiene los dedos inquietos y no hay nadie cerca',
            'modo fingering solitario activado en el grupo',
        ],
    },
    creampie: {
        emoji: '💦',
        mencion: [
            'terminó dentro de *@dest* sin avisar',
            'le dejó un regalo inesperado dentro a *@dest*',
            'acabó dentro de *@dest* completamente',
            'el final fue adentro, todo en *@dest*',
        ],
        solo: [
            'terminó dentro sin decirle a nadie',
            'el creampie más inesperado del grupo',
            'acabó adentro como todo un profesional/a',
            'la entrega final fue interna y sin aviso',
        ],
    },
    facesitting: {
        emoji: '🍑',
        mencion: [
            'se sentó en la cara de *@dest* sin pedir permiso',
            'usó la cara de *@dest* como silla personal',
            'se acomodó sobre la cara de *@dest* con toda comodidad',
            'la cara de *@dest* es ahora su asiento favorito',
        ],
        solo: [
            'está buscando una cara donde sentarse',
            'anda con ganas de hacer facesitting a alguien del grupo',
            'quiere una cara cómoda donde acomodarse',
            'modo facesitting: activado, se busca voluntario/a',
        ],
    },
    deepthroat: {
        emoji: '💦',
        mencion: [
            'le metió toda la polla en la garganta a *@dest*',
            'se tragó todo lo de *@dest* hasta el fondo',
            'deepthroat completo a *@dest* sin respirar',
            'la garganta de *@dest* ya no tiene secretos para este/esta',
        ],
        solo: [
            'está haciendo garganta profunda a quien quiera',
            'anda ofreciendo deepthroat gratis en el grupo',
            'tiene la garganta lista para quien se atreva',
            'modo garganta profunda activado, ¿quién se apunta?',
        ],
    },
    thighjob: {
        emoji: '🦵',
        mencion: [
            'le hizo una entre piernas a *@dest*',
            'apretó sus muslos alrededor de *@dest* despacito',
            'le frotó la polla entre los muslos a *@dest*',
            'los muslos de *@dest* nunca olvidarán este momento',
        ],
        solo: [
            'está ofreciendo thighjobs a quien lo pida',
            'tiene los muslos listos para complacer a alguien',
            'modo thighjob gratuito en el grupo hoy',
            'anda con los muslos apretados esperando acción',
        ],
    },
    bondage: {
        emoji: '⛓️',
        mencion: [
            'ató a *@dest* sin posibilidad de escapar',
            'dejó a *@dest* bien amarrado/a y sin salida',
            'inmovilizó a *@dest* con maestría absoluta',
            '*@dest* ya no puede moverse gracias a este/esta',
        ],
        solo: [
            'está atado/a y sin escapatoria propia',
            'anda buscando a quién atar en el grupo',
            'modo bondage activado, nadie está a salvo',
            'tiene cuerdas y no piensa desperdiciarlas',
        ],
    },
    pegging: {
        emoji: '🍆',
        mencion: [
            'le pegó por detrás a *@dest* con todo',
            'le dio lo que no esperaba a *@dest*',
            'le demostró a *@dest* lo que significa el rol inverso',
            '*@dest* recibió la sorpresa más inesperada de su vida',
        ],
        solo: [
            'está buscando a quién darle pegging en el grupo',
            'anda con el arnés puesto y sin víctima',
            'modo pegging activo, ¿quién se atreve?',
            'tiene energía de sobra y nadie para pegging',
        ],
    },
    futanari: {
        emoji: '🔥',
        mencion: [
            'tiene lo mejor de los dos mundos y se lo demostró a *@dest*',
            'le enseñó a *@dest* su sorpresa oculta',
            '*@dest* no esperaba lo que escondía debajo',
            'le presentó a *@dest* su lado más especial',
        ],
        solo: [
            'tiene lo mejor de ambos mundos y lo presume',
            'la sorpresa debajo del uniforme es inigualable',
            'modo futa activo, que no se diga más',
            'lo tiene todo y no se lo guarda para nadie',
        ],
    },
    futa: {
        emoji: '🔥',
        mencion: [
            'tiene lo mejor de los dos mundos y se lo demostró a *@dest*',
            'le enseñó a *@dest* su sorpresa oculta',
            '*@dest* no esperaba lo que escondía debajo',
            'le presentó a *@dest* su lado más especial',
        ],
        solo: [
            'tiene lo mejor de ambos mundos y lo presume',
            'la sorpresa debajo del uniforme es inigualable',
            'modo futa activo, que no se diga más',
            'lo tiene todo y no se lo guarda para nadie',
        ],
    },
    yaoi: {
        emoji: '🌈',
        mencion: [
            'pasó un momento muy intenso con *@dest*',
            'se lo pasó genial con *@dest* a solas',
            'vivió una noche de pasión con *@dest*',
            '*@dest* y este/esta tuvieron una conexión profunda',
        ],
        solo: [
            'está disfrutando de un momento muy intenso',
            'yaoi mode: activado sin destinatario aún',
            'anda buscando compañero para un momento especial',
            'tiene ganas de pasar un rato muy intenso',
        ],
    },
    bukkake: {
        emoji: '💦',
        mencion: [
            'invitó a sus amigos a acabar encima de *@dest*',
            'organizó una lluvia muy especial sobre *@dest*',
            'dejó a *@dest* completamente bañado/a',
            'fue el maestro/a de ceremonias sobre *@dest*',
        ],
        solo: [
            'terminó solo de una forma muy especial',
            'el bukkake solitario del grupo está servido',
            'lluvia de leche en el chat, cuidado todos',
            'modo bukkake activado sin objetivo confirmado',
        ],
    },
    orgy: {
        emoji: '🔥',
        mencion: [
            'organizó una orgía con *@dest* y todos los del grupo',
            'invitó a *@dest* a la fiesta más salvaje del chat',
            '*@dest* fue el/la invitado/a de honor a la orgía',
            'la orgía que organizó tiene a *@dest* como protagonista',
        ],
        solo: [
            'está organizando una orgía en el grupo',
            'abrió la fiesta y todos están invitados',
            'modo orgía grupal: activado, nadie se salva',
            'orgia del grupo, todo el mundo convocado',
        ],
    },
    orgia: {
        emoji: '🔥',
        mencion: [
            'organizó una orgía con *@dest* y todos los del grupo',
            'invitó a *@dest* a la fiesta más salvaje del chat',
            '*@dest* fue el/la invitado/a de honor a la orgía',
            'la orgía que organizó tiene a *@dest* como protagonista',
        ],
        solo: [
            'está organizando una orgía en el grupo',
            'abrió la fiesta y todos están invitados',
            'modo orgía grupal: activado, nadie se salva',
            'orgia del grupo, todo el mundo convocado',
        ],
    },
    squirting: {
        emoji: '💦',
        mencion: [
            'llevó a *@dest* al límite hasta que se vino con todo',
            'hizo que *@dest* llegara al clímax más húmedo',
            'no paró hasta hacer que *@dest* squirtee sin control',
            '*@dest* llegó al límite máximo gracias a este/esta',
        ],
        solo: [
            'llegó al límite y se vino con todo',
            'el squirt más épico del grupo acabó de ocurrir',
            'modo squirting activado, nadie queda seco/a',
            'llegó a la cima y la explosión fue monumental',
        ],
    },
    squirt: {
        emoji: '💦',
        mencion: [
            'llevó a *@dest* al límite hasta que se vino con todo',
            'hizo que *@dest* llegara al clímax más húmedo',
            'no paró hasta hacer que *@dest* squirtee sin control',
            '*@dest* llegó al límite máximo gracias a este/esta',
        ],
        solo: [
            'llegó al límite y se vino con todo',
            'el squirt más épico del grupo acabó de ocurrir',
            'modo squirting activado, nadie queda seco/a',
            'llegó a la cima y la explosión fue monumental',
        ],
    },
    tijeras: {
        emoji: '🌸',
        mencion: [
            'hizo tijeras con *@dest*',
            'se frotó bien rico con *@dest*',
            'montó unas tijeras apretadas con *@dest*',
            'se restregó con *@dest* hasta que las dos se vinieron',
        ],
        solo: [
            'quiere hacer tijeras con alguien del grupo',
            'anda buscando con quién frotarse',
            'está lista para unas ricas tijeras',
            'quiere montar tijeras con quien quiera ahora',
        ],
    },
};

// ══════════════════════════════════════════
//  OBTENER GIF DE NEKOS.BEST + DESCARGAR BUFFER
// ══════════════════════════════════════════
// Endpoints que el API de nekos.best realmente soporta (sin los custom que darían 404).
const NEKOS_BEST_REAL = new Set([
    'hug', 'kiss', 'slap', 'pat', 'dance', 'cry', 'bite', 'blush', 'cuddle',
    'poke', 'punch', 'laugh', 'run', 'wave', 'bored', 'facepalm', 'happy',
    'think', 'sleep', 'wink', 'tickle', 'nom', 'shoot', 'smug', 'kick',
    'handhold', 'baka', 'handshake', 'highfive', 'yeet', 'feed', 'nod',
    'thumbsup', 'stare', 'shrug', 'sad',
]);

// Todos los endpoints reconocidos (real + personalizados) — usado para lookups de tags.
const NEKOS_BEST_VALIDOS = new Set([
    ...NEKOS_BEST_REAL,
    'smoke', 'kill', 'cold', 'drunk', 'gaming', 'heat', 'draw', 'sing',
    'coffee', 'cook', 'psycho', 'scream', 'scared', 'dramatic', 'bath', 'walk',
    'seduce', 'lick',
]);

// Endpoints nativos de purrbot.site/api/img/sfw/<ep>/gif
// Para endpoints personalizados sin equivalente exacto, se usa el más cercano semánticamente.
const PURRBOT_MAP = {
    hug: 'hug', kiss: 'kiss', slap: 'slap', pat: 'pat', cry: 'cry',
    poke: 'poke', bite: 'bite', tickle: 'tickle', dance: 'dance',
    cuddle: 'cuddle', punch: 'punch', feed: 'feed', lick: 'lick',
    wave: 'wave', nod: 'nod', smile: 'smile', wink: 'wink',
    blush: 'blush', run: 'run', sleep: 'sleep', stare: 'stare',
    shrug: 'shrug', sad: 'cry', facepalm: 'facepalm', baka: 'baka',
    kick: 'kick', nom: 'nom', happy: 'smile', laugh: 'smile',
    highfive: 'highfive', handhold: 'handhold', thumbsup: 'thumbsup',
    handshake: 'handshake', think: 'pout', bored: 'pout',
    yeet: 'throw', shoot: 'punch',
    // Personalizados — fallback al endpoint purrbot más próximo semánticamente
    smoke:    'stare',     // mirando fijamente / relajado (lo más cercano)
    // kill: SIN purrbot — purrbot no tiene endpoint de kill; slap enviaba contenido incorrecto
    cold:     'cry',       // expresión de sufrimiento
    drunk:    'bored',     // estado alterado
    gaming:   'smile',     // entretenimiento
    heat:     'pout',      // incomodidad / expresión facial
    draw:     'pout',      // actividad tranquila / pensativo
    sing:     'dance',     // performance
    coffee:   'feed',      // consumir algo
    cook:     'feed',      // relacionado con comida
    psycho:   'stare',     // mirada intensa
    scream:   'baka',      // gritar / vociferar
    bleh:     'baka',      // lengua / burla ≈ baka
    scared:   'cry',       // expresión de miedo
    dramatic: 'cry',       // dramatismo
    bath:     'pout',      // estado personal
    walk:     'run',       // desplazamiento
    seduce:   'wink',      // coquetería — wink es el más cercano disponible
};

// Endpoints que waifu.pics soporta en /many/sfw/<ep> (devuelve hasta 30 URLs)
const WAIFU_PICS_ENDPOINTS = new Set([
    'hug', 'kiss', 'lick', 'pat', 'smug', 'bonk', 'yeet', 'blush',
    'smile', 'wave', 'highfive', 'handhold', 'nom', 'bite', 'glomp',
    'slap', 'kill', 'kick', 'happy', 'wink', 'poke', 'dance', 'cringe',
    'cuddle', 'cry', 'bully',
]);

// Para endpoints personalizados sin soporte nativo en waifu.pics,
// mapear al endpoint más cercano para obtener contenido visual similar.
const WAIFU_PICS_FALLBACK = {
    seduce:   'smug',    // expresión seductora ≈ smug
    psycho:   'kill',    // intensidad ≈ kill category
    gaming:   'smug',    // entretenido ≈ smug
    heat:     'blush',   // acalorado ≈ ruborizarse
    drunk:    'cry',     // estado alterado ≈ cry
    smoke:    'smug',    // cool/relajado ≈ smug
    cold:     'cry',     // sufrimiento ≈ cry
    draw:     'smile',   // actividad creativa ≈ smile
    sing:     'dance',   // performance ≈ dance
    coffee:   'nom',     // beber algo ≈ nom (comer)
    cook:     'nom',     // preparar comida ≈ nom
    scream:   'baka',    // vociferar ≈ baka
    bleh:     'baka',    // lengua ≈ baka (burla)
    scared:   'cry',     // miedo ≈ cry
    dramatic: 'cry',     // drama ≈ cry
    bath:     'blush',   // íntimo ≈ blush
    walk:     'wave',    // moverse ≈ wave
};

// Endpoints que hmtai.hatsunia.dev soporta (CDN propio, no bloquea IPs de servidor).
// Clave para comandos que fallan por CDN blocking en nekos.best.
const HMTAI_ENDPOINTS = new Set([
    'hug', 'kiss', 'pat', 'cry', 'slap', 'bite', 'poke', 'cuddle', 'dance',
    'punch', 'wave', 'happy', 'sleep', 'wink', 'run', 'pout', 'laugh', 'lick',
    'blush', 'kill', 'scream', 'shrug', 'sad', 'smile', 'bleh', 'nom', 'tickle',
    'yeet', 'baka', 'smug', 'stare', 'nod', 'highfive', 'handhold', 'thumbsup',
    'shoot', 'coffee', 'bored', 'think', 'throw',
]);

// Tags semánticos para Safebooru — usan la sintaxis REAL de Safebooru:
// palabras separadas por espacio = AND entre tags (NO son frases descriptivas).
// Ej: "coffee animated" busca posts con tag "coffee" Y tag "animated".
// Cada endpoint tiene múltiples variantes; se elige una al azar en cada llamada.
const SFW_SEMANTIC_TAGS = {
    hug:      ['hug animated', 'hug anime', 'embrace animated'],
    kiss:     ['kiss animated', 'kiss anime', 'kissing animated'],
    slap:     ['slap animated', 'slap anime', 'cheek_slap animated'],
    pat:      ['headpat animated', 'head_pat animated', 'pat animated'],
    dance:    ['dancing animated', 'dance animated', 'spin animated'],
    cry:      ['crying animated', 'tears animated', 'sobbing animated'],
    bite:     ['bite animated', 'biting animated', 'nibble animated'],
    blush:    ['blush animated', 'blushing animated', 'embarrassed animated'],
    cuddle:   ['cuddle animated', 'cuddling animated', 'snuggle animated'],
    poke:     ['poke animated', 'poking animated', 'finger_poke animated'],
    punch:    ['punch animated', 'punching animated', 'fist animated'],
    laugh:    ['laughing animated', 'laugh animated', 'hysterical animated'],
    run:      ['running animated', 'run animated', 'sprint animated'],
    wave:     ['waving animated', 'wave animated', 'waving_hand animated'],
    bored:    ['bored animated', 'yawning animated', 'yawn animated'],
    facepalm: ['facepalm animated', 'face_palm animated'],
    happy:    ['happy animated', 'excited animated', 'joy animated'],
    think:    ['thinking animated', 'pondering animated', 'contemplating animated'],
    sleep:    ['sleeping animated', 'sleep animated', 'zzz animated'],
    wink:     ['winking animated', 'wink animated', 'eye_wink animated'],
    tickle:   ['tickling animated', 'tickle animated'],
    nom:      ['eating animated', 'nom animated', 'food animated'],
    eat:      ['eating animated', 'food animated', 'ramen animated'],
    lick:     ['licking animated', 'lick animated', 'tongue animated'],
    shoot:    ['shooting animated', 'gun animated', 'pistol animated'],
    smug:     ['smug animated', 'smug_face animated', 'smirk animated'],
    kick:     ['kick animated', 'kicking animated', 'roundhouse_kick animated'],
    handhold: ['hand_holding animated', 'holding_hands animated'],
    baka:     ['baka animated', 'angry_anime animated', 'yelling animated'],
    highfive: ['high_five animated', 'highfive animated', 'clap animated'],
    yeet:     ['throwing animated', 'throw animated', 'yeet animated'],
    feed:     ['feeding animated', 'feed animated', 'spoon_feed animated'],
    nod:      ['nod animated', 'nodding animated'],
    thumbsup: ['thumbs_up animated', 'approval animated'],
    stare:    ['staring animated', 'stare animated', 'wide_eyes animated'],
    shrug:    ['shrug animated', 'shrugging animated'],
    sad:      ['sad animated', 'sadness animated', 'depressed animated'],
    // Personalizados — tags reales de Safebooru (sin frases descriptivas largas)
    smoke:    ['smoking animated', 'cigarette animated', 'smoke animated'],
    kill:     ['katana animated', 'sword animated', 'assassination animated'],
    cold:     ['shivering animated', 'cold animated', 'snow animated'],
    drunk:    ['drunk animated', 'alcohol animated', 'tipsy animated'],
    gaming:   ['video_game animated', 'controller animated', 'playing_games animated'],
    heat:     ['sweat animated', 'sweating animated', 'hot animated'],
    draw:     ['drawing animated', 'sketch animated', 'artist animated'],
    sing:     ['singing animated', 'microphone animated', 'song animated'],
    coffee:   ['coffee animated', 'coffee_cup animated', 'drinking_coffee animated'],
    cook:     ['cooking animated', 'kitchen animated', 'chef animated'],
    psycho:   ['yandere animated', 'insane animated', 'crazy_eyes animated'],
    bleh:     ['bleh animated', 'tongue_out animated', 'teasing animated'],
    scream:   ['screaming animated', 'scream animated', 'yelling animated'],
    scared:   ['scared animated', 'fear animated', 'frightened animated'],
    dramatic: ['crying animated', 'dramatic animated', 'tears animated'],
    bath:     ['bathing animated', 'bath animated', 'bubbles animated'],
    walk:     ['walking animated', 'walk animated', 'strolling animated'],
    seduce:   ['winking animated', 'flirting animated', 'seductive animated'],
};

// Re-encodifica cualquier media (GIF o MP4) al formato exacto que WhatsApp
// necesita para mostrarla animada en el chat con gifPlayback:true.
// Usa execFile directo para mayor fiabilidad y mensajes de error claros.
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

let _ffmpegBin = null;
function getFfmpegBin() {
    if (_ffmpegBin) return _ffmpegBin;
    try {
        const { execSync } = require('child_process');
        _ffmpegBin = execSync('which ffmpeg', { encoding: 'utf8' }).trim();
    } catch {
        _ffmpegBin = require('@ffmpeg-installer/ffmpeg').path;
    }
    return _ffmpegBin;
}

async function convertirParaGifPlayback(inputBuffer, ext = 'gif') {
    const ts     = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const tmpIn  = path.join(os.tmpdir(), `gif_in_${ts}.${ext}`);
    const tmpOut = path.join(os.tmpdir(), `gif_out_${ts}.mp4`);
    fs.writeFileSync(tmpIn, inputBuffer);
    try {
        await execFileAsync(getFfmpegBin(), [
            '-y',
            '-loglevel', 'error',   // suprime el progreso verbose que desborda maxBuffer
            '-i', tmpIn,
            '-vcodec', 'libx264',
            '-profile:v', 'baseline',
            '-level', '3.0',
            '-pix_fmt', 'yuv420p',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            '-r', '15',
            '-an',
            '-movflags', '+faststart',
            '-crf', '28',
            tmpOut,
        ], {
            timeout:   60000,
            maxBuffer: 50 * 1024 * 1024,   // 50 MB — sobrado para cualquier stderr de error
        });
        const mp4 = fs.readFileSync(tmpOut);
        if (mp4.length < 100) throw new Error('MP4 resultante vacío o corrupto');
        return mp4;
    } finally {
        try { fs.unlinkSync(tmpIn); } catch {}
        try { fs.unlinkSync(tmpOut); } catch {}
    }
}

// Descarga una URL y la convierte a MP4. Lanza error si falla.
async function descargarYConvertir(url, endpoint) {
    const bufRes = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: HUMAN_HEADERS
    });
    const rawBuf     = Buffer.from(bufRes.data);
    const cType      = bufRes.headers['content-type'] || '';
    const ext        = (url.includes('.gif') || cType.includes('image/gif')) ? 'gif'
                     : (url.includes('.webm') || cType.includes('video/webm')) ? 'webm'
                     : 'mp4';
    console.log(`[SFW] Descargado ${rawBuf.length} bytes (${cType}) para "${endpoint}". Convirtiendo...`);
    const mp4 = await convertirParaGifPlayback(rawBuf, ext);
    console.log(`[SFW] Conversión OK: ${mp4.length} bytes MP4`);
    return mp4;
}

async function obtenerGifBuffer(endpointInput) {
    const endpoint = String(endpointInput || 'hug').toLowerCase();

    // ── Fase 1: resolver qué endpoint usar en cada fuente ──────────────────────
    const tagVariants = SFW_SEMANTIC_TAGS[endpoint] || [`${endpoint} animated`];
    const selectedTag = tagVariants[Math.floor(Math.random() * tagVariants.length)];

    // NOTA: nekos.best CDN devuelve 403 en TODAS sus URLs desde IPs de servidor.
    // No se incluye en el pool para evitar que llene los 8 intentos con URLs rotas.

    // waifu.pics: endpoint nativo si existe, o el más próximo vía WAIFU_PICS_FALLBACK
    const wpDirect  = WAIFU_PICS_ENDPOINTS.has(endpoint) ? endpoint : (WAIFU_PICS_FALLBACK[endpoint] || null);

    // purrbot.site: endpoint nativo o aproximado (siempre tiene algo)
    const purrbotEp = PURRBOT_MAP[endpoint] || null;

    // hmtai.hatsunia.dev: CDN propio, no bloquea IPs de servidor — reemplaza nekos.best
    const hmtaiEp   = HMTAI_ENDPOINTS.has(endpoint) ? endpoint
                    : (HMTAI_ENDPOINTS.has(PURRBOT_MAP[endpoint] || '') ? PURRBOT_MAP[endpoint] : null);

    // ── Fase 2: consultar todas las fuentes en paralelo ─────────────────────────
    const fetches = [];

    // waifu.pics /many — hasta 30 URLs por petición (CDN propio, muy confiable)
    if (wpDirect) {
        fetches.push(
            axios.post(`https://api.waifu.pics/many/sfw/${wpDirect}`, {}, {
                timeout: 9000,
                headers: { 'Content-Type': 'application/json' }
            })
                .then(r => (r.data?.files || []).filter(Boolean))
                .catch(() => [])
        );
    }

    // purrbot.site — 3 peticiones paralelas para mayor variedad (1 URL cada una)
    if (purrbotEp) {
        fetches.push(
            Promise.allSettled([
                axios.get(`https://purrbot.site/api/img/sfw/${purrbotEp}/gif`, { timeout: 8000 }),
                axios.get(`https://purrbot.site/api/img/sfw/${purrbotEp}/gif`, { timeout: 8000 }),
                axios.get(`https://purrbot.site/api/img/sfw/${purrbotEp}/gif`, { timeout: 8000 }),
            ]).then(rs => rs
                .filter(r => r.status === 'fulfilled')
                .map(r => r.value?.data?.link)
                .filter(Boolean)
            )
        );
    }

    // hmtai.hatsunia.dev — CDN propio, no bloquea servers; 3 peticiones paralelas
    if (hmtaiEp) {
        fetches.push(
            Promise.allSettled([
                axios.get(`https://hmtai.hatsunia.dev/v2/${hmtaiEp}`, { timeout: 8000 }),
                axios.get(`https://hmtai.hatsunia.dev/v2/${hmtaiEp}`, { timeout: 8000 }),
                axios.get(`https://hmtai.hatsunia.dev/v2/${hmtaiEp}`, { timeout: 8000 }),
            ]).then(rs => rs
                .filter(r => r.status === 'fulfilled')
                .map(r => r.value?.data?.url)
                .filter(Boolean)
            )
        );
    }

    // otakugifs.xyz — 2 peticiones paralelas
    fetches.push(
        Promise.allSettled([
            axios.get(`https://api.otakugifs.xyz/gif?reaction=${endpoint}&format=gif`, { timeout: 8000 }),
            axios.get(`https://api.otakugifs.xyz/gif?reaction=${endpoint}&format=gif`, { timeout: 8000 }),
        ]).then(rs => rs
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value?.data?.url)
            .filter(Boolean)
        )
    );

    // nekos.life — fallback adicional
    fetches.push(
        axios.get(`https://nekos.life/api/v2/img/${endpoint}`, { timeout: 8000 })
            .then(r => r.data?.url ? [r.data.url] : [])
            .catch(() => [])
    );

    // api.yuki-wabot.my.id — 5 llamadas paralelas para maximizar variedad de URLs únicas.
    // Con 5 llamadas se obtienen ~4 URLs distintas en endpoints con pool pequeño (ej: kill).
    // Esto evita que apiPool quede con <3 URLs y active el fallback de Safebooru.
    fetches.push(
        Promise.allSettled([
            axios.get(`https://api.yuki-wabot.my.id/sfw/interaction?inter=${endpoint}&key=YukiBot-MD`, { timeout: 9000 }),
            axios.get(`https://api.yuki-wabot.my.id/sfw/interaction?inter=${endpoint}&key=YukiBot-MD`, { timeout: 9000 }),
            axios.get(`https://api.yuki-wabot.my.id/sfw/interaction?inter=${endpoint}&key=YukiBot-MD`, { timeout: 9000 }),
            axios.get(`https://api.yuki-wabot.my.id/sfw/interaction?inter=${endpoint}&key=YukiBot-MD`, { timeout: 9000 }),
            axios.get(`https://api.yuki-wabot.my.id/sfw/interaction?inter=${endpoint}&key=YukiBot-MD`, { timeout: 9000 }),
        ]).then(rs => [...new Set(
            rs.filter(r => r.status === 'fulfilled')
              .map(r => r.value?.data?.result || r.value?.data?.url || r.value?.data?.data)
              .filter(Boolean)
        )])
        .catch(() => [])
    );

    // Safebooru — TODOS los tags en paralelo con pid=0 (garantiza resultados en endpoints raros)
    // + una petición extra con pid aleatorio para variedad en endpoints con muchos posts.
    // Esto soluciona el problema donde pid aleatorio (0-9) falla el 90% del tiempo
    // cuando un tag tiene pocos posts (ej: "kill animated" solo tiene 2 posts, solo en pid=0).
    const safebooruExtract = p =>
        Array.isArray(p)
            ? p.filter(x => /\.(gif|mp4|webm)$/i.test(x.file_url || '')).map(x => x.file_url).filter(Boolean)
            : [];
    const safebooruGet = (tag, pid) =>
        axios.get(
            `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=50` +
            `&tags=${encodeURIComponent(tag)}&pid=${pid}`,
            { timeout: 12000 }
        ).then(r => safebooruExtract(r.data)).catch(() => []);

    // pid=0 para cada variante del tag (cobertura total de contenido raro)
    const sbPid0Promises = tagVariants.map(t => safebooruGet(t, 0));
    // pid aleatorio 1-6 sobre el tag seleccionado (variedad en endpoints populares)
    const sbPidRand = safebooruGet(selectedTag, 1 + Math.floor(Math.random() * 6));

    // (Safebooru se resuelve en Fase 3 de forma separada para no mezclar fuentes)

    // ── Fase 3: agregar resultados de APIs anime (fuentes de confianza) ─────────
    // Safebooru se resuelve por separado y solo se usa como último recurso para
    // evitar mezclar fotos reales / contenido pixelado / archivos enormes con las
    // respuestas de alta calidad que dan las APIs de anime especializadas.
    const [settledApis, sbResults] = await Promise.all([
        Promise.allSettled(fetches),
        Promise.all([...sbPid0Promises, sbPidRand])
            .then(rs => [...new Set(rs.flat().filter(Boolean))])
            .catch(() => []),
    ]);

    const apiUrls = [];
    for (const r of settledApis) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) apiUrls.push(...r.value);
    }
    const uniqueApiUrls = [...new Set(apiUrls.filter(Boolean))];

    // ── Fase 4: anti-repetición LRU — aplicar solo sobre APIs de anime ──────────
    const apiPool = sfwFilterUrls(endpoint, uniqueApiUrls);

    // Pool preferido: GIF/MP4 de APIs de anime primero; Safebooru solo si escasean
    const animadasApi = apiPool.filter(u => /\.(gif|mp4|webm)$/i.test(u));
    let candidatos     = animadasApi.length >= 3 ? animadasApi
                       : apiPool.length   >= 3 ? apiPool
                       : (() => {
                             // Pocas URLs de APIs — agregar Safebooru como refuerzo
                             const sbFiltered = sfwFilterUrls(endpoint,
                                 sbResults.filter(u => /\.(gif|mp4|webm)$/i.test(u)));
                             return [...apiPool, ...sbFiltered];
                         })();

    if (!candidatos.length) {
        // Pool completamente vacío — probar con endpoint de fallback (evita ciclos)
        const fallbackEp = PURRBOT_MAP[endpoint];
        if (fallbackEp && HMTAI_ENDPOINTS.has(fallbackEp) && fallbackEp !== endpoint) {
            try { return await obtenerGifBuffer(fallbackEp); } catch {}
        }
        throw new Error(`Sin URLs disponibles para "${endpoint}" — todos los proveedores fallaron`);
    }

    // ── Fase 5: selección aleatoria y descarga ───────────────────────────────────
    const shuffled = [...candidatos].sort(() => Math.random() - 0.5);

    let lastErr;
    for (const url of shuffled.slice(0, 8)) {   // máximo 8 intentos
        try {
            const mp4 = await descargarYConvertir(url, endpoint);
            sfwRecordUrl(endpoint, url);           // registrar SOLO si se descargó bien
            console.log(`[SFW] ✅ "${endpoint}" — pool ${candidatos.length} URLs, descargado: ${url.slice(-60)}`);
            return { buffer: mp4 };
        } catch (e) {
            lastErr = e;
            console.error(`[SFW] ❌ Fallo descargando "${url.slice(-60)}": ${e.message}`);
        }
    }

    throw new Error(`Descarga fallida para "${endpoint}": ${lastErr?.message}`);
}

// ══════════════════════════════════════════
//  INTERACCIÓN SFW ANIME
// ── Kaomoji por endpoint nekos — sin emojis, expresión por acción ────────────
const SFW_KAOMOJI_MAP = {
    // Afecto / cariño
    hug:       ['(つ◕ᵕ◕)つ', '(づ￣ ³￣)づ', '(⊃｡•́‿•̀｡)⊃', '~(˘▾˘~)'],
    kiss:      ['(˘ε˘~)♡',   '(*^з^)-♪',   '(´ε｀ )',       '(^з^)-☆'],
    cuddle:    ['(⊃｡•́‿•̀｡)⊃','(つ◕ᵕ◕)つ',   '(˘▾˘~)',        '(づ ᴗ _ᴗ)づ'],
    handhold:  ['(♡°▽°♡)',    '(◕‿◕)',       '(´｡• ᵕ •｡`)',  '~♡'],
    pat:       ['(´｡• ᵕ •｡`)', '(◍•ᴗ•◍)',  '(°▽°~)',        '(◕‿◕)'],
    blush:     ['(〃▽〃)',     '(*ノωノ)',     '( ⁄ ⁄•⁄ω⁄•⁄ ⁄)', '(/∇\\)'],
    wink:      ['(¬‿¬)',       '(｡•̀ᴗ-)✧',  '( ˘ ³˘)',       '>.~'],
    // Alegría
    dance:     ['♪(´▽｀)',     '♪～(´ε｀)',   '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', '(✿^‿^)'],
    laugh:     ['(≧▽≦)',       '(*≧▽≦)',      '(^▽^)',          'w~'],
    happy:     ['(✿^‿^)',      '(^▽^)',        '(*^▽^*)',        '(ﾉ◕ヮ◕)ﾉ'],
    highfive:  ['(ﾉ◕ヮ◕)ﾉ',   '(^▽^)',        '(°▽°)',          '~!'],
    thumbsup:  ['(°▽°)',       '(^▽^)',        '(^_^)b',         '~!'],
    feed:      ['(≧▽≦)',       '(^▽^)',        '~',              '(*^▽^*)'],
    nom:       ['(≧▽≦)',       '(^▽^)',        '(*^▽^*)',        'nom~'],
    // Tristeza
    cry:       ['(╥_╥)',       '(T_T)',        '(╯︵╰,)',         '(；＿；)'],
    sad:       ['(╥_╥)',       '(T_T)',        '(╯︵╰,)',         '(；_；)'],
    // Enojo / violencia
    slap:      ['(╬ ◣д◢)',     '(-_-)ノ⌒●',  '(ง •̀_•́)ง',    '(#`Д´)'],
    punch:     ['(ง •̀_•́)ง',  '(ノ`Д´)ノ彡', '(-_-)ノ',         '(╬◣д◢)'],
    kick:      ['(ง •̀_•́)ง',  '(-_-)ノ',     '(╬◣д◢)',         '(ノ`Д´)ノ彡'],
    shoot:     ['(╬ ◣д◢)',     '(-_-)ノ',     '(•̀ᴗ•́)و',      '(ง •̀_•́)ง'],
    kill:      ['(╬ ◣д◢)',     '(ง •̀_•́)ง',  '(-_-)ノ⌒●',     '(ノ`Д´)ノ彡'],
    baka:      ['(╬ ◣д◢)',     '(ノ`Д´)ノ彡', '(-_-)ノ',         '(#`Д´)'],
    // Juguetón
    bite:      ['(•̀ᴗ•́)و',    '(>ᴗ•)',       '(≧∇≦)',          '~(˘▾˘~)'],
    lick:      ['(>ᴗ•)',       '~(˘▾˘~)',     '(≧∇≦)',          '(•ᴗ•)'],
    poke:      ['(>ᴗ•)',       '(•ᴗ•)',        '(¬‿¬)',          '~(˘▾˘~)'],
    tickle:    ['(≧∇≦)',       '(^▽^)',        '~(˘▾˘~)',        '(ﾉ◕ヮ◕)ﾉ'],
    yeet:      ['( •̀ω•́ )✧',  '>.>',         '(•̀ᴗ•́)و',      '~'],
    // Descanso
    sleep:     ['(-.-) zzZ',   '(￣□￣｡)',    '(._.) zzz',      '...zZz'],
    bored:     ['(-.-)',        '(._.)zzZ',    '(￣o￣)',         '...'],
    // Actitudes
    smug:      ['(¬‿¬)',       '( ˘ ³˘)',     '(｡•̀ᴗ-)✧',      '>.>'],
    think:     ['(•̀o•́)و',   '(¬､¬)',        '( ._. )',         '...'],
    facepalm:  ['(-_-)',        '(¬_¬)',        '...',             '(._.)'],
    stare:     ['(¬_¬)',       '(._.)...',     '>.>',            '...'],
    shrug:     ['(¯\\_(ツ)_/¯)', '...',        '~',              '(._.)'],
    // Actividades
    run:       ['( •̀ω•́ )✧',  '~>',          '>.>',            '(•‿•)'],
    wave:      ['(^_^)/',      '(°▽°)',        '(o´▽`o)',        '~o/'],
    handshake: ['(°▽°)',       '(^_^)',        '(o´▽`o)',        '~'],
    nod:       ['(°▽°)',       '(^_^)',        '~',              '(._.)'],
    // Personalizados
    smoke:     ['...',          '(._.)~',      '(¬_¬)',          '~'],
    cold:      ['(>_<)',        'brrr~',       '(;-;)',          '(×_×)'],
    drunk:     ['(＠_＠)',      '...',          '(¬_¬)',          '~'],
    gaming:    ['(•̀ᴗ•́)و',   '( •̀ω•́ )✧',  '(ง •̀_•́)ง',    '>.>'],
    heat:      ['(>_<)',        '(×_×)',        'ugh~',           '(;-;)'],
    draw:      ['(°▽°)',       '(^▽^)',        '~',              '(._.)'],
    sing:      ['♪(´▽｀)',     '♪～',          '(✿^‿^)',         '~♪'],
    coffee:    ['(°▽°)',       '...',          '(._.)~',         'ahhh~'],
    cook:      ['(≧▽≦)',       '(^▽^)',        '~',              'nom~'],
    psycho:    ['(¬_¬)',       '(._.)...',     '...',             '>.>'],
    scream:    ['(╬ ◣д◢)',     '(>_<)',        '!!!',             '(ﾉ◕ヮ◕)ﾉ'],
    scared:    ['(>_<)',       '(;-;)',        '(×_×)',          'eek!'],
    dramatic:  ['...',         '(._.)/',       '(¬_¬)',          '~'],
    bath:      ['(°▽°)',       '~',            '(^▽^)',          'splish~'],
    walk:      ['(._.)/',      '~',            '...',             '(^_^)'],
    seduce:    ['(¬‿¬)',       '( ˘ ³˘)',     '>.~',            '(｡•̀ᴗ-)✧'],
    lick:      ['(>ᴗ•)',       '~(˘▾˘~)',     '(≧∇≦)',          '(•ᴗ•)'],
    peek:      ['(⌐■_■)',      '( ͡° ͜ʖ ͡°)', '>.>',            '...👀'],
    comfort:   ['(づ ᴗ _ᴗ)づ', '(°▽°~)',      '(◕‿◕)',          '~'],
    thinkhard: ['(¬_¬)',       '(•̀o•́)و',    '( ._. )',         '...🤔'],
    curious:   ['(⊙_⊙)',       '(•ᴗ•)?',      '(°o°)',           '~?'],
    sniff:     ['(•ω•)',        '(ᵔᴥᵔ)',       '~sniff~',        '(ó_ò)'],
    trip:      ['(ノ_<。)',     '(>_<)',        'woops~',         '(×_×)'],
    blowkiss:  ['(˘ε˘~)♡',    '(*^з^)',       '♡~',             '(*´з`)'],
    snuggle:   ['(⊃｡•́‿•̀｡)⊃','~(˘▾˘~)',     '(づ ᴗ _ᴗ)づ',   '♡'],
    push:      ['(ง •̀_•́)ง',  '(>ᴗ•)',       '~!',             '(・∀・)'],
    nope:      ['(╯°□°）╯',    '(¬_¬)',        'nope.',          '>.>'],
    jump:      ['(ﾉ◕ヮ◕)ﾉ',   '( •̀ω•́ )✧',  '~!',             '(°▽°)'],
    call:      ['(°▽°)',       '(^_^)/~',     '~📞',            '(o´▽`o)'],
    impregnate:['(¬‿¬)',       '(˘ε˘~)',      '( ͡° ͜ʖ ͡°)',    '~♡'],
};
const SFW_KAOMOJI_DEFAULT = ['~', '...', '(._.)/', '(°▽°)', '(¬_¬)', '>.>'];

// ══════════════════════════════════════════
async function cmdInteraccion(sock, jid, senderJid, accion, mencionados, pushName) {
    const config = SFW_ACCIONES[accion];
    if (!config) return;

    const senderNombre = pushName || senderJid.split('@')[0];
    const elegir    = arr => arr[Math.floor(Math.random() * arr.length)];
    const kaomoji   = elegir(SFW_KAOMOJI_MAP[config.nekos] || SFW_KAOMOJI_DEFAULT);

    let texto;
    if (mencionados && mencionados.length > 0) {
        const destJid     = mencionados[0];
        const destData    = getUsuario(destJid);
        const destNombre  = destData?.pushName || destJid.split('@')[0];
        const parteAccion = elegir(config.mencion).replace('@dest', `\`${destNombre}\``);
        texto = `\`${senderNombre}\` ${parteAccion} ${kaomoji}`;
    } else {
        texto = `\`${senderNombre}\` ${elegir(config.solo)} ${kaomoji}`;
    }

    // GIFs anime 2D — APIs específicas de anime (sin Tenor)
    // obtenerGifBuffer usa: waifu.pics → purrbot → hmtai → otakugifs.xyz → nekos.life → safebooru
    try {
        const { buffer } = await obtenerGifBuffer(config.nekos);
        await sock.sendMessage(jid, {
            video: buffer,
            caption: texto,
            gifPlayback: true,
            mentions: mencionados || []
        });
    } catch (err) {
        logRequestError('cmdInteraccion', err);
        await sock.sendMessage(jid, {
            text: texto,
            mentions: mencionados || []
        });
    }
}

// ══════════════════════════════════════════
//  NSFW IMAGEN
//  1. xbooru.com   (principal)
//  2. yande.re     (secundario)
//  3. hypnohub.net (terciario)
//  4. konachan.com (cuaternario)
//  5. tbib.org     (quinto)
//  6. pic.re       (fallback aleatorio)
// ══════════════════════════════════════════

const IMG_EXT = /\.(jpg|jpeg|jpe|png|webp|gif)$/i;
const rnd = n => Math.floor(Math.random() * n);

// Tags por categoría para cada API
const XBOORU_TAGS = {
    ass: 'ass', pussy: 'pussy', neko: 'neko', hentai: 'hentai',
    loli: 'flat_chest', blowjob: 'blowjob', paizuri: 'paizuri',
    oral: 'blowjob', cum: 'cum', anal: 'anal', yuri: 'yuri',
    milf: 'milf', ecchi: 'lingerie', ero: 'underwear',
    creampie: 'creampie', trap: 'trap', femdom: 'femdom',
};

const YANDERE_TAGS = {
    ass: 'ass', pussy: 'pussy', neko: 'animal_ears', hentai: 'nude',
    loli: 'flat_chest', blowjob: 'blowjob', paizuri: 'paizuri',
    oral: 'blowjob', cum: 'cum', anal: 'anal', yuri: 'yuri',
    milf: 'nude', ecchi: 'nude', ero: 'nude',
    creampie: 'creampie', trap: 'trap', femdom: 'nude',
};

const HYPNOHUB_TAGS = {
    ass: 'ass', pussy: 'pussy', neko: 'neko', hentai: 'nude',
    loli: 'nude', blowjob: 'paizuri', paizuri: 'paizuri',
    oral: 'paizuri', cum: 'cum', anal: 'anal', yuri: 'yuri',
    milf: 'milf', ecchi: 'nude', ero: 'nude',
    creampie: 'cum', trap: 'trap', femdom: 'femdom',
};

const KONACHAN_TAGS = {
    ass: 'ass', pussy: 'pussy', neko: 'neko', hentai: 'nude',
    loli: 'nude', blowjob: 'blowjob', paizuri: 'paizuri',
    oral: 'blowjob', cum: 'cum', anal: 'anal', yuri: 'yuri',
    milf: 'nude', ecchi: 'nude', ero: 'nude',
    creampie: 'nude', trap: 'trap', femdom: 'nude',
};

// Helper: booru con field file_url (xbooru, hypnohub, konachan)
async function buscarEnBooruFileUrl(baseUrl, tag, nombre) {
    try {
        const pid = rnd(10);
        const res = await axios.get(
            `${baseUrl}&tags=${encodeURIComponent(tag)}&pid=${pid}`,
            { timeout: 15000, headers: HUMAN_HEADERS }
        );
        const posts = Array.isArray(res.data) ? res.data : [];
        const imgs = posts.filter(p => p.file_url && IMG_EXT.test(p.file_url));
        if (imgs.length) return imgs[rnd(imgs.length)].file_url;
    } catch (err) { logRequestError(nombre, err); }
    return null;
}

// Helper: tbib (usa directory + image)
async function buscarEnTbib(tag) {
    try {
        const pid = rnd(10);
        const res = await axios.get(
            `https://tbib.org/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeURIComponent(tag)}&pid=${pid}`,
            { timeout: 15000, headers: HUMAN_HEADERS }
        );
        const posts = Array.isArray(res.data) ? res.data : [];
        const imgs = posts.filter(p => p.directory != null && p.image && IMG_EXT.test(p.image));
        if (imgs.length) {
            const p = imgs[rnd(imgs.length)];
            return `https://tbib.org/images/${p.directory}/${p.image}`;
        }
    } catch (err) { logRequestError('tbib', err); }
    return null;
}

// Helper: yande.re (usa file_url)
async function buscarEnYandere(tag) {
    try {
        const page = rnd(10) + 1;
        const res = await axios.get(
            `https://yande.re/post.json?limit=100&tags=${encodeURIComponent(tag)}&page=${page}`,
            { timeout: 15000, headers: HUMAN_HEADERS }
        );
        const posts = Array.isArray(res.data) ? res.data : [];
        const imgs = posts.filter(p => p.file_url && IMG_EXT.test(p.file_url));
        if (imgs.length) return imgs[rnd(imgs.length)].file_url;
    } catch (err) { logRequestError('yande.re', err); }
    return null;
}

async function buscarImagenNsfw(tipo, prefGif = false) {
    // Construir lista de fuentes con sus tags específicos
    const fuentes = [
        { fn: () => buscarEnBooruFileUrl('https://xbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100', XBOORU_TAGS[tipo] || tipo, 'xbooru') },
        { fn: () => buscarEnYandere(YANDERE_TAGS[tipo] || 'nude') },
        { fn: () => buscarEnBooruFileUrl('https://hypnohub.net/index.php?page=dapi&s=post&q=index&json=1&limit=100', HYPNOHUB_TAGS[tipo] || 'nude', 'hypnohub') },
        { fn: () => buscarEnBooruFileUrl('https://konachan.com/post.json?limit=100', KONACHAN_TAGS[tipo] || 'nude', 'konachan') },
        { fn: () => buscarEnTbib(XBOORU_TAGS[tipo] || tipo) },
    ];

    // Aleatorizar orden para repartir carga entre APIs y dar más variedad
    const shuffled = fuentes.sort(() => Math.random() - 0.5);

    for (const { fn } of shuffled) {
        const url = await fn();
        if (url) return url;
    }

    // Fallback final: pic.re aleatorio
    try {
        const res = await axios.get('https://pic.re/image.json', { timeout: 10000, headers: HUMAN_HEADERS });
        const raw = res.data?.file_url || res.data?.url || (typeof res.data === 'string' ? res.data : null);
        if (raw) return raw.startsWith('http') ? raw : `https://${raw}`;
    } catch (err) { logRequestError('pic.re', err); }

    return null;
}

async function cmdNsfw(sock, jid, tipo) {
    const endpoint = NSFW_CMDS[tipo];
    if (!endpoint) return;

    // 0. Carpeta local — prioridad sobre APIs externas
    const carpetaLocal = NSFW_IMG_CARPETA[tipo] || endpoint;
    const local = obtenerMediaLocal('nsfw', carpetaLocal);
    if (local) {
        const caption = `🔞 *${tipo.toUpperCase()}*`;
        if (local.isVideo) {
            await sock.sendMessage(jid, { video: local.buffer, caption, gifPlayback: true });
        } else {
            await sock.sendMessage(jid, { image: local.buffer, caption });
        }
        return;
    }

    try {
        const mediaUrl = await buscarImagenNsfw(endpoint, false);
        if (!mediaUrl) {
            await sock.sendMessage(jid, { text: '❌ No pude cargar la imagen. Intenta de nuevo.' });
            return;
        }

        const esVideo = /\.(mp4|webm)$/i.test(mediaUrl);
        if (esVideo) {
            await sock.sendMessage(jid, {
                video: { url: mediaUrl },
                caption: `🔞 *${tipo.toUpperCase()}*`,
                gifPlayback: true
            });
        } else {
            await sock.sendMessage(jid, {
                image: { url: mediaUrl },
                caption: `🔞 *${tipo.toUpperCase()}*`
            });
        }
    } catch (err) {
        logRequestError('cmdNsfw', err);
        await sock.sendMessage(jid, { text: `❌ Error NSFW: ${err.response?.status || err.message}` });
    }
}

// ══════════════════════════════════════════
//  NSFW ACCIÓN + GIF
// ══════════════════════════════════════════
const NSFW_ACCION_GIF = {
    anal:      'anal',
    blowjob:   'blowjob', mamada: 'blowjob', bj: 'blowjob',
    boobjob:   'paizuri',
    cum:       'cum',
    cummouth:  'oral',
    cumshot:   'cum',
    fap:       'hentai',  paja: 'hentai',
    footjob:   'hentai',
    fuck:      'hentai',  coger: 'hentai',
    grabboobs: 'paizuri',
    grope:     'ecchi',
    handjob:   'hentai',
    lickass:   'ass',
    lickdick:  'blowjob',
    lickpussy: 'hentai',
    sixnine:   'hentai',  '69': 'hentai',
    spank:     'ass',     nalgada: 'ass',
    suckboobs: 'paizuri',
    undress:   'ecchi',   encuerar: 'ecchi',
    yuri:      'yuri',    tijeras: 'yuri',
};

// ── Mapa acción NSFW → endpoints por proveedor de GIFs ──────────────────────
// purrbot : purrbot.site/api/img/nsfw/<ep>/gif
// hmtai   : hmtai.hatsunia.dev/v2/nsfw/<ep>
// waifuPics: api.waifu.pics/many/nsfw/<ep>
// nekobot : nekobot.xyz/api/image?type=<ep>
const NSFW_GIF_MAP = {
    anal:      { purrbot: 'anal',      hmtai: 'anal',       nekobot: 'pgif'    },
    blowjob:   { purrbot: 'blowjob',   hmtai: 'blowjob',   waifuPics: 'blowjob', nekobot: 'blowjob' },
    mamada:    { purrbot: 'blowjob',   hmtai: 'blowjob',   waifuPics: 'blowjob', nekobot: 'blowjob' },
    bj:        { purrbot: 'blowjob',   hmtai: 'blowjob',   waifuPics: 'blowjob', nekobot: 'blowjob' },
    boobjob:   { hmtai: 'boobjob',     nekobot: 'boobs'   },
    cum:       { purrbot: 'cum',       hmtai: 'cum',        nekobot: 'cum'     },
    cummouth:  { purrbot: 'cum',       hmtai: 'cum',        nekobot: 'cum'     },
    cumshot:   { purrbot: 'cum',       hmtai: 'cumshot',    nekobot: 'cum'     },
    fap:       { purrbot: 'solo',      hmtai: 'solo',       nekobot: 'pgif'    },
    paja:      { purrbot: 'solo',      hmtai: 'solo',       nekobot: 'pgif'    },
    footjob:   { purrbot: 'solo',      nekobot: 'pgif'    },
    fuck:      { purrbot: 'fuck',      hmtai: 'fuck',       nekobot: 'pgif'    },
    coger:     { purrbot: 'fuck',      hmtai: 'fuck',       nekobot: 'pgif'    },
    grabboobs: { hmtai: 'boobjob',     nekobot: 'boobs'   },
    grope:     { hmtai: 'boobjob',     nekobot: 'pgif'    },
    handjob:   { purrbot: 'blowjob',   hmtai: 'blowjob',   nekobot: 'pgif'    },
    lickass:   { purrbot: 'pussylick', hmtai: 'pussy_lick', nekobot: 'pgif'    },
    lickdick:  { purrbot: 'blowjob',   hmtai: 'blowjob',   waifuPics: 'blowjob', nekobot: 'blowjob' },
    lickpussy: { purrbot: 'pussylick', hmtai: 'pussy_lick', nekobot: 'pgif'    },
    sixnine:   { purrbot: 'fuck',      hmtai: 'fuck',       nekobot: 'pgif'    },
    '69':      { purrbot: 'fuck',      hmtai: 'fuck',       nekobot: 'pgif'    },
    spank:     { hmtai: 'spank',       nekobot: 'pgif'    },
    nalgada:   { hmtai: 'spank',       nekobot: 'pgif'    },
    suckboobs: { hmtai: 'boobjob',     nekobot: 'boobs'   },
    undress:   { purrbot: 'solo',      hmtai: 'solo',       nekobot: 'pgif'    },
    encuerar:  { purrbot: 'solo',      hmtai: 'solo',       nekobot: 'pgif'    },
    yuri:      { purrbot: 'yuri',      hmtai: 'yuri',       nekobot: 'pgif'    },
    tijeras:    { purrbot: 'yuri',      hmtai: 'yuri',       nekobot: 'pgif'    },
    fingering:  { purrbot: 'fuck',      hmtai: 'fuck',       nekobot: 'pgif'    },
    creampie:   { purrbot: 'cum',       hmtai: 'cum',        nekobot: 'cum'     },
    facesitting:{ purrbot: 'pussylick', hmtai: 'pussy_lick', nekobot: 'pgif'    },
    deepthroat: { purrbot: 'blowjob',   hmtai: 'blowjob',   waifuPics: 'blowjob', nekobot: 'blowjob' },
    thighjob:   { purrbot: 'blowjob',   nekobot: 'pgif'    },
    bondage:    { purrbot: 'fuck',      nekobot: 'pgif'    },
    pegging:    { purrbot: 'anal',      hmtai: 'anal',       nekobot: 'pgif'    },
    futanari:   { purrbot: 'fuck',      hmtai: 'fuck',       nekobot: 'pgif'    },
    futa:       { purrbot: 'fuck',      hmtai: 'fuck',       nekobot: 'pgif'    },
    yaoi:       { purrbot: 'anal',      hmtai: 'anal',       nekobot: 'pgif'    },
    bukkake:    { purrbot: 'cum',       hmtai: 'cumshot',    nekobot: 'cum'     },
    orgy:       { purrbot: 'fuck',      hmtai: 'fuck',       nekobot: 'pgif'    },
    orgia:      { purrbot: 'fuck',      hmtai: 'fuck',       nekobot: 'pgif'    },
    squirting:  { purrbot: 'cum',       hmtai: 'cum',        nekobot: 'pgif'    },
    squirt:     { purrbot: 'cum',       hmtai: 'cum',        nekobot: 'pgif'    },
};

/**
 * Busca un GIF/video NSFW en todas las APIs externas en paralelo.
 * Fuentes: waifu.pics, hmtai, purrbot, NekoBot, nekos.moe — todas simultáneas.
 * Se deduplican las URLs, se priorizan las animadas (.gif/.mp4/.webm) y se
 * elige aleatoriamente entre los candidatos. Devuelve { buffer } (MP4 listo
 * para gifPlayback) o lanza error si ninguna descarga prospera.
 */
async function obtenerGifNsfwBuffer(accion) {
    const map = NSFW_GIF_MAP[accion];
    if (!map) throw new Error(`Sin mapa NSFW para "${accion}"`);

    const fetches = [];

    // 1. waifu.pics /many/nsfw/<ep> — CDN propio, muy fiable
    if (map.waifuPics) {
        fetches.push(
            axios.post(`https://api.waifu.pics/many/nsfw/${map.waifuPics}`, {}, {
                timeout: 9000,
                headers: { 'Content-Type': 'application/json' }
            }).then(r => (r.data?.files || []).filter(Boolean)).catch(() => [])
        );
    }

    // 2. hmtai NSFW — 3 peticiones paralelas
    if (map.hmtai) {
        fetches.push(
            Promise.allSettled([
                axios.get(`https://hmtai.hatsunia.dev/v2/nsfw/${map.hmtai}`, { timeout: 8000 }),
                axios.get(`https://hmtai.hatsunia.dev/v2/nsfw/${map.hmtai}`, { timeout: 8000 }),
                axios.get(`https://hmtai.hatsunia.dev/v2/nsfw/${map.hmtai}`, { timeout: 8000 }),
            ]).then(rs => rs
                .filter(r => r.status === 'fulfilled')
                .map(r => r.value?.data?.url)
                .filter(Boolean)
            )
        );
    }

    // 3. purrbot NSFW — 3 peticiones paralelas
    if (map.purrbot) {
        fetches.push(
            Promise.allSettled([
                axios.get(`https://purrbot.site/api/img/nsfw/${map.purrbot}/gif`, { timeout: 8000 }),
                axios.get(`https://purrbot.site/api/img/nsfw/${map.purrbot}/gif`, { timeout: 8000 }),
                axios.get(`https://purrbot.site/api/img/nsfw/${map.purrbot}/gif`, { timeout: 8000 }),
            ]).then(rs => rs
                .filter(r => r.status === 'fulfilled')
                .map(r => r.value?.data?.link)
                .filter(Boolean)
            )
        );
    }

    // 4. NekoBot — 2 peticiones paralelas
    if (map.nekobot) {
        fetches.push(
            Promise.allSettled([
                axios.get(`https://nekobot.xyz/api/image?type=${map.nekobot}`, { timeout: 8000 }),
                axios.get(`https://nekobot.xyz/api/image?type=${map.nekobot}`, { timeout: 8000 }),
            ]).then(rs => rs
                .filter(r => r.status === 'fulfilled')
                .map(r => r.value?.data?.message)
                .filter(Boolean)
            )
        );
    }

    // Agregar y deduplicar
    const settled = await Promise.allSettled(fetches);
    const rawUrls = [];
    for (const r of settled) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) rawUrls.push(...r.value);
    }
    const uniqueUrls = [...new Set(rawUrls.filter(Boolean))];

    // Priorizar GIFs/MP4 animados
    const animadas   = uniqueUrls.filter(u => /\.(gif|mp4|webm)$/i.test(u));
    const candidatos = animadas.length >= 2 ? animadas : uniqueUrls;
    const shuffled   = [...candidatos].sort(() => Math.random() - 0.5);

    if (!shuffled.length) throw new Error(`Sin URLs NSFW disponibles para "${accion}"`);

    let lastErr;
    for (const url of shuffled.slice(0, 8)) {
        try {
            const mp4 = await descargarYConvertir(url, accion);
            console.log(`[NSFW-GIF] ✅ "${accion}" — ${url.slice(-60)}`);
            return { buffer: mp4 };
        } catch (e) {
            lastErr = e;
            console.error(`[NSFW-GIF] ❌ "${url.slice(-60)}": ${e.message}`);
        }
    }
    throw new Error(`Descarga NSFW fallida para "${accion}": ${lastErr?.message}`);
}

// Sufijos de texto para mensajes NSFW — sin emojis, solo kaomoji/chars especiales
const NSFW_SUFIJOS_MENCION = [
    '(¬_¬)', '! >.<', '-.-', '(˘▾˘~)', '>.>', '(¬‿¬)',
    '!/.',   '~',     '!',   '(°▽°~)', '>.~', '(¬_¬\')',
];
const NSFW_SUFIJOS_SOLO = [
    '(¬_¬)', '>.<',   '(˘▾˘)', '-.-',   '~',
    '(°▽°)', '(¬‿¬)', '!',     '>.>',   '(¬_¬\')',
];

async function cmdNsfwAccion(sock, jid, senderJid, accion, mencionados, pushName) {
    const config = NSFW_ACCIONES[accion];
    if (!config) return;
    const senderNombre = pushName || senderJid.split('@')[0];
    const elegir      = arr => arr[Math.floor(Math.random() * arr.length)];
    const elegirSuf   = arr => arr[Math.floor(Math.random() * arr.length)];
    let texto;
    if (mencionados && mencionados.length > 0) {
        const destJid    = mencionados[0];
        const destData   = getUsuario(destJid);
        const destNombre = destData?.pushName || destJid.split('@')[0];
        const parteAccion = elegir(config.mencion).replace('@dest', `\`${destNombre}\``);
        texto = `\`${senderNombre}\` ${parteAccion} ${elegirSuf(NSFW_SUFIJOS_MENCION)}`;
    } else {
        texto = `\`${senderNombre}\` ${elegir(config.solo)} ${elegirSuf(NSFW_SUFIJOS_SOLO)}`;
    }

    // ── Cascade 0: YukiBot CDN (MP4 pre-hosteados — enviados directo, sin descarga) ──────────────
    const canonicalCdn = NSFW_ACCION_CARPETA[accion] || accion;
    const yukiUrls = YUKI_CDN_NSFW[canonicalCdn] || YUKI_CDN_NSFW[accion];
    if (yukiUrls && yukiUrls.length > 0) {
        try {
            const randomUrl = yukiUrls[Math.floor(Math.random() * yukiUrls.length)];
            await sock.sendMessage(jid, {
                video: { url: randomUrl },
                caption: texto,
                gifPlayback: true,
                mimetype: 'video/mp4',
                mentions: mencionados || []
            });
            console.log(`[NSFW-CDN] ✅ YukiBot CDN para "${accion}" — ${randomUrl.slice(-30)}`);
            return;
        } catch (err) {
            console.error(`[NSFW-CDN] ❌ YukiBot CDN falló para "${accion}": ${err.message}`);
        }
    }

    // ── Cascade 1: APIs externas (GIFs) ────────────────────────────────────────
    if (NSFW_GIF_MAP[accion]) {
        try {
            const { buffer } = await obtenerGifNsfwBuffer(accion);
            await sock.sendMessage(jid, {
                video: buffer,
                caption: texto,
                gifPlayback: true,
                mimetype: 'video/mp4',
                mentions: mencionados || []
            });
            return;
        } catch (err) {
            console.error(`[NSFW-GIF] APIs fallaron para "${accion}", probando local: ${err.message}`);
        }
    }

    // ── Cascade 2: archivos locales ─────────────────────────────────────────────
    const carpetaAccion = NSFW_ACCION_CARPETA[accion] || accion;
    const localAccion = obtenerMediaLocal('nsfw', carpetaAccion);
    if (localAccion) {
        if (localAccion.isVideo) {
            await sock.sendMessage(jid, {
                video: localAccion.buffer,
                caption: texto,
                gifPlayback: true,
                mimetype: 'video/mp4',
                mentions: mencionados || []
            });
        } else {
            await sock.sendMessage(jid, {
                image: localAccion.buffer,
                caption: texto,
                mentions: mencionados || []
            });
        }
        return;
    }

    // ── Cascade 3: booru (imágenes estáticas — último recurso) ─────────────────
    const gifTipo = NSFW_ACCION_GIF[accion];
    if (gifTipo) {
        try {
            const mediaUrl = await buscarImagenNsfw(gifTipo, true);
            if (mediaUrl) {
                const esVideo = /\.(mp4|webm)$/i.test(mediaUrl);
                if (esVideo) {
                    try {
                        const dominio = new URL(mediaUrl).hostname;
                        const videoRes = await axios.get(mediaUrl, {
                            responseType: 'arraybuffer',
                            timeout: 60000,
                            maxContentLength: 50 * 1024 * 1024,
                            headers: { ...HUMAN_HEADERS, 'Referer': `https://${dominio}/` }
                        });
                        await sock.sendMessage(jid, {
                            video: Buffer.from(videoRes.data),
                            caption: texto,
                            gifPlayback: true,
                            mimetype: 'video/mp4',
                            mentions: mencionados || []
                        });
                    } catch {
                        await sock.sendMessage(jid, {
                            video: { url: mediaUrl },
                            caption: texto,
                            gifPlayback: true,
                            mentions: mencionados || []
                        });
                    }
                } else {
                    await sock.sendMessage(jid, {
                        image: { url: mediaUrl },
                        caption: texto,
                        mentions: mencionados || []
                    });
                }
                return;
            }
        } catch (err) { logRequestError('cmdNsfwAccion', err); }
    }

    await sock.sendMessage(jid, { text: texto, mentions: mencionados || [] });
}

// ══════════════════════════════════════════
//  WAIFU
// ══════════════════════════════════════════
async function buscarWaifuImagen(tag) {
    let imgUrl = null;

    // 1. Safebooru (siempre SFW, gran base de datos)
    if (!imgUrl) {
        try {
            const pid = Math.floor(Math.random() * 8);
            const res = await axios.get(
                `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeBooruTags(tag)}&pid=${pid}`,
                { timeout: 15000, headers: HUMAN_HEADERS }
            );
            const posts = Array.isArray(res.data) ? res.data.filter(p => p.file_url || p.image) : [];
            if (posts.length) {
                const p = posts[Math.floor(Math.random() * posts.length)];
                imgUrl = p.file_url || `https://safebooru.org//images/${p.directory}/${p.image}`;
            }
        } catch (err) { logRequestError('waifu safebooru', err); }
    }

    // 2. Gelbooru rating:general como fallback
    if (!imgUrl) {
        try {
            const pid = Math.floor(Math.random() * 5);
            const res = await axios.get(
                `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeBooruTags(tag + '+rating:general')}&pid=${pid}`,
                { timeout: 15000, headers: HUMAN_HEADERS }
            );
            const posts = parsearPostsGelbooru(res.data);
            if (posts.length) {
                const p = posts[Math.floor(Math.random() * posts.length)];
                imgUrl = p.file_url || p.sample_url;
            }
        } catch (err) { logRequestError('waifu gelbooru', err); }
    }

    // 3. Danbooru rating:general como segundo fallback
    if (!imgUrl) {
        try {
            const tagLimpio = tag.split('+')[0];
            const pid = Math.floor(Math.random() * 5) + 1;
            const res = await axios.get(
                `https://danbooru.donmai.us/posts.json?tags=${encodeBooruTags(tagLimpio + '+rating:g')}&limit=50&page=${pid}`,
                { timeout: 15000, headers: HUMAN_HEADERS }
            );
            const posts = (res.data || []).filter(p => p.file_url && /\.(jpg|jpeg|png|webp)$/i.test(p.file_url));
            if (posts.length) {
                imgUrl = posts[Math.floor(Math.random() * posts.length)].file_url;
            }
        } catch (err) { logRequestError('waifu danbooru', err); }
    }

    return imgUrl;
}

async function cmdWaifu(sock, jid, args) {
    try {
        const nombre = args.join(' ').trim();
        const waifu = nombre ? encontrarWaifu(nombre) : null;

        if (!nombre) {
            let imgUrl = null;
            try {
                const res = await axios.get('https://api.waifu.pics/sfw/waifu', { timeout: 10000 });
                imgUrl = res.data?.url;
            } catch (err) { logRequestError('waifu.pics sfw', err); }
            if (!imgUrl) {
                try {
                    const res = await axios.get('https://nekos.best/api/v2/waifu', { timeout: 10000 });
                    imgUrl = res.data?.results?.[0]?.url;
                } catch (err) { logRequestError('nekos.best waifu', err); }
            }
            if (imgUrl) {
                await sock.sendMessage(jid, {
                    image: { url: imgUrl },
                    caption: `💖 *Waifu random*\n\n_Usa *#waifu [nombre]* para buscar un personaje específico_\nEjemplo: #waifu rem, #waifu nezuko, #waifu miku`
                });
            } else {
                await sock.sendMessage(jid, { text: '❌ No pude obtener una waifu random. Intenta de nuevo.' });
            }
            return;
        }

        // Búsqueda específica
        const tag = waifu ? waifu.tag : nombre.toLowerCase().replace(/\s+/g, '_');
        const displayName = nombre.charAt(0).toUpperCase() + nombre.slice(1);
        const encontrada = waifu ? (waifu.key.charAt(0).toUpperCase() + waifu.key.slice(1)) : displayName;

        let imgUrl = await buscarWaifuImagen(tag);

        // Si encontró waifu en DB pero sin imagen, intenta sin modificar el nombre
        if (!imgUrl && waifu && tag !== nombre.toLowerCase().replace(/\s+/g, '_')) {
            imgUrl = await buscarWaifuImagen(nombre.toLowerCase().replace(/\s+/g, '_'));
        }

        if (imgUrl) {
            const caption = waifu && waifu.key !== nombre.toLowerCase()
                ? `💖 *${encontrada}*\n_¡Aquí está tu waifu!_`
                : `💖 *${displayName}*\n_¡Aquí está tu waifu!_`;
            await sock.sendMessage(jid, { image: { url: imgUrl }, caption });
            return;
        }

        // Fallback: waifu.pics random si no se encontró imagen específica
        let fallbackUrl = null;
        try {
            const res = await axios.get('https://api.waifu.pics/sfw/waifu', { timeout: 10000 });
            fallbackUrl = res.data?.url;
        } catch (err) { logRequestError('waifu fallback', err); }
        if (fallbackUrl) {
            await sock.sendMessage(jid, {
                image: { url: fallbackUrl },
                caption: `🔍 No encontré imagen exacta de *${displayName}*\n💭 Mostrando una waifu aleatoria como alternativa`
            });
        } else {
            await sock.sendMessage(jid, { text: `❌ No encontré imágenes de *${displayName}*. Prueba con: #waifu rem, #waifu miku, #waifu nezuko` });
        }
    } catch (err) {
        logRequestError('cmdWaifu', err);
        await sock.sendMessage(jid, { text: '❌ Error buscando waifu. Intenta de nuevo.' });
    }
}

// ══════════════════════════════════════════
//  BÚSQUEDA EN IMAGEBOARDS NSFW
// ══════════════════════════════════════════

// Helper para normalizar los posts de Gelbooru (varias versiones de API)
function parsearPostsGelbooru(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.post)) return data.post;
    if (data['@attributes'] && Array.isArray(data.post)) return data.post;
    return [];
}

async function buscarGelbooru(tags, soloVideo = false) {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    const pid = Math.floor(Math.random() * 5);
    const ratingTag = tagsLimpios.includes('rating:') ? '' : '+rating:explicit';
    const tagsFinal = tagsLimpios + ratingTag;

    const res = await axios.get(
        `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeBooruTags(tagsFinal)}&pid=${pid}`,
        { timeout: 20000, headers: HUMAN_HEADERS }
    );
    let posts = parsearPostsGelbooru(res.data);
    if (!posts.length) throw new Error('Sin resultados en Gelbooru');
    if (soloVideo) {
        posts = posts.filter(p => (p.file_url || '').match(/\.(mp4|webm|gif)$/i));
        if (!posts.length) throw new Error('Sin videos/GIFs en Gelbooru');
        // GIFs primero
        posts.sort((a, b) => /\.gif$/i.test(a.file_url||'') ? -1 : 1);
    } else {
        posts = posts.filter(p => p.file_url && /\.(jpg|jpeg|png|webp|gif)$/i.test(p.file_url));
        if (!posts.length) throw new Error('Sin imágenes en Gelbooru');
    }
    const elegido = posts[Math.floor(Math.random() * posts.length)];
    return elegido.file_url || elegido.sample_url;
}

async function buscarDanbooru(tags, rating = 'e') {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    // Danbooru sin auth solo devuelve contenido general/sensitive
    // Intentamos con rating:s (sensitive) ya que rating:e requiere cuenta
    const pid = Math.floor(Math.random() * 5) + 1;
    const res = await axios.get(
        `https://danbooru.donmai.us/posts.json?tags=${encodeBooruTags(tagsLimpios + '+rating:s')}&limit=50&page=${pid}`,
        { timeout: 20000, headers: HUMAN_HEADERS }
    );
    const posts = (res.data || []).filter(p => p.file_url && /\.(jpg|png|webp|gif|mp4)$/i.test(p.file_url));
    if (!posts.length) throw new Error('Sin resultados en Danbooru');
    return posts[Math.floor(Math.random() * posts.length)].file_url;
}

async function buscarRule34Paheal(tags, soloVideo = false) {
    if (soloVideo) throw new Error('Paheal no devuelve videos desde su API pública');
    const tagsLimpios = String(tags || '').replace(/\+/g, ' ').replace(/rating:\w+/g, '').trim();
    const res = await axios.get(
        `https://rule34.paheal.net/api/danbooru/find_posts?tags=${encodeBooruTags(tagsLimpios)}&limit=50`,
        { timeout: 20000, headers: HUMAN_HEADERS }
    );
    const xml = String(res.data || '');
    const posts = [...xml.matchAll(/<tag\b[^>]*>/gi)]
        .map(m => ({
            url: m[0].match(/\bfile_url=['"]([^'"]+)['"]/)?.[1],
            name: m[0].match(/\bfile_name=['"]([^'"]+)['"]/)?.[1]
        }))
        .filter(p => /\.(jpg|jpeg|png|webp|gif)$/i.test(p.name));
    if (!posts.length) throw new Error('Sin resultados en Rule34 Paheal');
    return posts[Math.floor(Math.random() * posts.length)].url;
}

// Búsqueda en tbib.org (Tropical Booru) — comparte estructura con Gelbooru/Rule34
async function buscarTbib(tags, soloVideo = false) {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    const pid = Math.floor(Math.random() * 25);
    try {
        const res = await axios.get(
            `https://tbib.org/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeBooruTags(tagsLimpios)}&pid=${pid}`,
            { timeout: 20000, headers: HUMAN_HEADERS }
        );
        let posts = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.post) ? res.data.post : []);
        posts = posts
            .map(p => {
                if (p.file_url) return p;
                if (p.directory && p.image) {
                    return { ...p, file_url: `https://tbib.org/images/${p.directory}/${p.image}` };
                }
                return null;
            })
            .filter(Boolean);
        if (!posts.length) throw new Error('tbib sin resultados');
        const filtroVideo = soloVideo
            ? posts.filter(p => /\.(mp4|webm|m3u8)$/i.test(p.file_url))
            : posts.filter(p => /\.(jpg|jpeg|png|webp|gif)$/i.test(p.file_url));
        if (!filtroVideo.length) throw new Error('tbib sin formato pedido');
        const e = filtroVideo[Math.floor(Math.random() * filtroVideo.length)];
        return e.file_url;
    } catch (err) {
        throw new Error(`tbib: ${err.message}`);
    }
}

// ── LRU en memoria para evitar repetir las mismas URLs entre llamadas ─────
const NSFW_LRU = new Map(); // key: tag+modo → array de URLs recientes
const NSFW_LRU_MAX = 80;
function _lruKey(tags, modo) { return `${modo}::${tags}`; }
function _lruRecord(tags, modo, url) {
    if (!url) return;
    const k = _lruKey(tags, modo);
    const arr = NSFW_LRU.get(k) || [];
    arr.push(url);
    if (arr.length > NSFW_LRU_MAX) arr.splice(0, arr.length - NSFW_LRU_MAX);
    NSFW_LRU.set(k, arr);
}
function _lruFiltrar(tags, modo, posts) {
    const k = _lruKey(tags, modo);
    const set = new Set(NSFW_LRU.get(k) || []);
    if (!set.size) return posts;
    const fresh = posts.filter(p => !set.has(p.file_url || p.sample_url));
    // Si quedaron muy pocos tras filtrar, devolver el set completo
    return fresh.length >= 5 ? fresh : posts;
}

async function _xbooruFetch(tagsLimpios, pid) {
    try {
        const res = await axios.get(
            `https://xbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeBooruTags(tagsLimpios)}&pid=${pid}`,
            { timeout: 15000, headers: HUMAN_HEADERS }
        );
        const arr = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.post) ? res.data.post : []);
        return arr.map(p => {
            if (p.file_url) return p;
            if (p.directory && p.image) return { ...p, file_url: `https://img.xbooru.com/images/${p.directory}/${p.image}` };
            return p;
        });
    } catch (err) { logRequestError('xbooru', err); return []; }
}

async function _r34Fetch(tagsConcat, pid) {
    try {
        const res = await axios.get(
            `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeBooruTags(tagsConcat)}&pid=${pid}`,
            { timeout: 10000, headers: NEXUS_R34_HEADERS }
        );
        const arr = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.post) ? res.data.post : []);
        return arr;
    } catch (err) { logRequestError('rule34 api', err); return []; }
}

// Verifica el tamaño de un archivo antes de descargarlo (HEAD request)
async function checkFileSize(url, maxMB = 14) {
    try {
        const dominio = new URL(url).hostname;
        const res = await axios.head(url, {
            timeout: 8000,
            headers: { ...HUMAN_HEADERS, 'Referer': `https://${dominio}/` }
        });
        const len = parseInt(res.headers['content-length'] || '0', 10);
        return len === 0 || len <= maxMB * 1024 * 1024;
    } catch { return true; } // si no responde al HEAD, intentar igual
}

// Hypnohub — busca GIFs animados (tienen animat* en tags o extensión .gif)
async function buscarHypnohubVideo(tags) {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    const pid = Math.floor(Math.random() * 5);
    const res = await axios.get(
        `https://hypnohub.net/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeBooruTags(tagsLimpios + '+animated')}&pid=${pid}`,
        { timeout: 10000, headers: HUMAN_HEADERS }
    );
    const arr = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.post) ? res.data.post : []);
    const gifs = arr.filter(p => p.file_url && /\.(gif|mp4|webm)$/i.test(p.file_url));
    if (!gifs.length) throw new Error('hypnohub sin animados');
    return gifs[Math.floor(Math.random() * gifs.length)].file_url;
}

// Yande.re — busca GIFs/videos animados (todas las variantes en paralelo)
async function buscarYandereVideo(tags) {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    const page = Math.floor(Math.random() * 5) + 1;
    const EXT = /\.(gif|mp4|webm)$/i;
    const peticiones = ['+animated_gif', '+animated', ''].map(suffix =>
        axios.get(`https://yande.re/post.json?limit=100&tags=${encodeBooruTags(tagsLimpios + suffix)}&page=${page}`,
            { timeout: 10000, headers: HUMAN_HEADERS })
            .then(r => (r.data || []).filter(p => p.file_url && EXT.test(p.file_url)))
            .catch(() => [])
    );
    const resultados = await Promise.all(peticiones);
    const todos = resultados.flat();
    if (!todos.length) throw new Error('yande.re sin animados para esos tags');
    return todos[Math.floor(Math.random() * todos.length)].file_url;
}

// Konachan — busca GIFs/videos animados (variantes en paralelo)
async function buscarKonachanVideo(tags) {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    const page = Math.floor(Math.random() * 5) + 1;
    const EXT = /\.(gif|mp4|webm)$/i;
    const peticiones = ['+animated', ''].map(suffix =>
        axios.get(`https://konachan.com/post.json?limit=100&tags=${encodeBooruTags(tagsLimpios + suffix)}&page=${page}`,
            { timeout: 10000, headers: HUMAN_HEADERS })
            .then(r => (r.data || []).filter(p => p.file_url && EXT.test(p.file_url)))
            .catch(() => [])
    );
    const resultados = await Promise.all(peticiones);
    const todos = resultados.flat();
    if (!todos.length) throw new Error('konachan sin animados para esos tags');
    return todos[Math.floor(Math.random() * todos.length)].file_url;
}

// rule34video.com — scraping de videos completos (360p con acctoken, máx 14MB)
async function buscarRule34VideoSite(tags, maxMB = 14) {
    const termino = tags.replace(/\+/g, ' ').replace(/_/g, ' ').trim();
    const R34V_HEADERS = { ...HUMAN_HEADERS, 'Referer': 'https://rule34video.com/' };
    // 1. Buscar en la web
    const res = await axios.get(
        `https://rule34video.com/?s=${encodeURIComponent(termino)}&order_by=rating`,
        { timeout: 12000, headers: R34V_HEADERS }
    );
    const html = res.data;
    // 2. Extraer páginas de video individuales (barajadas para variedad)
    const paginasVideo = [...new Set(
        [...html.matchAll(/href="(https:\/\/rule34video\.com\/video\/\d+\/[^"]+)"/g)].map(m => m[1])
    )].sort(() => Math.random() - 0.5);
    if (!paginasVideo.length) throw new Error('rule34video sin resultados');
    // 3. Probar hasta 8 páginas buscando un video ≤ maxMB
    let primerUrl = null;
    for (const paginaUrl of paginasVideo.slice(0, 8)) {
        try {
            const pg = await axios.get(paginaUrl, { timeout: 12000, headers: R34V_HEADERS });
            const match360 = pg.data.match(/https?:\/\/[^\s"']+_360\.mp4\/?\?v-acctoken=[^\s"'&]+/);
            const match480 = pg.data.match(/https?:\/\/[^\s"']+_480p\.mp4\/?\?v-acctoken=[^\s"'&]+/);
            const videoUrl = match360?.[0] || match480?.[0];
            if (!videoUrl) continue;
            if (!primerUrl) primerUrl = videoUrl; // guardar por si todos son grandes
            // Verificar tamaño antes de retornar
            const head = await axios.head(videoUrl, { timeout: 8000, headers: R34V_HEADERS }).catch(() => null);
            const bytes = parseInt(head?.headers?.['content-length'] || '0', 10);
            if (bytes === 0 || bytes <= maxMB * 1024 * 1024) return videoUrl; // cabe o no se sabe el tamaño
        } catch {}
    }
    if (primerUrl) return primerUrl; // ninguno cabía, devolver el primero de todos modos
    throw new Error('rule34video sin URL de video accesible');
}

async function buscarRule34(tags, soloVideo = false, _meta = null) {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    let posts = [];

    if (soloVideo) {
        // Incluir GIFs animados + mp4/webm — los GIFs son mucho más comunes y livianos
        const EXT_ANIM = /\.(mp4|webm|gif)$/i;
        const pidsAnim = [0, 1, 2, 3, pidRandomR34(), pidRandomR34()];
        const pidsRaw  = [0, 1, pidRandomR34(), pidRandomR34()];
        const peticiones = [
            ...pidsAnim.map(p => _r34Fetch(`${tagsLimpios}+animated`, p)),
            ...pidsRaw.map(p => _r34Fetch(`${tagsLimpios}+video`, p)),
            ...pidsRaw.map(p => _r34Fetch(tagsLimpios, p)),
        ];
        const resultados = await Promise.allSettled(peticiones);
        for (const r of resultados) if (r.status === 'fulfilled' && r.value?.length) posts.push(...r.value);

        let videos = posts.filter(p => EXT_ANIM.test(p.file_url || p.sample_url || ''));

        // Deduplicar
        const vistos = new Set();
        videos = videos.filter(p => {
            const key = p.id || p.file_url || p.sample_url;
            if (!key || vistos.has(key)) return false;
            vistos.add(key); return true;
        });

        // GIFs primero (más livianos y compatibles con WhatsApp), luego por score
        videos.sort((a, b) => {
            const aGif = /\.gif$/i.test(a.file_url || '');
            const bGif = /\.gif$/i.test(b.file_url || '');
            if (aGif && !bGif) return -1;
            if (!aGif && bGif) return 1;
            return (Number(b.score) || 0) - (Number(a.score) || 0);
        });

        videos = _lruFiltrar(tagsLimpios, 'video', videos);

        if (videos.length) {
            const pool = videos.slice(0, Math.max(10, Math.floor(videos.length * 0.4)));
            const e = pool[Math.floor(Math.random() * pool.length)];
            const url = e.file_url || e.sample_url;
            _lruRecord(tagsLimpios, 'video', url);
            if (_meta) { _meta.fuente = 'rule34.xxx'; _meta.total = videos.length; _meta.score = Number(e.score) || 0; _meta.esGif = /\.gif$/i.test(url); }
            return url;
        }

        // Fallbacks en PARALELO: rule34video.com + xbooru + yande.re + konachan + hypnohub
        const fallbacksVideo = await Promise.allSettled([
            buscarRule34VideoSite(tagsLimpios).then(u => ({ url: u, fuente: 'rule34video.com' })),
            _xbooruFetch(tagsLimpios, Math.floor(Math.random() * 5))
                .then(xb => {
                    const f = xb.filter(p => EXT_ANIM.test(p.file_url || ''));
                    if (!f.length) throw new Error('xbooru sin animados');
                    f.sort((a, b) => /\.gif$/i.test(a.file_url||'') ? -1 : 1);
                    return { url: f[0].file_url, fuente: 'xbooru.com' };
                }),
            buscarYandereVideo(tagsLimpios).then(u => ({ url: u, fuente: 'yande.re' })),
            buscarKonachanVideo(tagsLimpios).then(u => ({ url: u, fuente: 'konachan.com' })),
            buscarHypnohubVideo(tagsLimpios).then(u => ({ url: u, fuente: 'hypnohub.net' })),
        ]);
        const exitoFallback = fallbacksVideo.find(r => r.status === 'fulfilled' && r.value?.url);
        if (exitoFallback) {
            const { url, fuente } = exitoFallback.value;
            if (_meta) { _meta.fuente = fuente; _meta.esGif = /\.gif$/i.test(url); }
            _lruRecord(tagsLimpios, 'video', url);
            return url;
        }
        throw new Error('Sin videos/GIFs disponibles para esos tags');
    }

    // ── Imágenes: paralelizar páginas para máxima variedad y calidad ─────
    // pid random entre 0 y 50 para máxima variedad (según spec Nexus)
    const pidPool = Array.from({ length: 51 }, (_, i) => i);
    for (let i = pidPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pidPool[i], pidPool[j]] = [pidPool[j], pidPool[i]];
    }
    const pidIntentos = Array.from(new Set([0, pidRandomR34(), ...pidPool.slice(0, 6)])).slice(0, 8);

    const resultados = await Promise.allSettled(pidIntentos.map(p => _r34Fetch(tagsLimpios, p)));
    for (const r of resultados) if (r.status === 'fulfilled' && r.value?.length) posts.push(...r.value);

    // Deduplicar por id/file_url
    const vistos = new Set();
    posts = posts.filter(p => {
        const key = p.id || p.file_url || p.sample_url;
        if (!key || vistos.has(key)) return false;
        vistos.add(key);
        return p.file_url || p.sample_url;
    });

    if (!posts.length) {
        // Imágenes: paheal → xbooru → yande.re → konachan → hypnohub
        try { const u = await buscarRule34Paheal(tagsLimpios, false); _lruRecord(tagsLimpios, 'img', u); if (_meta) _meta.fuente = 'rule34.paheal.net'; return u; }
        catch (err) { logRequestError('rule34 paheal', err); }
        try {
            const xb = await _xbooruFetch(tagsLimpios, Math.floor(Math.random() * 8));
            const xbImg = xb.filter(p => /\.(jpg|jpeg|png|webp|gif)$/i.test(p.file_url || ''));
            if (xbImg.length) {
                const e = xbImg[Math.floor(Math.random() * xbImg.length)];
                _lruRecord(tagsLimpios, 'img', e.file_url);
                if (_meta) _meta.fuente = 'xbooru.com';
                return e.file_url;
            }
        } catch (err) { logRequestError('xbooru img', err); }
        try { const u = await buscarEnYandere(tagsLimpios); if (u) { _lruRecord(tagsLimpios, 'img', u); if (_meta) _meta.fuente = 'yande.re'; return u; } }
        catch (err) { logRequestError('yandere img', err); }
        try { const u = await buscarEnBooruFileUrl(`https://konachan.com/post.json?limit=100`, tagsLimpios, 'konachan'); if (u) { _lruRecord(tagsLimpios, 'img', u); if (_meta) _meta.fuente = 'konachan.com'; return u; } }
        catch (err) { logRequestError('konachan img', err); }
        try { const u = await buscarEnBooruFileUrl(`https://hypnohub.net/index.php?page=dapi&s=post&q=index&json=1&limit=100`, tagsLimpios, 'hypnohub'); if (u) { _lruRecord(tagsLimpios, 'img', u); if (_meta) _meta.fuente = 'hypnohub.net'; return u; } }
        catch (err) { logRequestError('hypnohub img', err); }
        throw new Error('Sin resultados en ninguna fuente');
    }

    let imgs = posts.filter(p => {
        const u = p.file_url || p.sample_url || '';
        return /\.(jpg|jpeg|png|webp|gif)$/i.test(u);
    });
    if (!imgs.length) throw new Error('Sin imágenes válidas');

    // Mejor calidad: ordenar por score (más alto primero) y mezclar el top 60%
    imgs.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    const corte = Math.max(10, Math.floor(imgs.length * 0.6));
    let pool = imgs.slice(0, corte);

    // Filtrar contra cache LRU para no repetir
    pool = _lruFiltrar(tagsLimpios, 'img', pool);

    const elegido = pool[Math.floor(Math.random() * pool.length)];
    const url = elegido.file_url || elegido.sample_url;
    _lruRecord(tagsLimpios, 'img', url);
    if (_meta) { _meta.fuente = 'rule34.xxx'; _meta.total = imgs.length; _meta.score = Number(elegido.score) || 0; }
    return url;
}

async function buscarE621(tags) {
    const tagsLimpios = tags.replace(/\s+/g, '_');
    const page = Math.floor(Math.random() * 5) + 1;
    const res = await axios.get(
        `https://e621.net/posts.json?tags=${encodeBooruTags(tagsLimpios + '+rating:e')}&limit=50&page=${page}`,
        {
            timeout: 20000,
            headers: {
                ...HUMAN_HEADERS,
                'User-Agent': 'NexusBot/1.0 (by Alejx)',
                'Accept': 'application/json'
            }
        }
    );
    const posts = (res.data?.posts || []).filter(p => p.file?.url && /\.(jpg|jpeg|png|webp|gif)$/i.test(p.file.url));
    if (!posts.length) throw new Error('Sin resultados en e621');
    return posts[Math.floor(Math.random() * posts.length)].file.url;
}

async function cmdImageboard(sock, jid, tipo, args, soloVideo = false) {
    const queryRaw = args.join(' ').trim();
    if (!queryRaw) {
        await sock.sendMessage(jid, {
            text: `❌ Uso: *#${tipo} [tags]*\n\n` +
                `💡 Puedes combinar varios tags:\n` +
                `  • *#${tipo} rem lingerie* — waifu + ropa\n` +
                `  • *#${tipo} rubia colegiala desnuda* — en español\n` +
                `  • *#${tipo} miku big_breasts* — inglés\n\n` +
                `🌐 Tags en español disponibles:\n` +
                sugerenciasR34()
        });
        return;
    }

    const esR34 = (tipo === 'rule34' || tipo === 'r34' || tipo === 'rule34video' || tipo === 'r34video');
    const tipoDisplay = tipo.replace('video', ' video').toUpperCase();

    let tags, labelOriginal;

    if (esR34) {
        const parsed = parsearInputR34(queryRaw);
        tags = parsed.tags;
        labelOriginal = parsed.labelOriginal;
        const tagsDisplay = tags.replace(/\+/g, ' + ').replace(/_/g, ' ');
        const traduccionNota = parsed.hayTraduccion ? `\n🔤 _Traducido: ${tagsDisplay}_` : `\n🏷️ _Tags: ${tagsDisplay}_`;
        await sock.sendMessage(jid, { text: `🔥 *Buscando en ${tipoDisplay}...*${traduccionNota}` });
    } else {
        tags = queryRaw.replace(/\s+/g, '_').toLowerCase();
        labelOriginal = queryRaw;
        try {
            const w = encontrarWaifu(queryRaw);
            if (w?.tag) { tags = String(w.tag).toLowerCase(); labelOriginal = w.key || queryRaw; }
        } catch {}
        await sock.sendMessage(jid, { text: `🔍 Buscando en ${tipoDisplay}: *${labelOriginal}* _(tag: ${tags})_...` });
    }

    let url = null;
    const meta = { fuente: null, score: null, total: null };

    // Timeout global de 25s para que nunca se quede colgado
    const _timeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout_global')), ms));

    try {
        if (tipo === 'danbooru' || tipo === 'dbooru') {
            try { url = await buscarDanbooru(tags); meta.fuente = 'danbooru.donmai.us'; }
            catch { try { url = await buscarRule34Paheal(tags, soloVideo); meta.fuente = 'rule34.paheal.net'; }
            catch { url = await buscarRule34(tags, soloVideo, meta); } }
        } else if (tipo === 'gelbooru' || tipo === 'gbooru' || tipo === 'booru' || tipo === 'gelboorovideo' || tipo === 'gboorovideo') {
            // Gelbooru está 401 — redirigir a fuentes alternativas
            if (soloVideo) {
                // VIDEO: rule34video.com en paralelo con los boorus
                const EXT_ANIM = /\.(mp4|webm|gif)$/i;
                const resultados = await Promise.allSettled([
                    buscarRule34VideoSite(tags.replace(/\+/g,'_')).then(u => ({ url: u, fuente: 'rule34video.com' })),
                    buscarRule34(tags, true, {}).then(u => ({ url: u, fuente: 'rule34.xxx' })),
                    _xbooruFetch(tags.replace(/\+/g,'_'), Math.floor(Math.random() * 5))
                        .then(xb => {
                            const f = xb.filter(p => EXT_ANIM.test(p.file_url || ''));
                            if (!f.length) throw new Error('xbooru sin animados');
                            return { url: f[Math.floor(Math.random() * f.length)].file_url, fuente: 'xbooru.com' };
                        }),
                    buscarYandereVideo(tags.replace(/\+/g,'_')).then(u => ({ url: u, fuente: 'yande.re' })),
                    buscarKonachanVideo(tags.replace(/\+/g,'_')).then(u => ({ url: u, fuente: 'konachan.com' })),
                ]);
                const ganador = resultados.find(r => r.status === 'fulfilled' && r.value?.url);
                if (ganador) { url = ganador.value.url; meta.fuente = ganador.value.fuente; }
            } else {
                // IMAGEN: xbooru + paheal + rule34
                try {
                    const xb = await _xbooruFetch(tags.replace(/\+/g,'_'), Math.floor(Math.random() * 5));
                    const f = xb.filter(p => /\.(jpg|jpeg|png|webp|gif)$/i.test(p.file_url || ''));
                    if (f.length) { url = f[Math.floor(Math.random() * f.length)].file_url; meta.fuente = 'xbooru.com'; }
                } catch {}
                if (!url) try { url = await buscarRule34Paheal(tags, false); meta.fuente = 'rule34.paheal.net'; } catch {}
                if (!url) try { url = await buscarRule34(tags, false, meta); } catch {}
            }
        } else if (esR34) {
            const primero        = tags.split('+')[0];
            const sinSufijo      = primero.replace(/_\([^)]+\)$/, '');
            const crudo          = queryRaw.toLowerCase().trim().replace(/\s+/g, '_');
            const primeraPalabra = queryRaw.trim().split(/\s+/)[0].toLowerCase();

            if (soloVideo) {
                // VIDEO: todos los candidatos en PARALELO con timeout global de 22s
                const candidatos = [...new Set([tags, primero, sinSufijo, crudo, primeraPalabra].filter(Boolean))];
                const busquedas  = candidatos.map(t => buscarRule34(t, true, {}).catch(() => null));
                const ganador = await Promise.race([
                    Promise.all(busquedas).then(urls => urls.find(u => u)),
                    _timeout(22000)
                ]).catch(() => null);
                if (ganador) {
                    url = ganador;
                    meta.fuente = meta.fuente || 'rule34.xxx';
                }
            } else {
                // IMAGEN: secuencial (más lento pero usa la metadata correcta)
                try { url = await buscarRule34(tags, false, meta); } catch (e1) { logRequestError('r34 principal', e1); }
                if (!url && primero && primero !== tags) {
                    try { url = await buscarRule34(primero, false, meta); } catch (e2) { logRequestError('r34 primer tag', e2); }
                }
                if (!url && sinSufijo && sinSufijo !== primero) {
                    try { url = await buscarRule34(sinSufijo, false, meta); } catch (e3) { logRequestError('r34 sin sufijo', e3); }
                }
                if (!url && crudo !== tags) {
                    try { url = await buscarRule34(crudo, false, meta); } catch (e4) { logRequestError('r34 crudo', e4); }
                }
                if (!url && primeraPalabra && primeraPalabra !== crudo) {
                    try { url = await buscarRule34(primeraPalabra, false, meta); } catch (e5) { logRequestError('r34 primera palabra', e5); }
                }
            }
        } else if (tipo === 'e621') {
            url = await buscarE621(tags);
            meta.fuente = 'e621.net';
        }
    } catch (err) {
        logRequestError('cmdImageboard', err);
    }

    if (!url) {
        const sugerencias = sugerenciasR34();
        const msgVacio = esR34
            ? `❌ *Sin resultados para:* _${queryRaw}_\n\n` +
              `💡 *Consejos:*\n` +
              `• Escribe el nombre exacto: \`miku\`, \`rem\`, \`asuna\`\n` +
              `• Combina tags: \`#r34 rem lingerie big_breasts\`\n` +
              `• Prueba en inglés: \`blonde_hair nude\`, \`school_uniform\`\n\n` +
              `🔤 *Tags en español que puedo traducir:*\n${sugerencias}`
            : `❌ No encontré resultados para: *${tags.replace(/_/g, ' ')}*\n_Intenta con otros tags_`;
        await sock.sendMessage(jid, { text: msgVacio });
        return;
    }

    const tagsLabel = tags.replace(/\+/g, ' · ').replace(/_/g, ' ');
    let label;
    if (esR34) {
        const scoreStr = (meta.score != null && meta.score > 0) ? `  ⭐ ${meta.score}` : '';
        const totalStr = meta.total ? `  📊 ${meta.total} resultados` : '';
        const fuenteStr = meta.fuente ? `\n🌐 _${meta.fuente}_` : '';
        label = `🔞 *${tipoDisplay}* — ${tagsLabel}${scoreStr}${totalStr}${fuenteStr}`;
    } else {
        label = `🔞 *${tipoDisplay}* — ${tagsLabel}`;
    }

    const esGif   = /\.gif$/i.test(url);
    const esVideo = soloVideo || /\.(mp4|webm)$/i.test(url) || (esR34 && meta.esGif === false && soloVideo);
    const esAnimado = esGif || esVideo;

    if (esAnimado) {
        try {
            const dominio = new URL(url).hostname;
            const referer  = `https://${dominio}/`;

            // Verificar tamaño antes de descargar
            const tamanoOk = await checkFileSize(url, 14);
            if (!tamanoOk) throw new Error('archivo_grande');

            const mediaRes = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 40000,
                maxContentLength: 14 * 1024 * 1024,
                headers: { ...HUMAN_HEADERS, 'Referer': referer }
            });
            const buf = Buffer.from(mediaRes.data);

            if (esGif) {
                await sock.sendMessage(jid, { video: buf, caption: label, mimetype: 'video/mp4', gifPlayback: true });
            } else {
                await sock.sendMessage(jid, { video: buf, caption: label, mimetype: 'video/mp4' });
            }
        } catch (errMedia) {
            const esPeso = errMedia.message === 'archivo_grande' || errMedia.message?.includes('maxContentLength');
            await sock.sendMessage(jid, {
                text: `🎬 ${label}\n\n🔗 *Enlace directo:*\n${url}\n\n` +
                    (esPeso
                        ? `_El archivo pesa más de 14MB — ábrelo en el navegador._`
                        : `_No se pudo descargar automáticamente — ábrelo en el navegador._`)
            });
        }
    } else {
        await sock.sendMessage(jid, { image: { url }, caption: label });
    }
}

// ══════════════════════════════════════════
//  TOP RANDOM
// ══════════════════════════════════════════
async function cmdTopRandom(sock, jid, groupMetadata, args) {
    if (!groupMetadata) {
        await sock.sendMessage(jid, { text: '❌ Este comando solo funciona en grupos.' });
        return;
    }
    const tema = args.join(' ') || 'los más especiales';
    let participantes = [...(groupMetadata.participants || [])];
    if (participantes.length < 2) {
        await sock.sendMessage(jid, { text: '❌ Se necesitan al menos 2 miembros para crear un top.' });
        return;
    }
    // Fisher-Yates shuffle
    for (let i = participantes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [participantes[i], participantes[j]] = [participantes[j], participantes[i]];
    }
    const emojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const limit = Math.min(participantes.length, 10);
    const mentions = [];
    let lineas = '';
    for (let i = 0; i < limit; i++) {
        const p = participantes[i];
        lineas += `${emojis[i]} @${p.id.split('@')[0]}\n`;
        mentions.push(p.id);
    }

    const temaDisplay = tema.charAt(0).toUpperCase() + tema.slice(1);
    const texto = `📊 *TOP — ${temaDisplay}*\n${'─'.repeat(24)}\n\n${lineas}\n_¡Generado aleatoriamente!_ 🎲`;
    await sock.sendMessage(jid, { text: texto, mentions });
}

// Filtrar 'kick' del menú SFW — el comando ya está interceptado por el admin kick en handler.js
const TODO_SFW = Object.keys(SFW_ACCIONES).filter(k => k !== 'kick');
const TODO_NSFW_IMG = Object.keys(NSFW_CMDS);
const TODO_NSFW_ACCION = Object.keys(NSFW_ACCIONES);
const TODO_IMAGEBOARDS = ['danbooru', 'dbooru', 'gelbooru', 'gbooru', 'booru', 'rule34', 'r34', 'e621'];
const TODO_IMAGEBOARDS_VIDEO = ['rule34video', 'r34video', 'gelboorovideo', 'gboorovideo'];

// precalentarCacheSfw y precalentarCacheSfwSilente fueron eliminados junto con el
// sistema de caché en disco. El nuevo sistema usa un pool de URLs en paralelo con
// anti-repetición LRU en memoria — no hay nada que precalentar en disco.
async function precalentarCacheSfw(sock, jid) {
    await sock.sendMessage(jid, {
        text: `ℹ️ *Caché SFW*\n\nEl sistema de caché en disco fue reemplazado por un motor de pool en memoria.\nNo es necesario precalentar nada — cada interacción consulta múltiples fuentes en paralelo automáticamente.`
    });
}

async function precalentarCacheSfwSilente() {
    // No-op — el sistema de caché en disco fue eliminado.
}

module.exports = {
    cmdInteraccion, cmdNsfw, cmdNsfwAccion, cmdWaifu, cmdImageboard, cmdTopRandom,
    precalentarCacheSfw, precalentarCacheSfwSilente,
    TODO_SFW, TODO_NSFW_IMG, TODO_NSFW_ACCION, TODO_IMAGEBOARDS, TODO_IMAGEBOARDS_VIDEO,
    R34_TAG_DICT, traducirTagsR34, pidRandomR34, parsearInputR34, sugerenciasR34
};
