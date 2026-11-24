import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';

export interface AuthPayload {
  userId: number;
  username: string;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as AuthPayload;
  } catch {
    return null;
  }
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (typeof (request.query as Record<string, unknown>)?.token === 'string') {
    token = String((request.query as Record<string, unknown>).token);
  }

  if (!token) {
    return reply.code(401).send({ error: 'Oturum açmanız gerekiyor.' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return reply.code(401).send({ error: 'Geçersiz veya süresi dolmuş oturum.' });
  }

  (request as FastifyRequest & { user?: AuthPayload }).user = payload;
}
