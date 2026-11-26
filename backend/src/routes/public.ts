import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { getDataPaths } from '../config.js';
import { generateJoinLinks, safeJsonParse, type TrafficConfig } from '../configGenerator.js';
import { createMultiContentBundleZip } from '../contentScanner.js';
import {
  getDb,
  getSetting,
  type CarRecord,
  type DriftScoreRecord,
  type OvertakeScoreRecord,
  type PackRecord,
  type ServerRecord,
  type TrackRecord,
} from '../db.js';
import { dockerManager } from '../dockerManager.js';
import { generateDriftLuaScript } from '../driftScript.js';
import { generateOvertakeLuaScript } from '../overtakeScript.js';
import { resolveServerContent } from '../serverService.js';

const IS_DOCKER = fs.existsSync('/.dockerenv');

function sendDownloadFile(
  reply: FastifyReply,
  relDataPath: string,
  downloadFileName: string
) {
  const paths = getDataPaths();
  const absPath = path.join(paths.root, relDataPath);
  if (!fs.existsSync(absPath)) {
    return reply.code(404).send({ error: 'İndirilebilir arşiv dosyası bulunamadı.' });
  }

  const safeName = downloadFileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  reply.header('Content-Disposition', `attachment; filename="${safeName}"`);
  reply.header('Content-Type', 'application/zip');

  // Inside Docker behind Nginx, delegate zero-copy download via X-Accel-Redirect
  if (IS_DOCKER) {
    const normalizedRel = relDataPath.replace(/\\/g, '/').replace(/^\/+/, '');
    reply.header('X-Accel-Redirect', `/internal-data/${normalizedRel}`);
    return reply.send();
  }

  const stat = fs.statSync(absPath);
  reply.header('Content-Length', stat.size);
  return reply.send(fs.createReadStream(absPath));
}

export async function publicRoutes(app: FastifyInstance) {
  /**
   * Public Server Invite & Mod Download Portal Data (NO AUTH REQUIRED)
   */
  app.get('/api/public/join/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const db = getDb();
    const server = db
      .prepare('SELECT * FROM servers WHERE slug = ? OR id = ?')
      .get(slug, slug) as ServerRecord | undefined;

    if (!server) {
      return reply.code(404).send({ error: 'Sunucu bulunamadı veya kaldırılmış.' });
    }

    const publicIp = getSetting(db, 'public_ip', '127.0.0.1');
    const panelPort = Number(getSetting(db, 'panel_port', '5829'));
    const joinLinks = generateJoinLinks({ server, publicIp, panelPort });
    const runtime = await dockerManager.getContainerStatus(server, false);
    const live = runtime.running
      ? await dockerManager.queryLivePlayers(server)
      : { reachable: false, players: [] };
    const resolved = resolveServerContent(db, server);

    const trackInfo = resolved.track
      ? {
          id: resolved.track.id,
          name: resolved.track.name,
          layout: server.track_config || '',
          country: resolved.track.country,
          city: resolved.track.city,
          length: resolved.track.length,
          pitboxes: resolved.track.pitboxes,
          is_kunos: Boolean(resolved.track.is_kunos),
          version: resolved.track.version,
          sha256: resolved.track.sha256 ? resolved.track.sha256.slice(0, 12) : '',
          downloadSize: resolved.track.download_size,
          downloadUrl:
            !resolved.track.is_kunos && resolved.track.download_path
              ? `/api/public/dl/track/${encodeURIComponent(resolved.track.id)}`
              : null,
          previewUrl: resolved.track.has_preview
            ? `/api/public/preview/track/${encodeURIComponent(resolved.track.id)}`
            : null,
        }
      : resolved.effectiveTrackId
        ? {
            id: resolved.effectiveTrackId,
            name: resolved.effectiveTrackId,
            layout: server.track_config || '',
            country: '',
            city: '',
            length: '',
            pitboxes: server.max_clients,
            is_kunos: true,
            version: 'base',
            sha256: '',
            downloadSize: 0,
            downloadUrl: null,
            previewUrl: null,
          }
        : null;

    const carsInfo = resolved.cars.map((c) => ({
      id: c.id,
      name: c.name,
      brand: c.brand,
      carClass: c.car_class,
      specs: safeJsonParse<Record<string, unknown>>(c.specs_json, {}),
      skinsCount: safeJsonParse<string[]>(c.skins_json, []).length,
      is_kunos: Boolean(c.is_kunos),
      isTrafficOnly: resolved.trafficOnlyCarIds.has(c.id),
      version: c.version,
      sha256: c.sha256 ? c.sha256.slice(0, 12) : '',
      downloadSize: c.download_size,
      downloadUrl:
        !c.is_kunos && c.download_path
          ? `/api/public/dl/car/${encodeURIComponent(c.id)}`
          : null,
      previewUrl: c.has_preview ? `/api/public/preview/car/${encodeURIComponent(c.id)}` : null,
    }));

    const packsInfo = resolved.packs.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      category: p.category,
      version: p.version,
      sha256: p.sha256 ? p.sha256.slice(0, 12) : '',
      downloadSize: p.download_size,
      downloadUrl: p.download_path
        ? `/api/public/dl/pack/${encodeURIComponent(p.slug)}`
        : null,
    }));

    const downloadableCars = carsInfo.filter((c) => !c.is_kunos && c.downloadUrl);
    const downloadableTrack = trackInfo && !trackInfo.is_kunos && trackInfo.downloadUrl ? trackInfo : null;
    const totalEstimatedSize =
      (downloadableTrack?.downloadSize || 0) +
      downloadableCars.reduce((acc, c) => acc + c.downloadSize, 0);
    const trafficCfg = safeJsonParse<Partial<TrafficConfig>>(server.traffic_config_json, {});
    const leaderboard = db
      .prepare(
        `SELECT driver_name, car_id, score, max_combo, max_speed_kmh, overtakes, updated_at
         FROM overtake_scores WHERE server_id = ? ORDER BY score DESC LIMIT 10`
      )
      .all(server.id) as unknown as OvertakeScoreRecord[];
    const driftLeaderboard = db
      .prepare(
        `SELECT driver_name, car_id, score, max_combo, max_angle_deg, transitions, updated_at
         FROM drift_scores WHERE server_id = ? ORDER BY score DESC LIMIT 10`
      )
      .all(server.id) as unknown as DriftScoreRecord[];

    return {
      server: {
        id: server.id,
        slug: server.slug,
        name: server.name,
        engine: server.engine,
        template: server.template,
        description: server.description,
        rules: server.rules_text || '',
        bannerUrl: server.banner_url || '',
        weatherPreset: server.weather_preset || '3_clear',
        timeOfDay: server.time_of_day || 'noon',
        hasPassword: Boolean(server.password),
        maxClients: server.max_clients,
        udpPort: server.udp_port,
        tcpPort: server.tcp_port,
        httpPort: server.http_port,
        trafficEnabled: Boolean(server.traffic_enabled),
        overtakeEnabled: Boolean(trafficCfg.overtakeEnabled),
        driftHudEnabled: Boolean(trafficCfg.driftHudEnabled),
        cmAutodownload: Boolean(server.cm_autodownload),
        publicIp,
        panelPort,
        joinLinks,
      },
      status: {
        running: runtime.running,
        state: runtime.state,
        onlinePlayers: live.clients ?? live.players.length,
        maxClients: live.maxClients ?? server.max_clients,
        players: live.players,
      },
      track: trackInfo,
      cars: carsInfo,
      packs: packsInfo,
      leaderboard,
      driftLeaderboard,
      bundle: {
        available: downloadableCars.length > 0 || Boolean(downloadableTrack),
        downloadableCount: downloadableCars.length + (downloadableTrack ? 1 : 0),
        totalEstimatedSize,
        cachedSize: server.bundle_size,
        sha256: server.bundle_sha256 ? server.bundle_sha256.slice(0, 12) : '',
        downloadUrl: `/api/public/dl/server/${encodeURIComponent(server.slug)}/bundle`,
      },
    };
  });

  app.get('/api/public/dl/car/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(id) as CarRecord | undefined;
    if (!car || !car.download_path) {
      return reply.code(404).send({ error: 'Araba arşivi bulunamadı.' });
    }
    return sendDownloadFile(reply, car.download_path, `car-${car.id}-${car.version}.zip`);
  });

  app.get('/api/public/dl/track/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as
      | TrackRecord
      | undefined;
    if (!track || !track.download_path) {
      return reply.code(404).send({ error: 'Harita arşivi bulunamadı.' });
    }
    return sendDownloadFile(reply, track.download_path, `track-${track.id}-${track.version}.zip`);
  });

  app.get('/api/public/dl/pack/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const db = getDb();
    const pack = db
      .prepare('SELECT * FROM packs WHERE slug = ? OR id = ?')
      .get(slug, slug) as PackRecord | undefined;
    if (!pack || !pack.download_path) {
      return reply.code(404).send({ error: 'Pack arşivi bulunamadı.' });
    }
    return sendDownloadFile(reply, pack.download_path, `pack-${pack.slug}-${pack.version}.zip`);
  });

  app.get('/api/public/dl/server/:slug/bundle', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const db = getDb();
    const paths = getDataPaths();
    const server = db
      .prepare('SELECT * FROM servers WHERE slug = ? OR id = ?')
      .get(slug, slug) as ServerRecord | undefined;
    if (!server) {
      return reply.code(404).send({ error: 'Sunucu bulunamadı.' });
    }

    const relPath = `downloads/bundles/${server.slug}-bundle.zip`;
    const absPath = path.join(paths.root, relPath);

    if (!fs.existsSync(absPath) || !server.bundle_sha256) {
      const resolved = resolveServerContent(db, server);
      const carIds = resolved.cars.filter((c) => !c.is_kunos).map((c) => c.id);
      const trackIds = resolved.track && !resolved.track.is_kunos ? [resolved.track.id] : [];

      if (carIds.length === 0 && trackIds.length === 0) {
        return reply.code(404).send({ error: 'Bu sunucuda indirilmesi gereken özel mod yok.' });
      }

      const publicIp = getSetting(db, 'public_ip', '127.0.0.1');
      const panelPort = Number(getSetting(db, 'panel_port', '5829'));
      const built = await createMultiContentBundleZip({
        outZipPath: absPath,
        carIds,
        trackIds,
        title: server.name,
        joinUrl: `http://${publicIp}:${panelPort}/join/${server.slug}`,
      });
      db.prepare('UPDATE servers SET bundle_sha256 = ?, bundle_size = ? WHERE id = ?').run(
        built.sha256,
        built.size,
        server.id
      );
    }

    return sendDownloadFile(reply, relPath, `${server.slug}-tum-modlar.zip`);
  });

  app.get('/api/public/preview/car/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const paths = getDataPaths();
    const file = path.join(paths.carsDir, path.basename(id), '.ac-panel-preview.jpg');
    if (!fs.existsSync(file)) return reply.code(404).send();
    reply.header('Content-Type', 'image/jpeg');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(fs.createReadStream(file));
  });

  // CSP Online Script endpoint for in-game Makas & Hiz Skoru HUD
  app.get('/api/public/scripts/:slug/overtake.lua', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const db = getDb();
    const server = db
      .prepare('SELECT * FROM servers WHERE slug = ? OR id = ?')
      .get(slug, slug) as ServerRecord | undefined;
    if (!server) {
      return reply.code(404).type('text/plain').send('-- Server not found\n');
    }
    const publicIp = getSetting(db, 'public_ip', '127.0.0.1');
    const panelPort = Number(getSetting(db, 'panel_port', '5829'));
    const trafficCfg = safeJsonParse<Partial<TrafficConfig>>(server.traffic_config_json, {});
    const lua = generateOvertakeLuaScript({
      serverSlug: server.slug,
      serverName: server.name,
      minSpeedKmh: trafficCfg.overtakeMinSpeedKmh ?? 80,
      apiBaseUrl: `http://${publicIp}:${panelPort}`,
    });
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header('Cache-Control', 'no-cache');
    return reply.send(lua);
  });

  // Public Overtake Leaderboard (consumed by both in-game Lua HUD and /join/:slug page)
  app.get('/api/public/overtake/:slug/leaderboard', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const db = getDb();
    const server = db
      .prepare('SELECT id, name, slug FROM servers WHERE slug = ? OR id = ?')
      .get(slug, slug) as Pick<ServerRecord, 'id' | 'name' | 'slug'> | undefined;
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    const scores = db
      .prepare(
        `SELECT driver_name, car_id, score, max_combo, max_speed_kmh, overtakes, updated_at
         FROM overtake_scores WHERE server_id = ? ORDER BY score DESC LIMIT 20`
      )
      .all(server.id) as unknown as OvertakeScoreRecord[];
    return { server: server.name, scores };
  });

  // Submit Overtake Score from in-game CSP Lua script
  const scoreRateLimit = new Map<string, number>();
  app.post('/api/public/overtake/:slug/score', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const ip = request.ip || 'unknown';
    const now = Date.now();
    const last = scoreRateLimit.get(ip) || 0;
    if (now - last < 2000) {
      return reply.code(429).send({ error: 'Çok hızlı istek.' });
    }
    scoreRateLimit.set(ip, now);

    const db = getDb();
    const server = db
      .prepare('SELECT id FROM servers WHERE slug = ? OR id = ?')
      .get(slug, slug) as Pick<ServerRecord, 'id'> | undefined;
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    const body = (request.body || {}) as Record<string, unknown>;
    const rawName = String(body.driverName || '').trim().slice(0, 48);
    const driverName = rawName.replace(/[\r\n\t]/g, ' ') || 'Sürücü';
    const carId = String(body.carId || '').trim().slice(0, 64);
    const score = Math.floor(Number(body.score) || 0);
    const maxCombo = Math.max(1, Math.min(20, Number(body.maxCombo) || 1));
    const maxSpeedKmh = Math.max(0, Math.min(600, Math.floor(Number(body.maxSpeedKmh) || 0)));
    const overtakes = Math.max(0, Math.min(5000, Math.floor(Number(body.overtakes) || 0)));

    if (score < 100 || score > 50_000_000) {
      return reply.code(400).send({ error: 'Geçersiz skor.' });
    }

    const existing = db
      .prepare('SELECT score FROM overtake_scores WHERE server_id = ? AND driver_name = ?')
      .get(server.id, driverName) as { score: number } | undefined;

    if (!existing) {
      db.prepare(
        `INSERT INTO overtake_scores (server_id, driver_name, car_id, score, max_combo, max_speed_kmh, overtakes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(server.id, driverName, carId, score, maxCombo, maxSpeedKmh, overtakes);
      return { success: true, isNewBest: true };
    }

    if (score > existing.score) {
      db.prepare(
        `UPDATE overtake_scores
         SET car_id = ?, score = ?, max_combo = ?, max_speed_kmh = ?, overtakes = ?, updated_at = datetime('now')
         WHERE server_id = ? AND driver_name = ?`
      ).run(carId, score, maxCombo, maxSpeedKmh, overtakes, server.id, driverName);
      return { success: true, isNewBest: true };
    }

    return { success: true, isNewBest: false };
  });

  // CSP Online Script endpoint for in-game Drift & Tandem Skoru HUD
  app.get('/api/public/scripts/:slug/drift.lua', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const db = getDb();
    const server = db
      .prepare('SELECT * FROM servers WHERE slug = ? OR id = ?')
      .get(slug, slug) as ServerRecord | undefined;
    if (!server) {
      return reply.code(404).type('text/plain').send('-- Server not found\n');
    }
    const publicIp = getSetting(db, 'public_ip', '127.0.0.1');
    const panelPort = Number(getSetting(db, 'panel_port', '5829'));
    const trafficCfg = safeJsonParse<Partial<TrafficConfig>>(server.traffic_config_json, {});
    const lua = generateDriftLuaScript({
      serverSlug: server.slug,
      serverName: server.name,
      apiBaseUrl: `http://${publicIp}:${panelPort}`,
      offsetY: trafficCfg.overtakeEnabled ? 360 : 92,
    });
    reply.header('Content-Type', 'text/plain; charset=utf-8');
    reply.header('Cache-Control', 'no-cache');
    return reply.send(lua);
  });

  app.get('/api/public/drift/:slug/leaderboard', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const db = getDb();
    const server = db
      .prepare('SELECT id, name, slug FROM servers WHERE slug = ? OR id = ?')
      .get(slug, slug) as Pick<ServerRecord, 'id' | 'name' | 'slug'> | undefined;
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    const scores = db
      .prepare(
        `SELECT driver_name, car_id, score, max_combo, max_angle_deg, transitions, updated_at
         FROM drift_scores WHERE server_id = ? ORDER BY score DESC LIMIT 20`
      )
      .all(server.id) as unknown as DriftScoreRecord[];
    return { server: server.name, scores };
  });

  const driftRateLimit = new Map<string, number>();
  app.post('/api/public/drift/:slug/score', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const ip = request.ip || 'unknown';
    const now = Date.now();
    const last = driftRateLimit.get(ip) || 0;
    if (now - last < 2000) {
      return reply.code(429).send({ error: 'Çok hızlı istek.' });
    }
    driftRateLimit.set(ip, now);

    const db = getDb();
    const server = db
      .prepare('SELECT id FROM servers WHERE slug = ? OR id = ?')
      .get(slug, slug) as Pick<ServerRecord, 'id'> | undefined;
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    const body = (request.body || {}) as Record<string, unknown>;
    const rawName = String(body.driverName || '').trim().slice(0, 48);
    const driverName = rawName.replace(/[\r\n\t]/g, ' ') || 'Sürücü';
    const carId = String(body.carId || '').trim().slice(0, 64);
    const score = Math.floor(Number(body.score) || 0);
    const maxCombo = Math.max(1, Math.min(20, Number(body.maxCombo) || 1));
    const maxAngleDeg = Math.max(0, Math.min(90, Math.floor(Number(body.maxAngleDeg) || 0)));
    const transitions = Math.max(0, Math.min(5000, Math.floor(Number(body.transitions) || 0)));

    if (score < 100 || score > 50_000_000) {
      return reply.code(400).send({ error: 'Geçersiz skor.' });
    }

    const existing = db
      .prepare('SELECT score FROM drift_scores WHERE server_id = ? AND driver_name = ?')
      .get(server.id, driverName) as { score: number } | undefined;

    if (!existing) {
      db.prepare(
        `INSERT INTO drift_scores (server_id, driver_name, car_id, score, max_combo, max_angle_deg, transitions, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(server.id, driverName, carId, score, maxCombo, maxAngleDeg, transitions);
      return { success: true, isNewBest: true };
    }

    if (score > existing.score) {
      db.prepare(
        `UPDATE drift_scores
         SET car_id = ?, score = ?, max_combo = ?, max_angle_deg = ?, transitions = ?, updated_at = datetime('now')
         WHERE server_id = ? AND driver_name = ?`
      ).run(carId, score, maxCombo, maxAngleDeg, transitions, server.id, driverName);
      return { success: true, isNewBest: true };
    }

    return { success: true, isNewBest: false };
  });

  app.get('/api/public/preview/track/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const paths = getDataPaths();
    const file = path.join(paths.tracksDir, path.basename(id), '.ac-panel-preview.png');
    if (!fs.existsSync(file)) return reply.code(404).send();
    reply.header('Content-Type', 'image/png');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(fs.createReadStream(file));
  });
}
