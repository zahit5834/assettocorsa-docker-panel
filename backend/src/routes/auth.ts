import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword, requireAuth, signToken, verifyPassword, type AuthPayload } from '../auth.js';
import { getDb } from '../db.js';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const changePassSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'Yeni şifre en az 6 karakter olmalıdır.'),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Kullanıcı adı ve şifre gereklidir.' });
    }

    const db = getDb();
    const user = db
      .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
      .get(parsed.data.username) as
      | { id: number; username: string; password_hash: string }
      | undefined;

    if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
      return reply.code(401).send({ error: 'Kullanıcı adı veya şifre hatalı.' });
    }

    const token = signToken({ userId: user.id, username: user.username });
    return { token, user: { id: user.id, username: user.username } };
  });

  app.get('/api/auth/me', { preHandler: [requireAuth] }, async (request) => {
    const user = (request as typeof request & { user: AuthPayload }).user;
    return { user };
  });

  app.post('/api/auth/change-password', { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = changePassSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message || 'Geçersiz istek.' });
    }

    const userPayload = (request as typeof request & { user: AuthPayload }).user;
    const db = getDb();
    const user = db
      .prepare('SELECT id, password_hash FROM users WHERE id = ?')
      .get(userPayload.userId) as { id: number; password_hash: string } | undefined;

    if (!user || !verifyPassword(parsed.data.currentPassword, user.password_hash)) {
      return reply.code(400).send({ error: 'Mevcut şifre yanlış.' });
    }

    const newHash = hashPassword(parsed.data.newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
    return { success: true, message: 'Şifre başarıyla güncellendi.' };
  });
}
