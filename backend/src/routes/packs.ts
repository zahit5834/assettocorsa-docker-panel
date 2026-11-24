import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { getDataPaths } from '../config.js';
import { safeJsonParse, slugify } from '../configGenerator.js';
import { createMultiContentBundleZip } from '../contentScanner.js';
import { getDb, type CarRecord, type PackRecord, type TrackRecord } from '../db.js';

const packSchema = z.object({
  name: z.string().min(2, 'Pack adı en az 2 karakter olmalıdır.'),
  description: z.string().optional().default(''),
  category: z.enum(['mixed', 'cars', 'tracks', 'traffic', 'drift']).optional().default('mixed'),
  car_ids: z.array(z.string()).default([]),
  track_ids: z.array(z.string()).default([]),
  extra_cfg_yml: z.string().optional().default(''),
  csp_extra_options: z.string().optional().default(''),
  version: z.string().optional().default('1.0'),
});

export async function packRoutes(app: FastifyInstance) {
  app.get('/api/packs', { preHandler: [requireAuth] }, async () => {
    const db = getDb();
    const packs = db.prepare('SELECT * FROM packs ORDER BY created_at DESC').all() as unknown as PackRecord[];
    return {
      packs: packs.map((p) => ({
        ...p,
        car_ids: safeJsonParse<string[]>(p.car_ids_json, []),
        track_ids: safeJsonParse<string[]>(p.track_ids_json, []),
      })),
    };
  });

  app.post('/api/packs', { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = packSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Geçersiz pack verisi.' });
    }

    const db = getDb();
    const paths = getDataPaths();
    const id = crypto.randomUUID();
    const baseSlug = slugify(parsed.data.name);
    const exists = db.prepare('SELECT id FROM packs WHERE slug = ?').get(baseSlug);
    const slug = exists ? `${baseSlug}-${id.slice(0, 5)}` : baseSlug;

    // Exclude Kunos base items from downloadable pack zip
    const downloadableCars = parsed.data.car_ids.filter((cid) => {
      const c = db.prepare('SELECT is_kunos FROM cars WHERE id = ?').get(cid) as CarRecord | undefined;
      return c && !c.is_kunos;
    });
    const downloadableTracks = parsed.data.track_ids.filter((tid) => {
      const t = db.prepare('SELECT is_kunos FROM tracks WHERE id = ?').get(tid) as TrackRecord | undefined;
      return t && !t.is_kunos;
    });

    let zipRelPath = '';
    let size = 0;
    let sha256 = '';

    if (downloadableCars.length > 0 || downloadableTracks.length > 0) {
      zipRelPath = `downloads/packs/${slug}.zip`;
      const zipAbsPath = path.join(paths.root, zipRelPath);
      const built = await createMultiContentBundleZip({
        outZipPath: zipAbsPath,
        carIds: downloadableCars,
        trackIds: downloadableTracks,
        title: parsed.data.name,
      });
      size = built.size;
      sha256 = built.sha256;
    }

    db.prepare(
      `INSERT INTO packs (id, slug, name, description, category, car_ids_json, track_ids_json, extra_cfg_yml, csp_extra_options, version, sha256, download_path, download_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      slug,
      parsed.data.name,
      parsed.data.description,
      parsed.data.category,
      JSON.stringify(parsed.data.car_ids),
      JSON.stringify(parsed.data.track_ids),
      parsed.data.extra_cfg_yml,
      parsed.data.csp_extra_options,
      parsed.data.version || sha256.slice(0, 8) || '1.0',
      sha256,
      zipRelPath,
      size
    );

    const created = db.prepare('SELECT * FROM packs WHERE id = ?').get(id) as unknown as PackRecord;
    return reply.code(201).send({
      pack: {
        ...created,
        car_ids: parsed.data.car_ids,
        track_ids: parsed.data.track_ids,
      },
    });
  });

  app.put('/api/packs/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = packSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Geçersiz pack verisi.' });
    }

    const db = getDb();
    const paths = getDataPaths();
    const existing = db.prepare('SELECT * FROM packs WHERE id = ?').get(id) as PackRecord | undefined;
    if (!existing) return reply.code(404).send({ error: 'Pack bulunamadı.' });

    const downloadableCars = parsed.data.car_ids.filter((cid) => {
      const c = db.prepare('SELECT is_kunos FROM cars WHERE id = ?').get(cid) as CarRecord | undefined;
      return c && !c.is_kunos;
    });
    const downloadableTracks = parsed.data.track_ids.filter((tid) => {
      const t = db.prepare('SELECT is_kunos FROM tracks WHERE id = ?').get(tid) as TrackRecord | undefined;
      return t && !t.is_kunos;
    });

    let zipRelPath = '';
    let size = 0;
    let sha256 = '';

    if (downloadableCars.length > 0 || downloadableTracks.length > 0) {
      zipRelPath = `downloads/packs/${existing.slug}.zip`;
      const zipAbsPath = path.join(paths.root, zipRelPath);
      const built = await createMultiContentBundleZip({
        outZipPath: zipAbsPath,
        carIds: downloadableCars,
        trackIds: downloadableTracks,
        title: parsed.data.name,
      });
      size = built.size;
      sha256 = built.sha256;
    }

    db.prepare(
      `UPDATE packs SET
         name = ?, description = ?, category = ?, car_ids_json = ?, track_ids_json = ?,
         extra_cfg_yml = ?, csp_extra_options = ?, version = ?, sha256 = ?,
         download_path = ?, download_size = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      parsed.data.name,
      parsed.data.description,
      parsed.data.category,
      JSON.stringify(parsed.data.car_ids),
      JSON.stringify(parsed.data.track_ids),
      parsed.data.extra_cfg_yml,
      parsed.data.csp_extra_options,
      parsed.data.version || sha256.slice(0, 8) || existing.version,
      sha256,
      zipRelPath,
      size,
      id
    );

    db.prepare('UPDATE servers SET bundle_sha256 = ?, bundle_size = 0').run('');
    return { success: true };
  });

  app.delete('/api/packs/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const paths = getDataPaths();
    const existing = db.prepare('SELECT * FROM packs WHERE id = ?').get(id) as PackRecord | undefined;
    if (!existing) return reply.code(404).send({ error: 'Pack bulunamadı.' });

    db.prepare('DELETE FROM packs WHERE id = ?').run(id);
    if (existing.download_path) {
      fs.rmSync(path.join(paths.root, existing.download_path), { force: true });
    }
    return { success: true };
  });
}
