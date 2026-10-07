import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import type { GameMetadata, MashupMetadata, Registry } from './types';

export async function loadRegistry(root = join(__dirname, '..', '..', 'registry')): Promise<Registry> {
  const gameData = YAML.parse(await readFile(join(root, 'games.yaml'), 'utf8')) as { games: GameMetadata[] };
  const mashupData = YAML.parse(await readFile(join(root, 'mashups.yaml'), 'utf8')) as { mashups: MashupMetadata[] };
  if (!Array.isArray(gameData?.games) || !Array.isArray(mashupData?.mashups)) throw new Error('Invalid registry');
  const ids = new Set<string>();
  for (const game of gameData.games) {
    if (!game.id || ids.has(game.id) || !Array.isArray(game.providerIds)) throw new Error(`Invalid game entry: ${game.id}`);
    ids.add(game.id);
  }
  const mashupIds = new Set<string>();
  for (const mashup of mashupData.mashups) {
    if (!mashup.id || mashupIds.has(mashup.id) || !Array.isArray(mashup.requires?.games)) throw new Error(`Invalid mashup entry: ${mashup.id}`);
    mashupIds.add(mashup.id);
    for (const requirement of mashup.requires.games) {
      if (!ids.has(requirement.id)) throw new Error(`Unknown game: ${requirement.id}`);
    }
  }
  return { games: gameData.games, mashups: mashupData.mashups };
}
