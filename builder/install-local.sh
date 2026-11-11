#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--accept-sql-eula" ]]; then
    echo "Read the Microsoft SQL Server licence, then run: bash builder/install-local.sh --accept-sql-eula" >&2
    exit 1
fi
if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
    echo "This installer requires Linux on x86_64." >&2
    exit 1
fi
for command in node npm python3 openssl docker systemctl sudo curl; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "Missing prerequisite: $command. Install the prerequisites described in README_PI.md." >&2
        exit 1
    fi
done
if (( $(node -p "Number(process.versions.node.split('.')[0])") < 20 )); then
    echo "Node.js 20 or newer is required." >&2
    exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="$HOME/.config/homelink"
if [[ ! "$ROOT" =~ ^/[a-zA-Z0-9._/-]+$ || ! "$HOME" =~ ^/[a-zA-Z0-9._/-]+$ ]]; then
    echo "Paths containing spaces or systemd special characters are not supported." >&2
    exit 1
fi
cd "$ROOT"
sudo docker info >/dev/null
if sudo docker inspect homelink-sql >/dev/null 2>&1 || sudo docker volume inspect homelink-sql-data >/dev/null 2>&1 ||
   systemctl cat homelink.service >/dev/null 2>&1 || [[ -e "$CONFIG_DIR/sqlserver.env" || -e "$CONFIG_DIR/app.env" ]]; then
    echo "An existing HomeLink service, database, volume or configuration was found. Nothing was replaced." >&2
    exit 1
fi

if [[ -e .venv ]] && ! .venv/bin/python --version >/dev/null 2>&1; then
    backup="$HOME/homelink-venv-backup-$(date +%Y%m%d-%H%M%S)"
    if [[ -e "$backup" ]]; then echo "Backup path already exists: $backup" >&2; exit 1; fi
    mv .venv "$backup"
    echo "Preserved the incompatible virtual environment in $backup."
fi
if [[ ! -d .venv ]]; then python3 -m venv .venv; fi
npm ci
.venv/bin/python -m pip install -r requirements.txt

umask 077
mkdir -p "$CONFIG_DIR"
printf 'ACCEPT_EULA=Y\nMSSQL_PID=Express\nMSSQL_SA_PASSWORD=Sa%s!1a\n' "$(openssl rand -hex 24)" > "$CONFIG_DIR/sqlserver.env"
sudo docker run -d --name homelink-sql --restart unless-stopped \
    -p 127.0.0.1:1433:1433 --env-file "$CONFIG_DIR/sqlserver.env" \
    -v homelink-sql-data:/var/opt/mssql mcr.microsoft.com/mssql/server:2022-latest
export HOMELINK_CONFIG_DIR="$CONFIG_DIR"
node builder/init-local-db.js
openssl req -nodes -new -x509 -keyout "$CONFIG_DIR/server.key" -out "$CONFIG_DIR/server.cert" \
    -days 365 -subj '/CN=homelink.local' >/dev/null 2>&1
printf 'TLS_KEY_PATH=%s/server.key\nTLS_CERT_PATH=%s/server.cert\n' "$CONFIG_DIR" "$CONFIG_DIR" >> "$CONFIG_DIR/app.env"

unit="$(mktemp)"
trap 'rm -f "$unit"' EXIT
printf '[Unit]\nDescription=HomeLink\nRequires=docker.service\nAfter=docker.service\n\n[Service]\nType=simple\nUser=%s\nWorkingDirectory=%s\nEnvironment=NODE_OPTIONS=--openssl-legacy-provider\nEnvironmentFile=%s/app.env\nExecStartPre=%s %s/builder/wait-for-local-db.js\nExecStart=%s %s/server.js\nRestart=on-failure\nRestartSec=5\nTimeoutStartSec=180\n\n[Install]\nWantedBy=multi-user.target\n' \
    "$(id -un)" "$ROOT" "$CONFIG_DIR" "$(command -v node)" "$ROOT" "$(command -v node)" "$ROOT" > "$unit"
sudo install -m 0644 "$unit" /etc/systemd/system/homelink.service
sudo systemctl daemon-reload
sudo systemctl enable --now homelink
sleep 5
systemctl is-active --quiet homelink
echo "HomeLink service is active. Check journalctl -u homelink and open the server on port 3000."
