import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import Docker from 'dockerode';
import { config, getDataPaths } from './config.js';

const execFileAsync = promisify(execFile);
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const UPDATER_CONTAINER_NAME = 'ac-panel-updater';
const UPDATER_IMAGE = 'docker:27-cli';

export interface UpdateJobStatus {
  state: 'idle' | 'starting' | 'fetching' | 'pulling' | 'building' | 'completed' | 'error';
  step: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  fromCommit?: string;
  toCommit?: string;
}

export interface UpdateOverview {
  gitAvailable: boolean;
  repoReady: boolean;
  branch: string;
  currentCommit: string;
  currentMessage: string;
  currentDate: string;
  remoteUrl: string;
  remoteCommit: string;
  remoteMessage: string;
  behindCount: number;
  updateAvailable: boolean;
  changelog: Array<{ hash: string; message: string; date: string }>;
  job: UpdateJobStatus;
  updaterRunning: boolean;
  logs: string;
  fetchError?: string;
}

async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    ['-c', `safe.directory=${cwd}`, ...args],
    { cwd, timeout: 20_000, maxBuffer: 1024 * 1024 * 4 }
  );
  return stdout.trim();
}

export async function resolveHostProjectDir(): Promise<string> {
  if (
    config.hostProjectDir &&
    path.isAbsolute(config.hostProjectDir) &&
    !config.hostProjectDir.startsWith('.')
  ) {
    return config.hostProjectDir;
  }

  try {
    const info = await docker.getContainer(os.hostname()).inspect();
    const projectMount = info.Mounts?.find((m) => m.Destination === '/project');
    if (projectMount?.Source) {
      return projectMount.Source;
    }
    const dataMount = info.Mounts?.find((m) => m.Destination === '/data');
    if (dataMount?.Source) {
      return path.posix.dirname(dataMount.Source);
    }
  } catch {
    // Running outside Docker
  }

  return path.resolve(config.projectDir);
}

async function isUpdaterContainerRunning(): Promise<boolean> {
  try {
    const info = await docker.getContainer(UPDATER_CONTAINER_NAME).inspect();
    return Boolean(info.State.Running);
  } catch {
    return false;
  }
}

function readUpdateJobStatus(): UpdateJobStatus {
  const paths = getDataPaths();
  const statusFile = path.join(paths.tmpDir, 'update-status.json');
  if (!fs.existsSync(statusFile)) {
    return { state: 'idle', step: '' };
  }
  try {
    return JSON.parse(fs.readFileSync(statusFile, 'utf8')) as UpdateJobStatus;
  } catch {
    return { state: 'idle', step: '' };
  }
}

function readUpdateLogs(): string {
  const paths = getDataPaths();
  const logFile = path.join(paths.tmpDir, 'update.log');
  if (!fs.existsSync(logFile)) return '';
  try {
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split(/\r?\n/);
    return lines.slice(-120).join('\n');
  } catch {
    return '';
  }
}

export async function getUpdateStatus(fetchRemote = false): Promise<UpdateOverview> {
  const projectDir = config.projectDir;
  const repoReady = fs.existsSync(path.join(projectDir, '.git'));
  const job = readUpdateJobStatus();
  const logs = readUpdateLogs();
  const updaterRunning = await isUpdaterContainerRunning();

  if (!repoReady) {
    return {
      gitAvailable: true,
      repoReady: false,
      branch: '',
      currentCommit: '',
      currentMessage: '',
      currentDate: '',
      remoteUrl: '',
      remoteCommit: '',
      remoteMessage: '',
      behindCount: 0,
      updateAvailable: false,
      changelog: [],
      job,
      updaterRunning,
      logs,
    };
  }

  let fetchError: string | undefined;
  let branch = 'main';
  let currentCommit = '';
  let currentMessage = '';
  let currentDate = '';
  let remoteUrl = '';
  let remoteCommit = '';
  let remoteMessage = '';
  let behindCount = 0;
  const changelog: Array<{ hash: string; message: string; date: string }> = [];

  try {
    branch = (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], projectDir)) || 'main';
    currentCommit = await runGit(['rev-parse', '--short', 'HEAD'], projectDir);
    currentMessage = await runGit(['log', '-1', '--pretty=%s'], projectDir);
    currentDate = await runGit(['log', '-1', '--pretty=%ci'], projectDir);
    remoteUrl = await runGit(['remote', 'get-url', 'origin'], projectDir).catch(() => '');

    if (fetchRemote && remoteUrl) {
      try {
        await runGit(['fetch', 'origin', branch, '--quiet'], projectDir);
      } catch (e) {
        fetchError = e instanceof Error ? e.message : 'GitHub sunucusuna erişilemedi.';
      }
    }

    if (remoteUrl) {
      try {
        remoteCommit = await runGit(['rev-parse', '--short', `origin/${branch}`], projectDir);
        remoteMessage = await runGit(['log', '-1', '--pretty=%s', `origin/${branch}`], projectDir);
        const behindRaw = await runGit(
          ['rev-list', '--count', `HEAD..origin/${branch}`],
          projectDir
        );
        behindCount = Number(behindRaw) || 0;

        if (behindCount > 0) {
          const logRaw = await runGit(
            ['log', '--pretty=%h|%s|%ci', '-n', '10', `HEAD..origin/${branch}`],
            projectDir
          );
          for (const line of logRaw.split(/\r?\n/)) {
            if (!line.trim()) continue;
            const [hash, message, date] = line.split('|');
            if (hash) {
              changelog.push({ hash, message: message || '', date: date || '' });
            }
          }
        }
      } catch {
        // Remote branch not fetched yet
      }
    }
  } catch (e) {
    return {
      gitAvailable: false,
      repoReady,
      branch,
      currentCommit,
      currentMessage,
      currentDate,
      remoteUrl,
      remoteCommit,
      remoteMessage,
      behindCount: 0,
      updateAvailable: false,
      changelog: [],
      job,
      updaterRunning,
      logs,
      fetchError: e instanceof Error ? e.message : 'Git okunamadı.',
    };
  }

  return {
    gitAvailable: true,
    repoReady: true,
    branch,
    currentCommit,
    currentMessage,
    currentDate,
    remoteUrl,
    remoteCommit,
    remoteMessage,
    behindCount,
    updateAvailable: behindCount > 0,
    changelog,
    job,
    updaterRunning,
    logs,
    fetchError,
  };
}

export async function triggerSelfUpdate(): Promise<{ started: boolean; message: string }> {
  const projectDir = config.projectDir;
  if (!fs.existsSync(path.join(projectDir, '.git'))) {
    throw new Error(
      'Bu kurulum GitHub deposundan (git clone) yapılmadığı için otomatik güncellenemiyor. Projeyi GitHub üzerinden klonlayarak kurun.'
    );
  }
  if (!fs.existsSync(path.join(projectDir, 'update.sh'))) {
    throw new Error('update.sh dosyası proje klasöründe bulunamadı.');
  }

  try {
    await docker.ping();
  } catch {
    throw new Error('Docker servisine erişilemiyor (/var/run/docker.sock).');
  }

  if (await isUpdaterContainerRunning()) {
    throw new Error('Bir güncelleme işlemi zaten devam ediyor.');
  }

  // Remove any leftover stopped updater container
  try {
    await docker.getContainer(UPDATER_CONTAINER_NAME).remove({ force: true });
  } catch {
    // ignore
  }

  // Write initial status immediately so frontend sees progress right away
  const paths = getDataPaths();
  fs.mkdirSync(paths.tmpDir, { recursive: true });
  fs.writeFileSync(
    path.join(paths.tmpDir, 'update-status.json'),
    JSON.stringify(
      {
        state: 'starting',
        step: 'Güncelleme konteyneri başlatılıyor...',
        startedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );

  // Pull tiny docker CLI image if not cached
  try {
    await docker.getImage(UPDATER_IMAGE).inspect();
  } catch {
    await new Promise<void>((resolve, reject) => {
      docker.pull(UPDATER_IMAGE, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (finishErr: Error | null) => {
          if (finishErr) return reject(finishErr);
          resolve();
        });
      });
    });
  }

  const hostProjectDir = await resolveHostProjectDir();
  const container = await docker.createContainer({
    name: UPDATER_CONTAINER_NAME,
    Image: UPDATER_IMAGE,
    WorkingDir: hostProjectDir,
    Cmd: [
      'sh',
      '-c',
      `apk add --no-cache git bash >/dev/null 2>&1 && bash "${hostProjectDir}/update.sh" --from-panel`,
    ],
    HostConfig: {
      AutoRemove: true,
      Binds: [
        '/var/run/docker.sock:/var/run/docker.sock',
        `${hostProjectDir}:${hostProjectDir}`,
      ],
    },
    Labels: {
      'ac-panel.updater': 'true',
    },
  });

  await container.start();

  return {
    started: true,
    message:
      'Güncelleme başlatıldı! Panel birkaç saniye içinde yeniden başlatılacak; çalışan AC sunucularınız etkilenmez.',
  };
}
