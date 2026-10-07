import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { MarioInstaller, PROFILE_ID, ROM_SHA1 } from '../core/mario';

test('ROM validation rejects an unsupported file with expected and detected hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mashup-rom-'));
  try {
    const rom = join(root, 'baserom.us.z64');
    await writeFile(rom, 'not a Super Mario 64 ROM');
    await assert.rejects(() => new MarioInstaller(root).validateRom(rom), error => {
      assert.match(String(error), new RegExp(ROM_SHA1));
      assert.match(String(error), /Detected: [a-f0-9]{40}/);
      return true;
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('installation verification checks the isolated profile and ROM contents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mashup-install-'));
  try {
    const minecraft = join(root, '.minecraft');
    const installer = new MarioInstaller(root);
    const instance = installer.instancePath();
    const version = 'fabric-loader-0.16.10-1.21.4';
    await mkdir(join(minecraft, 'versions', version), { recursive: true });
    await mkdir(join(minecraft, 'versions', '1.21.4'), { recursive: true });
    await mkdir(join(instance, 'mods'), { recursive: true });
    await mkdir(join(instance, 'config', 'mario64'), { recursive: true });
    await writeFile(join(minecraft, 'versions', version, `${version}.json`), '{}');
    await writeFile(join(minecraft, 'versions', '1.21.4', '1.21.4.jar'), 'vanilla jar');
    await writeFile(join(minecraft, 'launcher_profiles.json'), JSON.stringify({ profiles: { [PROFILE_ID]: { gameDir: instance, lastVersionId: version } } }));
    await writeFile(join(instance, 'installation.json'), JSON.stringify({ fabricLoader: '0.16.10', fabricApiFile: 'fabric-api-0.119.4+1.21.4.jar', installedVersion: '0.1.0', sha256: 'wrong' }));
    await writeFile(join(instance, 'mods', 'fabric-api-0.119.4+1.21.4.jar'), 'fake jar');
    await writeFile(join(instance, 'mods', 'mario64mc-0.1.0.jar'), 'fake jar');
    await writeFile(join(instance, 'config', 'mario64', process.platform === 'win32' ? 'sm64.dll' : process.platform === 'darwin' ? 'libsm64.dylib' : 'libsm64.so'), 'fake library');
    await writeFile(join(instance, 'config', 'mario64', 'baserom.us.z64'), 'invalid rom');
    const checks = await installer.verify(minecraft);
    assert.equal(checks.find(item => item.id === 'fabric-profile')?.ok, true);
    assert.equal(checks.find(item => item.id === 'rom')?.ok, true);
    assert.equal(checks.find(item => item.id === 'rom-hash')?.ok, false);
    await assert.rejects(() => installer.selectProfile(minecraft), /not ready/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
