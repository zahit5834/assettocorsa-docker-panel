import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  generateCspExtraOptionsIni,
  generateEntryListIni,
  generateExtraCfgYml,
  generateFirewallCommands,
  generateJoinLinks,
  generateServerCfgIni,
  slugify,
} from './configGenerator.js';
import {
  createCmArchive,
  createMultiContentBundleZip,
  detectTrafficCar,
  isPathInside,
  parseRelaxedJson,
  scanExtractedDirectory,
} from './contentScanner.js';
import { getDb, type CarRecord, type ServerRecord, type TrackRecord } from './db.js';
import { stripDockerMultiplexHeaders } from './dockerManager.js';
import { checkPortConflicts, suggestAvailablePorts } from './serverService.js';

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-panel-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const d = tempDirs.pop()!;
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe('configGenerator', () => {
  const mockServer: ServerRecord = {
    id: 'srv-1',
    slug: 'shutoko-trafik',
    name: 'Shutoko Trafik TR',
    engine: 'assettoserver',
    udp_port: 9610,
    tcp_port: 9610,
    http_port: 8085,
    password: 'drift',
    admin_password: 'secret',
    max_clients: 16,
    track_id: 'shuto_revival_project_beta',
    track_config: 'shibaura_pa',
    car_ids_json: '["bmw_m3_e92","nissan_gtr"]',
    pack_ids_json: '[]',
    traffic_enabled: 1,
    traffic_config_json: '{"maxAiCount":10,"maxSpeedKmh":130}',
    template: 'freeroam_traffic',
    description: 'TR Freeroam',
    cm_autodownload: 1,
    register_to_lobby: 0,
    bundle_sha256: '',
    bundle_size: 0,
    container_id: '',
    memory_limit_mb: 0,
    cpu_limit: 0,
    created_at: '',
    updated_at: '',
  };

  it('slugifies Turkish characters cleanly', () => {
    expect(slugify('İstanbul Şutoko Trafik #1')).toBe('istanbul-sutoko-trafik-1');
  });

  it('generates server_cfg.ini with custom ports, AI-inclusive MAX_CLIENTS, and welcome message', () => {
    const ini = generateServerCfgIni({
      server: mockServer,
      carIds: ['bmw_m3_e92', 'nissan_gtr'],
      publicIp: '185.10.20.30',
      panelPort: 5829,
      trafficConfig: {
        maxAiPerPlayer: 4,
        aiDensity: 20,
        maxAiCount: 10,
        maxSpeedKmh: 120,
        rightLaneOffset: 0.5,
        trafficCars: [],
      },
    });
    expect(ini).toContain('UDP_PORT=9610');
    expect(ini).toContain('TCP_PORT=9610');
    expect(ini).toContain('HTTP_PORT=8085');
    expect(ini).toContain('MAX_CLIENTS=26');
    expect(ini).toContain('CARS=bmw_m3_e92;nissan_gtr');
    expect(ini).toContain('TRACK=shuto_revival_project_beta');
    expect(ini).toContain('CONFIG_TRACK=shibaura_pa');
    expect(ini).toContain('WELCOME_MESSAGE=cfg/welcome.txt');
    expect(ini).toContain('LEGAL_TYRES=');
  });

  it('generates entry_list.ini with player slots and AI=fixed slots for AssettoServer', () => {
    const cars: CarRecord[] = [
      {
        id: 'bmw_m3_e92',
        name: 'BMW M3',
        brand: 'BMW',
        car_class: 'street',
        specs_json: '{}',
        skins_json: '["black","white"]',
        is_kunos: 0,
        is_traffic: 0,
        version: '1.0',
        sha256: 'abc',
        download_path: 'downloads/cars/bmw_m3_e92.zip',
        download_size: 100,
        has_preview: 0,
        created_at: '',
      },
    ];
    const trafficCar: CarRecord = {
      id: 'traffic_van_ai',
      name: 'Traffic Van',
      brand: 'Traffic',
      car_class: 'traffic',
      specs_json: '{}',
      skins_json: '["white"]',
      is_kunos: 0,
      is_traffic: 1,
      version: '1.0',
      sha256: 'xyz',
      download_path: 'downloads/cars/traffic_van_ai.zip',
      download_size: 50,
      has_preview: 0,
      created_at: '',
    };
    const entry = generateEntryListIni({
      server: mockServer,
      cars,
      trafficCars: [trafficCar],
      trafficConfig: {
        maxAiPerPlayer: 4,
        aiDensity: 20,
        maxAiCount: 8,
        maxSpeedKmh: 120,
        rightLaneOffset: 0.5,
        trafficCars: ['traffic_van_ai'],
      },
    });
    expect(entry).toContain('[CAR_0]\nMODEL=bmw_m3_e92');
    expect(entry).toContain('[CAR_16]\nMODEL=traffic_van_ai');
    expect(entry).toContain('AI=fixed');
    // Player slots must NOT get the traffic-only car
    expect(entry.split('[CAR_16]')[0]).not.toContain('MODEL=traffic_van_ai');
  });

  it('generates extra_cfg.yml and csp_extra_options.ini with VDS download URLs', () => {
    const yml = generateExtraCfgYml({
      server: mockServer,
      publicIp: '185.10.20.30',
      panelPort: 5829,
    });
    expect(yml).toContain('EnableAi: true');
    expect(yml).toContain('http://185.10.20.30:5829/join/shutoko-trafik');
    expect(yml).toContain('MissingCarChecksums: true');
    expect(yml).not.toContain('IgnoreConfigurationErrors: true');

    const track: TrackRecord = {
      id: 'shuto_revival_project_beta',
      name: 'Shutoko',
      country: 'Japan',
      city: 'Tokyo',
      length: '180000',
      pitboxes: 32,
      layouts_json: '["shibaura_pa"]',
      has_ai_spline: 1,
      is_kunos: 0,
      version: '0.9',
      sha256: 'def',
      download_path: 'downloads/tracks/shuto.zip',
      download_size: 200,
      has_preview: 0,
      created_at: '',
    };
    const csp = generateCspExtraOptionsIni({
      server: mockServer,
      track,
      cars: [],
      publicIp: '185.10.20.30',
      panelPort: 5829,
    });
    expect(csp).toContain('http://185.10.20.30:5829/api/public/dl/track/shuto_revival_project_beta');
    expect(csp).toContain('http://185.10.20.30:5829/api/public/dl/server/shutoko-trafik/bundle');
  });

  it('generates direct Content Manager join links and ufw firewall commands', () => {
    const links = generateJoinLinks({
      server: mockServer,
      publicIp: '185.10.20.30',
      panelPort: 5829,
    });
    expect(links.portalUrl).toBe('http://185.10.20.30:5829/join/shutoko-trafik');
    expect(links.cmDirectLink).toContain('acmanager://race/online/join?');
    expect(links.cmDirectLink).toContain('ip=185.10.20.30');
    expect(links.cmDirectLink).toContain('httpPort=8085');

    const fw = generateFirewallCommands(9610, 9610, 8085);
    expect(fw.oneLiner).toContain('sudo ufw allow 9610/udp');
    expect(fw.oneLiner).toContain('sudo ufw allow 9610/tcp');
    expect(fw.oneLiner).toContain('sudo ufw allow 8085/tcp');
  });
});

describe('contentScanner & archive packaging', () => {
  it('blocks Zip Slip path traversal', () => {
    const base = makeTempDir();
    expect(isPathInside(base, path.join(base, 'content', 'cars', 'test'))).toBe(true);
    expect(isPathInside(base, path.join(base, '..', 'etc', 'passwd'))).toBe(false);
  });

  it('parses AC mod JSON with BOM and trailing commas', () => {
    const dir = makeTempDir();
    const f = path.join(dir, 'ui_car.json');
    fs.writeFileSync(f, '\uFEFF{"name": "Supra MK4", "brand": "Toyota",}', 'utf8');
    const parsed = parseRelaxedJson<{ name: string; brand: string }>(f);
    expect(parsed?.name).toBe('Supra MK4');
    expect(parsed?.brand).toBe('Toyota');
  });

  it('auto-detects AI traffic / NPC cars without false positives on regular car names', () => {
    // Positive detections (folder id & ui_car.json)
    expect(detectTrafficCar('srp_traffic_honda_fit', null)).toBe(true);
    expect(detectTrafficCar('a3pp_ai_civic', null)).toBe(true);
    expect(detectTrafficCar('npc_delivery_van', null)).toBe(true);
    expect(detectTrafficCar('custom_sedan', { name: 'Toyota Prius (AI)' })).toBe(true);
    expect(detectTrafficCar('custom_sedan', { tags: ['street', 'traffic'] })).toBe(true);
    expect(detectTrafficCar('custom_sedan', { class: 'NPC' })).toBe(true);

    // Negative cases (must NOT false-positive on "ferrari", "fairlady", "cayman", "air")
    expect(detectTrafficCar('ferrari_458_gt2', { name: 'Ferrari 458 GT2', brand: 'Ferrari' })).toBe(
      false
    );
    expect(
      detectTrafficCar('nissan_fairlady_z', { name: 'Nissan Fairlady Z', brand: 'Nissan' })
    ).toBe(false);
    expect(detectTrafficCar('ks_porsche_cayman_gt4', { name: 'Porsche Cayman GT4' })).toBe(false);
  });

  it('detects nested cars, multi-layout tracks with AI splines, and creates CM-ready zips', async () => {
    const root = makeTempDir();
    // Create fake car
    const carDir = path.join(root, 'pack', 'content', 'cars', 'toyota_supra_mk4');
    fs.mkdirSync(path.join(carDir, 'ui'), { recursive: true });
    fs.mkdirSync(path.join(carDir, 'skins', '01_red'), { recursive: true });
    fs.writeFileSync(
      path.join(carDir, 'ui', 'ui_car.json'),
      JSON.stringify({ name: 'Toyota Supra MK4', brand: 'Toyota', class: 'street' })
    );
    fs.writeFileSync(path.join(carDir, 'data.acd'), 'fake-acd');

    // Create fake multi-layout track with AI spline
    const trackDir = path.join(root, 'pack', 'content', 'tracks', 'shutoko_srp');
    fs.mkdirSync(path.join(trackDir, 'ui', 'shibaura_pa'), { recursive: true });
    fs.mkdirSync(path.join(trackDir, 'shibaura_pa', 'ai'), { recursive: true });
    fs.writeFileSync(
      path.join(trackDir, 'ui', 'shibaura_pa', 'ui_track.json'),
      JSON.stringify({ name: 'Shutoko SRP', country: 'Japan', pitboxes: '32' })
    );
    fs.writeFileSync(path.join(trackDir, 'shibaura_pa', 'ai', 'fast_lane.ai'), 'spline');

    const result = scanExtractedDirectory(root);
    expect(result.cars).toHaveLength(1);
    expect(result.cars[0].id).toBe('toyota_supra_mk4');
    expect(result.cars[0].skins).toEqual(['01_red']);

    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].id).toBe('shutoko_srp');
    expect(result.tracks[0].layouts).toEqual(['shibaura_pa']);
    expect(result.tracks[0].hasAiSpline).toBe(true);
    expect(result.tracks[0].pitboxes).toBe(32);

    const outZip = path.join(root, 'out-car.zip');
    const pkg = await createCmArchive({
      type: 'car',
      id: 'toyota_supra_mk4',
      sourceDir: carDir,
      outZipPath: outZip,
    });
    expect(pkg.size).toBeGreaterThan(50);
    expect(pkg.sha256).toHaveLength(64);

    // Test bundle zip builder
    const dataRoot = makeTempDir();
    fs.cpSync(carDir, path.join(dataRoot, 'library', 'cars', 'toyota_supra_mk4'), { recursive: true });
    fs.cpSync(trackDir, path.join(dataRoot, 'library', 'tracks', 'shutoko_srp'), { recursive: true });
    const bundleOut = path.join(dataRoot, 'downloads', 'bundles', 'test-bundle.zip');
    const bundle = await createMultiContentBundleZip({
      outZipPath: bundleOut,
      carIds: ['toyota_supra_mk4'],
      trackIds: ['shutoko_srp'],
      title: 'Test Server',
      dataDir: dataRoot,
    });
    expect(bundle.includedCars).toEqual(['toyota_supra_mk4']);
    expect(bundle.includedTracks).toEqual(['shutoko_srp']);
    expect(bundle.size).toBeGreaterThan(100);
  });
});

describe('port conflict detection & docker log parsing', () => {
  it('detects panel port and duplicate server port conflicts', () => {
    const db = getDb(':memory:');
    // Conflict with panel port 5829
    const c1 = checkPortConflicts(db, { udp_port: 9600, tcp_port: 9600, http_port: 5829 });
    expect(c1.conflict).toBe(true);

    // Valid ports
    const c2 = checkPortConflicts(db, { udp_port: 9600, tcp_port: 9600, http_port: 8081 });
    expect(c2.conflict).toBe(false);

    db.prepare(
      `INSERT INTO servers (id, slug, name, engine, udp_port, tcp_port, http_port)
       VALUES ('s1', 'srv1', 'Server 1', 'assettoserver', 9600, 9600, 8081)`
    ).run();

    const c3 = checkPortConflicts(db, { udp_port: 9600, tcp_port: 9601, http_port: 8082 });
    expect(c3.conflict).toBe(true);

    const suggested = suggestAvailablePorts(db);
    expect(suggested.udp_port).toBe(9601);
    expect(suggested.http_port).toBe(8082);
  });

  it('strips Docker multiplexed stdout/stderr headers cleanly', () => {
    const payload = Buffer.from('Hello AC Server\n', 'utf8');
    const header = Buffer.alloc(8);
    header[0] = 1;
    header.writeUInt32BE(payload.length, 4);
    const frame = Buffer.concat([header, payload]);
    expect(stripDockerMultiplexHeaders(frame)).toBe('Hello AC Server\n');
  });
});
