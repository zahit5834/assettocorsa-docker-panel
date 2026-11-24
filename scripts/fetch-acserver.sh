#!/usr/bin/env bash
set -euo pipefail

# Resmi Kunos Assetto Corsa Dedicated Server (App ID: 302550) Linux acServer dosyasini
# SteamCMD Docker konteyneri ile indirip ./data/engines/acServer konumuna kopyalar.
# Not: Steam, App 302550 icin Assetto Corsa'ya sahip bir Steam hesabi gerektirir.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINES_DIR="${SCRIPT_DIR}/data/engines"
TMP_STEAM_DIR="${SCRIPT_DIR}/data/tmp/steamcmd-ac"

mkdir -p "$ENGINES_DIR" "$TMP_STEAM_DIR"

echo "============================================================"
echo "  Vanilla Kunos acServer (SteamCMD) Indirme Yardimcisi"
echo "============================================================"
read -r -p "Steam Kullanici Adiniz: " STEAM_USER

if [ -z "$STEAM_USER" ]; then
  echo "[!] Steam kullanici adi bos olamaz."
  exit 1
fi

echo "[*] SteamCMD konteyneri baslatiliyor (Sifre ve Steam Guard kodu sorulacaktir)..."
docker run --rm -it \
  -v "${TMP_STEAM_DIR}:/ac-download" \
  steamcmd/steamcmd:ubuntu-22 \
  +@sSteamCmdForcePlatformType windows \
  +force_install_dir /ac-download \
  +login "$STEAM_USER" \
  +app_update 302550 validate \
  +quit

if [ -f "${TMP_STEAM_DIR}/acServer" ]; then
  cp "${TMP_STEAM_DIR}/acServer" "${ENGINES_DIR}/acServer"
  chmod +x "${ENGINES_DIR}/acServer"
  rm -rf "$TMP_STEAM_DIR"
  echo "[+] Basarili! Vanilla acServer dosyasi hazir: ${ENGINES_DIR}/acServer"
else
  echo "[!] Hata: Indirilen dizinde acServer dosyasi bulunamadi."
  exit 1
fi
