import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { getDataPaths } from './config.js';
import {
  generateCspExtraOptionsIni,
  generateEntryListIni,
  generateExtraCfgYml,
  generateServerCfgIni,
  safeJsonParse,
  type TrafficConfig,
} from './configGenerator.js';
import {
  getSetting,
  type CarRecord,
  type PackRecord,
  type ServerRecord,
  type TrackRecord,
} from './db.js';

export interface PortConflictResult {
  conflict: boolean;
  message?: string;
}

export function checkPortConflicts(
  db: DatabaseSync,
  ports: { udp_port: number; tcp_port: number; http_port: number },
  excludeServerId?: string
): PortConflictResult {
  const { udp_port, tcp_port, http_port } = ports;
  const panelPort = Number(getSetting(db, 'panel_port', '5829'));

  for (const [label, p] of [
    ['UDP', udp_port],
    ['TCP', tcp_port],
    ['HTTP', http_port],
  ] as const) {
    if (!Number.isInteger(p) || p < 1024 || p > 65535) {
      return { conflict: true, message: `${label} portu 1024 ile 65535 arasında olmalıdır.` };
    }
    if (p === panelPort) {
      return {
        conflict: true,
        message: `${label} portu (${p}) panel portu (${panelPort}) ile çakışıyor.`,
      };
    }
  }

  if (tcp_port === http_port) {
    return {
      conflict: true,
      message: `TCP portu (${tcp_port}) ile HTTP portu (${http_port}) aynı olamaz.`,
    };
  }

  const others = db
    .prepare('SELECT id, name, udp_port, tcp_port, http_port FROM servers')
    .all() as Array<{
    id: string;
    name: string;
    udp_port: number;
    tcp_port: number;
    http_port: number;
  }>;

  for (const srv of others) {
    if (excludeServerId && srv.id === excludeServerId) continue;
    if (srv.udp_port === udp_port) {
      return { conflict: true, message: `UDP portu (${udp_port}) "${srv.name}" sunucusu tarafından kullanılıyor.` };
    }
    if (srv.tcp_port === tcp_port || srv.http_port === tcp_port) {
      return { conflict: true, message: `TCP portu (${tcp_port}) "${srv.name}" sunucusu tarafından kullanılıyor.` };
    }
    if (srv.http_port === http_port || srv.tcp_port === http_port) {
      return { conflict: true, message: `HTTP portu (${http_port}) "${srv.name}" sunucusu tarafından kullanılıyor.` };
    }
  }

  return { conflict: false };
}

export function suggestAvailablePorts(db: DatabaseSync): {
  udp_port: number;
  tcp_port: number;
  http_port: number;
} {
  const rows = db
    .prepare('SELECT udp_port, tcp_port, http_port FROM servers')
    .all() as Array<{ udp_port: number; tcp_port: number; http_port: number }>;

  const usedUdp = new Set(rows.map((r) => r.udp_port));
  const usedTcp = new Set<number>([Number(getSetting(db, 'panel_port', '5829'))]);
  for (const r of rows) {
    usedTcp.add(r.tcp_port);
    usedTcp.add(r.http_port);
  }

  let gamePort = 9600;
  while (usedUdp.has(gamePort) || usedTcp.has(gamePort)) {
    gamePort++;
  }

  let httpPort = 8081;
  while (usedTcp.has(httpPort) || httpPort === gamePort) {
    httpPort++;
  }

  return { udp_port: gamePort, tcp_port: gamePort, http_port: httpPort };
}

export function resolveServerContent(db: DatabaseSync, server: ServerRecord) {
  const directCarIds = safeJsonParse<string[]>(server.car_ids_json, []);
  const packIds = safeJsonParse<string[]>(server.pack_ids_json, []);

  const packs: PackRecord[] = [];
  const mergedCarIds = new Set<string>(directCarIds);
  let packTrackFallback = '';
  const extraYmlParts: string[] = [];
  const cspParts: string[] = [];

  for (const pid of packIds) {
    const pack = db.prepare('SELECT * FROM packs WHERE id = ?').get(pid) as PackRecord | undefined;
    if (!pack) continue;
    packs.push(pack);
    for (const cid of safeJsonParse<string[]>(pack.car_ids_json, [])) {
      mergedCarIds.add(cid);
    }
    const pTracks = safeJsonParse<string[]>(pack.track_ids_json, []);
    if (!packTrackFallback && pTracks.length > 0) {
      packTrackFallback = pTracks[0];
    }
    if (pack.extra_cfg_yml.trim()) {
      extraYmlParts.push(pack.extra_cfg_yml.trim());
    }
    if (pack.csp_extra_options.trim()) {
      cspParts.push(pack.csp_extra_options.trim());
    }
  }

  const effectiveTrackId = server.track_id || packTrackFallback;
  const track = effectiveTrackId
    ? ((db.prepare('SELECT * FROM tracks WHERE id = ?').get(effectiveTrackId) as
        | TrackRecord
        | undefined) ?? null)
    : null;

  const cars: CarRecord[] = [];
  for (const cid of mergedCarIds) {
    const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(cid) as CarRecord | undefined;
    if (car) {
      cars.push(car);
    }
  }

  return {
    packs,
    track,
    effectiveTrackId,
    cars,
    carIds: Array.from(mergedCarIds),
    packExtraYml: extraYmlParts.join('\n'),
    packCspExtra: cspParts.join('\n'),
  };
}

export function writeServerConfigFiles(db: DatabaseSync, server: ServerRecord): void {
  const paths = getDataPaths();
  const cfgDir = path.join(paths.serversDir, server.id, 'cfg');
  fs.mkdirSync(cfgDir, { recursive: true });

  const publicIp = getSetting(db, 'public_ip', '127.0.0.1');
  const panelPort = Number(getSetting(db, 'panel_port', '5829'));
  const resolved = resolveServerContent(db, server);
  const trafficCfg = safeJsonParse<TrafficConfig>(server.traffic_config_json, {
    maxAiPerPlayer: 6,
    aiDensity: 20,
    maxAiCount: 60,
    maxSpeedKmh: 110,
    rightLaneOffset: 0.5,
    trafficCars: [],
  });

  const serverCfg = generateServerCfgIni({
    server: { ...server, track_id: resolved.effectiveTrackId },
    carIds: resolved.carIds,
    publicIp,
    panelPort,
  });

  const entryList = generateEntryListIni({
    server,
    cars: resolved.cars,
    trafficConfig: trafficCfg,
  });

  const cspExtra = generateCspExtraOptionsIni({
    server,
    track: resolved.track,
    cars: resolved.cars,
    publicIp,
    panelPort,
    extraSnippet: resolved.packCspExtra,
  });

  fs.writeFileSync(path.join(cfgDir, 'server_cfg.ini'), serverCfg, 'utf8');
  fs.writeFileSync(path.join(cfgDir, 'entry_list.ini'), entryList, 'utf8');
  fs.writeFileSync(path.join(cfgDir, 'csp_extra_options.ini'), cspExtra, 'utf8');
  fs.writeFileSync(
    path.join(cfgDir, 'welcome.txt'),
    `${server.name} - Modlar ve bilgiler: http://${publicIp}:${panelPort}/join/${server.slug}\n`,
    'utf8'
  );

  if (server.engine === 'assettoserver') {
    const extraCfg = generateExtraCfgYml({
      server,
      trafficConfig: trafficCfg,
      publicIp,
      panelPort,
      overrideYml: resolved.packExtraYml,
    });
    fs.writeFileSync(path.join(cfgDir, 'extra_cfg.yml'), extraCfg, 'utf8');
  }
}

export function invalidateServerBundle(db: DatabaseSync, serverId: string, slug: string): void {
  const paths = getDataPaths();
  const bundlePath = path.join(paths.bundleDownloadsDir, `${slug}-bundle.zip`);
  if (fs.existsSync(bundlePath)) {
    fs.rmSync(bundlePath, { force: true });
  }
  db.prepare('UPDATE servers SET bundle_sha256 = ?, bundle_size = 0 WHERE id = ?').run('', serverId);
}
