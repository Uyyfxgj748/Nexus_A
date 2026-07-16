#!/bin/bash
# ─────────────────────────────────────────────
#  Nexus-Bot — Script de instalación en VPS
#  Compatible con Ubuntu 22.04 / Debian 12
#
#  Uso (como root o con sudo):
#    bash setup_vps.sh
# ─────────────────────────────────────────────

set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Nexus-Bot — Instalación en VPS     ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Actualizar sistema ──
echo "📦 Actualizando el sistema..."
apt update -y && apt upgrade -y

# ── 2. Instalar dependencias del sistema ──
echo "📦 Instalando dependencias..."
apt install -y git curl ffmpeg imagemagick python3 python3-pip unzip wget

# ── 3. Instalar Node.js 20 ──
echo "📦 Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v && npm -v

# ── 4. Instalar PM2 globalmente ──
echo "📦 Instalando PM2..."
npm install -g pm2

# ── 5. Instalar rclone ──
echo "📦 Instalando rclone..."
curl https://rclone.org/install.sh | bash

# ── 6. Clonar el repositorio ──
echo ""
echo "📁 ¿Cuál es la URL de tu repositorio Git?"
echo "   (Ejemplo: https://github.com/tu-usuario/nexus-bot.git)"
read -r REPO_URL

if [ -n "$REPO_URL" ]; then
  git clone "$REPO_URL" /root/nexus-bot
  cd /root/nexus-bot
else
  echo "⚠️  Sin repositorio. Asegúrate de subir el proyecto manualmente a /root/nexus-bot"
  mkdir -p /root/nexus-bot
  cd /root/nexus-bot
fi

# ── 7. Instalar dependencias npm ──
echo "📦 Instalando dependencias del bot..."
npm install

# ── 8. Configurar variables de entorno ──
echo ""
echo "📝 Configurando .env ..."
cp .env.example .env
echo ""
echo "⚠️  IMPORTANTE: Edita el archivo .env con tus datos:"
echo "   nano /root/nexus-bot/.env"
echo ""

# ── 9. Crear carpeta de logs ──
mkdir -p /root/nexus-bot/logs

# ── 10. Iniciar el bot con PM2 ──
echo "🚀 Iniciando el bot con PM2..."
pm2 start ecosystem.config.js

# ── 11. Guardar configuración y activar autoarranque ──
pm2 save
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║ ✅ Instalación completada                            ║"
echo "║                                                      ║"
echo "║  Comandos útiles:                                    ║"
echo "║  pm2 status           → ver estado del bot          ║"
echo "║  pm2 logs nexus-bot   → ver logs en tiempo real     ║"
echo "║  pm2 restart nexus-bot → reiniciar el bot           ║"
echo "║  pm2 stop nexus-bot   → detener el bot              ║"
echo "║                                                      ║"
echo "║  Próximo paso: configurar rclone para backups        ║"
echo "║  → rclone config                                     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
