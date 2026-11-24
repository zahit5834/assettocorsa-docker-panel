import fs from 'node:fs';
import path from 'node:path';

export const config = {
  port: Number(process.env.PORT || 3000),
  dataDir: path.resolve(process.env.DATA_DIR || path.join(process.cwd(), '..', 'data')),
  hostDataDir: process.env.HOST_DATA_DIR || './data',
  projectDir: path.resolve(process.env.PROJECT_DIR || path.join(process.cwd(), '..')),
  hostProjectDir: process.env.HOST_PROJECT_DIR || '.',
  panelPort: Number(process.env.PANEL_PORT || 5829),
  vdsPublicIp: process.env.VDS_PUBLIC_IP || '127.0.0.1',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
  jwtSecret: process.env.JWT_SECRET || 'ac-panel-dev-secret-change-me',
  assettoServerImage: process.env.ASSETTOSERVER_IMAGE || 'compujuckel/assettoserver:latest',
  vanillaAcImage: process.env.VANILLA_AC_IMAGE || 'ac-panel-vanilla:latest',
};

export function getDataPaths(baseDir = config.dataDir) {
  return {
    root: baseDir,
    dbDir: path.join(baseDir, 'db'),
    dbFile: path.join(baseDir, 'db', 'panel.sqlite'),
    carsDir: path.join(baseDir, 'library', 'cars'),
    tracksDir: path.join(baseDir, 'library', 'tracks'),
    carDownloadsDir: path.join(baseDir, 'downloads', 'cars'),
    trackDownloadsDir: path.join(baseDir, 'downloads', 'tracks'),
    packDownloadsDir: path.join(baseDir, 'downloads', 'packs'),
    bundleDownloadsDir: path.join(baseDir, 'downloads', 'bundles'),
    serversDir: path.join(baseDir, 'servers'),
    enginesDir: path.join(baseDir, 'engines'),
    tmpDir: path.join(baseDir, 'tmp'),
  };
}

export function ensureDataDirectories(baseDir = config.dataDir) {
  const paths = getDataPaths(baseDir);
  const dirs = [
    paths.dbDir,
    paths.carsDir,
    paths.tracksDir,
    paths.carDownloadsDir,
    paths.trackDownloadsDir,
    paths.packDownloadsDir,
    paths.bundleDownloadsDir,
    paths.serversDir,
    paths.enginesDir,
    paths.tmpDir,
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}
