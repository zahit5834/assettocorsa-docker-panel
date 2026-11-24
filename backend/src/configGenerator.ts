import yaml from 'js-yaml';
import type { CarRecord, ServerRecord, TrackRecord } from './db.js';

export interface ServerTemplateDefinition {
  id: string;
  name: string;
  description: string;
  defaultEngine: 'assettoserver' | 'vanilla';
  trafficEnabled: boolean;
  maxClients: number;
  sessionType: 'practice' | 'drift' | 'trackday' | 'race';
  tcAllowed: number;
  absAllowed: number;
  stabilityAllowed: number;
  tireBlankets: number;
  damageMultiplier: number;
  fuelRate: number;
  tireWearRate: number;
}

export const SERVER_TEMPLATES: ServerTemplateDefinition[] = [
  {
    id: 'freeroam_traffic',
    name: 'Freeroam & AI Trafik (Shutoko / No Hesi)',
    description: 'AssettoServer ile AI trafik, CSP Extra Options ve serbest sürüş ortamı.',
    defaultEngine: 'assettoserver',
    trafficEnabled: true,
    maxClients: 24,
    sessionType: 'practice',
    tcAllowed: 1,
    absAllowed: 1,
    stabilityAllowed: 0,
    tireBlankets: 1,
    damageMultiplier: 0,
    fuelRate: 0,
    tireWearRate: 0,
  },
  {
    id: 'drift',
    name: 'Drift Lobby',
    description: 'Hasarsız, sınırsız yakıt ve lastikle uzun süreli serbest drift oturumu.',
    defaultEngine: 'assettoserver',
    trafficEnabled: false,
    maxClients: 24,
    sessionType: 'drift',
    tcAllowed: 0,
    absAllowed: 1,
    stabilityAllowed: 0,
    tireBlankets: 1,
    damageMultiplier: 0,
    fuelRate: 0,
    tireWearRate: 0,
  },
  {
    id: 'trackday',
    name: 'Track Day (Pist Günü)',
    description: 'Gerçekçi lastik ve yakıt tüketimi ile açık pist antrenmanı.',
    defaultEngine: 'vanilla',
    trafficEnabled: false,
    maxClients: 24,
    sessionType: 'trackday',
    tcAllowed: 1,
    absAllowed: 1,
    stabilityAllowed: 0,
    tireBlankets: 1,
    damageMultiplier: 50,
    fuelRate: 100,
    tireWearRate: 100,
  },
  {
    id: 'race',
    name: 'Klasik Yarış (Antrenman + Sıralama + Yarış)',
    description: 'Standart Kunos yarış döngüsü: Practice, Qualifying ve Race oturumları.',
    defaultEngine: 'vanilla',
    trafficEnabled: false,
    maxClients: 20,
    sessionType: 'race',
    tcAllowed: 1,
    absAllowed: 1,
    stabilityAllowed: 0,
    tireBlankets: 1,
    damageMultiplier: 100,
    fuelRate: 100,
    tireWearRate: 100,
  },
];

export interface TrafficConfig {
  maxAiPerPlayer: number;
  aiDensity: number;
  maxAiCount: number;
  maxSpeedKmh: number;
  rightLaneOffset: number;
  trafficCars: string[];
  trafficPackIds?: string[];
  welcomeMessage?: string;
}

export const DEFAULT_TRAFFIC_CONFIG: TrafficConfig = {
  maxAiPerPlayer: 6,
  aiDensity: 20,
  maxAiCount: 60,
  maxSpeedKmh: 110,
  rightLaneOffset: 0.5,
  trafficCars: [],
  trafficPackIds: [],
  welcomeMessage: 'Sunucuya hoş geldiniz! Keyifli sürüşler.',
};

export function slugify(input: string): string {
  const trMap: Record<string, string> = {
    ç: 'c',
    ğ: 'g',
    ı: 'i',
    ö: 'o',
    ş: 's',
    ü: 'u',
    Ç: 'c',
    Ğ: 'g',
    İ: 'i',
    Ö: 'o',
    Ş: 's',
    Ü: 'u',
  };
  const replaced = input
    .split('')
    .map((ch) => trMap[ch] ?? ch)
    .join('');
  return (
    replaced
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'sunucu'
  );
}

export function safeJsonParse<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getTemplate(templateId: string): ServerTemplateDefinition {
  return SERVER_TEMPLATES.find((t) => t.id === templateId) || SERVER_TEMPLATES[0];
}

export function getAiSlotCount(server: ServerRecord, trafficConfig?: TrafficConfig): number {
  if (server.engine !== 'assettoserver' || !server.traffic_enabled) {
    return 0;
  }
  const tCfg = { ...DEFAULT_TRAFFIC_CONFIG, ...trafficConfig };
  return Math.min(Math.max(4, tCfg.maxAiCount || 20), 120);
}

export function generateServerCfgIni(params: {
  server: ServerRecord;
  carIds: string[];
  publicIp: string;
  panelPort: number;
  trafficConfig?: TrafficConfig;
}): string {
  const { server, carIds, trafficConfig } = params;
  const tpl = getTemplate(server.template);
  const carsList = carIds.length > 0 ? carIds.join(';') : 'ks_bmw_m3_e30';
  const trackId = server.track_id || 'monza';
  const playerSlots = Math.max(1, server.max_clients || 16);
  const aiSlots = getAiSlotCount(server, trafficConfig);
  const totalMaxClients = playerSlots + aiSlots;

  const lines: string[] = [
    '[SERVER]',
    `NAME=${server.name}`,
    `CARS=${carsList}`,
    `CONFIG_TRACK=${server.track_config || ''}`,
    `TRACK=${trackId}`,
    `SUN_ANGLE=48`,
    `PASSWORD=${server.password || ''}`,
    `ADMIN_PASSWORD=${server.admin_password || 'admin123'}`,
    `UDP_PORT=${server.udp_port}`,
    `TCP_PORT=${server.tcp_port}`,
    `HTTP_PORT=${server.http_port}`,
    `MAX_BALLAST_KG=0`,
    `QUALIFY_MAX_WAIT_PERC=120`,
    `RACE_PIT_WINDOW_START=0`,
    `RACE_PIT_WINDOW_END=0`,
    `REVERSED_GRID_RACE_POSITIONS=0`,
    `LOCKED_ENTRY_LIST=0`,
    `PICKUP_MODE_ENABLED=1`,
    `LOOP_MODE=1`,
    `SLEEP_TIME=1`,
    `CLIENT_SEND_INTERVAL_HZ=18`,
    `SEND_BUFFER_SIZE=0`,
    `RECV_BUFFER_SIZE=0`,
    `RACE_OVER_TIME=180`,
    `KICK_QUORUM=85`,
    `VOTING_QUORUM=80`,
    `VOTE_DURATION=20`,
    `BLACKLIST_MODE=1`,
    `FUEL_RATE=${tpl.fuelRate}`,
    `DAMAGE_MULTIPLIER=${tpl.damageMultiplier}`,
    `TYRE_WEAR_RATE=${tpl.tireWearRate}`,
    `ALLOWED_TYRES_OUT=4`,
    `ABS_ALLOWED=${tpl.absAllowed}`,
    `TC_ALLOWED=${tpl.tcAllowed}`,
    `STABILITY_ALLOWED=${tpl.stabilityAllowed}`,
    `AUTOCLUTCH_ALLOWED=1`,
    `TYRE_BLANKETS_ALLOWED=${tpl.tireBlankets}`,
    `FORCE_VIRTUAL_MIRROR=0`,
    `REGISTER_TO_LOBBY=${server.register_to_lobby ? 1 : 0}`,
    `MAX_CLIENTS=${totalMaxClients}`,
    `UDP_PLUGIN_LOCAL_PORT=0`,
    `UDP_PLUGIN_ADDRESS=`,
    `AUTH_PLUGIN_ADDRESS=`,
    `LEGAL_TYRES=`,
    `WELCOME_MESSAGE=cfg/welcome.txt`,
    `START_RULE=0`,
    `RACE_GAS_PENALTY_DISABLED=1`,
    `TIME_OF_DAY_MULTIPLIER=1`,
    `RESULT_SCREEN_TIME=60`,
    `MAX_CONTACTS_PER_KM=-1`,
    `DISABLE_DRIFT_MODE=${tpl.sessionType === 'drift' ? 0 : 1}`,
    '',
  ];

  if (tpl.sessionType === 'race') {
    lines.push(
      '[PRACTICE]',
      'NAME=Antrenman',
      'TIME=15',
      'IS_OPEN=1',
      '',
      '[QUALIFY]',
      'NAME=Siralama',
      'TIME=15',
      'IS_OPEN=1',
      '',
      '[RACE]',
      'NAME=Yaris',
      'LAPS=10',
      'WAIT_TIME=60',
      'IS_OPEN=1',
      ''
    );
  } else {
    lines.push(
      '[PRACTICE]',
      `NAME=${tpl.sessionType === 'drift' ? 'Drift' : 'Freeroam'}`,
      'TIME=480',
      'IS_OPEN=1',
      ''
    );
  }

  lines.push(
    '[DYNAMIC_TRACK]',
    'SESSION_START=98',
    'RANDOMNESS=1',
    'SESSION_TRANSFER=95',
    'LAP_GAIN=10',
    '',
    '[WEATHER_0]',
    'GRAPHICS=3_clear',
    'BASE_TEMPERATURE_AMBIENT=24',
    'BASE_TEMPERATURE_ROAD=30',
    'VARIATION_AMBIENT=2',
    'VARIATION_ROAD=2',
    'WIND_BASE_SPEED_MIN=2',
    'WIND_BASE_SPEED_MAX=8',
    'WIND_BASE_DIRECTION=45',
    'WIND_VARIATION_DIRECTION=15',
    ''
  );

  return lines.join('\n');
}

export function generateEntryListIni(params: {
  server: ServerRecord;
  cars: CarRecord[];
  trafficCars?: CarRecord[];
  trafficConfig?: TrafficConfig;
}): string {
  const { server, cars, trafficCars, trafficConfig } = params;
  const maxSlots = Math.max(1, server.max_clients || 16);
  const effectiveCars =
    cars.length > 0
      ? cars
      : [
          {
            id: 'ks_bmw_m3_e30',
            skins_json: '[]',
          } as CarRecord,
        ];

  const blocks: string[] = [];
  let idx = 0;

  // Player slots distributed evenly across player cars & available skins
  for (let i = 0; i < maxSlots; i++) {
    const car = effectiveCars[i % effectiveCars.length];
    const skins = safeJsonParse<string[]>(car.skins_json, []);
    const skin = skins.length > 0 ? skins[Math.floor(i / effectiveCars.length) % skins.length] : '';
    blocks.push(
      [
        `[CAR_${idx}]`,
        `MODEL=${car.id}`,
        `SKIN=${skin}`,
        'SPECTATOR_MODE=0',
        'DRIVERNAME=',
        'TEAM=',
        'GUID=',
        'BALLAST=0',
        'RESTRICTOR=0',
        ...(server.engine === 'assettoserver' && server.traffic_enabled ? ['AI=none'] : []),
        '',
      ].join('\n')
    );
    idx++;
  }

  // AssettoServer AI traffic slots (separate traffic pool if provided, otherwise fallback to player cars)
  const aiSlotCount = getAiSlotCount(server, trafficConfig);
  if (aiSlotCount > 0) {
    const tCfg = { ...DEFAULT_TRAFFIC_CONFIG, ...trafficConfig };
    const allCarRecords = [...effectiveCars, ...(trafficCars || [])];
    const aiPool: string[] =
      trafficCars && trafficCars.length > 0
        ? trafficCars.map((c) => c.id)
        : tCfg.trafficCars && tCfg.trafficCars.length > 0
          ? tCfg.trafficCars
          : effectiveCars.map((c) => c.id);

    for (let j = 0; j < aiSlotCount; j++) {
      const modelId = aiPool[j % aiPool.length];
      const matchedCar = allCarRecords.find((c) => c.id === modelId);
      const skins = matchedCar ? safeJsonParse<string[]>(matchedCar.skins_json, []) : [];
      const skin = skins.length > 0 ? skins[j % skins.length] : '';
      blocks.push(
        [
          `[CAR_${idx}]`,
          `MODEL=${modelId}`,
          `SKIN=${skin}`,
          'SPECTATOR_MODE=0',
          'DRIVERNAME=Traffic',
          'TEAM=',
          'GUID=',
          'BALLAST=0',
          'RESTRICTOR=0',
          'AI=fixed',
          '',
        ].join('\n')
      );
      idx++;
    }
  }

  return blocks.join('\n');
}

export function generateExtraCfgYml(params: {
  server: ServerRecord;
  trafficConfig?: TrafficConfig;
  publicIp: string;
  panelPort: number;
  overrideYml?: string;
}): string {
  const { server, publicIp, panelPort, overrideYml } = params;
  const joinPortalUrl = `http://${publicIp}:${panelPort}/join/${server.slug}`;

  const baseConfig: Record<string, unknown> = {
    EnableAi: Boolean(server.traffic_enabled),
    EnableClientMessages: true,
    EnableServerDetails: true,
    ServerDescription: server.description
      ? `${server.description} | Modlar: ${joinPortalUrl}`
      : `Mod indirme ve sunucu bilgileri: ${joinPortalUrl}`,
    IgnoreConfigurationErrors: {
      MissingCarChecksums: true,
      MissingTrackParams: true,
      WrongServerDetails: true,
    },
  };

  if (server.traffic_enabled) {
    baseConfig.AiParams = {
      PlayerRadiusMeters: 500,
      PlayerPositionOffsetMeters: 100,
      MinAiSafetyDistanceMeters: 15,
      MaxAiSafetyDistanceMeters: 50,
    };
  }

  if (overrideYml && overrideYml.trim().length > 0) {
    try {
      const parsed = yaml.load(overrideYml);
      if (parsed && typeof parsed === 'object') {
        return yaml.dump({ ...baseConfig, ...(parsed as Record<string, unknown>) }, { lineWidth: 120 });
      }
    } catch {
      return `${yaml.dump(baseConfig, { lineWidth: 120 })}\n# Pack Extra YAML:\n${overrideYml}\n`;
    }
  }

  return yaml.dump(baseConfig, { lineWidth: 120 });
}

export function generateCspExtraOptionsIni(params: {
  server: ServerRecord;
  track: TrackRecord | null;
  cars: CarRecord[];
  publicIp: string;
  panelPort: number;
  extraSnippet?: string;
}): string {
  const { server, track, cars, publicIp, panelPort, extraSnippet } = params;
  const baseUrl = `http://${publicIp}:${panelPort}`;
  const lines: string[] = [
    '[EXTRA_RULES]',
    'ALLOW_WRONG_WAY = 1',
    'NO_BACK_TO_PITS_PENALTY = 1',
    '',
    '[CUSTOM_COLOR_GRADING]',
    'ENABLED = 0',
    '',
  ];

  if (server.cm_autodownload) {
    // Content Manager missing content auto-download mapping
    lines.push('[MISSING_CONTENT]');
    if (track && !track.is_kunos && track.download_path) {
      lines.push(`TRACK_${track.id} = ${baseUrl}/api/public/dl/track/${encodeURIComponent(track.id)}`);
    }
    for (const car of cars) {
      if (!car.is_kunos && car.download_path) {
        lines.push(`CAR_${car.id} = ${baseUrl}/api/public/dl/car/${encodeURIComponent(car.id)}`);
      }
    }
    lines.push(`BUNDLE_URL = ${baseUrl}/api/public/dl/server/${encodeURIComponent(server.slug)}/bundle`);
    lines.push(`JOIN_PORTAL = ${baseUrl}/join/${encodeURIComponent(server.slug)}`);
    lines.push('');
  }

  if (extraSnippet && extraSnippet.trim().length > 0) {
    lines.push('; Pack CSP Extra Options', extraSnippet.trim(), '');
  }

  return lines.join('\n');
}

export function generateJoinLinks(params: {
  server: ServerRecord;
  publicIp: string;
  panelPort: number;
}) {
  const { server, publicIp, panelPort } = params;
  const ip = publicIp || '127.0.0.1';
  const port = panelPort || 5829;
  const query = new URLSearchParams({
    ip,
    httpPort: String(server.http_port),
  });
  if (server.password) {
    query.set('password', server.password);
  }
  return {
    portalUrl: `http://${ip}:${port}/join/${server.slug}`,
    cmDirectLink: `acmanager://race/online/join?${query.toString()}`,
    bundleDownloadUrl: `http://${ip}:${port}/api/public/dl/server/${server.slug}/bundle`,
  };
}

export function generateFirewallCommands(udpPort: number, tcpPort: number, httpPort: number) {
  const rules = new Set<string>();
  rules.add(`sudo ufw allow ${udpPort}/udp`);
  rules.add(`sudo ufw allow ${tcpPort}/tcp`);
  rules.add(`sudo ufw allow ${httpPort}/tcp`);
  const list = Array.from(rules);
  return {
    commands: list,
    oneLiner: list.join(' && '),
  };
}
