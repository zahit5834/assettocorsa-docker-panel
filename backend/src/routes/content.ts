import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { getDataPaths } from '../config.js';
import { slugify } from '../configGenerator.js';
import {
  copyDirectoryClean,
  createCmArchive,
  createMultiContentBundleZip,
  extractArchiveSafely,
  scanExtractedDirectory,
} from '../contentScanner.js';
import { getDb, type CarRecord, type TrackRecord } from '../db.js';

async function importArchiveIntoLibrary(params: {
  archivePath: string;
  hintType?: 'car' | 'track' | 'pack';
  markKunos?: boolean;
  markTraffic?: boolean;
  version?: string;
  createPackName?: string;
  packDescription?: string;
  packCategory?: string;
}) {
  const paths = getDataPaths();
  const db = getDb();
  const workDir = path.join(paths.tmpDir, `extract-${crypto.randomUUID()}`);

  try {
    await extractArchiveSafely(params.archivePath, workDir);
    const scanned = scanExtractedDirectory(workDir, params.hintType);

    if (scanned.cars.length === 0 && scanned.tracks.length === 0) {
      throw new Error(
        'Arşiv içinde geçerli bir Assetto Corsa arabası veya haritası bulunamadı. (ui_car.json / data.acd / ui_track.json / surfaces.ini arandı)'
      );
    }

    const importedCars: string[] = [];
    const importedTracks: string[] = [];

    for (const car of scanned.cars) {
      const targetDir = path.join(paths.carsDir, car.id);
      copyDirectoryClean(car.sourceDir, targetDir);

      let hasPreview = 0;
      if (car.previewFile && fs.existsSync(car.previewFile)) {
        const previewOut = path.join(targetDir, '.ac-panel-preview.jpg');
        fs.copyFileSync(car.previewFile, previewOut);
        hasPreview = 1;
      }

      const zipRelPath = `downloads/cars/${car.id}.zip`;
      const zipAbsPath = path.join(paths.root, zipRelPath);
      const { size, sha256 } = await createCmArchive({
        type: 'car',
        id: car.id,
        sourceDir: targetDir,
        outZipPath: zipAbsPath,
      });

      const isKunos = params.markKunos ? 1 : car.isKunos ? 1 : 0;
      const isTraffic =
        params.markTraffic || params.packCategory === 'traffic' || car.isTraffic ? 1 : 0;
      const version = params.version?.trim() || sha256.slice(0, 8);

      db.prepare(
        `INSERT INTO cars (id, name, brand, car_class, specs_json, skins_json, is_kunos, is_traffic, version, sha256, download_path, download_size, has_preview)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           brand = excluded.brand,
           car_class = excluded.car_class,
           specs_json = excluded.specs_json,
           skins_json = excluded.skins_json,
           is_kunos = excluded.is_kunos,
           is_traffic = excluded.is_traffic,
           version = excluded.version,
           sha256 = excluded.sha256,
           download_path = excluded.download_path,
           download_size = excluded.download_size,
           has_preview = excluded.has_preview`
      ).run(
        car.id,
        car.name,
        car.brand,
        car.carClass,
        JSON.stringify(car.specs),
        JSON.stringify(car.skins),
        isKunos,
        isTraffic,
        version,
        sha256,
        zipRelPath,
        size,
        hasPreview
      );

      importedCars.push(car.id);
    }

    for (const track of scanned.tracks) {
      const targetDir = path.join(paths.tracksDir, track.id);
      copyDirectoryClean(track.sourceDir, targetDir);

      let hasPreview = 0;
      if (track.previewFile && fs.existsSync(track.previewFile)) {
        const previewOut = path.join(targetDir, '.ac-panel-preview.png');
        fs.copyFileSync(track.previewFile, previewOut);
        hasPreview = 1;
      }

      const zipRelPath = `downloads/tracks/${track.id}.zip`;
      const zipAbsPath = path.join(paths.root, zipRelPath);
      const { size, sha256 } = await createCmArchive({
        type: 'track',
        id: track.id,
        sourceDir: targetDir,
        outZipPath: zipAbsPath,
      });

      const isKunos = params.markKunos ? 1 : track.isKunos ? 1 : 0;
      const version = params.version?.trim() || sha256.slice(0, 8);

      db.prepare(
        `INSERT INTO tracks (id, name, country, city, length, pitboxes, layouts_json, has_ai_spline, is_kunos, version, sha256, download_path, download_size, has_preview)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           country = excluded.country,
           city = excluded.city,
           length = excluded.length,
           pitboxes = excluded.pitboxes,
           layouts_json = excluded.layouts_json,
           has_ai_spline = excluded.has_ai_spline,
           is_kunos = excluded.is_kunos,
           version = excluded.version,
           sha256 = excluded.sha256,
           download_path = excluded.download_path,
           download_size = excluded.download_size,
           has_preview = excluded.has_preview`
      ).run(
        track.id,
        track.name,
        track.country,
        track.city,
        track.length,
        track.pitboxes,
        JSON.stringify(track.layouts),
        track.hasAiSpline ? 1 : 0,
        isKunos,
        version,
        sha256,
        zipRelPath,
        size,
        hasPreview
      );

      importedTracks.push(track.id);
    }

    // Invalidate cached server bundles so next download reflects updated files
    db.prepare('UPDATE servers SET bundle_sha256 = ?, bundle_size = 0').run('');

    let createdPackId: string | null = null;
    if (params.createPackName && params.createPackName.trim().length > 0) {
      const packId = crypto.randomUUID();
      const baseSlug = slugify(params.createPackName);
      const exists = db.prepare('SELECT id FROM packs WHERE slug = ?').get(baseSlug);
      const slug = exists ? `${baseSlug}-${packId.slice(0, 5)}` : baseSlug;
      const packZipRel = `downloads/packs/${slug}.zip`;
      const packZipAbs = path.join(paths.root, packZipRel);

      const { size, sha256 } = await createMultiContentBundleZip({
        outZipPath: packZipAbs,
        carIds: importedCars,
        trackIds: importedTracks,
        title: params.createPackName.trim(),
      });

      const category =
        params.packCategory ||
        (params.markTraffic
          ? 'traffic'
          : importedCars.length > 0 && importedTracks.length > 0
            ? 'mixed'
            : importedTracks.length > 0
              ? 'tracks'
              : 'cars');

      db.prepare(
        `INSERT INTO packs (id, slug, name, description, category, car_ids_json, track_ids_json, extra_cfg_yml, csp_extra_options, version, sha256, download_path, download_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        packId,
        slug,
        params.createPackName.trim(),
        params.packDescription?.trim() || '',
        category,
        JSON.stringify(importedCars),
        JSON.stringify(importedTracks),
        scanned.extraCfgYml,
        scanned.cspExtraOptions,
        params.version?.trim() || sha256.slice(0, 8),
        sha256,
        packZipRel,
        size
      );
      createdPackId = packId;
    }

    return {
      importedCars,
      importedTracks,
      createdPackId,
      hasExtraCfg: Boolean(scanned.extraCfgYml),
      hasCspExtra: Boolean(scanned.cspExtraOptions),
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

export async function contentRoutes(app: FastifyInstance) {
  app.get('/api/content/cars', { preHandler: [requireAuth] }, async () => {
    const db = getDb();
    const cars = db.prepare('SELECT * FROM cars ORDER BY created_at DESC').all() as unknown as CarRecord[];
    return {
      cars: cars.map((c) => ({
        ...c,
        specs: JSON.parse(c.specs_json || '{}'),
        skins: JSON.parse(c.skins_json || '[]'),
        is_kunos: Boolean(c.is_kunos),
        is_traffic: Boolean(c.is_traffic),
        has_preview: Boolean(c.has_preview),
      })),
    };
  });

  app.get('/api/content/tracks', { preHandler: [requireAuth] }, async () => {
    const db = getDb();
    const tracks = db.prepare('SELECT * FROM tracks ORDER BY created_at DESC').all() as unknown as TrackRecord[];
    return {
      tracks: tracks.map((t) => ({
        ...t,
        layouts: JSON.parse(t.layouts_json || '[]'),
        has_ai_spline: Boolean(t.has_ai_spline),
        is_kunos: Boolean(t.is_kunos),
        has_preview: Boolean(t.has_preview),
      })),
    };
  });

  app.post('/api/content/upload', { preHandler: [requireAuth] }, async (request, reply) => {
    const paths = getDataPaths();
    const parts = request.parts();

    let savedArchivePath = '';
    let hintType: 'car' | 'track' | 'pack' | undefined;
    let markKunos = false;
    let markTraffic = false;
    let version = '';
    let createPackName = '';
    let packDescription = '';
    let packCategory = '';

    try {
      for await (const part of parts) {
        if (part.type === 'file') {
          const ext = path.extname(part.filename || '.zip').toLowerCase() || '.zip';
          const tmpFile = path.join(paths.tmpDir, `upload-${crypto.randomUUID()}${ext}`);
          await pipeline(part.file, fs.createWriteStream(tmpFile));
          savedArchivePath = tmpFile;
        } else {
          const val = String(part.value || '');
          if (part.fieldname === 'type' && (val === 'car' || val === 'track' || val === 'pack')) {
            hintType = val;
          } else if (part.fieldname === 'is_kunos') {
            markKunos = val === 'true' || val === '1';
          } else if (part.fieldname === 'is_traffic') {
            markTraffic = val === 'true' || val === '1';
          } else if (part.fieldname === 'version') {
            version = val;
          } else if (part.fieldname === 'pack_name') {
            createPackName = val;
          } else if (part.fieldname === 'pack_description') {
            packDescription = val;
          } else if (part.fieldname === 'pack_category') {
            packCategory = val;
          }
        }
      }

      if (!savedArchivePath) {
        return reply.code(400).send({ error: 'Yüklenecek arşiv dosyası bulunamadı.' });
      }

      const result = await importArchiveIntoLibrary({
        archivePath: savedArchivePath,
        hintType,
        markKunos,
        markTraffic,
        version,
        createPackName,
        packDescription,
        packCategory,
      });

      return {
        success: true,
        ...result,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Yükleme sırasında hata oluştu.';
      return reply.code(400).send({ error: msg });
    } finally {
      if (savedArchivePath && fs.existsSync(savedArchivePath)) {
        fs.rmSync(savedArchivePath, { force: true });
      }
    }
  });

  app.post('/api/content/import-url', { preHandler: [requireAuth] }, async (request, reply) => {
    const schema = z.object({
      url: z.string().url('Geçerli bir indirme bağlantısı (URL) girin.'),
      type: z.enum(['car', 'track', 'pack']).optional(),
      is_kunos: z.boolean().optional(),
      is_traffic: z.boolean().optional(),
      version: z.string().optional(),
      pack_name: z.string().optional(),
      pack_description: z.string().optional(),
      pack_category: z.string().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Geçersiz istek.' });
    }

    const paths = getDataPaths();
    const urlObj = new URL(parsed.data.url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return reply.code(400).send({ error: 'Sadece HTTP/HTTPS bağlantıları desteklenir.' });
    }

    const ext = path.extname(urlObj.pathname).toLowerCase() || '.zip';
    const tmpFile = path.join(paths.tmpDir, `url-${crypto.randomUUID()}${ext}`);

    try {
      const res = await fetch(parsed.data.url, { redirect: 'follow' });
      if (!res.ok || !res.body) {
        return reply.code(400).send({ error: `Dosya indirilemedi (HTTP ${res.status}).` });
      }
      const ws = fs.createWriteStream(tmpFile);
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        ws.write(Buffer.from(value));
      }
      await new Promise<void>((resolve, reject) => {
        ws.end(() => resolve());
        ws.on('error', reject);
      });

      const result = await importArchiveIntoLibrary({
        archivePath: tmpFile,
        hintType: parsed.data.type,
        markKunos: parsed.data.is_kunos,
        markTraffic: parsed.data.is_traffic,
        version: parsed.data.version,
        createPackName: parsed.data.pack_name,
        packDescription: parsed.data.pack_description,
        packCategory: parsed.data.pack_category,
      });

      return { success: true, ...result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'URL üzerinden içe aktarma başarısız.';
      return reply.code(400).send({ error: msg });
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.rmSync(tmpFile, { force: true });
      }
    }
  });

  app.post('/api/content/rescan', { preHandler: [requireAuth] }, async () => {
    const paths = getDataPaths();
    const db = getDb();

    const scannedCars = scanExtractedDirectory(paths.carsDir, 'car').cars;
    const scannedTracks = scanExtractedDirectory(paths.tracksDir, 'track').tracks;

    let carsCount = 0;
    for (const car of scannedCars) {
      const zipRelPath = `downloads/cars/${car.id}.zip`;
      const zipAbsPath = path.join(paths.root, zipRelPath);
      const { size, sha256 } = await createCmArchive({
        type: 'car',
        id: car.id,
        sourceDir: car.sourceDir,
        outZipPath: zipAbsPath,
      });
      let hasPreview = 0;
      if (car.previewFile && fs.existsSync(car.previewFile)) {
        fs.copyFileSync(car.previewFile, path.join(car.sourceDir, '.ac-panel-preview.jpg'));
        hasPreview = 1;
      }
      db.prepare(
        `INSERT INTO cars (id, name, brand, car_class, specs_json, skins_json, is_kunos, is_traffic, version, sha256, download_path, download_size, has_preview)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, brand = excluded.brand, skins_json = excluded.skins_json,
           is_traffic = CASE WHEN cars.is_traffic = 1 THEN 1 ELSE excluded.is_traffic END,
           sha256 = excluded.sha256, download_path = excluded.download_path,
           download_size = excluded.download_size, has_preview = excluded.has_preview`
      ).run(
        car.id,
        car.name,
        car.brand,
        car.carClass,
        JSON.stringify(car.specs),
        JSON.stringify(car.skins),
        car.isKunos ? 1 : 0,
        car.isTraffic ? 1 : 0,
        sha256.slice(0, 8),
        sha256,
        zipRelPath,
        size,
        hasPreview
      );
      carsCount++;
    }

    let tracksCount = 0;
    for (const track of scannedTracks) {
      const zipRelPath = `downloads/tracks/${track.id}.zip`;
      const zipAbsPath = path.join(paths.root, zipRelPath);
      const { size, sha256 } = await createCmArchive({
        type: 'track',
        id: track.id,
        sourceDir: track.sourceDir,
        outZipPath: zipAbsPath,
      });
      let hasPreview = 0;
      if (track.previewFile && fs.existsSync(track.previewFile)) {
        fs.copyFileSync(track.previewFile, path.join(track.sourceDir, '.ac-panel-preview.png'));
        hasPreview = 1;
      }
      db.prepare(
        `INSERT INTO tracks (id, name, country, city, length, pitboxes, layouts_json, has_ai_spline, is_kunos, version, sha256, download_path, download_size, has_preview)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, pitboxes = excluded.pitboxes, layouts_json = excluded.layouts_json,
           has_ai_spline = excluded.has_ai_spline, sha256 = excluded.sha256,
           download_path = excluded.download_path, download_size = excluded.download_size,
           has_preview = excluded.has_preview`
      ).run(
        track.id,
        track.name,
        track.country,
        track.city,
        track.length,
        track.pitboxes,
        JSON.stringify(track.layouts),
        track.hasAiSpline ? 1 : 0,
        track.isKunos ? 1 : 0,
        sha256.slice(0, 8),
        sha256,
        zipRelPath,
        size,
        hasPreview
      );
      tracksCount++;
    }

    return { success: true, carsCount, tracksCount };
  });

  app.patch('/api/content/cars/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      name: z.string().min(1).optional(),
      is_kunos: z.boolean().optional(),
      is_traffic: z.boolean().optional(),
      version: z.string().min(1).optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Geçersiz güncelleme verisi.' });

    const db = getDb();
    const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(id) as unknown as
      | CarRecord
      | undefined;
    if (!car) return reply.code(404).send({ error: 'Araba bulunamadı.' });

    db.prepare('UPDATE cars SET name = ?, is_kunos = ?, is_traffic = ?, version = ? WHERE id = ?').run(
      parsed.data.name ?? car.name,
      parsed.data.is_kunos !== undefined ? (parsed.data.is_kunos ? 1 : 0) : car.is_kunos,
      parsed.data.is_traffic !== undefined ? (parsed.data.is_traffic ? 1 : 0) : car.is_traffic,
      parsed.data.version ?? car.version,
      id
    );
    db.prepare('UPDATE servers SET bundle_sha256 = ?, bundle_size = 0').run('');
    return { success: true };
  });

  app.patch('/api/content/tracks/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      name: z.string().min(1).optional(),
      is_kunos: z.boolean().optional(),
      version: z.string().min(1).optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Geçersiz güncelleme verisi.' });

    const db = getDb();
    const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as TrackRecord | undefined;
    if (!track) return reply.code(404).send({ error: 'Harita bulunamadı.' });

    db.prepare('UPDATE tracks SET name = ?, is_kunos = ?, version = ? WHERE id = ?').run(
      parsed.data.name ?? track.name,
      parsed.data.is_kunos !== undefined ? (parsed.data.is_kunos ? 1 : 0) : track.is_kunos,
      parsed.data.version ?? track.version,
      id
    );
    db.prepare('UPDATE servers SET bundle_sha256 = ?, bundle_size = 0').run('');
    return { success: true };
  });

  app.delete('/api/content/cars/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const paths = getDataPaths();
    const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(id) as CarRecord | undefined;
    if (!car) return reply.code(404).send({ error: 'Araba bulunamadı.' });

    db.prepare('DELETE FROM cars WHERE id = ?').run(id);
    fs.rmSync(path.join(paths.carsDir, id), { recursive: true, force: true });
    if (car.download_path) {
      fs.rmSync(path.join(paths.root, car.download_path), { force: true });
    }
    return { success: true };
  });

  app.delete('/api/content/tracks/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const paths = getDataPaths();
    const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as TrackRecord | undefined;
    if (!track) return reply.code(404).send({ error: 'Harita bulunamadı.' });

    db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
    fs.rmSync(path.join(paths.tracksDir, id), { recursive: true, force: true });
    if (track.download_path) {
      fs.rmSync(path.join(paths.root, track.download_path), { force: true });
    }
    return { success: true };
  });
}
