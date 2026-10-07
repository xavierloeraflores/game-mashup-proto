import { access, readFile, stat } from 'node:fs/promises';

export async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export async function isDirectory(path: string): Promise<boolean> {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

export async function readJson<T>(path: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; } catch { return undefined; }
}
