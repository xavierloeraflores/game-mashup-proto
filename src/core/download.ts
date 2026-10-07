import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { exists } from './fs';

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { 'User-Agent': 'GameMashupLauncher/0.1', Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return await response.json() as T;
}

export async function getText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'User-Agent': 'GameMashupLauncher/0.1', Accept: 'text/plain' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return await response.text();
}

export async function hashFile(path: string, algorithm: 'sha1' | 'sha256' | 'sha512'): Promise<string> {
  const hash = createHash(algorithm);
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

export async function download(url: string, destination: string, expectedHash?: { algorithm: 'sha1' | 'sha256' | 'sha512'; value: string }): Promise<string> {
  if (await exists(destination)) {
    const current = await hashFile(destination, expectedHash?.algorithm ?? 'sha256');
    if (!expectedHash || current.toLowerCase() === expectedHash.value.toLowerCase()) return current;
  }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.partial`;
  const response = await fetch(url, { headers: { 'User-Agent': 'GameMashupLauncher/0.1' } });
  if (!response.ok || !response.body) throw new Error(`${url}: HTTP ${response.status}`);
  const contentLength = Number(response.headers.get('content-length'));
  if (contentLength > 100_000_000) throw new Error('Download exceeds 100 MB limit');
  let received = 0;
  try {
    const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
    body.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > 100_000_000) body.destroy(new Error('Download exceeds 100 MB limit'));
    });
    await pipeline(body, createWriteStream(temporary));
    const actual = await hashFile(temporary, expectedHash?.algorithm ?? 'sha256');
    if (expectedHash && actual.toLowerCase() !== expectedHash.value.toLowerCase()) throw new Error(`Checksum mismatch for ${url}`);
    await rm(destination, { force: true });
    await rename(temporary, destination);
    return actual;
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
