import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { exists, isDirectory, readJson } from '../fs';
import type { GameInstallation, GameMetadata, GameProvider } from '../types';

export interface Settings { manualPaths: Record<string, string>; romPath?: string; toolchainBinPath?: string; pythonBinPath?: string; javaBinPath?: string }

export class ManualProvider implements GameProvider {
  readonly id = 'manual';
  constructor(private readonly settingsPath: string) {}

  async discover(game: GameMetadata): Promise<GameInstallation[]> {
    const settings = await readJson<Settings>(this.settingsPath);
    const path = settings?.manualPaths?.[game.id];
    if (!path || !await isDirectory(path)) return [];
    if (game.id === 'minecraft-java') {
      const versions = join(path, 'versions');
      if (!await isDirectory(versions)) return [];
      const found: GameInstallation[] = [];
      for (const version of await readdir(versions)) {
        if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) continue;
        if (await exists(join(versions, version, `${version}.json`)) && await exists(join(versions, version, `${version}.jar`))) {
          found.push({ gameId: game.id, providerId: this.id, path: resolve(path), version, details: 'Manual Minecraft directory' });
        }
      }
      return found;
    }
    return [{ gameId: game.id, providerId: this.id, path: resolve(path), details: 'Manual path' }];
  }
}
