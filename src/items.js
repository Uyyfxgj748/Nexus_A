const { getUsuario, guardarUsuario } = require('./database');
const { H, SH, F, FS, FI, FE, FC, OK, ERR, WARN, INFO, DIV } = require('./style');

const ITEMS_DB = {
    escudo: {
        nombre: 'Escudo',
        desc: 'Bloquea el próximo robo que recibas (1 uso)',
        precio: 15000,
        tipo: 'defensa'
    },
    boost_trabajo: {
        nombre: 'Boost de trabajo',
        desc: 'Duplica la ganancia del próximo #work',
        precio: 22000,
        tipo: 'boost'
    },
    dado_suerte: {
        nombre: 'Dado de la suerte',
        desc: 'Multiplica x1.5 la ganancia de tu próxima apuesta',
        precio: 32000,
        tipo: 'suerte'
    },
    detector: {
        nombre: 'Detector',
        desc: 'Sube el éxito del próximo #rob al 85%',
        precio: 42000,
        tipo: 'ataque'
    },
    pocion_exp: {
        nombre: 'Pocion de EXP',
        desc: 'Otorga +150 XP de combate al instante',
        precio: 20000,
        tipo: 'combate'
    },
    caja_misteriosa: {
        nombre: 'Caja misteriosa',
        desc: 'Contiene una recompensa aleatoria (puede ser buena... o mala)',
        precio: 10000,
        tipo: 'especial'
    },
    fianza: {
        nombre: 'Fianza',
        desc: 'Sale de la cárcel inmediatamente (1 uso)',
        precio: 15000,
        tipo: 'especial'
    },
    bendicion_fortuna: {
        nombre: 'Bendicion de Fortuna',
        desc: 'Aumenta +25% todas tus ganancias 30 min (work, crime, rob, daily)',
        precio: 28000,
        tipo: 'boost'
    },
    granada_aturd: {
        nombre: 'Granada Aturdidora',
        desc: 'Hace fallar el próximo intento de robo que te hagan (1 uso)',
        precio: 35000,
        tipo: 'defensa'
    },
    cristal_prisma: {
        nombre: 'Cristal Prisma',
        desc: 'Duplica la recompensa de tu próxima caja misteriosa',
        precio: 55000,
        tipo: 'especial'
    },
    turbo_apuesta: {
        nombre: 'Turbo-Apuesta',
        desc: 'Tus ganancias en apuestas son x2 durante 1 hora (#coinflip, #ruleta)',
        precio: 40000,
        tipo: 'boost'
    },
    orbe_predictor: {
        nombre: 'Orbe Predictor',
        desc: 'Revela si tu próximo #rob sería exitoso o fallaría sin ejecutarlo',
        precio: 30000,
        tipo: 'utilidad'
    },
    lobo_guardian: {
        nombre: 'Lobo Guardian',
        desc: 'Reduce 40% el daño recibido en combates PVP durante 24 horas',
        precio: 70000,
        tipo: 'defensa'
    },
    contrabando: {
        nombre: 'Paquete de Contrabando',
        desc: 'Recompensa aleatoria: dinero, XP o ítem especial al abrirlo',
        precio: 18000,
        tipo: 'especial'
    },
    carga_pesada: {
        nombre: 'Carga Pesada',
        desc: 'Reduce la defensa del enemigo en tu próximo combate PVP',
        precio: 25000,
        tipo: 'ataque'
    },
    chip_energia: {
        nombre: 'Chip de Energia',
        desc: 'Restablece los cooldowns de #work, #crime y #slut al instante',
        precio: 20000,
        tipo: 'utilidad'
    },
    contrato_oscuro: {
        nombre: 'Contrato Oscuro',
        desc: 'Los robos tienen 100% de éxito durante 10 minutos',
        precio: 90000,
        tipo: 'ataque'
    },
};

function getInventario(u) {
    if (Array.isArray(u.inventario)) {
        const nuevo = {};
        for (const key of Object.keys(u.inventario)) {
            if (isNaN(key) && u.inventario[key] > 0) {
                nuevo[key] = u.inventario[key];
            }
        }
        u.inventario = nuevo;
    } else if (!u.inventario || typeof u.inventario !== 'object') {
        u.inventario = {};
    }
    return u.inventario;
}

function tieneItem(u, itemId) {
    const inv = getInventario(u);
    return (inv[itemId] || 0) > 0;
}

function consumirItem(u, itemId) {
    const inv = getInventario(u);
    if ((inv[itemId] || 0) > 0) {
        inv[itemId]--;
        u.inventario = inv;
        return true;
    }
    return false;
}

async function cmdInventario(sock, jid, senderJid, pagina = 1) {
    const { paginar, piePagina } = require('./paginator');
    const u = getUsuario(senderJid);
    const inv = getInventario(u);
    const todos = Object.entries(inv).filter(([, qty]) => qty > 0);
    const activos = u.itemsActivos || {};
    const ahora = Date.now();

    if (!todos.length) {
        await sock.sendMessage(jid, {
            text: `${INFO} Tu inventario está vacío.\n_Visita la tienda con *#shop* y compra ítems con *#buyitem [id]*_`
        });
        return;
    }

    const { items, pag, totalPags } = paginar(todos, pagina, 10);
    let texto = `${H('Inventario')}\n\n`;
    texto += items.map(([id, qty]) => {
        const item = ITEMS_DB[id];
        if (!item) return null;
        let estadoStr = '';
        const val = activos[id];
        if (val === true) {
            estadoStr = ` _(activo — ${OK})_`;
        } else if (typeof val === 'number' && val > ahora) {
            const mins = Math.ceil((val - ahora) / 60000);
            estadoStr = ` _(activo ${OK} — ${mins} min)_`;
        }
        return `${F} *${item.nombre}* ×${qty}${estadoStr}\n| _${item.desc}_`;
    }).filter(Boolean).join('\n\n');
    texto += piePagina(pag, totalPags, 'inv');

    await sock.sendMessage(jid, { text: texto });
}

async function cmdShop(sock, jid, pagina = 1) {
    const { paginar, piePagina } = require('./paginator');
    const todos = Object.entries(ITEMS_DB);
    const { items, pag, totalPags } = paginar(todos, pagina, 10);
    let texto = `${H('Tienda de Items')}\n\n`;
    texto += items.map(([id, item]) =>
        `${F} *${item.nombre}*\n| ${item.desc}\n| *${item.precio.toLocaleString()} ⓃNexCoins* — \`${id}\``
    ).join('\n\n');
    texto += `\n\n_Compra con *#buyitem [id]* · Usa con *#useitem [id]*_${piePagina(pag, totalPags, 'shop')}`;
    await sock.sendMessage(jid, { text: texto });
}

async function cmdBuyItem(sock, jid, senderJid, args) {
    const itemId = args[0]?.toLowerCase().replace(/[\s-]/g, '_');
    if (!itemId || !ITEMS_DB[itemId]) {
        const ids = Object.keys(ITEMS_DB).join(', ');
        await sock.sendMessage(jid, {
            text: `${ERR} Ítem no encontrado.\nIDs válidos: \`${ids}\`\n\n_Usa *#shop* para ver la tienda._`
        });
        return;
    }
    const item = ITEMS_DB[itemId];
    const u = getUsuario(senderJid);

    if (itemId !== 'fianza' && u.encarcelado && Date.now() < u.encarcelado) {
        const min = Math.ceil((u.encarcelado - Date.now()) / 60000);
        await sock.sendMessage(jid, {
            text: `${ERR} Estás en la cárcel. No puedes comprar nada por *${min} min*.\n_Usa *#buyitem fianza* para salir si tienes coins suficientes._`
        });
        return;
    }

    if (u.monedas < item.precio) {
        await sock.sendMessage(jid, {
            text: `${ERR} No tienes suficientes ⓃNexCoins.\n${FI} Necesitas » *${item.precio.toLocaleString()}*\n${FE} Tienes » *${u.monedas.toLocaleString()}*`
        });
        return;
    }

    if (itemId === 'fianza') {
        if (!u.encarcelado || Date.now() >= u.encarcelado) {
            await sock.sendMessage(jid, { text: `${ERR} No estás en la cárcel. No necesitas una fianza.` });
            return;
        }
        u.monedas -= item.precio;
        u.encarcelado = null;
        guardarUsuario(senderJid, u);
        await sock.sendMessage(jid, {
            text: `${OK} *Saliste de la cárcel.* Pagaste *${item.precio.toLocaleString()} ⓃNexCoins* de fianza.\n${FE} Saldo restante » *${u.monedas.toLocaleString()}*`
        });
        return;
    }

    u.monedas -= item.precio;
    const inv = getInventario(u);
    inv[itemId] = (inv[itemId] || 0) + 1;
    u.inventario = inv;
    guardarUsuario(senderJid, u);
    await sock.sendMessage(jid, {
        text: `${OK} Compraste *${item.nombre}* por *${item.precio.toLocaleString()} ⓃNexCoins*\n${FE} Saldo restante » *${u.monedas.toLocaleString()}*\n\n_Úsalo con *#useitem ${itemId}*_`
    });
}

async function cmdUseItem(sock, jid, senderJid, args) {
    const itemId = args[0]?.toLowerCase().replace(/[\s-]/g, '_');
    if (!itemId) {
        await sock.sendMessage(jid, {
            text: `${ERR} Uso: *#useitem [id]*\nEjemplo: *#useitem escudo*\n\n_Ve tu inventario con *#inv*_`
        });
        return;
    }
    const item = ITEMS_DB[itemId];
    if (!item) {
        await sock.sendMessage(jid, { text: `${ERR} Ítem desconocido: \`${itemId}\`` });
        return;
    }
    const u = getUsuario(senderJid);
    const inv = getInventario(u);
    if ((inv[itemId] || 0) <= 0) {
        await sock.sendMessage(jid, { text: `${ERR} No tienes *${item.nombre}* en tu inventario.` });
        return;
    }
    if (!u.itemsActivos) u.itemsActivos = {};

    switch (itemId) {

        case 'escudo':
            inv[itemId]--;
            u.itemsActivos.escudo = true;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `${OK} *Escudo activado.*\nEl próximo robo que intenten hacerte será bloqueado automáticamente.`
            });
            break;

        case 'boost_trabajo':
            inv[itemId]--;
            u.itemsActivos.boost_trabajo = true;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `${OK} *Boost de trabajo activado.*\nTu próximo *#work* dará el doble de coins.`
            });
            break;

        case 'dado_suerte':
            inv[itemId]--;
            u.itemsActivos.dado_suerte = true;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `${OK} *Dado de la suerte activado.*\nTu próxima apuesta (#coinflip o #ruleta) dará x1.5 coins.`
            });
            break;

        case 'detector':
            inv[itemId]--;
            u.itemsActivos.detector = true;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `${OK} *Detector activado.*\nTu próximo *#rob* tendrá un 85% de éxito.`
            });
            break;

        case 'pocion_exp': {
            inv[itemId]--;
            u.inventario = inv;
            if (!u.stats) u.stats = { fuerza: 10, defensa: 10, suerte: 10, xp: 0, nivel: 1 };
            u.stats.xp = (u.stats.xp || 0) + 150;
            const xpNecesaria = (u.stats.nivel || 1) * 100;
            if (u.stats.xp >= xpNecesaria) {
                u.stats.xp -= xpNecesaria;
                u.stats.nivel = (u.stats.nivel || 1) + 1;
                guardarUsuario(senderJid, u);
                await sock.sendMessage(jid, {
                    text: `${OK} *Pocion de EXP usada.* +150 XP de combate\n${FS} *Subiste al nivel de combate ${u.stats.nivel}*`
                });
            } else {
                guardarUsuario(senderJid, u);
                await sock.sendMessage(jid, {
                    text: `${OK} *Pocion de EXP usada.* +150 XP de combate\n${FI} XP » ${u.stats.xp}/${xpNecesaria}`
                });
            }
            break;
        }

        case 'caja_misteriosa': {
            inv[itemId]--;
            u.inventario = inv;
            let prismaActivo = false;
            if (u.itemsActivos?.cristal_prisma) {
                delete u.itemsActivos.cristal_prisma;
                prismaActivo = true;
            }
            const randCaja = Math.random();
            let resultado;
            if (randCaja < 0.4) {
                let coins = Math.floor(Math.random() * 40000) + 10000;
                if (prismaActivo) coins *= 2;
                u.monedas += coins;
                resultado = `${FE} *+${coins.toLocaleString()} ⓃNexCoins*${prismaActivo ? ' _(x2 Cristal Prisma)_' : ''}`;
            } else if (randCaja < 0.6) {
                const itemsBonus = ['escudo', 'boost_trabajo', 'dado_suerte'];
                const itemBonus = itemsBonus[Math.floor(Math.random() * itemsBonus.length)];
                const cantBonus = prismaActivo ? 2 : 1;
                inv[itemBonus] = (inv[itemBonus] || 0) + cantBonus;
                resultado = `${F} *${prismaActivo ? '2x ' : ''}${ITEMS_DB[itemBonus].nombre}*${prismaActivo ? ' _(x2 Cristal Prisma)_' : ''}`;
            } else if (randCaja < 0.75) {
                let xpCaja = 300;
                if (prismaActivo) xpCaja = 600;
                if (!u.stats) u.stats = { fuerza: 10, defensa: 10, suerte: 10, xp: 0, nivel: 1 };
                u.stats.xp = (u.stats.xp || 0) + xpCaja;
                resultado = `${FI} *+${xpCaja} XP* de combate${prismaActivo ? ' _(x2 Cristal Prisma)_' : ''}`;
            } else {
                const perdida = Math.floor(Math.random() * 10000) + 5000;
                u.monedas = Math.max(0, u.monedas - perdida);
                resultado = `${ERR} Estaba maldita. Perdiste *${perdida.toLocaleString()} ⓃNexCoins*`;
            }
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `${H('Caja misteriosa')}\n\n${resultado}\n\n${FE} Coins » *${u.monedas.toLocaleString()}*`
            });
            break;
        }

        case 'fianza':
            if (!u.encarcelado || Date.now() >= u.encarcelado) {
                await sock.sendMessage(jid, { text: `${ERR} No estás en la cárcel.` });
                return;
            }
            inv[itemId]--;
            u.inventario = inv;
            u.encarcelado = null;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, { text: `${OK} *Saliste de la cárcel usando tu fianza.*` });
            break;

        case 'bendicion_fortuna': {
            inv[itemId]--;
            const expiraBF = Date.now() + 30 * 60 * 1000;
            u.itemsActivos.bendicion_fortuna = expiraBF;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            const horaFin = new Date(expiraBF).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
            await sock.sendMessage(jid, {
                text: `${OK} *Bendicion de Fortuna activada.*\nTodas tus ganancias aumentan *+25%* durante *30 minutos*.\n${FI} Expira a las *${horaFin}*\n\n_Aplica en: #work, #crime, #rob, #daily, #slut_`
            });
            break;
        }

        case 'granada_aturd':
            inv[itemId]--;
            u.itemsActivos.granada_aturd = true;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `${OK} *Granada Aturdidora activada.*\nEl próximo robo que alguien te intente hacer *fallará automáticamente*.`
            });
            break;

        case 'cristal_prisma':
            inv[itemId]--;
            u.itemsActivos.cristal_prisma = true;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `${OK} *Cristal Prisma activado.*\nLa próxima *#useitem caja_misteriosa* dará el *doble* de recompensas.`
            });
            break;

        case 'turbo_apuesta': {
            inv[itemId]--;
            const expiraTA = Date.now() + 60 * 60 * 1000;
            u.itemsActivos.turbo_apuesta = expiraTA;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            const horaFinTA = new Date(expiraTA).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
            await sock.sendMessage(jid, {
                text: `${OK} *Turbo-Apuesta activado.*\nTus ganancias en *#coinflip* y *#ruleta* serán *x2* durante *1 hora*.\n${FI} Expira a las *${horaFinTA}*`
            });
            break;
        }

        case 'orbe_predictor': {
            inv[itemId]--;
            u.inventario = inv;
            let tasaSimulada = 0.45;
            if (u.itemsActivos?.detector) tasaSimulada = 0.85;
            if (u.itemsActivos?.contrato_oscuro && Date.now() < u.itemsActivos.contrato_oscuro) tasaSimulada = 1.0;
            const prediccionExito = Math.random() < tasaSimulada;
            const prediccionTexto = prediccionExito
                ? `${OK} *Tu próximo #rob TENDRÍA EXITO*\n_Prob. base: ${Math.round(tasaSimulada * 100)}%_`
                : `${ERR} *Tu próximo #rob FALLARIA*\n_Prob. base: ${Math.round(tasaSimulada * 100)}%_\n_Usa un Detector para mejorar tus chances._`;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `${H('Orbe Predictor')}\n\n${prediccionTexto}\n\n_${WARN} El resultado real puede variar. El orbe fue consumido._`
            });
            break;
        }

        case 'lobo_guardian': {
            inv[itemId]--;
            const expiraLG = Date.now() + 24 * 60 * 60 * 1000;
            u.itemsActivos.lobo_guardian = expiraLG;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            const horaFinLG = new Date(expiraLG).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
            await sock.sendMessage(jid, {
                text: `${OK} *Lobo Guardian invocado.*\nReducirás el *40% del daño recibido* en combates PVP durante *24 horas*.\n${FI} Expira mañana a las *${horaFinLG}*`
            });
            break;
        }

        case 'contrabando': {
            inv[itemId]--;
            u.inventario = inv;
            if (!u.stats) u.stats = { fuerza: 10, defensa: 10, suerte: 10, xp: 0, nivel: 1 };
            const randCB = Math.random();
            let resultadoCB;
            if (randCB < 0.45) {
                const coinsCB = Math.floor(Math.random() * 25000) + 5000;
                u.monedas += coinsCB;
                resultadoCB = `${FE} *+${coinsCB.toLocaleString()} ⓃNexCoins* encontradas en el paquete.`;
            } else if (randCB < 0.70) {
                const xpCB = Math.floor(Math.random() * 200) + 100;
                u.stats.xp = (u.stats.xp || 0) + xpCB;
                resultadoCB = `${FI} *+${xpCB} XP* de combate encontrado en el paquete.`;
            } else if (randCB < 0.87) {
                const itemsRaros = ['escudo', 'detector', 'dado_suerte', 'granada_aturd'];
                const itemR = itemsRaros[Math.floor(Math.random() * itemsRaros.length)];
                inv[itemR] = (inv[itemR] || 0) + 1;
                resultadoCB = `${F} Encontraste un *${ITEMS_DB[itemR].nombre}* en el paquete.`;
            } else {
                resultadoCB = `${WARN} El paquete estaba *completamente vacío*... te engañaron.`;
            }
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `${H('Paquete de Contrabando')}\n\n${resultadoCB}\n\n${FE} Saldo » *${u.monedas.toLocaleString()} ⓃNC*`
            });
            break;
        }

        case 'carga_pesada':
            inv[itemId]--;
            u.itemsActivos.carga_pesada = true;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `${OK} *Carga Pesada preparada.*\nEn tu próximo combate con *#fight*, la defensa de tu enemigo se reducirá un *30%*.`
            });
            break;

        case 'chip_energia': {
            inv[itemId]--;
            u.inventario = inv;
            delete u.ultimoTrabajo;
            delete u.ultimoCrimen;
            delete u.ultimoSlut;
            guardarUsuario(senderJid, u);
            await sock.sendMessage(jid, {
                text: `${OK} *Chip de Energia instalado.*\nCooldowns reseteados:\n${OK} *#work*\n${OK} *#crime*\n${OK} *#slut*\n\n_Puedes usar estos comandos de nuevo._`
            });
            break;
        }

        case 'contrato_oscuro': {
            inv[itemId]--;
            const expiraCO = Date.now() + 10 * 60 * 1000;
            u.itemsActivos.contrato_oscuro = expiraCO;
            u.inventario = inv;
            guardarUsuario(senderJid, u);
            const horaFinCO = new Date(expiraCO).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
            await sock.sendMessage(jid, {
                text: `${OK} *Contrato Oscuro firmado.*\nTus robos tendrán *100% de éxito* durante *10 minutos*.\n${FI} Expira a las *${horaFinCO}*\n\n${WARN} _El pago vendrá después..._`
            });
            break;
        }

        default:
            await sock.sendMessage(jid, { text: `${ERR} Este ítem no se puede usar manualmente.` });
    }
}

module.exports = { cmdInventario, cmdShop, cmdBuyItem, cmdUseItem, ITEMS_DB, getInventario, tieneItem, consumirItem };
