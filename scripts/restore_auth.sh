#!/bin/bash
# ─────────────────────────────────────────────
#  Nexus-Bot — Restaurar auth_info/ desde nube
#  Úsalo si migras de servidor o pierdes la sesión.
#
#  Uso: ./scripts/restore_auth.sh
# ─────────────────────────────────────────────

BOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="backblaze:nexus-bot-backups"

echo "⬇️  Restaurando auth_info/ desde la nube..."
rclone sync "$REMOTE/auth_info/" "$BOT_DIR/auth_info/"

echo "⬇️  Restaurando data/ desde la nube..."
rclone sync "$REMOTE/data/" "$BOT_DIR/data/"

echo "✅ Restauración completa. Ya puedes iniciar el bot."
