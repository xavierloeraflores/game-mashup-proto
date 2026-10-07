import type { GameInstallation, GameProvider, Registry } from './types';

export async function discoverGames(registry: Registry, providers: GameProvider[]): Promise<Record<string, GameInstallation[]>> {
  const result: Record<string, GameInstallation[]> = {};
  for (const game of registry.games) {
    const available = providers.filter(provider => game.providerIds.includes(provider.id));
    const found = await Promise.all(available.map(provider => provider.discover(game)));
    result[game.id] = found.flat();
  }
  return result;
}

export function resolveGameRequirements(
  registry: Registry,
  mashupId: string,
  installations: Record<string, GameInstallation[]>,
  assetStatus: Record<string, boolean> = {},
): { id: string; installed: boolean; satisfied: boolean; detail: string }[] {
  const mashup = registry.mashups.find(item => item.id === mashupId);
  if (!mashup) throw new Error(`Unknown mashup: ${mashupId}`);
  return mashup.requires.games.map(requirement => {
    if (registry.games.find(game => game.id === requirement.id)?.assetOnly) {
      const ready = assetStatus[requirement.id] ?? false;
      return { id: requirement.id, installed: ready, satisfied: ready, detail: ready ? 'User asset verified' : 'User asset required' };
    }
    const found = installations[requirement.id] ?? [];
    const matches = found.some(item => !requirement.version || item.version === requirement.version);
    return {
      id: requirement.id,
      installed: found.length > 0,
      satisfied: matches,
      detail: !found.length ? 'Not installed' : matches ? (requirement.version ? `Version ${requirement.version} found` : 'Installed') : `Installed, but version ${requirement.version} was not found`,
    };
  });
}
