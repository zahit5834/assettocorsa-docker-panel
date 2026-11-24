import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import archiver from 'archiver';
import { getDataPaths } from './config.js';

const execFileAsync = promisify(execFile);

export interface CarCompatibilityWarning {
  code: 'server_locked' | 'csp_script' | 'missing_data_acd' | 'missing_collider';
  severity: 'error' | 'warning';
  message: string;
}

export interface DetectedCar {
  id: string;
  sourceDir: string;
  name: string;
  brand: string;
  carClass: string;
  specs: Record<string, unknown>;
  skins: string[];
  previewFile: string | null;
  isKunos: boolean;
  isTraffic: boolean;
  warnings: CarCompatibilityWarning[];
}

export interface DetectedTrack {
  id: string;
  sourceDir: string;
  name: string;
  country: string;
  city: string;
  length: string;
  pitboxes: number;
  layouts: string[];
  hasAiSpline: boolean;
  previewFile: string | null;
  isKunos: boolean;
}

export interface ScanResult {
  cars: DetectedCar[];
  tracks: DetectedTrack[];
  extraCfgYml: string;
  cspExtraOptions: string;
}

export function isPathInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function sanitizeFolderId(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 96);
}

/**
 * Strips BOM, trailing commas, and unescaped control characters often found in AC mod JSON files.
 */
export function parseRelaxedJson<T = Record<string, unknown>>(filePath: string): T | null {
  try {
    let raw = fs.readFileSync(filePath, 'utf8');
    raw = raw.replace(/^\uFEFF/, '').trim();
    // Remove trailing commas before } or ]
    raw = raw.replace(/,\s*([}\]])/g, '$1');
    // Replace raw newlines inside string literals safely if parse fails
    try {
      return JSON.parse(raw) as T;
    } catch {
      const cleaned = raw.replace(/[\u0000-\u001F]+/g, ' ');
      return JSON.parse(cleaned) as T;
    }
  } catch {
    return null;
  }
}

export async function extractArchiveSafely(archivePath: string, destDir: string): Promise<void> {
  fs.mkdirSync(destDir, { recursive: true });
  const lower = archivePath.toLowerCase();

  if (lower.endsWith('.zip')) {
    try {
      await execFileAsync('unzip', ['-o', '-q', archivePath, '-d', destDir], {
        maxBuffer: 1024 * 1024 * 32,
      });
    } catch {
      await execFileAsync('7z', ['x', '-y', `-o${destDir}`, archivePath], {
        maxBuffer: 1024 * 1024 * 32,
      });
    }
  } else if (lower.endsWith('.7z') || lower.endsWith('.rar')) {
    try {
      await execFileAsync('7z', ['x', '-y', `-o${destDir}`, archivePath], {
        maxBuffer: 1024 * 1024 * 32,
      });
    } catch {
      await execFileAsync('bsdtar', ['-xf', archivePath, '-C', destDir], {
        maxBuffer: 1024 * 1024 * 32,
      });
    }
  } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar')) {
    await execFileAsync('tar', ['-xf', archivePath, '-C', destDir], {
      maxBuffer: 1024 * 1024 * 32,
    });
  } else {
    // Fallback auto-detect with 7z / bsdtar
    try {
      await execFileAsync('7z', ['x', '-y', `-o${destDir}`, archivePath], {
        maxBuffer: 1024 * 1024 * 32,
      });
    } catch {
      await execFileAsync('bsdtar', ['-xf', archivePath, '-C', destDir], {
        maxBuffer: 1024 * 1024 * 32,
      });
    }
  }

  // Zip-Slip & symlink escape verification
  validateExtractedTree(destDir, destDir);
}

export function validateExtractedTree(rootDir: string, currentDir: string): void {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (!isPathInside(rootDir, fullPath)) {
      throw new Error(`Güvenlik hatası: Arşiv hedef dizin dışına çıkıyor (${entry.name}).`);
    }
    if (entry.isSymbolicLink()) {
      const target = fs.realpathSync(fullPath);
      if (!isPathInside(rootDir, target)) {
        fs.unlinkSync(fullPath);
        throw new Error(`Güvenlik hatası: Arşiv içinde dışarıyı gösteren sembolik bağlantı tespit edildi (${entry.name}).`);
      }
    } else if (entry.isDirectory()) {
      validateExtractedTree(rootDir, fullPath);
    }
  }
}

function isCarDirectory(dir: string): boolean {
  if (fs.existsSync(path.join(dir, 'ui', 'ui_car.json'))) return true;
  if (fs.existsSync(path.join(dir, 'data.acd'))) return true;
  if (fs.existsSync(path.join(dir, 'data', 'car.ini'))) return true;
  return false;
}

function findTrackLayouts(dir: string): { layouts: string[]; primaryUiJson: string | null } {
  const uiDir = path.join(dir, 'ui');
  if (!fs.existsSync(uiDir) || !fs.statSync(uiDir).isDirectory()) {
    return { layouts: [], primaryUiJson: null };
  }

  const rootUi = path.join(uiDir, 'ui_track.json');
  if (fs.existsSync(rootUi)) {
    return { layouts: [], primaryUiJson: rootUi };
  }

  const layouts: string[] = [];
  let primaryUiJson: string | null = null;
  for (const entry of fs.readdirSync(uiDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const layoutUi = path.join(uiDir, entry.name, 'ui_track.json');
      if (fs.existsSync(layoutUi)) {
        layouts.push(entry.name);
        if (!primaryUiJson) primaryUiJson = layoutUi;
      }
    }
  }

  return { layouts: layouts.sort(), primaryUiJson };
}

function isTrackDirectory(dir: string): boolean {
  const { primaryUiJson } = findTrackLayouts(dir);
  if (primaryUiJson) return true;
  if (fs.existsSync(path.join(dir, 'data', 'surfaces.ini'))) return true;
  if (fs.existsSync(path.join(dir, 'models.ini'))) return true;
  // Multi-layout track without ui/ui_track.json
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'data', 'surfaces.ini'))) {
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

function detectTrackAiSpline(dir: string, layouts: string[]): boolean {
  const candidates = [
    path.join(dir, 'ai', 'fast_lane.ai'),
    path.join(dir, 'ai', 'fast_lane.aip'),
    path.join(dir, 'ai', 'traffic.json'),
  ];
  for (const layout of layouts) {
    candidates.push(
      path.join(dir, layout, 'ai', 'fast_lane.ai'),
      path.join(dir, layout, 'ai', 'fast_lane.aip'),
      path.join(dir, layout, 'ai', 'traffic.json')
    );
  }
  return candidates.some((c) => fs.existsSync(c));
}

export function detectTrafficCar(
  folderId: string,
  uiJson?: {
    name?: string;
    brand?: string;
    class?: string;
    description?: string;
    tags?: string[];
  } | null
): boolean {
  const tokenRegex = /(?:^|[^a-z0-9])(traffic|npc|ai)(?:$|[^a-z0-9])/i;
  const trafficSubstrRegex = /traffic/i;

  const candidates: string[] = [
    folderId || '',
    uiJson?.name || '',
    uiJson?.brand || '',
    uiJson?.class || '',
    uiJson?.description || '',
    ...(Array.isArray(uiJson?.tags) ? uiJson.tags.map(String) : []),
  ];

  return candidates.some((val) => trafficSubstrRegex.test(val) || tokenRegex.test(val));
}

/**
 * Read-only compatibility pre-check for uploaded car mods.
 * Flags missing server files (data.acd, collider.kn5) and potential third-party
 * server-only restrictions / CSP extension scripts so admins are warned before
 * deploying a car to players. Never modifies mod files.
 */
export function checkCarCompatibility(
  carDir: string,
  uiJson?: {
    name?: string;
    description?: string;
    author?: string;
    tags?: string[];
  } | null
): CarCompatibilityWarning[] {
  const warnings: CarCompatibilityWarning[] = [];

  // 1. Check essential server-side files
  const hasDataAcd = fs.existsSync(path.join(carDir, 'data.acd'));
  const hasDataDir = fs.existsSync(path.join(carDir, 'data', 'car.ini'));
  if (!hasDataAcd && !hasDataDir) {
    warnings.push({
      code: 'missing_data_acd',
      severity: 'error',
      message: 'data.acd veya data/car.ini bulunamadı — sunucuda çalışmayabilir.',
    });
  } else if (!hasDataAcd) {
    warnings.push({
      code: 'missing_data_acd',
      severity: 'warning',
      message: 'data.acd eksik (açık data/ klasörü var) — Vanilla acServer checksum uyumsuzluğu olabilir.',
    });
  }

  if (!fs.existsSync(path.join(carDir, 'collider.kn5'))) {
    warnings.push({
      code: 'missing_collider',
      severity: 'warning',
      message: 'collider.kn5 eksik — çarpışma veya checksum sorunu oluşabilir.',
    });
  }

  // 2. Read-only scan of plain-text metadata & extension config/scripts for server-lock indicators
  const serverLockTextRegex =
    /(only\s+works?\s+on\s+.*servers?|yaln[ıi]zca\s+.*sunucular[ıi]nda|sadece\s+.*sunucular[ıi]nda|exclusive\s+to\s+.*server|server[\s_-]?locked|getServerIP|sim\.serverIP|ac\.getServerIP|serverName\s*[=~]=)/i;

  let serverLockDetected = false;
  let hasCspLuaScript = false;

  const metaBlob = [
    uiJson?.name || '',
    uiJson?.description || '',
    uiJson?.author || '',
    ...(Array.isArray(uiJson?.tags) ? uiJson.tags.map(String) : []),
  ].join('\n');

  if (serverLockTextRegex.test(metaBlob)) {
    serverLockDetected = true;
  }

  const extDir = path.join(carDir, 'extension');
  if (fs.existsSync(extDir) && fs.statSync(extDir).isDirectory()) {
    const scanExt = (dir: string, depth: number) => {
      if (depth > 3) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanExt(full, depth + 1);
          continue;
        }
        const lower = entry.name.toLowerCase();
        if (lower.endsWith('.lua')) {
          hasCspLuaScript = true;
        }
        if (lower.endsWith('.ini') || lower.endsWith('.lua') || lower.endsWith('.txt')) {
          try {
            const stat = fs.statSync(full);
            if (stat.size <= 512 * 1024) {
              const text = fs.readFileSync(full, 'utf8');
              if (serverLockTextRegex.test(text)) {
                serverLockDetected = true;
              }
              if (lower.endsWith('.ini') && /^\s*\[SCRIPT_/im.test(text)) {
                hasCspLuaScript = true;
              }
            }
          } catch {
            // ignore unreadable files
          }
        }
      }
    };
    scanExt(extDir, 0);
  }

  if (serverLockDetected) {
    warnings.push({
      code: 'server_locked',
      severity: 'error',
      message:
        'Bu araç belirli bir topluluğun resmi sunucularına özel kilitli olabilir — kendi sunucunuzda çalışmayabilir.',
    });
  } else if (hasCspLuaScript) {
    warnings.push({
      code: 'csp_script',
      severity: 'warning',
      message:
        'Özel CSP extension scripti içeriyor — üçüncü parti sunucu kısıtlaması olabilir, eklemeden önce test edin.',
    });
  }

  return warnings;
}

function inspectCarDirectory(dir: string, folderName: string): DetectedCar {
  const id = sanitizeFolderId(folderName);
  const uiJson = parseRelaxedJson<{
    name?: string;
    brand?: string;
    class?: string;
    description?: string;
    author?: string;
    tags?: string[];
    specs?: Record<string, unknown>;
  }>(path.join(dir, 'ui', 'ui_car.json'));

  const skinsDir = path.join(dir, 'skins');
  const skins: string[] = [];
  let previewFile: string | null = null;

  if (fs.existsSync(skinsDir) && fs.statSync(skinsDir).isDirectory()) {
    for (const e of fs.readdirSync(skinsDir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        skins.push(e.name);
        if (!previewFile) {
          const pJpg = path.join(skinsDir, e.name, 'preview.jpg');
          const pPng = path.join(skinsDir, e.name, 'preview.png');
          if (fs.existsSync(pJpg)) previewFile = pJpg;
          else if (fs.existsSync(pPng)) previewFile = pPng;
        }
      }
    }
  }
  if (!previewFile) {
    const badge = path.join(dir, 'ui', 'badge.png');
    if (fs.existsSync(badge)) previewFile = badge;
  }

  return {
    id,
    sourceDir: dir,
    name: uiJson?.name?.trim() || id,
    brand: uiJson?.brand?.trim() || '',
    carClass: uiJson?.class?.trim() || 'street',
    specs: uiJson?.specs || {},
    skins: skins.sort(),
    previewFile,
    isKunos: id.toLowerCase().startsWith('ks_'),
    isTraffic: detectTrafficCar(id, uiJson),
    warnings: checkCarCompatibility(dir, uiJson),
  };
}

function inspectTrackDirectory(dir: string, folderName: string): DetectedTrack {
  const id = sanitizeFolderId(folderName);
  const { layouts, primaryUiJson } = findTrackLayouts(dir);
  const uiJson = primaryUiJson
    ? parseRelaxedJson<{
        name?: string;
        country?: string;
        city?: string;
        length?: string | number;
        pitboxes?: string | number;
      }>(primaryUiJson)
    : null;

  let previewFile: string | null = null;
  const previewCandidates = [
    path.join(dir, 'ui', 'preview.png'),
    path.join(dir, 'ui', 'preview.jpg'),
    ...(layouts[0]
      ? [
          path.join(dir, 'ui', layouts[0], 'preview.png'),
          path.join(dir, 'ui', layouts[0], 'preview.jpg'),
        ]
      : []),
  ];
  for (const c of previewCandidates) {
    if (fs.existsSync(c)) {
      previewFile = c;
      break;
    }
  }

  const parsedPitboxes = Number(uiJson?.pitboxes);
  return {
    id,
    sourceDir: dir,
    name: uiJson?.name?.trim() || id,
    country: uiJson?.country?.trim() || '',
    city: uiJson?.city?.trim() || '',
    length: uiJson?.length != null ? String(uiJson.length) : '',
    pitboxes: Number.isFinite(parsedPitboxes) && parsedPitboxes > 0 ? parsedPitboxes : 24,
    layouts,
    hasAiSpline: detectTrackAiSpline(dir, layouts),
    previewFile,
    isKunos: id.toLowerCase().startsWith('ks_'),
  };
}

/**
 * Recursively scans an extracted archive folder to discover all AC cars, tracks,
 * and optional AssettoServer/CSP config templates (extra_cfg.yml, csp_extra_options.ini).
 */
export function scanExtractedDirectory(rootDir: string, hintType?: 'car' | 'track' | 'pack'): ScanResult {
  const carsMap = new Map<string, DetectedCar>();
  const tracksMap = new Map<string, DetectedTrack>();
  let extraCfgYml = '';
  let cspExtraOptions = '';

  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    const baseName = path.basename(dir);

    // Check optional pack config files
    const maybeExtra = path.join(dir, 'extra_cfg.yml');
    if (!extraCfgYml && fs.existsSync(maybeExtra) && fs.statSync(maybeExtra).isFile()) {
      extraCfgYml = fs.readFileSync(maybeExtra, 'utf8');
    }
    const maybeCsp = path.join(dir, 'csp_extra_options.ini');
    if (!cspExtraOptions && fs.existsSync(maybeCsp) && fs.statSync(maybeCsp).isFile()) {
      cspExtraOptions = fs.readFileSync(maybeCsp, 'utf8');
    }

    if (depth > 0) {
      const parentName = path.basename(path.dirname(dir)).toLowerCase();
      const carLike = isCarDirectory(dir);
      const trackLike = isTrackDirectory(dir);

      if (carLike && (!trackLike || parentName === 'cars' || hintType === 'car')) {
        const car = inspectCarDirectory(dir, baseName);
        if (car.id) carsMap.set(car.id, car);
        return;
      }
      if (trackLike && (!carLike || parentName === 'tracks' || hintType === 'track')) {
        const track = inspectTrackDirectory(dir, baseName);
        if (track.id) tracksMap.set(track.id, track);
        return;
      }
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '__MACOSX' || entry.name.startsWith('.')) continue;
      walk(path.join(dir, entry.name), depth + 1);
    }
  };

  walk(rootDir, 0);

  return {
    cars: Array.from(carsMap.values()),
    tracks: Array.from(tracksMap.values()),
    extraCfgYml,
    cspExtraOptions,
  };
}

export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Packages a car or track folder into a Content Manager drag-and-drop compatible .zip
 * (with internal root content/cars/<id>/... or content/tracks/<id>/...).
 */
export async function createCmArchive(params: {
  type: 'car' | 'track';
  id: string;
  sourceDir: string;
  outZipPath: string;
}): Promise<{ size: number; sha256: string }> {
  const { type, id, sourceDir, outZipPath } = params;
  fs.mkdirSync(path.dirname(outZipPath), { recursive: true });
  const tempOut = `${outZipPath}.tmp`;

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(tempOut);
    const archive = archiver('zip', { zlib: { level: 5 } });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    const prefix = type === 'car' ? `content/cars/${id}` : `content/tracks/${id}`;
    archive.directory(sourceDir, prefix);
    archive.finalize();
  });

  fs.renameSync(tempOut, outZipPath);
  const stat = fs.statSync(outZipPath);
  const sha256 = await computeFileSha256(outZipPath);
  return { size: stat.size, sha256 };
}

/**
 * Builds a single CM-ready bundle .zip containing multiple tracks & cars plus an install guide.
 */
export async function createMultiContentBundleZip(params: {
  outZipPath: string;
  carIds: string[];
  trackIds: string[];
  title: string;
  joinUrl?: string;
  dataDir?: string;
}): Promise<{ size: number; sha256: string; includedCars: string[]; includedTracks: string[] }> {
  const paths = getDataPaths(params.dataDir);
  fs.mkdirSync(path.dirname(params.outZipPath), { recursive: true });
  const tempOut = `${params.outZipPath}.tmp`;

  const includedCars: string[] = [];
  const includedTracks: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(tempOut);
    const archive = archiver('zip', { zlib: { level: 4 } });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);

    for (const trackId of params.trackIds) {
      const dir = path.join(paths.tracksDir, trackId);
      if (fs.existsSync(dir)) {
        archive.directory(dir, `content/tracks/${trackId}`);
        includedTracks.push(trackId);
      }
    }

    for (const carId of params.carIds) {
      const dir = path.join(paths.carsDir, carId);
      if (fs.existsSync(dir)) {
        archive.directory(dir, `content/cars/${carId}`);
        includedCars.push(carId);
      }
    }

    const readme = [
      `=== ${params.title} — Assetto Corsa Mod Paketi ===`,
      '',
      'KURULUM (Content Manager ile):',
      '1. Bu .zip dosyasini dogrudan Content Manager penceresine surukleyip birakin.',
      '2. Sag ustte cikan yesil "Install" butonuna tiklayin.',
      '3. Kurulum bitince sunucuya dogrudan baglanabilirsiniz!',
      '',
      params.joinUrl ? `Sunucu Davet Sayfasi: ${params.joinUrl}` : '',
      `Dahil Haritalar (${includedTracks.length}): ${includedTracks.join(', ') || '-'}`,
      `Dahil Arabalar (${includedCars.length}): ${includedCars.join(', ') || '-'}`,
      '',
    ].join('\n');

    archive.append(readme, { name: 'KURULUM-OKU.txt' });
    archive.finalize();
  });

  fs.renameSync(tempOut, params.outZipPath);
  const stat = fs.statSync(params.outZipPath);
  const sha256 = await computeFileSha256(params.outZipPath);
  return { size: stat.size, sha256, includedCars, includedTracks };
}

export function copyDirectoryClean(src: string, dest: string): void {
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}
