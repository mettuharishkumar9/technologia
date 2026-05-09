#!/usr/bin/env bash
# One-time bootstrap for a fresh Ubuntu 22.04 LTS Lightsail instance.
# Run this on first SSH after creating the VM:
#   curl -fsSL https://raw.githubusercontent.com/<your>/<repo>/main/databricks-pulse/scripts/provision.sh | sudo bash
# OR, if you prefer to clone first:
#   git clone <repo> ~/databricks-pulse && sudo bash ~/databricks-pulse/scripts/provision.sh
#
# What this does:
#   1. apt update + upgrade
#   2. Set timezone to Asia/Kolkata so cron HH:MM = IST
#   3. Install dependencies: Node 24, ffmpeg, git, fail2ban, ufw, nginx (for future blog)
#   4. Configure ufw firewall (22, 80, 443 only)
#   5. Install Playwright Chromium with Linux deps
#   6. Set up unattended-upgrades for security patches
#
# Idempotent — safe to re-run.

set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "This script must be run as root (use sudo)."
  exit 1
fi

ACTUAL_USER="${SUDO_USER:-ubuntu}"
ACTUAL_HOME="$(getent passwd "$ACTUAL_USER" | cut -d: -f6)"
echo "Provisioning for user: $ACTUAL_USER (home: $ACTUAL_HOME)"

# === Timezone ===
echo "[1/7] Setting timezone to Asia/Kolkata..."
timedatectl set-timezone Asia/Kolkata

# === System update ===
echo "[2/7] Updating apt..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# === Base tools ===
echo "[3/7] Installing base tools..."
apt-get install -y -qq \
    curl \
    git \
    ffmpeg \
    fail2ban \
    ufw \
    nginx \
    unattended-upgrades \
    ca-certificates \
    gnupg \
    build-essential

# === Node 24 (NodeSource) ===
if ! command -v node >/dev/null 2>&1 || [[ "$(node --version | sed 's/v//;s/\..*//')" -lt 24 ]]; then
  echo "[4/7] Installing Node.js 24..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y -qq nodejs
else
  echo "[4/7] Node $(node --version) already installed."
fi

# === Firewall ===
echo "[5/7] Configuring ufw firewall (22, 80, 443)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# === Unattended security upgrades ===
echo "[6/7] Enabling unattended security upgrades..."
dpkg-reconfigure -f noninteractive unattended-upgrades

# === Playwright Chromium (per-user install) ===
# Only install if databricks-pulse repo exists (i.e. user already cloned it).
if [[ -d "$ACTUAL_HOME/databricks-pulse" ]]; then
  echo "[7/7] Installing Playwright Chromium for $ACTUAL_USER..."
  sudo -u "$ACTUAL_USER" bash -c "cd '$ACTUAL_HOME/databricks-pulse' && npm install --silent && npx playwright install --with-deps chromium"
else
  echo "[7/7] No ~/databricks-pulse yet — skipping Playwright. Run this after cloning the repo:"
  echo "    cd ~/databricks-pulse && npm install && npx playwright install --with-deps chromium"
fi

echo ""
echo "✓ Provisioning complete."
echo ""
echo "Next steps:"
echo "  1. Clone the repo:  git clone <your-repo-url> $ACTUAL_HOME/databricks-pulse"
echo "  2. Create .env:     cp $ACTUAL_HOME/databricks-pulse/.env.example $ACTUAL_HOME/databricks-pulse/.env"
echo "                      then edit it with real Composio / IG / LinkedIn / Anthropic keys"
echo "  3. Install claude:  npm install -g @anthropic-ai/claude-code"
echo "  4. Set up cron:     crontab -e   (add the 4 entries from README)"
