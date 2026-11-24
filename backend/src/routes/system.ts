import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { getDataPaths } from '../config.js';
import { getAllSettings, getDb, getSetting, setSetting, type ServerRecord } from '../db.js';
import { dockerManager } from '../dockerManager.js';
import { writeServerConfigFiles } from '../serverService.js';
import { getUpdateStatus, triggerSelfUpdate } from '../updateService.js';

export async function systemRoutes(app: FastifyInstance) {
  app.get('/api/system/overview', { preHandler: [requireAuth] }, async () => {
    const db = getDb();
    const paths = getDataPaths();

    const servers = db.prepare('SELECT * FROM servers').all() as unknown as ServerRecord[];
    const carsCount = (db.prepare('SELECT COUNT(*) as c FROM cars').get() as { c: number }).c;
    const tracksCount = (db.prepare('SELECT COUNT(*) as c FROM tracks').get() as { c: number }).c;
    const packsCount = (db.prepare('SELECT COUNT(*) as c FROM packs').get() as { c: number }).c;

    let runningServers = 0;
    let totalPlayers = 0;
    for (const s of servers) {
      const st = await dockerManager.getContainerStatus(s, false);
      if (st.running) {
        runningServers++;
        const live = await dockerManager.queryLivePlayers(s);
        totalPlayers += live.clients ?? live.players.length;
      }
    }

    const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
    const freeMemMb = Math.round(os.freemem() / (1024 * 1024));
    const usedMemMb = totalMemMb - freeMemMb;

    let diskTotalGb = 0;
    let diskFreeGb = 0;
    try {
      const statfs = fs.statfsSync(paths.root);
      diskTotalGb = Number(((statfs.blocks * statfs.bsize) / 1024 ** 3).toFixed(1));
      diskFreeGb = Number(((statfs.bavail * statfs.bsize) / 1024 ** 3).toFixed(1));
    } catch {
      // ignore if unsupported
    }

    const engines = await dockerManager.checkEngines(
      getSetting(db, 'assettoserver_image', 'compujuckel/assettoserver:latest'),
      getSetting(db, 'vanilla_ac_image', 'ac-panel-vanilla:latest')
    );

    return {
      counts: {
        servers: servers.length,
        runningServers,
        totalPlayers,
        cars: carsCount,
        tracks: tracksCount,
        packs: packsCount,
      },
      host: {
        hostname: os.hostname(),
        platform: `${os.platform()} ${os.arch()}`,
        cpus: os.cpus().length,
        loadAvg: os.loadavg().map((n) => Number(n.toFixed(2))),
        uptimeSec: Math.round(os.uptime()),
        totalMemMb,
        usedMemMb,
        diskTotalGb,
        diskFreeGb,
        diskUsedGb: Number(Math.max(0, diskTotalGb - diskFreeGb).toFixed(1)),
      },
      engines,
      settings: getAllSettings(db),
    };
  });

  app.get('/api/system/settings', { preHandler: [requireAuth] }, async () => {
    const db = getDb();
    const settings = getAllSettings(db);
    const engines = await dockerManager.checkEngines(
      settings.assettoserver_image || 'compujuckel/assettoserver:latest',
      settings.vanilla_ac_image || 'ac-panel-vanilla:latest'
    );
    return { settings, engines };
  });

  app.put('/api/system/settings', { preHandler: [requireAuth] }, async (request, reply) => {
    const schema = z.object({
      public_ip: z.string().min(1).optional(),
      panel_port: z.string().regex(/^\d+$/).optional(),
      assettoserver_image: z.string().min(1).optional(),
      vanilla_ac_image: z.string().min(1).optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Geçersiz ayar değerleri.' });
    }

    const db = getDb();
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) {
        setSetting(db, k, v.trim());
      }
    }

    // Regenerate config files so updated public_ip / panel_port reflects in CM auto-download URLs
    const servers = db.prepare('SELECT * FROM servers').all() as unknown as ServerRecord[];
    for (const srv of servers) {
      writeServerConfigFiles(db, srv);
    }

    return { success: true, settings: getAllSettings(db) };
  });

  app.post(
    '/api/system/engines/pull-assettoserver',
    { preHandler: [requireAuth] },
    async (_request, reply) => {
      const db = getDb();
      const image = getSetting(db, 'assettoserver_image', 'compujuckel/assettoserver:latest');
      try {
        const res = await dockerManager.pullImage(image);
        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'İmaj çekilemedi.';
        return reply.code(500).send({ error: msg });
      }
    }
  );

  app.post(
    '/api/system/engines/upload-vanilla',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const paths = getDataPaths();
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ error: 'acServer dosyası gönderilmedi.' });
      }
      const target = path.join(paths.enginesDir, 'acServer');
      await pipeline(file.file, fs.createWriteStream(target));
      try {
        fs.chmodSync(target, 0o755);
      } catch {
        // ignore on Windows
      }
      const stat = fs.statSync(target);
      return {
        success: true,
        message: 'Vanilla acServer Linux binary dosyası başarıyla yüklendi.',
        size: stat.size,
      };
    }
  );

  app.get('/api/system/update/status', { preHandler: [requireAuth] }, async (request) => {
    const query = request.query as { fetch?: string };
    const fetchRemote = query?.fetch === '1' || query?.fetch === 'true';
    return getUpdateStatus(fetchRemote);
  });

  app.post('/api/system/update/run', { preHandler: [requireAuth] }, async (_request, reply) => {
    try {
      return await triggerSelfUpdate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Güncelleme başlatılamadı.';
      return reply.code(400).send({ error: msg });
    }
  });
}
