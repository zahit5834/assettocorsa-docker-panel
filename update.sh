#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TMP_DIR="${SCRIPT_DIR}/data/tmp"
mkdir -p "$TMP_DIR"
STATUS_FILE="${TMP_DIR}/update-status.json"
LOG_FILE="${TMP_DIR}/update.log"

FROM_PANEL=0
if [ "${1:-}" = "--from-panel" ]; then
  FROM_PANEL=1
fi

STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
FROM_COMMIT=""
TO_COMMIT=""

log() {
  local msg="[$(date +"%H:%M:%S")] $1"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

write_status() {
  local state="$1"
  local step="$2"
  local err="${3:-}"
  local finished="${4:-}"
  cat > "$STATUS_FILE" <<EOF
{
  "state": "${state}",
  "step": "${step}",
  "error": "${err}",
  "startedAt": "${STARTED_AT}",
  "finishedAt": "${finished}",
  "fromCommit": "${FROM_COMMIT}",
  "toCommit": "${TO_COMMIT}"
}
EOF
}

on_error() {
  local line="$1"
  local msg="Guncelleme hatasi (satir ${line}). Detay icin loglari kontrol edin."
  log "HATA: ${msg}"
  write_status "error" "Guncelleme basarisiz oldu" "$msg" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  exit 1
}
trap 'on_error $LINENO' ERR

: > "$LOG_FILE"
log "=== AC Panel Guncelleme Baslatildi ==="

if [ ! -d "${SCRIPT_DIR}/.git" ]; then
  log "HATA: Bu klasor bir Git deposu degil (.git bulunamadi)."
  write_status "error" "Git deposu bulunamadi" "Proje GitHub'dan git clone ile kurulmamis." "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  exit 1
fi

GIT="git -c safe.directory=${SCRIPT_DIR}"
BRANCH="$($GIT rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
FROM_COMMIT="$($GIT rev-parse --short HEAD 2>/dev/null || echo unknown)"
TO_COMMIT="$FROM_COMMIT"

log "Mevcut dal: ${BRANCH} | Mevcut surum: ${FROM_COMMIT}"
write_status "fetching" "GitHub uzerinden guncellemeler kontrol ediliyor..."

$GIT fetch origin "$BRANCH" >> "$LOG_FILE" 2>&1

write_status "pulling" "Yeni kodlar indiriliyor..."
log "Kodlar guncelleniyor (origin/${BRANCH})..."

# .env ve data/ .gitignore icinde oldugu icin korunur.
if ! $GIT pull --ff-only origin "$BRANCH" >> "$LOG_FILE" 2>&1; then
  log "Fast-forward yapilamadi, temiz esitleme uygulanıyor (git reset --hard origin/${BRANCH})..."
  $GIT reset --hard "origin/${BRANCH}" >> "$LOG_FILE" 2>&1
fi

TO_COMMIT="$($GIT rev-parse --short HEAD 2>/dev/null || echo unknown)"
log "Yeni surum: ${TO_COMMIT}"

# .env icinde HOST_PROJECT_DIR eksikse otomatik ekle (eski kurulumlardan gecis icin)
if [ -f "${SCRIPT_DIR}/.env" ] && ! grep -q "^HOST_PROJECT_DIR=" "${SCRIPT_DIR}/.env"; then
  echo "HOST_PROJECT_DIR=${SCRIPT_DIR}" >> "${SCRIPT_DIR}/.env"
  log ".env dosyasina HOST_PROJECT_DIR=${SCRIPT_DIR} eklendi."
fi

write_status "building" "Docker imajlari derleniyor ve panel yeniden baslatiliyor..."
log "Docker Compose derleniyor ve yeniden baslatiliyor (calisan AC sunuculari etkilenmez)..."

docker compose --project-directory "$SCRIPT_DIR" -f "${SCRIPT_DIR}/docker-compose.yml" up -d --build --remove-orphans >> "$LOG_FILE" 2>&1

# Vanilla acServer Dockerfile guncellendiyse imaji da tazele
if [ -f "${SCRIPT_DIR}/images/vanilla-ac/Dockerfile" ]; then
  docker compose --project-directory "$SCRIPT_DIR" -f "${SCRIPT_DIR}/docker-compose.yml" --profile build-vanilla build vanilla-ac-builder >> "$LOG_FILE" 2>&1 || true
fi

FINISHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
log "=== Guncelleme Tamamlandi (${FROM_COMMIT} -> ${TO_COMMIT}) ==="
write_status "completed" "Guncelleme basariyla tamamlandi (${FROM_COMMIT} -> ${TO_COMMIT})" "" "$FINISHED_AT"
