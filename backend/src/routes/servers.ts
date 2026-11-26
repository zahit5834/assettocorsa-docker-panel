import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, verifyToken } from '../auth.js';
import { getDataPaths } from '../config.js';
import {
  DEFAULT_TRAFFIC_CONFIG,
  generateFirewallCommands,
  generateJoinLinks,
  safeJsonParse,
  SERVER_TEMPLATES,
  slugify,
  TIME_OF_DAY_PRESETS,
  WEATHER_PRESETS,
  type TrafficConfig,
} from '../configGenerator.js';
import {
  createMultiContentBundleZip,
  extractArchiveSafely,
  isPathInside,
} from '../contentScanner.js';
import { getDb, getSetting, type ServerRecord } from '../db.js';
import { dockerManager } from '../dockerManager.js';
import {
  checkPortConflicts,
  invalidateServerBundle,
  resolveServerContent,
  suggestAvailablePorts,
  writeServerConfigFiles,
} from '../serverService.js';

const trafficSchema = z
  .object({
    maxAiPerPlayer: z.number().int().min(1).max(150).default(35),
    aiDensity: z.number().int().min(1).max(100).default(25),
    maxAiCount: z.number().int().min(4).max(200).default(100),
    maxAiTargetCount: z.number().int().min(4).max(400).optional(),
    maxSpeedKmh: z.number().int().min(30).max(320).default(90),
    rightLaneOffset: z.number().min(-2).max(2).default(0),
    rightLaneOffsetKph: z.number().int().min(-60).max(60).default(0),
    laneWidthMeters: z.number().min(2).max(6).default(3),
    playerRadiusMeters: z.number().int().min(150).max(1000).default(350),
    playerPositionOffsetMeters: z.number().int().min(0).max(400).default(120),
    minSpawnDistancePoints: z.number().int().min(20).max(400).default(75),
    maxSpawnDistancePoints: z.number().int().min(80).max(1000).default(300),
    maxPlayerDistanceMeters: z.number().min(5).max(80).default(20),
    minSafetyDistanceMeters: z.number().min(3).max(50).default(10),
    maxSafetyDistanceMeters: z.number().min(5).max(80).default(24),
    stateSpawnDistanceMeters: z.number().min(30).max(500).default(100),
    twoWayTraffic: z.boolean().default(false),
    overtakeEnabled: z.boolean().default(false),
    overtakeMinSpeedKmh: z.number().int().min(40).max(200).default(80),
    customScriptUrl: z.string().max(500).optional().default(''),
    trafficCars: z.array(z.string()).default([]),
    trafficPackIds: z.array(z.string()).default([]),
    welcomeMessage: z.string().optional(),
  })
  .optional();

const createServerSchema = z.object({
  name: z.string().min(2, 'Sunucu adı en az 2 karakter olmalıdır.').max(80),
  engine: z.enum(['assettoserver', 'vanilla']),
  udp_port: z.number().int().min(1024).max(65535),
  tcp_port: z.number().int().min(1024).max(65535),
  http_port: z.number().int().min(1024).max(65535),
  password: z.string().optional().default(''),
  admin_password: z.string().min(1).optional().default('admin123'),
  max_clients: z.number().int().min(2).max(128).default(24),
  track_id: z.string().optional().default(''),
  track_config: z.string().optional().default(''),
  car_ids: z.array(z.string()).default([]),
  pack_ids: z.array(z.string()).default([]),
  traffic_enabled: z.boolean().optional().default(false),
  traffic_config: trafficSchema,
  template: z.string().optional().default('freeroam_traffic'),
  description: z.string().optional().default(''),
  rules_text: z.string().optional().default(''),
  banner_url: z.string().optional().default(''),
  weather_preset: z.string().optional().default('3_clear'),
  time_of_day: z.string().optional().default('noon'),
  time_multiplier: z.number().min(0).max(60).optional().default(1),
  cm_autodownload: z.boolean().optional().default(true),
  register_to_lobby: z.boolean().optional().default(false),
  memory_limit_mb: z.number().int().min(0).max(65536).optional().default(0),
  cpu_limit: z.number().min(0).max(64).optional().default(0),
  auto_start: z.boolean().optional().default(false),
});

const cloneSchema = z.object({
  name: z.string().min(2).max(80),
  udp_port: z.number().int().min(1024).max(65535),
  tcp_port: z.number().int().min(1024).max(65535),
  http_port: z.number().int().min(1024).max(65535),
  engine: z.enum(['assettoserver', 'vanilla']).optional(),
});

const ALLOWED_CFG_FILES = [
  'server_cfg.ini',
  'entry_list.ini',
  'extra_cfg.yml',
  'csp_extra_options.ini',
] as const;

async function enrichServer(server: ServerRecord, includeStats = false) {
  const db = getDb();
  const publicIp = getSetting(db, 'public_ip', '127.0.0.1');
  const panelPort = Number(getSetting(db, 'panel_port', '5829'));
  const runtime = await dockerManager.getContainerStatus(server, includeStats);
  const live = runtime.running
    ? await dockerManager.queryLivePlayers(server)
    : { reachable: false, players: [] };
  const resolved = resolveServerContent(db, server);
  const joinLinks = generateJoinLinks({ server, publicIp, panelPort });
  const firewall = generateFirewallCommands(server.udp_port, server.tcp_port, server.http_port);

  return {
    ...server,
    car_ids: safeJsonParse<string[]>(server.car_ids_json, []),
    pack_ids: safeJsonParse<string[]>(server.pack_ids_json, []),
    traffic_enabled: Boolean(server.traffic_enabled),
    traffic_config: {
      ...DEFAULT_TRAFFIC_CONFIG,
      ...safeJsonParse<Partial<TrafficConfig>>(server.traffic_config_json, {}),
    },
    cm_autodownload: Boolean(server.cm_autodownload),
    register_to_lobby: Boolean(server.register_to_lobby),
    effective_track: resolved.track
      ? { id: resolved.track.id, name: resolved.track.name, layouts: safeJsonParse<string[]>(resolved.track.layouts_json, []) }
      : resolved.effectiveTrackId
        ? { id: resolved.effectiveTrackId, name: resolved.effectiveTrackId, layouts: [] }
        : null,
    effective_car_count: resolved.carIds.length,
    runtime,
    live,
    joinLinks,
    firewall,
  };
}

export async function serverRoutes(app: FastifyInstance) {
  app.get('/api/servers/templates', { preHandler: [requireAuth] }, async () => {
    return {
      templates: SERVER_TEMPLATES,
      weatherPresets: WEATHER_PRESETS,
      timePresets: Object.entries(TIME_OF_DAY_PRESETS).map(([id, v]) => ({
        id,
        label: v.label,
      })),
    };
  });

  app.get('/api/servers/suggest-ports', { preHandler: [requireAuth] }, async () => {
    const db = getDb();
    return suggestAvailablePorts(db);
  });

  app.get('/api/servers', { preHandler: [requireAuth] }, async () => {
    const db = getDb();
    const servers = db
      .prepare('SELECT * FROM servers ORDER BY created_at DESC')
      .all() as unknown as ServerRecord[];
    const enriched = await Promise.all(servers.map((s) => enrichServer(s, true)));
    return { servers: enriched };
  });

  app.get('/api/servers/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as
      | ServerRecord
      | undefined;
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });
    return { server: await enrichServer(server, true) };
  });

  app.post('/api/servers', { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = createServerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Geçersiz sunucu bilgileri.' });
    }

    const data = parsed.data;
    const db = getDb();
    const conflict = checkPortConflicts(db, {
      udp_port: data.udp_port,
      tcp_port: data.tcp_port,
      http_port: data.http_port,
    });
    if (conflict.conflict) {
      return reply.code(409).send({ error: conflict.message });
    }

    const id = crypto.randomUUID();
    const baseSlug = slugify(data.name);
    const existsSlug = db.prepare('SELECT id FROM servers WHERE slug = ?').get(baseSlug);
    const slug = existsSlug ? `${baseSlug}-${id.slice(0, 5)}` : baseSlug;

    const trafficEnabled = data.engine === 'assettoserver' && data.traffic_enabled ? 1 : 0;

    db.prepare(
      `INSERT INTO servers (
        id, slug, name, engine, udp_port, tcp_port, http_port, password, admin_password,
        max_clients, track_id, track_config, car_ids_json, pack_ids_json,
        traffic_enabled, traffic_config_json, template, description, rules_text, banner_url,
        weather_preset, time_of_day, time_multiplier, cm_autodownload,
        register_to_lobby, memory_limit_mb, cpu_limit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      slug,
      data.name,
      data.engine,
      data.udp_port,
      data.tcp_port,
      data.http_port,
      data.password,
      data.admin_password,
      data.max_clients,
      data.track_id,
      data.track_config,
      JSON.stringify(data.car_ids),
      JSON.stringify(data.pack_ids),
      trafficEnabled,
      JSON.stringify({ ...DEFAULT_TRAFFIC_CONFIG, ...data.traffic_config }),
      data.template,
      data.description,
      data.rules_text,
      data.banner_url,
      data.weather_preset,
      data.time_of_day,
      data.time_multiplier,
      data.cm_autodownload ? 1 : 0,
      data.register_to_lobby ? 1 : 0,
      data.memory_limit_mb,
      data.cpu_limit
    );

    const created = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as unknown as ServerRecord;
    writeServerConfigFiles(db, created);

    let startError: string | undefined;
    if (data.auto_start) {
      try {
        const containerId = await dockerManager.createAndStartServer(created, {
          assettoServerImage: getSetting(db, 'assettoserver_image', 'compujuckel/assettoserver:latest'),
          vanillaAcImage: getSetting(db, 'vanilla_ac_image', 'ac-panel-vanilla:latest'),
        });
        db.prepare('UPDATE servers SET container_id = ? WHERE id = ?').run(containerId, id);
      } catch (err) {
        startError = err instanceof Error ? err.message : 'Sunucu başlatılamadı.';
      }
    }

    const fresh = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as unknown as ServerRecord;
    return reply.code(201).send({
      server: await enrichServer(fresh, true),
      startError,
    });
  });

  app.put('/api/servers/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createServerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Geçersiz sunucu verisi.' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as
      | ServerRecord
      | undefined;
    if (!existing) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    const data = parsed.data;
    const conflict = checkPortConflicts(
      db,
      { udp_port: data.udp_port, tcp_port: data.tcp_port, http_port: data.http_port },
      id
    );
    if (conflict.conflict) {
      return reply.code(409).send({ error: conflict.message });
    }

    const trafficEnabled = data.engine === 'assettoserver' && data.traffic_enabled ? 1 : 0;

    db.prepare(
      `UPDATE servers SET
         name = ?, engine = ?, udp_port = ?, tcp_port = ?, http_port = ?,
         password = ?, admin_password = ?, max_clients = ?, track_id = ?, track_config = ?,
         car_ids_json = ?, pack_ids_json = ?, traffic_enabled = ?, traffic_config_json = ?,
         template = ?, description = ?, rules_text = ?, banner_url = ?,
         weather_preset = ?, time_of_day = ?, time_multiplier = ?,
         cm_autodownload = ?, register_to_lobby = ?, memory_limit_mb = ?, cpu_limit = ?,
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      data.name,
      data.engine,
      data.udp_port,
      data.tcp_port,
      data.http_port,
      data.password,
      data.admin_password,
      data.max_clients,
      data.track_id,
      data.track_config,
      JSON.stringify(data.car_ids),
      JSON.stringify(data.pack_ids),
      trafficEnabled,
      JSON.stringify({ ...DEFAULT_TRAFFIC_CONFIG, ...data.traffic_config }),
      data.template,
      data.description,
      data.rules_text,
      data.banner_url,
      data.weather_preset,
      data.time_of_day,
      data.time_multiplier,
      data.cm_autodownload ? 1 : 0,
      data.register_to_lobby ? 1 : 0,
      data.memory_limit_mb,
      data.cpu_limit,
      id
    );

    const updated = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as unknown as ServerRecord;
    writeServerConfigFiles(db, updated);
    invalidateServerBundle(db, id, updated.slug);

    return { server: await enrichServer(updated, true) };
  });

  app.post('/api/servers/:id/clone', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = cloneSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Geçersiz klonlama verisi.' });
    }

    const db = getDb();
    const source = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as
      | ServerRecord
      | undefined;
    if (!source) return reply.code(404).send({ error: 'Kaynak sunucu bulunamadı.' });

    const conflict = checkPortConflicts(db, {
      udp_port: parsed.data.udp_port,
      tcp_port: parsed.data.tcp_port,
      http_port: parsed.data.http_port,
    });
    if (conflict.conflict) {
      return reply.code(409).send({ error: conflict.message });
    }

    const newId = crypto.randomUUID();
    const baseSlug = slugify(parsed.data.name);
    const existsSlug = db.prepare('SELECT id FROM servers WHERE slug = ?').get(baseSlug);
    const newSlug = existsSlug ? `${baseSlug}-${newId.slice(0, 5)}` : baseSlug;
    const engine = parsed.data.engine || source.engine;

    db.prepare(
      `INSERT INTO servers (
        id, slug, name, engine, udp_port, tcp_port, http_port, password, admin_password,
        max_clients, track_id, track_config, car_ids_json, pack_ids_json,
        traffic_enabled, traffic_config_json, template, description, rules_text, banner_url,
        weather_preset, time_of_day, time_multiplier, cm_autodownload,
        register_to_lobby, memory_limit_mb, cpu_limit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId,
      newSlug,
      parsed.data.name,
      engine,
      parsed.data.udp_port,
      parsed.data.tcp_port,
      parsed.data.http_port,
      source.password,
      source.admin_password,
      source.max_clients,
      source.track_id,
      source.track_config,
      source.car_ids_json,
      source.pack_ids_json,
      engine === 'assettoserver' ? source.traffic_enabled : 0,
      source.traffic_config_json,
      source.template,
      source.description,
      source.rules_text || '',
      source.banner_url || '',
      source.weather_preset || '3_clear',
      source.time_of_day || 'noon',
      source.time_multiplier ?? 1,
      source.cm_autodownload,
      source.register_to_lobby,
      source.memory_limit_mb,
      source.cpu_limit
    );

    const cloned = db.prepare('SELECT * FROM servers WHERE id = ?').get(newId) as unknown as ServerRecord;
    writeServerConfigFiles(db, cloned);
    return reply.code(201).send({ server: await enrichServer(cloned, true) });
  });

  app.post('/api/servers/:id/start', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as
      | ServerRecord
      | undefined;
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    try {
      const containerId = await dockerManager.createAndStartServer(server, {
        assettoServerImage: getSetting(db, 'assettoserver_image', 'compujuckel/assettoserver:latest'),
        vanillaAcImage: getSetting(db, 'vanilla_ac_image', 'ac-panel-vanilla:latest'),
      });
      db.prepare('UPDATE servers SET container_id = ? WHERE id = ?').run(containerId, id);
      const fresh = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as unknown as ServerRecord;
      return { success: true, server: await enrichServer(fresh, true) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sunucu başlatılamadı.';
      return reply.code(500).send({ error: msg });
    }
  });

  app.post('/api/servers/:id/stop', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as
      | ServerRecord
      | undefined;
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    await dockerManager.stopServer(server);
    return { success: true, server: await enrichServer(server, false) };
  });

  app.post('/api/servers/:id/restart', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as
      | ServerRecord
      | undefined;
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    try {
      const containerId = await dockerManager.restartServer(server, {
        assettoServerImage: getSetting(db, 'assettoserver_image', 'compujuckel/assettoserver:latest'),
        vanillaAcImage: getSetting(db, 'vanilla_ac_image', 'ac-panel-vanilla:latest'),
      });
      db.prepare('UPDATE servers SET container_id = ? WHERE id = ?').run(containerId, id);
      const fresh = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as unknown as ServerRecord;
      return { success: true, server: await enrichServer(fresh, true) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sunucu yeniden başlatılamadı.';
      return reply.code(500).send({ error: msg });
    }
  });

  app.delete('/api/servers/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const paths = getDataPaths();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as
      | ServerRecord
      | undefined;
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    await dockerManager.removeContainerByNameOrId(
      server.container_id || dockerManager.getContainerName(server)
    );
    db.prepare('DELETE FROM servers WHERE id = ?').run(id);
    fs.rmSync(path.join(paths.serversDir, id), { recursive: true, force: true });
    fs.rmSync(path.join(paths.bundleDownloadsDir, `${server.slug}-bundle.zip`), { force: true });
    return { success: true };
  });

  app.get('/api/servers/:id/files', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as
      | ServerRecord
      | undefined;
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    const paths = getDataPaths();
    const cfgDir = path.join(paths.serversDir, id, 'cfg');
    if (!fs.existsSync(cfgDir)) {
      writeServerConfigFiles(db, server);
    }

    const files: Record<string, string> = {};
    for (const filename of ALLOWED_CFG_FILES) {
      const fullPath = path.join(cfgDir, filename);
      files[filename] = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
    }
    return { files };
  });

  app.put('/api/servers/:id/files', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      filename: z.enum(ALLOWED_CFG_FILES),
      content: z.string(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Geçersiz dosya adı veya içerik.' });
    }

    const db = getDb();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as
      | ServerRecord
      | undefined;
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    const paths = getDataPaths();
    const cfgDir = path.join(paths.serversDir, id, 'cfg');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, parsed.data.filename), parsed.data.content, 'utf8');
    return { success: true, message: `${parsed.data.filename} kaydedildi.` };
  });

  app.post('/api/servers/:id/rebuild-bundle', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const paths = getDataPaths();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as
      | ServerRecord
      | undefined;
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    const resolved = resolveServerContent(db, server);
    const carIds = resolved.cars.filter((c) => !c.is_kunos).map((c) => c.id);
    const trackIds = resolved.track && !resolved.track.is_kunos ? [resolved.track.id] : [];

    if (carIds.length === 0 && trackIds.length === 0) {
      return reply.code(400).send({ error: 'İndirilebilir özel mod (non-Kunos) bulunmuyor.' });
    }

    const publicIp = getSetting(db, 'public_ip', '127.0.0.1');
    const panelPort = Number(getSetting(db, 'panel_port', '5829'));
    const outZip = path.join(paths.bundleDownloadsDir, `${server.slug}-bundle.zip`);
    const built = await createMultiContentBundleZip({
      outZipPath: outZip,
      carIds,
      trackIds,
      title: server.name,
      joinUrl: `http://${publicIp}:${panelPort}/join/${server.slug}`,
    });

    db.prepare('UPDATE servers SET bundle_sha256 = ?, bundle_size = ? WHERE id = ?').run(
      built.sha256,
      built.size,
      id
    );

    return {
      success: true,
      bundleSize: built.size,
      bundleSha256: built.sha256,
      includedCars: built.includedCars.length,
      includedTracks: built.includedTracks.length,
    };
  });

  app.get('/api/servers/:id/logs', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as unknown as
      | ServerRecord
      | undefined;
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    const logs = await dockerManager.getRecentLogs(server, 250);
    return { logs };
  });

  // Live Admin / Whitelist / Blacklist Management (hot-reloaded by AssettoServer)
  app.get('/api/servers/:id/lists', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const server = db.prepare('SELECT id FROM servers WHERE id = ?').get(id);
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    const paths = getDataPaths();
    const listsDir = path.join(paths.serversDir, id, 'lists');
    fs.mkdirSync(listsDir, { recursive: true });

    const readList = (fname: string) => {
      const p = path.join(listsDir, fname);
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    };

    return {
      admins: readList('admins.txt'),
      whitelist: readList('whitelist.txt'),
      blacklist: readList('blacklist.txt'),
    };
  });

  app.put('/api/servers/:id/lists', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      admins: z.string().optional(),
      whitelist: z.string().optional(),
      blacklist: z.string().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Geçersiz liste verisi.' });

    const db = getDb();
    const server = db.prepare('SELECT id FROM servers WHERE id = ?').get(id);
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    const paths = getDataPaths();
    const listsDir = path.join(paths.serversDir, id, 'lists');
    fs.mkdirSync(listsDir, { recursive: true });

    if (parsed.data.admins !== undefined) {
      fs.writeFileSync(path.join(listsDir, 'admins.txt'), parsed.data.admins, 'utf8');
    }
    if (parsed.data.whitelist !== undefined) {
      fs.writeFileSync(path.join(listsDir, 'whitelist.txt'), parsed.data.whitelist, 'utf8');
    }
    if (parsed.data.blacklist !== undefined) {
      fs.writeFileSync(path.join(listsDir, 'blacklist.txt'), parsed.data.blacklist, 'utf8');
    }

    return {
      success: true,
      message: 'Listeler kaydedildi (AssettoServer çalışırken otomatik günceller).',
    };
  });

  // AssettoServer Plugin Manager (.zip / .7z / .rar / .dll)
  app.get('/api/servers/:id/plugins', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const server = db.prepare('SELECT id FROM servers WHERE id = ?').get(id);
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    const paths = getDataPaths();
    const pluginsDir = path.join(paths.serversDir, id, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });

    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true }).map((e) => {
      const full = path.join(pluginsDir, e.name);
      const stat = fs.statSync(full);
      return {
        name: e.name,
        isDirectory: e.isDirectory(),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    });

    return { plugins: entries };
  });

  app.post('/api/servers/:id/plugins/upload', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const server = db.prepare('SELECT id FROM servers WHERE id = ?').get(id);
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'Plugin dosyası seçilmedi.' });

    const paths = getDataPaths();
    const pluginsDir = path.join(paths.serversDir, id, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });

    const origName = path.basename(file.filename || 'plugin.zip');
    const lower = origName.toLowerCase();

    if (lower.endsWith('.dll') || lower.endsWith('.yml') || lower.endsWith('.json')) {
      const dest = path.join(pluginsDir, origName.replace(/[^a-zA-Z0-9_.-]/g, '_'));
      await pipeline(file.file, fs.createWriteStream(dest));
      return { success: true, message: `${origName} plugins klasörüne yüklendi.` };
    }

    const tmpFile = path.join(paths.tmpDir, `plugin-${crypto.randomUUID()}${path.extname(lower) || '.zip'}`);
    try {
      await pipeline(file.file, fs.createWriteStream(tmpFile));
      await extractArchiveSafely(tmpFile, pluginsDir);
      return { success: true, message: `${origName} plugins klasörüne çıkarıldı. Aktif olması için sunucuyu yeniden başlatın.` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Plugin arşivi çıkarılamadı.';
      return reply.code(400).send({ error: msg });
    } finally {
      if (fs.existsSync(tmpFile)) fs.rmSync(tmpFile, { force: true });
    }
  });

  app.delete('/api/servers/:id/plugins/:name', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id, name } = request.params as { id: string; name: string };
    const db = getDb();
    const server = db.prepare('SELECT id FROM servers WHERE id = ?').get(id);
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    const paths = getDataPaths();
    const pluginsDir = path.join(paths.serversDir, id, 'plugins');
    const target = path.join(pluginsDir, path.basename(name));
    if (!isPathInside(pluginsDir, target) || !fs.existsSync(target)) {
      return reply.code(404).send({ error: 'Plugin bulunamadı.' });
    }

    fs.rmSync(target, { recursive: true, force: true });
    return { success: true };
  });

  // Live Port / Firewall Reachability Test
  app.post('/api/servers/:id/test-ports', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as unknown as
      | ServerRecord
      | undefined;
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });

    const publicIp = getSetting(db, 'public_ip', '127.0.0.1');
    const result = await dockerManager.testServerPorts(server, publicIp);
    const firewall = generateFirewallCommands(server.udp_port, server.tcp_port, server.http_port);
    return { ...result, firewall };
  });

  // Overtake / Makas Leaderboard management
  app.get('/api/servers/:id/leaderboard', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const server = db.prepare('SELECT id FROM servers WHERE id = ?').get(id) as
      | { id: string }
      | undefined;
    if (!server) return reply.code(404).send({ error: 'Sunucu bulunamadı.' });
    const scores = db
      .prepare(
        `SELECT id, driver_name, car_id, score, max_combo, max_speed_kmh, overtakes, updated_at
         FROM overtake_scores WHERE server_id = ? ORDER BY score DESC LIMIT 50`
      )
      .all(id);
    return { scores };
  });

  app.delete('/api/servers/:id/leaderboard', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    db.prepare('DELETE FROM overtake_scores WHERE server_id = ?').run(id);
    return { success: true, message: 'Makas liderlik tablosu sıfırlandı.' };
  });

  // Live WebSocket console log stream
  app.get('/api/ws/servers/:id/logs', { websocket: true }, async (socket, request) => {
    const query = request.query as { token?: string };
    if (!query?.token || !verifyToken(query.token)) {
      socket.send('[Yetkisiz bağlantı]\n');
      socket.close();
      return;
    }

    const { id } = request.params as { id: string };
    const db = getDb();
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as
      | ServerRecord
      | undefined;
    if (!server) {
      socket.send('[Sunucu bulunamadı]\n');
      socket.close();
      return;
    }

    const cleanup = await dockerManager.streamLogs(
      server,
      (chunk) => {
        if (socket.readyState === 1) {
          socket.send(chunk);
        }
      },
      () => {
        if (socket.readyState === 1) {
          socket.send('\n[Log akışı sonlandı]\n');
        }
      }
    );

    socket.on('close', () => {
      cleanup();
    });
  });
}
