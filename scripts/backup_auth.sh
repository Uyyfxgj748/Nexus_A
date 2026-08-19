#!/bin/bash
# ─────────────────────────────────────────────
#  Nexus-Bot — Backup de auth_info/ con rclone
#  Guarda la sesión de WhatsApp en la nube para
#  no perderla si el servidor se reinicia o falla.
#
#  Uso: ./scripts/backup_auth.sh
#  Cron recomendado (cada 30 min):
#    */30 * * * * /home/tu-usuario/nexus-bot/scripts/backup_auth.sh
# ─────────────────────────────────────────────

BOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="backblaze:nexus-bot-backups"   # cambia "backblaze" por el nombre que le diste en rclone config
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
LOG="$BOT_DIR/logs/backup_auth.log"

mkdir -p "$BOT_DIR/logs"

echo "[$TIMESTAMP] Iniciando backup de auth_info/ y data/" >> "$LOG"

# Backup de la sesión de WhatsApp (crítico)
rclone sync "$BOT_DIR/auth_info/" "$REMOTE/auth_info/" \
  --log-file="$LOG" --log-level=INFO

# Backup de los datos del bot
rclone sync "$BOT_DIR/data/" "$REMOTE/data/" \
  --log-file="$LOG" --log-level=INFO

echo "[$TIMESTAMP] Backup completado." >> "$LOG"
