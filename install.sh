#!/usr/bin/env bash
set -euo pipefail

echo "============================================================"
echo "  Assetto Corsa Docker Multi-Server Panel — VDS Kurulumu"
echo "============================================================"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "[!] Bu betigi sudo/root yetkisiyle calistirin: sudo bash install.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Docker & Docker Compose kontrol / kurulum
if ! command -v docker >/dev/null 2>&1; then
  echo "[*] Docker bulunamadi, kuruluyor..."
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg openssl
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "[+] Docker zaten kurulu: $(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[*] Docker Compose eklentisi kuruluyor..."
  apt-get update -y
  apt-get install -y docker-compose-plugin
fi

# 2. VDS Genel IP tespiti
DETECTED_IP="$(curl -fsSL --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
echo ""
read -r -p "VDS Genel IP adresiniz [${DETECTED_IP}]: " INPUT_IP
VDS_IP="${INPUT_IP:-$DETECTED_IP}"

read -r -p "Panel Portu [5829]: " INPUT_PORT
PANEL_PORT="${INPUT_PORT:-5829}"

read -r -p "Admin Kullanici Adi [admin]: " INPUT_USER
ADMIN_USER="${INPUT_USER:-admin}"

DEFAULT_PASS="$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | head -c 12)"
read -r -p "Admin Sifresi [${DEFAULT_PASS}]: " INPUT_PASS
ADMIN_PASS="${INPUT_PASS:-$DEFAULT_PASS}"

JWT_SECRET="$(openssl rand -hex 32)"
HOST_DATA_DIR="${SCRIPT_DIR}/data"
mkdir -p "$HOST_DATA_DIR"

# 3. .env olustur
cat > "${SCRIPT_DIR}/.env" <<EOF
PANEL_PORT=${PANEL_PORT}
VDS_PUBLIC_IP=${VDS_IP}
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PASS}
JWT_SECRET=${JWT_SECRET}
HOST_PROJECT_DIR=${SCRIPT_DIR}
HOST_DATA_DIR=${HOST_DATA_DIR}
ASSETTOSERVER_IMAGE=compujuckel/assettoserver:latest
VANILLA_AC_IMAGE=ac-panel-vanilla:latest
TZ=Europe/Istanbul
EOF

echo "[+] .env dosyasi olusturuldu (HOST_DATA_DIR=${HOST_DATA_DIR})"

# 4. UFW aktifse panel portunu ac
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  echo "[*] UFW uzerinde ${PANEL_PORT}/tcp portu aciliyor..."
  ufw allow "${PANEL_PORT}/tcp" >/dev/null
fi

# 5. AssettoServer imajini cek ve Vanilla acServer imajini derle
echo "[*] AssettoServer Docker imaji cekiliyor (compujuckel/assettoserver:latest)..."
docker pull compujuckel/assettoserver:latest || echo "[!] AssettoServer imaji simdi cekilemedi, panel icinden tekrar deneyebilirsiniz."

echo "[*] Vanilla Kunos acServer lokal Docker imaji derleniyor..."
docker compose --profile build-vanilla build vanilla-ac-builder

# 6. Paneli derle ve baslat
echo "[*] AC Panel derleniyor ve baslatiliyor..."
docker compose up -d --build

echo ""
echo "============================================================"
echo "  KURULUM TAMAMLANDI!"
echo "============================================================"
echo "  Panel Adresi   : http://${VDS_IP}:${PANEL_PORT}"
echo "  Kullanici Adi  : ${ADMIN_USER}"
echo "  Sifre          : ${ADMIN_PASS}"
echo ""
echo "  Notlar:"
echo "  - Panelden yeni sunucu olusturdugunuzda sectiginiz UDP/TCP/HTTP"
echo "    portlarini VDS guvenlik duvarinda (ufw) acmayi unutmayin."
echo "  - Vanilla acServer kullanmak icin Panel -> Ayarlar -> Motorlar"
echo "    bolumunden acServer Linux dosyasini yukleyebilir veya"
echo "    'sudo bash scripts/fetch-acserver.sh' komutunu calistirabilirsiniz."
echo "============================================================"
