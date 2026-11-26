import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { config, ensureDataDirectories } from './config.js';

export interface CarRecord {
  id: string;
  name: string;
  brand: string;
  car_class: string;
  specs_json: string;
  skins_json: string;
  is_kunos: number;
  is_traffic: number;
  warnings_json: string;
  version: string;
  sha256: string;
  download_path: string;
  download_size: number;
  has_preview: number;
  created_at: string;
}

export interface TrackRecord {
  id: string;
  name: string;
  country: string;
  city: string;
  length: string;
  pitboxes: number;
  layouts_json: string;
  has_ai_spline: number;
  is_kunos: number;
  version: string;
  sha256: string;
  download_path: string;
  download_size: number;
  has_preview: number;
  created_at: string;
}

export interface PackRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  car_ids_json: string;
  track_ids_json: string;
  extra_cfg_yml: string;
  csp_extra_options: string;
  server_preset_json: string;
  version: string;
  sha256: string;
  download_path: string;
  download_size: number;
  created_at: string;
  updated_at: string;
}

export interface OvertakeScoreRecord {
  id: number;
  server_id: string;
  driver_name: string;
  car_id: string;
  score: number;
  max_combo: number;
  max_speed_kmh: number;
  overtakes: number;
  updated_at: string;
}

export interface ServerRecord {
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
  car_ids_json: string;
  pack_ids_json: string;
  traffic_enabled: number;
  traffic_config_json: string;
  template: string;
  description: string;
  rules_text: string;
  banner_url: string;
  weather_preset: string;
  time_of_day: string;
  time_multiplier: number;
  cm_autodownload: number;
  register_to_lobby: number;
  bundle_sha256: string;
  bundle_size: number;
  container_id: string;
  memory_limit_mb: number;
  cpu_limit: number;
  created_at: string;
  updated_at: string;
}

let dbInstance: DatabaseSync | null = null;

export function getDb(customDbPath?: string): DatabaseSync {
  if (dbInstance && !customDbPath) {
    return dbInstance;
  }

  let dbPath = customDbPath;
  if (!dbPath) {
    const paths = ensureDataDirectories();
    dbPath = paths.dbFile;
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  initSchema(db);

  if (!customDbPath) {
    dbInstance = db;
  }
  return db;
}

function initSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cars (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '',
      car_class TEXT NOT NULL DEFAULT 'street',
      specs_json TEXT NOT NULL DEFAULT '{}',
      skins_json TEXT NOT NULL DEFAULT '[]',
      is_kunos INTEGER NOT NULL DEFAULT 0,
      is_traffic INTEGER NOT NULL DEFAULT 0,
      warnings_json TEXT NOT NULL DEFAULT '[]',
      version TEXT NOT NULL DEFAULT '1.0',
      sha256 TEXT NOT NULL DEFAULT '',
      download_path TEXT NOT NULL DEFAULT '',
      download_size INTEGER NOT NULL DEFAULT 0,
      has_preview INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      length TEXT NOT NULL DEFAULT '',
      pitboxes INTEGER NOT NULL DEFAULT 24,
      layouts_json TEXT NOT NULL DEFAULT '[]',
      has_ai_spline INTEGER NOT NULL DEFAULT 0,
      is_kunos INTEGER NOT NULL DEFAULT 0,
      version TEXT NOT NULL DEFAULT '1.0',
      sha256 TEXT NOT NULL DEFAULT '',
      download_path TEXT NOT NULL DEFAULT '',
      download_size INTEGER NOT NULL DEFAULT 0,
      has_preview INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS packs (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'mixed',
      car_ids_json TEXT NOT NULL DEFAULT '[]',
      track_ids_json TEXT NOT NULL DEFAULT '[]',
      extra_cfg_yml TEXT NOT NULL DEFAULT '',
      csp_extra_options TEXT NOT NULL DEFAULT '',
      server_preset_json TEXT NOT NULL DEFAULT '{}',
      version TEXT NOT NULL DEFAULT '1.0',
      sha256 TEXT NOT NULL DEFAULT '',
      download_path TEXT NOT NULL DEFAULT '',
      download_size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      engine TEXT NOT NULL DEFAULT 'assettoserver',
      udp_port INTEGER NOT NULL,
      tcp_port INTEGER NOT NULL,
      http_port INTEGER NOT NULL,
      password TEXT NOT NULL DEFAULT '',
      admin_password TEXT NOT NULL DEFAULT 'admin123',
      max_clients INTEGER NOT NULL DEFAULT 24,
      track_id TEXT NOT NULL DEFAULT '',
      track_config TEXT NOT NULL DEFAULT '',
      car_ids_json TEXT NOT NULL DEFAULT '[]',
      pack_ids_json TEXT NOT NULL DEFAULT '[]',
      traffic_enabled INTEGER NOT NULL DEFAULT 0,
      traffic_config_json TEXT NOT NULL DEFAULT '{}',
      template TEXT NOT NULL DEFAULT 'freeroam_traffic',
      description TEXT NOT NULL DEFAULT '',
      rules_text TEXT NOT NULL DEFAULT '',
      banner_url TEXT NOT NULL DEFAULT '',
      weather_preset TEXT NOT NULL DEFAULT '3_clear',
      time_of_day TEXT NOT NULL DEFAULT 'noon',
      time_multiplier REAL NOT NULL DEFAULT 1,
      cm_autodownload INTEGER NOT NULL DEFAULT 1,
      register_to_lobby INTEGER NOT NULL DEFAULT 0,
      bundle_sha256 TEXT NOT NULL DEFAULT '',
      bundle_size INTEGER NOT NULL DEFAULT 0,
      container_id TEXT NOT NULL DEFAULT '',
      memory_limit_mb INTEGER NOT NULL DEFAULT 0,
      cpu_limit REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS overtake_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL,
      driver_name TEXT NOT NULL,
      car_id TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      max_combo REAL NOT NULL DEFAULT 1,
      max_speed_kmh INTEGER NOT NULL DEFAULT 0,
      overtakes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(server_id, driver_name)
    );
  `);

  // Safe schema migrations for existing databases
  try {
    const cols = db.prepare('PRAGMA table_info(servers)').all() as Array<{ name: string }>;
    const serverMigrations: Array<[string, string]> = [
      ['register_to_lobby', 'INTEGER NOT NULL DEFAULT 0'],
      ['rules_text', "TEXT NOT NULL DEFAULT ''"],
      ['banner_url', "TEXT NOT NULL DEFAULT ''"],
      ['weather_preset', "TEXT NOT NULL DEFAULT '3_clear'"],
      ['time_of_day', "TEXT NOT NULL DEFAULT 'noon'"],
      ['time_multiplier', 'REAL NOT NULL DEFAULT 1'],
    ];
    for (const [colName, colDef] of serverMigrations) {
      if (!cols.some((c) => c.name === colName)) {
        db.exec(`ALTER TABLE servers ADD COLUMN ${colName} ${colDef};`);
      }
    }
    const carCols = db.prepare('PRAGMA table_info(cars)').all() as Array<{ name: string }>;
    if (!carCols.some((c) => c.name === 'is_traffic')) {
      db.exec('ALTER TABLE cars ADD COLUMN is_traffic INTEGER NOT NULL DEFAULT 0;');
    }
    if (!carCols.some((c) => c.name === 'warnings_json')) {
      db.exec("ALTER TABLE cars ADD COLUMN warnings_json TEXT NOT NULL DEFAULT '[]';");
    }
  } catch {
    // ignore
  }

  // Seed default settings if missing
  const defaultSettings: Record<string, string> = {
    public_ip: config.vdsPublicIp,
    panel_port: String(config.panelPort),
    assettoserver_image: config.assettoServerImage,
    vanilla_ac_image: config.vanillaAcImage,
  };
  const upsertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [k, v] of Object.entries(defaultSettings)) {
    upsertSetting.run(k, v);
  }

  // Seed admin user if none exists
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
  if (userCount.cnt === 0) {
    const hash = bcrypt.hashSync(config.adminPassword, 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(
      config.adminUsername,
      hash
    );
  }
}

export function getSetting(db: DatabaseSync, key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : fallback;
}

export function setSetting(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

export function getAllSettings(db: DatabaseSync): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const result: Record<string, string> = {};
  for (const r of rows) {
    result[r.key] = r.value;
  }
  return result;
}
