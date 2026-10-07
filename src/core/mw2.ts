import { spawn } from 'node:child_process';
import { readFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { unzipSync } from 'fflate';
import { download, hashFile } from './download';
import { exists, readJson } from './fs';

// Pinned to the upstream release. Never substitute an unverified "latest" binary.
export const IW4L_RELEASE = {
  tag: 'v0.4.0',
  url: 'https://github.com/chasmlol/2010-rust-rewrite-mashup/releases/download/v0.4.0/2010-Rust-Rewrite-Mashup-windows-x64.zip',
  sha256: 'f7c02cfb4dd5650be29762947a0b17d3e6f9b9f1259025ee89a99bd031e1ebca',
  executableSha256: '7749d48cf176190c3b54c38ecfc20c540d076aec83714f58ad2b4f4f7954bd38',
  source: 'https://github.com/chasmlol/2010-rust-rewrite-mashup',
};

interface Receipt { tag: string; archiveSha256: string; executableSha256: string }
const ARCHIVE_ROOT = '2010-Rust-Rewrite-Mashup/';

export function releaseFiles(zip: Uint8Array): Record<string, Uint8Array> {
  const files = unzipSync(zip);
  const selected: Record<string, Uint8Array> = {};
  for (const [entry, contents] of Object.entries(files)) {
    const normalized = entry.replace(/\\/g, '/');
    if (!normalized.startsWith(ARCHIVE_ROOT)) throw new Error(`Unexpected IW4L archive entry: ${entry}`);
    const relative = normalized.slice(ARCHIVE_ROOT.length);
    if (!relative || relative.endsWith('/') || relative.split('/').some(part => !part || part === '.' || part === '..' || part.includes(':'))) {
      throw new Error(`Unsafe IW4L archive entry: ${entry}`);
    }
    selected[relative] = contents;
  }
  if (!selected['iw4l.exe'] || !selected['LICENSE'] || !selected['README.txt']) throw new Error('IW4L release archive is incomplete.');
  return selected;
}

export async function isMw2MultiplayerPath(path: string): Promise<boolean> {
  if (!await exists(join(path, 'iw4mp.exe'))) return false;
  const zone = join(path, 'zone');
  try {
    const languages = await readdir(zone, { withFileTypes: true });
    for (const language of languages) {
      if (language.isDirectory() && await exists(join(zone, language.name, 'common_mp.ff'))) return true;
    }
  } catch { /* Missing or unreadable multiplayer assets. */ }
  return false;
}

export class MW2Installer {
  constructor(private readonly dataRoot: string, private readonly log: (line: string) => void = () => {}) {}

  instancePath(): string { return join(this.dataRoot, 'iw4l', IW4L_RELEASE.tag); }

  async verify(): Promise<boolean> {
    const root = this.instancePath();
    const receipt = await readJson<Receipt>(join(root, 'installation.json'));
    if (receipt?.tag !== IW4L_RELEASE.tag || receipt.archiveSha256 !== IW4L_RELEASE.sha256) return false;
    const exe = join(root, 'iw4l.exe');
    return receipt.executableSha256 === IW4L_RELEASE.executableSha256 &&
      await exists(exe) && (await hashFile(exe, 'sha256')) === IW4L_RELEASE.executableSha256;
  }

  async install(): Promise<string> {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This IW4L release supports Windows x64. Other platforms require an upstream source build.');
    if (await this.verify()) return this.instancePath();
    const root = this.instancePath();
    const archive = join(this.dataRoot, 'downloads', `iw4l-${IW4L_RELEASE.tag}-windows-x64.zip`);
    this.log(`Downloading IW4L ${IW4L_RELEASE.tag} from upstream.\n`);
    await download(IW4L_RELEASE.url, archive, { algorithm: 'sha256', value: IW4L_RELEASE.sha256 });
    const files = releaseFiles(await readFile(archive));
    await mkdir(root, { recursive: true });
    for (const [name, contents] of Object.entries(files)) {
      const target = resolve(root, name);
      if (!target.startsWith(`${resolve(root)}${sep}`)) throw new Error(`Unsafe IW4L path: ${name}`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents);
    }
    const executableSha256 = await hashFile(join(root, 'iw4l.exe'), 'sha256');
    if (executableSha256 !== IW4L_RELEASE.executableSha256) throw new Error('IW4L executable checksum mismatch.');
    await writeFile(join(root, 'installation.json'), JSON.stringify({ tag: IW4L_RELEASE.tag, archiveSha256: IW4L_RELEASE.sha256, executableSha256 }, null, 2));
    this.log(`IW4L installed in ${root}.\n`);
    return root;
  }

  async play(mw2Path: string): Promise<void> {
    if (!await this.verify()) throw new Error('Install the MW2 mashup first.');
    if (!await isMw2MultiplayerPath(mw2Path)) {
      throw new Error('The selected MW2 (2009) folder is missing its multiplayer files.');
    }
    const root = this.instancePath();
    const child = spawn(join(root, 'iw4l.exe'), ['map', 'minecraft:overworld'], {
      cwd: root, detached: true, stdio: 'ignore', windowsHide: false,
      env: { ...process.env, IW4L_GAMES: dirname(mw2Path) },
    });
    await new Promise<void>((resolvePromise, reject) => {
      child.once('error', reject);
      child.once('spawn', resolvePromise);
    });
    child.unref();
    this.log(`Started IW4L with ${basename(mw2Path)}.\n`);
  }
}
