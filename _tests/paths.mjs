import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const repo = fileURLToPath(new URL('../', import.meta.url));
export const artifacts = path.join(tmpdir(), 'vingo-playwright', createHash('sha256').update(repo).digest('hex').slice(0, 12));
export const origin = 'http://127.0.0.1:4178';
export const baseURL = `${origin}/VINGO/`;
