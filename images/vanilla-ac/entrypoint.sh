#!/bin/sh
set -e

ENGINE_BIN="/engine/acServer"
RUNTIME_BIN="/tmp/acServer"

if [ ! -f "$ENGINE_BIN" ]; then
  echo "[AC-PANEL] HATA: Vanilla acServer binary bulunamadi (/engine/acServer)." >&2
  echo "[AC-PANEL] Lutfen Panel -> Ayarlar -> Motorlar bolumunden acServer Linux dosyasini yukleyin" >&2
  echo "[AC-PANEL] veya VDS uzerinde ./scripts/fetch-acserver.sh betigini calistirin." >&2
  exit 1
fi

cp "$ENGINE_BIN" "$RUNTIME_BIN"
chmod +x "$RUNTIME_BIN"

mkdir -p /data/logs /data/results
cd /data

echo "[AC-PANEL] Vanilla Kunos acServer baslatiliyor..."
exec "$RUNTIME_BIN"
