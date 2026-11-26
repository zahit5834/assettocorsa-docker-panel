export interface UserInfo {
  id: number;
  username: string;
}

export interface CarCompatibilityWarning {
  code: 'server_locked' | 'csp_script' | 'missing_data_acd' | 'missing_collider';
  severity: 'error' | 'warning';
  message: string;
}

export interface CarItem {
  id: string;
  name: string;
  brand: string;
  car_class: string;
  specs: Record<string, unknown>;
  skins: string[];
  is_kunos: boolean;
  is_traffic: boolean;
  warnings: CarCompatibilityWarning[];
  version: string;
  sha256: string;
  download_path: string;
  download_size: number;
  has_preview: boolean;
  created_at: string;
}

export interface TrackItem {
  id: string;
  name: string;
  country: string;
  city: string;
  length: string;
  pitboxes: number;
  layouts: string[];
  has_ai_spline: boolean;
  is_kunos: boolean;
  version: string;
  sha256: string;
  download_path: string;
  download_size: number;
  has_preview: boolean;
  created_at: string;
}

export interface PackItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: 'mixed' | 'cars' | 'tracks' | 'traffic' | 'drift';
  car_ids: string[];
  track_ids: string[];
  extra_cfg_yml: string;
  csp_extra_options: string;
  version: string;
  sha256: string;
  download_path: string;
  download_size: number;
  created_at: string;
}

export interface ServerTemplate {
  id: string;
  name: string;
  description: string;
  defaultEngine: 'assettoserver' | 'vanilla';
  trafficEnabled: boolean;
  maxClients: number;
  sessionType: string;
}

export interface ServerItem {
  id: string;
  slug: string;
  name: string;
  engine: 'assettoserver' | 'vanilla';
  udp_port: number;
  tcp_port: number;
  http_port: number;
  password: string;
  admin_password: string;
  max_clients: number;
  track_id: string;
  track_config: string;
  car_ids: string[];
  pack_ids: string[];
  traffic_enabled: boolean;
  traffic_config: {
    maxAiPerPlayer: number;
    aiDensity: number;
    maxAiCount: number;
    maxAiTargetCount?: number;
    maxSpeedKmh: number;
    rightLaneOffset: number;
    rightLaneOffsetKph?: number;
    laneWidthMeters?: number;
    playerRadiusMeters?: number;
    playerPositionOffsetMeters?: number;
    minSpawnDistancePoints?: number;
    maxSpawnDistancePoints?: number;
    maxPlayerDistanceMeters?: number;
    minSafetyDistanceMeters?: number;
    maxSafetyDistanceMeters?: number;
    stateSpawnDistanceMeters?: number;
    twoWayTraffic?: boolean;
    overtakeEnabled?: boolean;
    overtakeMinSpeedKmh?: number;
    driftHudEnabled?: boolean;
    customScriptUrl?: string;
    trafficCars: string[];
    trafficPackIds?: string[];
    welcomeMessage?: string;
  };
  template: string;
  description: string;
  rules_text: string;
  banner_url: string;
  weather_preset: string;
  time_of_day: string;
  time_multiplier: number;
  cm_autodownload: boolean;
  register_to_lobby: boolean;
  bundle_sha256: string;
  bundle_size: number;
  memory_limit_mb: number;
  cpu_limit: number;
  effective_track: { id: string; name: string; layouts: string[] } | null;
  effective_car_count: number;
  runtime: {
    state: string;
    running: boolean;
    containerName: string;
    containerId: string;
    startedAt?: string;
    cpuPercent?: number;
    memoryUsageMb?: number;
    memoryLimitMb?: number;
  };
  live: {
    reachable: boolean;
    clients?: number;
    maxClients?: number;
    players: Array<{ name: string; car: string; skin: string; connected: boolean }>;
  };
  joinLinks: {
    portalUrl: string;
    cmDirectLink: string;
    bundleDownloadUrl: string;
  };
  firewall: {
    commands: string[];
    oneLiner: string;
  };
}

export interface SystemOverview {
  counts: {
    servers: number;
    runningServers: number;
    totalPlayers: number;
    cars: number;
    tracks: number;
    packs: number;
  };
  host: {
    hostname: string;
    platform: string;
    cpus: number;
    loadAvg: number[];
    uptimeSec: number;
    totalMemMb: number;
    usedMemMb: number;
    diskTotalGb: number;
    diskFreeGb: number;
    diskUsedGb: number;
  };
  engines: {
    dockerAvailable: boolean;
    assettoserver: { image: string; imageReady: boolean };
    vanilla: { image: string; imageReady: boolean; binaryReady: boolean; binarySize: number };
  };
  settings: Record<string, string>;
}

export interface OvertakeScoreItem {
  id?: number;
  driver_name: string;
  car_id: string;
  score: number;
  max_combo: number;
  max_speed_kmh: number;
  overtakes: number;
  updated_at: string;
}

export interface DriftScoreItem {
  id?: number;
  driver_name: string;
  car_id: string;
  score: number;
  max_combo: number;
  max_angle_deg: number;
  transitions: number;
  updated_at: string;
}

export interface PublicJoinPayload {
  server: {
    id: string;
    slug: string;
    name: string;
    engine: 'assettoserver' | 'vanilla';
    template: string;
    description: string;
    rules?: string;
    bannerUrl?: string;
    weatherPreset?: string;
    timeOfDay?: string;
    hasPassword: boolean;
    maxClients: number;
    udpPort: number;
    tcpPort: number;
    httpPort: number;
    trafficEnabled: boolean;
    overtakeEnabled?: boolean;
    driftHudEnabled?: boolean;
    cmAutodownload: boolean;
    publicIp: string;
    panelPort: number;
    joinLinks: {
      portalUrl: string;
      cmDirectLink: string;
      bundleDownloadUrl: string;
    };
  };
  status: {
    running: boolean;
    state: string;
    onlinePlayers: number;
    maxClients: number;
    players: Array<{ name: string; car: string; skin: string }>;
  };
  track: {
    id: string;
    name: string;
    layout: string;
    country: string;
    city: string;
    length: string;
    pitboxes: number;
    is_kunos: boolean;
    version: string;
    sha256: string;
    downloadSize: number;
    downloadUrl: string | null;
    previewUrl: string | null;
  } | null;
  cars: Array<{
    id: string;
    name: string;
    brand: string;
    carClass: string;
    skinsCount: number;
    is_kunos: boolean;
    isTrafficOnly?: boolean;
    version: string;
    sha256: string;
    downloadSize: number;
    downloadUrl: string | null;
    previewUrl: string | null;
  }>;
  packs: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    version: string;
    sha256: string;
    downloadSize: number;
    downloadUrl: string | null;
  }>;
  leaderboard?: OvertakeScoreItem[];
  driftLeaderboard?: DriftScoreItem[];
  bundle: {
    available: boolean;
    downloadableCount: number;
    totalEstimatedSize: number;
    cachedSize: number;
    sha256: string;
    downloadUrl: string;
  };
}

const TOKEN_KEY = 'ac_panel_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && !url.includes('/api/auth/login') && !url.includes('/api/public/')) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Oturum süresi doldu.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `İstek başarısız (${res.status})`);
  }
  return data as T;
}

export function uploadWithProgress<T = unknown>(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    const token = getToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(json as T);
        } else {
          reject(new Error(json.error || `Yükleme hatası (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Yükleme hatası (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Ağ bağlantısı kesildi.'));
    xhr.send(formData);
  });
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(idx === 0 ? 0 : val >= 100 ? 0 : 1)} ${units[idx]}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  }
}
