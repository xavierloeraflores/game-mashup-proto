import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { extractorPath } from '../core/archive';
import { MarioInstaller, PROFILE_ID, ROM_SHA1, githubAssetSha256, javaMajorVersion, validateMarioJar } from '../core/mario';

test('GitHub release JAR requires a complete SHA-256 digest', () => {
  assert.equal(githubAssetSha256(`sha256:${'A'.repeat(64)}`), 'a'.repeat(64));
  assert.equal(githubAssetSha256('sha256:bad'), undefined);
  assert.equal(githubAssetSha256(`sha1:${'a'.repeat(40)}`), undefined);
});

test('Mario JAR metadata must match its release and Minecraft 1.21.4', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mashup-jar-'));
  try {
    const files = join(root, 'files');
    await mkdir(files);
    const jar = join(root, 'mario64mc-0.1.0.jar');
    const metadata = { id: 'mario64', version: '0.1.0', depends: { minecraft: '~1.21.4' } };
    await writeFile(join(files, 'fabric.mod.json'), JSON.stringify(metadata));
    await promisify(execFile)(extractorPath(), ['a', '-tzip', jar, 'fabric.mod.json'], { cwd: files });
    await validateMarioJar(jar, '0.1.0');
    await assert.rejects(() => validateMarioJar(jar, '0.2.0'), /does not match version/);

    metadata.depends.minecraft = '~1.21.5';
    await writeFile(join(files, 'fabric.mod.json'), JSON.stringify(metadata));
    const incompatible = join(root, 'incompatible.jar');
    await promisify(execFile)(extractorPath(), ['a', '-tzip', incompatible, 'fabric.mod.json'], { cwd: files });
    await assert.rejects(() => validateMarioJar(incompatible, '0.1.0'), /does not explicitly support/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Java version gate recognizes Java 21 and rejects older runtime formats', () => {
  assert.equal(javaMajorVersion('openjdk version "21.0.9" 2025-10-21'), 21);
  assert.equal(javaMajorVersion('java version "17.0.2"'), 17);
  assert.equal(javaMajorVersion('java version "1.8.0_361"'), 8);
});

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
