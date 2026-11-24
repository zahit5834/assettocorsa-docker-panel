import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { config, ensureDataDirectories } from './config.js';
import { getDb } from './db.js';
import { authRoutes } from './routes/auth.js';
import { contentRoutes } from './routes/content.js';
import { packRoutes } from './routes/packs.js';
import { publicRoutes } from './routes/public.js';
import { serverRoutes } from './routes/servers.js';
import { systemRoutes } from './routes/system.js';

export async function buildApp() {
  ensureDataDirectories();
  getDb();

  const app = Fastify({
    logger: true,
    bodyLimit: 1024 * 1024 * 50,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 1024 * 1024 * 1024 * 25, // 25 GB max archive upload
      files: 1,
    },
  });

  await app.register(websocket);

  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  await app.register(authRoutes);
  await app.register(contentRoutes);
  await app.register(packRoutes);
  await app.register(serverRoutes);
  await app.register(publicRoutes);
  await app.register(systemRoutes);

  return app;
}

const isMain = process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts');
if (isMain) {
  buildApp()
    .then(async (app) => {
      await app.listen({ port: config.port, host: '0.0.0.0' });
      app.log.info(`AC Panel Backend listening on 0.0.0.0:${config.port}`);
    })
    .catch((err) => {
      console.error('Failed to start backend:', err);
      process.exit(1);
    });
}
