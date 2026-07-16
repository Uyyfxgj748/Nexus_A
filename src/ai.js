const axios = require('axios');

const SYSTEM_PROMPTS = {
    nexus: `Eres Nexus, un asistente IA integrado en WhatsApp. Eres simpático, divertido y servicial. Respondes en el mismo idioma del usuario (español por defecto). Puedes hacer bromas, responder preguntas y ayudar en el grupo. Mantén respuestas cortas (máximo 3-4 párrafos). No uses markdown como ** o ##.`,
    sarcastico: `Eres Nexus con personalidad sarcástica. Respondes con ironía y humor negro suave. Todo lo que dices tiene un toque de sarcasmo. No eres ofensivo pero sí mordaz. Sin markdown.`,
    sabio: `Eres Nexus en modo sabio. Das respuestas profundas, filosóficas y reflexivas. Citas frases célebres cuando aplica. Usas metáforas y analogías. Sin markdown.`,
    troll: `Eres Nexus en modo troll amigable. Das respuestas inesperadas, absurdas y cómicas. Desvías el tema de forma divertida. Nunca eres ofensivo, solo loco. Sin markdown.`,
    tsundere: `Eres Nexus con personalidad tsundere de anime. Eres frío/a al principio pero a veces muestras amabilidad. Usas frases como "¡n-no es que me importe!" y "baka". Sin markdown.`,
};

const historial = new Map();
const personaActiva = new Map();
const memoriaGrupal = new Map();

function getPersona(userId) {
    return personaActiva.get(userId) || 'nexus';
}

function getSystemPrompt(userId) {
    return SYSTEM_PROMPTS[getPersona(userId)] || SYSTEM_PROMPTS.nexus;
}

function obtenerHistorial(userId) {
    if (!historial.has(userId)) historial.set(userId, []);
    return historial.get(userId);
}

const HISTORIAL_MAX_USUARIOS = 500;

function agregarMensaje(userId, role, content) {
    const h = obtenerHistorial(userId);
    h.push({ role, content });
    if (h.length > 14) h.splice(0, 2);
    // LRU: si el Map supera el límite, eliminar los 50 usuarios más antiguos
    if (historial.size > HISTORIAL_MAX_USUARIOS) {
        const sobran = [...historial.keys()].slice(0, 50);
        sobran.forEach(k => historial.delete(k));
    }
}

function limpiarDeprecation(t) {
    if (!t) return t;
    let out = String(t);
    // Eliminar avisos típicos de Pollinations sobre tier/auth/deprecation
    const patrones = [
        /^[\s\S]*?(?:deprecat\w+|free tier|authenticated tier|register your app|api key|sign up|🚨|⚠️)[\s\S]*?(?:\n\s*\n|\.\s)/i,
    ];
    for (const re of patrones) {
        const m = out.match(re);
        if (m && m[0].length < out.length * 0.7) {
            out = out.slice(m[0].length);
        }
    }
    out = out.replace(/^\s*[-=*_]{3,}\s*/g, '').trim();
    return out;
}

function pareceDeprecation(t) {
    if (!t) return false;
    const s = t.toLowerCase();
    if (t.length < 600 && (
        s.includes('deprecat') ||
        s.includes('authenticated tier') ||
        s.includes('register your app') ||
        s.includes('free tier is no longer') ||
        s.includes('please sign up') ||
        s.includes('api key required')
    )) return true;
    return false;
}

function extraerTexto(data) {
    if (!data) return null;
    if (typeof data === 'string') {
        const t = data.trim();
        if (t.length > 1 && !t.startsWith('<')) return t;
        return null;
    }
    if (data?.choices?.[0]?.message?.content) return String(data.choices[0].message.content).trim();
    if (data?.choices?.[0]?.text) return String(data.choices[0].text).trim();
    if (data?.content) return String(data.content).trim();
    if (data?.text) return String(data.text).trim();
    if (data?.response) return String(data.response).trim();
    if (data?.result) {
        if (typeof data.result === 'string') return data.result.trim();
        if (data.result?.response) return String(data.result.response).trim();
        if (data.result?.text) return String(data.result.text).trim();
    }
    if (data?.gpt) return String(data.gpt).trim();
    if (data?.data) {
        if (typeof data.data === 'string') return data.data.trim();
        if (data.data?.response) return String(data.data.response).trim();
        if (data.data?.text) return String(data.data.text).trim();
    }
    return null;
}

let ultimoErrorIA = null;

async function preguntarIA(userId, pregunta, systemOverride = null) {
    agregarMensaje(userId, 'user', pregunta);
    const sysPrompt = systemOverride || getSystemPrompt(userId);
    const msgs = obtenerHistorial(userId);
    const mensajes = [{ role: 'system', content: sysPrompt }, ...msgs];
    const seed = Math.floor(Math.random() * 99999) + 1;
    const referrer = 'nexusbot';

    const procesar = (raw) => {
        const t = extraerTexto(raw);
        if (!t) throw new Error('respuesta vacía');
        if (pareceDeprecation(t)) throw new Error('mensaje de deprecation');
        const limpio = limpiarDeprecation(t);
        if (limpio && limpio.length > 1 && !pareceDeprecation(limpio)) return limpio;
        throw new Error('vacío tras limpiar');
    };

    // Todos los proveedores se lanzan en paralelo.
    // Promise.any() resuelve con el primero que responda válido.
    const proveedores = [
        // 1) Pollinations OpenAI-compatible
        axios.post(
            `https://text.pollinations.ai/openai?referrer=${referrer}`,
            { model: 'openai', messages: mensajes, seed, referrer, stream: false },
            { timeout: 30000, headers: { 'Content-Type': 'application/json' } }
        ).then(r => procesar(r.data)),

        // 2) Pollinations endpoint plano
        axios.post(
            `https://text.pollinations.ai/?referrer=${referrer}`,
            { messages: mensajes, model: 'openai', seed, referrer, stream: false },
            { timeout: 25000, headers: { 'Content-Type': 'application/json', Accept: 'text/plain, application/json' } }
        ).then(r => procesar(r.data)),

        // 3) Pollinations GET con prompt en URL
        axios.get(
            `https://text.pollinations.ai/${encodeURIComponent(pregunta)}?model=openai&system=${encodeURIComponent(sysPrompt)}&seed=${seed}&referrer=${referrer}`,
            { timeout: 25000, headers: { Accept: 'text/plain' } }
        ).then(r => procesar(r.data)),

        // 4) Pollinations Mistral
        axios.post(
            `https://text.pollinations.ai/openai?referrer=${referrer}`,
            { model: 'mistral', messages: mensajes, seed, referrer, stream: false },
            { timeout: 25000, headers: { 'Content-Type': 'application/json' } }
        ).then(r => procesar(r.data)),

        // 5) Pollinations Llama
        axios.post(
            'https://text.pollinations.ai/openai',
            { model: 'llama', messages: mensajes, seed, stream: false },
            { timeout: 25000, headers: { 'Content-Type': 'application/json' } }
        ).then(r => procesar(r.data)),

        // 6) Samir Pikachu API
        axios.get(
            `https://samirxpikachuapi.vercel.app/gpt?prompt=${encodeURIComponent(pregunta)}`,
            { timeout: 25000 }
        ).then(r => procesar(r.data)),

        // 7) Netfly GPT-4o mini
        axios.get(
            `https://free.netfly.top/api/openai/v1/chat/completions?model=gpt-4o-mini&message=${encodeURIComponent(pregunta)}`,
            { timeout: 20000 }
        ).then(r => procesar(r.data)),

        // 8) OpenRouter Mistral free
        axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            { model: 'mistralai/mistral-7b-instruct:free', messages: mensajes },
            {
                timeout: 25000,
                headers: {
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://nexusbot.app',
                    'X-Title': 'Nexus WhatsApp Bot'
                }
            }
        ).then(r => procesar(r.data)),
    ];

    // 9) Kaiz — solo si hay API key configurada
    const kaizKey = process.env.KAIZ_API_KEY;
    if (kaizKey) {
        proveedores.push(
            axios.get(
                `https://kaiz-apis.gleeze.com/api/gpt-4o?q=${encodeURIComponent(pregunta)}&uid=${encodeURIComponent(userId)}&imageUrl=&apikey=${kaizKey}`,
                { timeout: 25000 }
            ).then(r => procesar(r.data))
        );
    }

    try {
        const respuesta = await Promise.any(proveedores);
        agregarMensaje(userId, 'assistant', respuesta);
        return respuesta;
    } catch (e) {
        // AggregateError: todos los proveedores fallaron
        const detalles = (e.errors || [e]).map(err => err.message).join(' | ');
        ultimoErrorIA = detalles;
        console.log('AI ERROR (todos los proveedores fallaron):', ultimoErrorIA);
        throw new Error('No se obtuvo respuesta de la IA');
    }
}

// ══════════════════════════════════════════
//  COMANDO PRINCIPAL #ai
// ══════════════════════════════════════════
async function cmdIA(sock, jid, senderJid, args, pushName) {
    if (!args.length) {
        const persona = getPersona(senderJid);
        await sock.sendMessage(jid, {
            text: `🤖 *Nexus AI*\n\nUso: *#ai [pregunta]*\nPersona actual: *${persona}*\n\n📋 Subcomandos:\n• *#ai persona [nexus|sarcastico|sabio|troll|tsundere]*\n• *#ai memory on|off*\n• *#ai roast @usuario*\n• *#ai reset* — Borra historial\n• *#ai status* — Diagnóstico de la IA`
        });
        return;
    }

    const sub = args[0]?.toLowerCase();

    if (sub === 'status' || sub === 'diag') {
        await sock.sendMessage(jid, { text: '🔍 Probando conexión IA...' });
        try {
            const t = await preguntarIA('__diag__', 'Responde solo "ok"');
            historial.delete('__diag__');
            await sock.sendMessage(jid, { text: `✅ IA operativa.\nRespuesta: _${t.slice(0, 80)}_` });
        } catch {
            await sock.sendMessage(jid, { text: `❌ IA no responde.\n\nÚltimo error:\n${ultimoErrorIA || 'desconocido'}` });
        }
        return;
    }

    if (sub === 'persona' || sub === 'personalidad') {
        const p = args[1]?.toLowerCase();
        if (!p || !SYSTEM_PROMPTS[p]) {
            const lista = Object.keys(SYSTEM_PROMPTS).join(', ');
            await sock.sendMessage(jid, { text: `❌ Personas disponibles: *${lista}*\nEjemplo: *#ai persona sarcastico*` });
            return;
        }
        personaActiva.set(senderJid, p);
        historial.delete(senderJid);
        await sock.sendMessage(jid, { text: `✅ Nexus ahora tiene personalidad *${p}* 🤖\n_El historial fue reiniciado._` });
        return;
    }

    if (sub === 'memory' || sub === 'memoria') {
        const toggle = args[1]?.toLowerCase();
        if (!['on', 'off'].includes(toggle)) {
            await sock.sendMessage(jid, { text: '❌ Uso: *#ai memory on* o *#ai memory off*' });
            return;
        }
        if (!memoriaGrupal.has(jid)) memoriaGrupal.set(jid, { activa: false, mensajes: [] });
        memoriaGrupal.get(jid).activa = toggle === 'on';
        await sock.sendMessage(jid, { text: `🧠 Memoria del grupo: *${toggle === 'on' ? 'ACTIVADA ✅' : 'DESACTIVADA ❌'}*` });
        return;
    }

    if (sub === 'roast') {
        const targetNombre = args[1]?.replace('@', '') || pushName || 'alguien del grupo';
        const roastPrompt = `Eres un comediante de roast. Haz un insulto creativo, divertido y sin crueldad real de máximo 3 líneas sobre "${targetNombre}". En español. Sin markdown.`;
        try {
            await sock.sendMessage(jid, { text: '🔥 _Cargando roast..._' });
            const res = await preguntarIA(senderJid + '_roast', `Roastéame a ${targetNombre}`, roastPrompt);
            await sock.sendMessage(jid, { text: `🔥 *ROAST para ${targetNombre}:*\n\n_"${res}"_\n\n😂 by Nexus AI` });
        } catch {
            await sock.sendMessage(jid, { text: '❌ La IA está en modo pacifista hoy 😂' });
        }
        return;
    }

    if (sub === 'reset' || sub === 'clear') {
        historial.delete(senderJid);
        await sock.sendMessage(jid, { text: '🗑️ Historial de conversación borrado.' });
        return;
    }

    const pregunta = args.join(' ').trim();
    const nombre = pushName || senderJid.split('@')[0];
    await sock.sendMessage(jid, { text: '🤖 _Nexus pensando..._' });

    let preguntaFinal = pregunta;
    if (jid.endsWith('@g.us') && memoriaGrupal.get(jid)?.activa) {
        const ctx = memoriaGrupal.get(jid).mensajes.slice(-5).join('\n');
        if (ctx) preguntaFinal = `[Contexto reciente del grupo: ${ctx}]\n\n${pregunta}`;
    }

    try {
        const respuesta = await preguntarIA(senderJid, preguntaFinal);
        await sock.sendMessage(jid, { text: `🤖 *Nexus AI* → _${nombre}_\n\n${respuesta}` });
    } catch {
        await sock.sendMessage(jid, {
            text: `❌ No pude conectarme a la IA ahora.\n\nProbá *#ai status* para ver el motivo.`
        });
    }
}

function registrarMensajeGrupal(groupId, texto) {
    if (!memoriaGrupal.has(groupId)) return;
    const m = memoriaGrupal.get(groupId);
    if (!m.activa) return;
    m.mensajes.push(texto.slice(0, 100));
    if (m.mensajes.length > 20) m.mensajes.shift();
}

async function cmdLimpiarMemoria(sock, jid, senderJid) {
    let limpiados = 0;
    for (const [key] of historial) {
        historial.delete(key);
        limpiados++;
    }
    if (memoriaGrupal.has(jid)) {
        memoriaGrupal.get(jid).mensajes = [];
    }
    await sock.sendMessage(jid, {
        text: `🧹 *Memoria IA limpiada*\n\n🗑️ Historiales borrados: *${limpiados}*\n🧠 Contexto grupal: *reiniciado*\n\n_Nexus empieza de cero._`
    });
}

module.exports = { cmdIA, registrarMensajeGrupal, cmdLimpiarMemoria };
