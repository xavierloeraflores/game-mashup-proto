import { resolve } from 'node:path';
import { isDirectory, readJson } from '../fs';
import type { GameInstallation, GameMetadata, GameProvider } from '../types';

export interface Settings { manualPaths: Record<string, string> }

export class ManualProvider implements GameProvider {
  readonly id = 'manual';
  constructor(private readonly settingsPath: string) {}

  async discover(game: GameMetadata): Promise<GameInstallation[]> {
    const settings = await readJson<Settings>(this.settingsPath);
    const path = settings?.manualPaths?.[game.id];
    if (!path || !await isDirectory(path)) return [];
    return [{ gameId: game.id, providerId: this.id, path: resolve(path), details: 'Manual path' }];
  }
}
