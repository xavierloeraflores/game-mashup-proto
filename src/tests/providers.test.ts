import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { MinecraftLauncherProvider } from '../core/providers/minecraft';
import { SteamProvider, steamLibraryPaths } from '../core/providers/steam';

test('Minecraft provider does not mistake a launcher or Bedrock for Java', async () => {
  const home = await mkdtemp(join(tmpdir(), 'mashup-mc-'));
  try {
    const local = join(home, 'Local');
    await mkdir(join(local, 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe'), { recursive: true });
    await mkdir(join(local, 'Packages', 'Microsoft.MinecraftUWP_8wekyb3d8bbwe'), { recursive: true });
    const provider = new MinecraftLauncherProvider(home, 'win32', { APPDATA: join(home, 'Roaming'), LOCALAPPDATA: local });
    const result = await provider.inspect();
    assert.equal(result.launcherInstalled, true);
    assert.equal(result.bedrockDetected, true);
    assert.equal(result.javaUsable, false);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('Minecraft provider does not treat a prefetched version manifest as an installed game', async () => {
  const home = await mkdtemp(join(tmpdir(), 'mashup-mc-'));
  try {
    const root = join(home, 'Roaming', '.minecraft');
    await mkdir(join(root, 'versions', '1.21.4'), { recursive: true });
    await writeFile(join(root, 'versions', '1.21.4', '1.21.4.json'), '{}');
    await writeFile(join(root, 'launcher_profiles.json'), JSON.stringify({ profiles: { Mario: { lastVersionId: '1.21.4' } } }));
    const provider = new MinecraftLauncherProvider(home, 'win32', { APPDATA: join(home, 'Roaming'), LOCALAPPDATA: join(home, 'Local') });
    const result = await provider.inspect();
    assert.equal(result.launcherInstalled, true);
    assert.equal(result.javaUsable, false);
    assert.equal(result.installations.length, 0);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('Minecraft provider reads a custom game directory and exact installed version', async () => {
  const home = await mkdtemp(join(tmpdir(), 'mashup-mc-'));
  try {
    const root = join(home, '.minecraft');
    const custom = join(home, 'Mario instance');
    await mkdir(join(root, 'versions', '1.21.4'), { recursive: true });
    await mkdir(custom);
    await writeFile(join(root, 'versions', '1.21.4', '1.21.4.json'), '{}');
    await writeFile(join(root, 'versions', '1.21.4', '1.21.4.jar'), 'jar');
    await writeFile(join(root, 'launcher_profiles.json'), JSON.stringify({ profiles: { Mario: { gameDir: custom, lastVersionId: '1.21.4' } } }));
    const result = await new MinecraftLauncherProvider(home, 'linux').inspect();
    assert.equal(result.javaUsable, true);
    assert.ok(result.installations.some(item => item.path === custom && item.version === '1.21.4'));
    assert.equal(result.installations.find(item => item.path === custom)?.rootPath, root);
    assert.ok(result.rootDirectories.includes(root));
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('Steam uses AppIDs and libraries, not ambiguous names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mashup-steam-'));
  try {
    const gamePath = join(root, 'steamapps', 'common', 'MW2');
    await mkdir(gamePath, { recursive: true });
    await writeFile(join(root, 'steamapps', 'appmanifest_10180.acf'), '"AppState" { "appid" "10180" "name" "Wrong title" "installdir" "MW2" }');
    const provider = new SteamProvider([root]);
    const found = await provider.discover({ id: 'call-of-duty-modern-warfare-2-2009', name: 'MW2 2009', providerIds: ['steam'], steamAppIds: [10180] });
    assert.equal(found.length, 1);
    assert.equal(found[0].path, gamePath);
    assert.deepEqual(steamLibraryPaths('"path" "D:\\\\SteamLibrary"'), ['D:\\SteamLibrary']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Call of Duty HQ alone is not mistaken for Modern Warfare II', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mashup-steam-'));
  try {
    const gamePath = join(root, 'steamapps', 'common', 'Call of Duty HQ');
    await mkdir(gamePath, { recursive: true });
    const manifestPath = join(root, 'steamapps', 'appmanifest_1938090.acf');
    await writeFile(manifestPath, '"AppState" { "appid" "1938090" "installdir" "Call of Duty HQ" "InstalledDepots" { "1962663" { "dlcappid" "1962663" } } }');
    const game = { id: 'call-of-duty-modern-warfare-ii-2022', name: 'MWII 2022', providerIds: ['steam'], steamAppIds: [3595230], steamParentAppId: 1938090, steamParentDlcIds: [1962660, 1962661] };
    const provider = new SteamProvider([root]);
    assert.equal((await provider.discover(game)).length, 0);
    await writeFile(manifestPath, '"AppState" { "appid" "1938090" "installdir" "Call of Duty HQ" "InstalledDepots" { "2014032" { "dlcappid" "1962660" } } }');
    assert.equal((await provider.discover(game)).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
