import { sep } from 'node:path';
import { path7za } from '7zip-bin';

export function extractorPath(): string {
  // Electron places executable dependencies outside its read-only asar archive.
  return path7za.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`);
}
