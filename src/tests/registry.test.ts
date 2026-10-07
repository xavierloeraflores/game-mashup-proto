import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadRegistry } from '../core/registry';
import { resolveGameRequirements } from '../core/discovery';

test('registry has canonical titles and versioned Mario requirements', async () => {
  const registry = await loadRegistry();
  assert.deepEqual(registry.games.map(game => game.id), [
    'minecraft-java', 'super-mario-64', 'call-of-duty-modern-warfare-2-2009', 'call-of-duty-modern-warfare-ii-2022',
  ]);
  const mashup = registry.mashups.find(item => item.id === 'mario64-in-minecraft');
  assert.equal(mashup?.requires.games[0].version, '1.21.4');
  assert.equal(mashup?.requires.assets?.[0].sha1, '9bef1128717f958171a4afac3ed78ee2bb4e86ce');
});

test('resolver distinguishes installed Minecraft from missing required version', async () => {
  const registry = await loadRegistry();
  const result = resolveGameRequirements(registry, 'mario64-in-minecraft', {
    'minecraft-java': [{ gameId: 'minecraft-java', providerId: 'minecraft-launcher', path: '/minecraft', version: '1.21.5' }],
  });
  assert.equal(result[0].installed, true);
  assert.equal(result[0].satisfied, false);
  assert.match(result[0].detail, /1.21.4/);
});
