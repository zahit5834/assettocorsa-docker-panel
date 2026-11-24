import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Docker from 'dockerode';
import { config, getDataPaths } from './config.js';
import type { ServerRecord } from './db.js';

export interface ContainerRuntimeStatus {
  state: 'running' | 'exited' | 'created' | 'restarting' | 'paused' | 'not_created' | 'docker_unavailable';
  running: boolean;
  containerName: string;
  containerId: string;
  startedAt?: string;
  cpuPercent?: number;
  memoryUsageMb?: number;
  memoryLimitMb?: number;
}

export interface LiveServerInfo {
  reachable: boolean;
  name?: string;
  track?: string;
  clients?: number;
  maxClients?: number;
  players: Array<{
    name: string;
    car: string;
    skin: string;
    connected: boolean;
  }>;
}

class DockerManager {
  private docker: Docker;
  private resolvedHostDataDir: string | null = null;
  private detectedNetworkName: string | null = null;

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  getContainerName(server: Pick<ServerRecord, 'slug' | 'id'>): string {
    const safeSlug = server.slug.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 36);
    const shortId = server.id.slice(0, 6);
    return `ac-srv-${safeSlug}-${shortId}`;
  }

  async isDockerAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Automatically resolves the Linux host path backing /data inside the backend container.
   * This ensures sibling AC server containers mount the exact host directories even if
   * HOST_DATA_DIR was left as a relative path like "./data".
   */
  async resolveHostDataDir(): Promise<string> {
    if (this.resolvedHostDataDir) {
      return this.resolvedHostDataDir;
    }

    if (path.isAbsolute(config.hostDataDir) && !config.hostDataDir.startsWith('./')) {
      this.resolvedHostDataDir = config.hostDataDir;
      return this.resolvedHostDataDir;
    }

    try {
      const selfId = os.hostname();
      const info = await this.docker.getContainer(selfId).inspect();
      const dataMount = info.Mounts?.find((m) => m.Destination === '/data');
      if (dataMount?.Source) {
        this.resolvedHostDataDir = dataMount.Source;
        return this.resolvedHostDataDir;
      }
    } catch {
      // Running outside Docker (e.g. local dev or tests)
    }

    this.resolvedHostDataDir = path.resolve(config.hostDataDir);
    return this.resolvedHostDataDir;
  }

  async resolvePanelNetwork(): Promise<string | null> {
    if (this.detectedNetworkName !== null) {
      return this.detectedNetworkName || null;
    }
    try {
      const selfId = os.hostname();
      const info = await this.docker.getContainer(selfId).inspect();
      const nets = Object.keys(info.NetworkSettings?.Networks || {});
      this.detectedNetworkName = nets[0] || '';
      return this.detectedNetworkName || null;
    } catch {
      this.detectedNetworkName = '';
      return null;
    }
  }

  async checkEngines(assettoServerImage: string, vanillaAcImage: string) {
    const dockerOk = await this.isDockerAvailable();
    const paths = getDataPaths();
    const vanillaBinaryPath = path.join(paths.enginesDir, 'acServer');
    const vanillaBinaryExists = fs.existsSync(vanillaBinaryPath);
    const vanillaBinarySize = vanillaBinaryExists ? fs.statSync(vanillaBinaryPath).size : 0;

    let assettoImagePresent = false;
    let vanillaImagePresent = false;

    if (dockerOk) {
      try {
        await this.docker.getImage(assettoServerImage).inspect();
        assettoImagePresent = true;
      } catch {
        assettoImagePresent = false;
      }
      try {
        await this.docker.getImage(vanillaAcImage).inspect();
        vanillaImagePresent = true;
      } catch {
        vanillaImagePresent = false;
      }
    }

    return {
      dockerAvailable: dockerOk,
      assettoserver: {
        image: assettoServerImage,
        imageReady: assettoImagePresent,
      },
      vanilla: {
        image: vanillaAcImage,
        imageReady: vanillaImagePresent,
        binaryReady: vanillaBinaryExists,
        binarySize: vanillaBinarySize,
      },
    };
  }

  async pullImage(imageName: string): Promise<{ success: boolean; message: string }> {
    const dockerOk = await this.isDockerAvailable();
    if (!dockerOk) {
      throw new Error('Docker servisine erişilemiyor (/var/run/docker.sock).');
    }

    await new Promise<void>((resolve, reject) => {
      this.docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        this.docker.modem.followProgress(stream, (finishErr: Error | null) => {
          if (finishErr) return reject(finishErr);
          resolve();
        });
      });
    });

    return { success: true, message: `${imageName} imajı başarıyla güncellendi.` };
  }

  private async ensureImagePresent(imageName: string, allowAutoPull: boolean) {
    try {
      await this.docker.getImage(imageName).inspect();
      return;
    } catch {
      if (!allowAutoPull) {
        throw new Error(
          `${imageName} Docker imajı bulunamadı. Linux VDS üzerinde 'docker compose --profile build-vanilla build vanilla-ac-builder' komutunu çalıştırın.`
        );
      }
      await this.pullImage(imageName);
    }
  }

  async createAndStartServer(
    server: ServerRecord,
    images: { assettoServerImage: string; vanillaAcImage: string }
  ): Promise<string> {
    const dockerOk = await this.isDockerAvailable();
    if (!dockerOk) {
      throw new Error('Docker Engine erişilebilir değil. Linux VDS üzerinde Docker çalıştığından emin olun.');
    }

    const hostDataDir = await this.resolveHostDataDir();
    const paths = getDataPaths();
    const serverCfgDir = path.join(paths.serversDir, server.id, 'cfg');
    const serverLogsDir = path.join(paths.serversDir, server.id, 'logs');
    const serverPluginsDir = path.join(paths.serversDir, server.id, 'plugins');
    fs.mkdirSync(serverCfgDir, { recursive: true });
    fs.mkdirSync(serverLogsDir, { recursive: true });
    fs.mkdirSync(serverPluginsDir, { recursive: true });

    const isVanilla = server.engine === 'vanilla';
    if (isVanilla) {
      const binPath = path.join(paths.enginesDir, 'acServer');
      if (!fs.existsSync(binPath)) {
        throw new Error(
          'Vanilla acServer binary dosyası yüklü değil. Lütfen Ayarlar -> Motorlar bölümünden acServer dosyasını yükleyin veya ./scripts/fetch-acserver.sh çalıştırın.'
        );
      }
    }

    const imageName = isVanilla ? images.vanillaAcImage : images.assettoServerImage;
    await this.ensureImagePresent(imageName, !isVanilla);

    // Clean up any existing container with the same name
    const containerName = this.getContainerName(server);
    await this.removeContainerByNameOrId(server.container_id || containerName);

    const binds: string[] = [
      `${path.posix.join(hostDataDir, 'servers', server.id, 'cfg')}:/data/cfg`,
      `${path.posix.join(hostDataDir, 'servers', server.id, 'logs')}:/data/logs`,
      `${path.posix.join(hostDataDir, 'servers', server.id, 'plugins')}:/data/plugins`,
      `${path.posix.join(hostDataDir, 'library', 'cars')}:/data/content/cars:ro`,
      `${path.posix.join(hostDataDir, 'library', 'tracks')}:/data/content/tracks:ro`,
    ];

    if (isVanilla) {
      binds.push(`${path.posix.join(hostDataDir, 'engines')}:/engine:ro`);
    }

    // Use host networking on Linux VDS so Assetto Corsa UDP/TCP packets bypass
    // Docker bridge NAT / docker-proxy (which otherwise causes "Connection issue"
    // disconnects a few seconds after spawning due to UDP/TCP source-IP mismatch).
    const hostConfig: Docker.HostConfig = {
      Binds: binds,
      NetworkMode: 'host',
      RestartPolicy: { Name: 'unless-stopped' },
    };

    if (server.memory_limit_mb && server.memory_limit_mb > 0) {
      hostConfig.Memory = server.memory_limit_mb * 1024 * 1024;
    }
    if (server.cpu_limit && server.cpu_limit > 0) {
      hostConfig.NanoCpus = Math.round(server.cpu_limit * 1e9);
    }

    const createOptions: Docker.ContainerCreateOptions = {
      name: containerName,
      Image: imageName,
      HostConfig: hostConfig,
      Env: [`TZ=${process.env.TZ || 'Europe/Istanbul'}`],
      Labels: {
        'ac-panel.managed': 'true',
        'ac-panel.server-id': server.id,
        'ac-panel.server-slug': server.slug,
        'ac-panel.engine': server.engine,
      },
    };

    const container = await this.docker.createContainer(createOptions);
    await container.start();
    return container.id;
  }

  async stopServer(server: ServerRecord): Promise<void> {
    const ref = server.container_id || this.getContainerName(server);
    try {
      const container = this.docker.getContainer(ref);
      const info = await container.inspect();
      if (info.State.Running) {
        await container.stop({ t: 5 });
      }
    } catch {
      // Already stopped or missing
    }
  }

  async restartServer(
    server: ServerRecord,
    images: { assettoServerImage: string; vanillaAcImage: string }
  ): Promise<string> {
    // Recreating ensures updated ports/engine/limits are always applied cleanly
    return this.createAndStartServer(server, images);
  }

  async removeContainerByNameOrId(ref: string): Promise<void> {
    if (!ref) return;
    try {
      const container = this.docker.getContainer(ref);
      const info = await container.inspect();
      if (info.State.Running) {
        await container.stop({ t: 3 }).catch(() => undefined);
      }
      await container.remove({ force: true });
    } catch {
      // Container does not exist
    }
  }

  async getContainerStatus(server: ServerRecord, includeStats = false): Promise<ContainerRuntimeStatus> {
    const containerName = this.getContainerName(server);
    const dockerOk = await this.isDockerAvailable();
    if (!dockerOk) {
      return {
        state: 'docker_unavailable',
        running: false,
        containerName,
        containerId: server.container_id || '',
      };
    }

    const ref = server.container_id || containerName;
    try {
      const container = this.docker.getContainer(ref);
      const info = await container.inspect();
      const rawState = (info.State.Status || 'exited') as ContainerRuntimeStatus['state'];
      const status: ContainerRuntimeStatus = {
        state: rawState,
        running: Boolean(info.State.Running),
        containerName: info.Name.replace(/^\//, ''),
        containerId: info.Id,
        startedAt: info.State.StartedAt,
      };

      if (includeStats && status.running) {
        try {
          const stats = (await container.stats({ stream: false })) as unknown as {
            cpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number; online_cpus?: number };
            precpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number };
            memory_stats?: { usage?: number; limit?: number };
          };
          const cpuDelta =
            (stats.cpu_stats?.cpu_usage?.total_usage || 0) -
            (stats.precpu_stats?.cpu_usage?.total_usage || 0);
          const sysDelta =
            (stats.cpu_stats?.system_cpu_usage || 0) -
            (stats.precpu_stats?.system_cpu_usage || 0);
          const onlineCpus = stats.cpu_stats?.online_cpus || 1;
          if (sysDelta > 0 && cpuDelta >= 0) {
            status.cpuPercent = Number(((cpuDelta / sysDelta) * onlineCpus * 100).toFixed(1));
          } else {
            status.cpuPercent = 0;
          }
          status.memoryUsageMb = Math.round((stats.memory_stats?.usage || 0) / (1024 * 1024));
          status.memoryLimitMb = Math.round((stats.memory_stats?.limit || 0) / (1024 * 1024));
        } catch {
          // Ignore transient stats error
        }
      }

      return status;
    } catch {
      return {
        state: 'not_created',
        running: false,
        containerName,
        containerId: '',
      };
    }
  }

  async getRecentLogs(server: ServerRecord, tail = 200): Promise<string> {
    const dockerOk = await this.isDockerAvailable();
    if (!dockerOk) return '[Docker servisi erişilebilir değil]';

    const ref = server.container_id || this.getContainerName(server);
    try {
      const container = this.docker.getContainer(ref);
      const raw = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true,
      });
      return stripDockerMultiplexHeaders(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)));
    } catch {
      return '[Sunucu container henüz oluşturulmamış veya log kaydı yok]';
    }
  }

  async streamLogs(
    server: ServerRecord,
    onChunk: (text: string) => void,
    onEnd: () => void
  ): Promise<() => void> {
    const dockerOk = await this.isDockerAvailable();
    if (!dockerOk) {
      onChunk('[Docker servisi erişilebilir değil]\n');
      onEnd();
      return () => undefined;
    }

    const ref = server.container_id || this.getContainerName(server);
    try {
      const container = this.docker.getContainer(ref);
      const stream = (await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        tail: 150,
        timestamps: true,
      })) as unknown as NodeJS.ReadableStream & { destroy?: () => void };

      stream.on('data', (chunk: Buffer) => {
        onChunk(stripDockerMultiplexHeaders(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      });
      stream.on('end', () => onEnd());
      stream.on('error', () => onEnd());

      return () => {
        try {
          stream.destroy?.();
        } catch {
          // ignore
        }
      };
    } catch {
      onChunk('[Sunucu şu an çalışmıyor veya container bulunamadı]\n');
      onEnd();
      return () => undefined;
    }
  }

  async queryLivePlayers(server: ServerRecord): Promise<LiveServerInfo> {
    const containerName = this.getContainerName(server);
    const hostsToTry = ['host.docker.internal', '127.0.0.1', containerName];

    for (const host of hostsToTry) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);
      try {
        const infoRes = await fetch(`http://${host}:${server.http_port}/INFO`, {
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!infoRes.ok) continue;
        const infoJson = (await infoRes.json()) as {
          name?: string;
          track?: string;
          clients?: number;
          maxclients?: number;
        };

        let players: LiveServerInfo['players'] = [];
        try {
          const c2 = new AbortController();
          const t2 = setTimeout(() => c2.abort(), 1200);
          const jsonRes = await fetch(`http://${host}:${server.http_port}/JSON`, {
            signal: c2.signal,
          });
          clearTimeout(t2);
          if (jsonRes.ok) {
            const detail = (await jsonRes.json()) as {
              Cars?: Array<{
                DriverName?: string;
                Model?: string;
                Skin?: string;
                IsConnected?: boolean;
              }>;
            };
            players = (detail.Cars || [])
              .filter((c) => c.IsConnected)
              .map((c) => ({
                name: c.DriverName || 'Oyuncu',
                car: c.Model || '',
                skin: c.Skin || '',
                connected: true,
              }));
          }
        } catch {
          // /JSON optional
        }

        return {
          reachable: true,
          name: infoJson.name,
          track: infoJson.track,
          clients: infoJson.clients ?? players.length,
          maxClients: infoJson.maxclients ?? server.max_clients,
          players,
        };
      } catch {
        clearTimeout(timer);
      }
    }

    return {
      reachable: false,
      players: [],
    };
  }
}

export function stripDockerMultiplexHeaders(buf: Buffer): string {
  // Docker multiplexed log frames start with [streamType(1), 0, 0, 0, size(4 big-endian)]
  const chunks: string[] = [];
  let offset = 0;
  let parsedFrames = 0;

  while (offset + 8 <= buf.length) {
    const streamType = buf[offset];
    const zero1 = buf[offset + 1];
    const zero2 = buf[offset + 2];
    const zero3 = buf[offset + 3];
    if ((streamType === 1 || streamType === 2) && zero1 === 0 && zero2 === 0 && zero3 === 0) {
      const size = buf.readUInt32BE(offset + 4);
      if (offset + 8 + size <= buf.length) {
        chunks.push(buf.subarray(offset + 8, offset + 8 + size).toString('utf8'));
        offset += 8 + size;
        parsedFrames++;
        continue;
      }
    }
    break;
  }

  if (parsedFrames > 0 && offset === buf.length) {
    return chunks.join('');
  }
  return buf.toString('utf8');
}

export const dockerManager = new DockerManager();
