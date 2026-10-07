import { readFile, readdir } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { exists, isDirectory } from '../fs';
import type { GameInstallation, GameMetadata, GameProvider } from '../types';

function field(vdf: string, key: string): string | undefined {
  const match = vdf.match(new RegExp(`"${key}"\\s+"((?:\\\\.|[^"])*)"`, 'i'));
  return match?.[1]?.replace(/\\\\/g, '\\');
}

export function steamLibraryPaths(vdf: string): string[] {
  // libraryfolders.vdf contains numbered root blocks with a "path" member.
  return [...vdf.matchAll(/"path"\s+"((?:\\.|[^"])*)"/gi)].map(match => match[1].replace(/\\\\/g, '\\'));
}

export class SteamProvider implements GameProvider {
  readonly id: string = 'steam';
  constructor(protected readonly roots = defaultSteamRoots()) {}

  async discover(game: GameMetadata): Promise<GameInstallation[]> {
    if (!game.steamAppIds?.length) return [];
    const libraries = new Set<string>();
    for (const root of this.roots) {
      if (!await isDirectory(root)) continue;
      libraries.add(root);
      try {
        const vdf = await readFile(join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
        for (const path of steamLibraryPaths(vdf)) libraries.add(resolve(path));
      } catch { /* A standalone Steam library is still useful. */ }
    }
    const matches: GameInstallation[] = [];
    for (const library of libraries) {
      for (const appId of game.steamAppIds) {
        const manifestPath = join(library, 'steamapps', `appmanifest_${appId}.acf`);
        if (!await exists(manifestPath)) continue;
        const manifest = await readFile(manifestPath, 'utf8');
        if (field(manifest, 'appid') !== String(appId)) continue;
        const installDir = field(manifest, 'installdir');
        if (!installDir) continue;
        const path = join(library, 'steamapps', 'common', installDir);
        if (!await isDirectory(path)) continue;
        matches.push({ gameId: game.id, providerId: this.id, path, details: `Steam AppID ${appId}` });
      }
    }
    return matches;
  }
}

export class CrossOverSteamProvider extends SteamProvider {
  override readonly id: string = 'crossover-steam';
  constructor(home = homedir()) {
    super([join(home, 'Library', 'Application Support', 'CrossOver', 'Bottles', 'Steam', 'drive_c', 'Program Files (x86)', 'Steam')]);
    this.home = home;
  }
  private readonly home: string;

  override async discover(game: GameMetadata): Promise<GameInstallation[]> {
    const bottleRoot = join(this.home, 'Library', 'Application Support', 'CrossOver', 'Bottles');
    const roots: string[] = [];
    if (await isDirectory(bottleRoot)) {
      for (const bottle of await readdir(bottleRoot)) {
        for (const programs of ['Program Files (x86)', 'Program Files']) roots.push(join(bottleRoot, bottle, 'drive_c', programs, 'Steam'));
      }
    }
    const provider = new SteamProvider(roots);
    return (await provider.discover(game)).map(item => ({ ...item, providerId: this.id }));
  }
}

function defaultSteamRoots(): string[] {
  const home = homedir();
  switch (platform()) {
    case 'win32': return [join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Steam'), join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Steam')];
    case 'darwin': return [join(home, 'Library', 'Application Support', 'Steam')];
    default: return [join(home, '.local', 'share', 'Steam'), join(home, '.steam', 'steam')];
  }
}
