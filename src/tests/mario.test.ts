import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { MarioInstaller, MODS_FOLDER_JVM_ARGUMENT, PROFILE_ID, ROM_SHA1, cleanProfileJvmArguments, createManagedFabricVersion, fabricInstallerSha256, githubAssetSha256, javaMajorVersion, managedFabricVersionId, validateMarioJar } from '../core/mario';

test('managed Fabric version passes the isolated mods folder as one JVM argument', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mashup-version-'));
  try {
    const sourceId = 'fabric-loader-0.19.5-1.21.4';
    const sourceDir = join(root, 'versions', sourceId);
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, `${sourceId}.json`), JSON.stringify({ id: sourceId, inheritsFrom: '1.21.4', mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient', arguments: { jvm: ['-DFabricMcEmu= net.minecraft.client.main.Main '], game: [] } }));
    await writeFile(join(sourceDir, `${sourceId}.jar`), 'Fabric version JAR');
    const targetId = await createManagedFabricVersion(root, '0.19.5');
    assert.equal(targetId, managedFabricVersionId('0.19.5'));
    const target = JSON.parse(await readFile(join(root, 'versions', targetId, `${targetId}.json`), 'utf8'));
    assert.deepEqual(target.arguments.jvm, ['-DFabricMcEmu= net.minecraft.client.main.Main ', MODS_FOLDER_JVM_ARGUMENT]);
    assert.equal(await readFile(join(root, 'versions', targetId, `${targetId}.jar`), 'utf8'), 'Fabric version JAR');
    assert.equal(cleanProfileJvmArguments('-Xmx2G "-Dfabric.modsFolder=C:/Old Path/mods"'), '-Xmx2G');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('GitHub release JAR requires a complete SHA-256 digest', () => {
  assert.equal(githubAssetSha256(`sha256:${'A'.repeat(64)}`), 'a'.repeat(64));
  assert.equal(githubAssetSha256('sha256:bad'), undefined);
  assert.equal(githubAssetSha256(`sha1:${'a'.repeat(40)}`), undefined);
});

test('Fabric installer requires a SHA-256 Maven sidecar', () => {
  assert.equal(fabricInstallerSha256(` ${'B'.repeat(64)}\n`), 'b'.repeat(64));
  assert.equal(fabricInstallerSha256('not-a-digest'), undefined);
});

test('Mario JAR metadata must match its release and Minecraft 1.21.4', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mashup-jar-'));
  try {
    const jar = join(root, 'mario64mc-0.1.0.jar');
    const metadata = { id: 'mario64', version: '0.1.0', depends: { minecraft: '~1.21.4' } };
    await writeFile(jar, zipSync({ 'fabric.mod.json': strToU8(JSON.stringify(metadata)) }));
    await validateMarioJar(jar, '0.1.0');
    await assert.rejects(() => validateMarioJar(jar, '0.2.0'), /does not match version/);

    metadata.depends.minecraft = '~1.21.5';
    const incompatible = join(root, 'incompatible.jar');
    await writeFile(incompatible, zipSync({ 'fabric.mod.json': strToU8(JSON.stringify(metadata)) }));
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
    const version = managedFabricVersionId('0.16.10');
    await mkdir(join(minecraft, 'versions', version), { recursive: true });
    await mkdir(join(minecraft, 'versions', '1.21.4'), { recursive: true });
    await mkdir(join(instance, 'mods'), { recursive: true });
    await mkdir(join(instance, 'config', 'mario64'), { recursive: true });
    await writeFile(join(minecraft, 'versions', version, `${version}.json`), JSON.stringify({ id: version, arguments: { jvm: [MODS_FOLDER_JVM_ARGUMENT] } }));
    await writeFile(join(minecraft, 'versions', version, `${version}.jar`), 'Fabric version JAR');
    await writeFile(join(minecraft, 'versions', '1.21.4', '1.21.4.jar'), 'vanilla jar');
    await writeFile(join(minecraft, 'launcher_profiles.json'), JSON.stringify({ profiles: { [PROFILE_ID]: { gameDir: instance, lastVersionId: version } } }));
    const apiHash = createHash('sha512').update('fake jar').digest('hex');
    await writeFile(join(instance, 'installation.json'), JSON.stringify({ fabricLoader: '0.16.10', fabricApiFile: 'fabric-api-0.119.4+1.21.4.jar', fabricApiSha512: apiHash, installedVersion: '0.1.0', sha256: 'wrong' }));
    await writeFile(join(instance, 'mods', 'fabric-api-0.119.4+1.21.4.jar'), 'fake jar');
    await writeFile(join(instance, 'mods', 'mario64mc-0.1.0.jar'), 'fake jar');
    await writeFile(join(instance, 'config', 'mario64', 'sm64.dll'), 'fake library');
    await writeFile(join(instance, 'config', 'mario64', 'baserom.us.z64'), 'invalid rom');
    const checks = await installer.verify(minecraft);
    assert.equal(checks.find(item => item.id === 'fabric-profile')?.ok, true);
    assert.equal(checks.find(item => item.id === 'fabric-api')?.ok, true);
    assert.equal(checks.find(item => item.id === 'native')?.ok, true);
    assert.equal(checks.find(item => item.id === 'rom')?.ok, true);
    assert.equal(checks.find(item => item.id === 'rom-hash')?.ok, false);
    await rm(join(instance, 'config', 'mario64', 'sm64.dll'));
    assert.equal((await installer.verify(minecraft)).find(item => item.id === 'native')?.ok, false);
    await writeFile(join(instance, 'mods', 'fabric-api-0.119.4+1.21.4.jar'), 'corrupt jar');
    assert.equal((await installer.verify(minecraft)).find(item => item.id === 'fabric-api')?.ok, false);
    await assert.rejects(() => installer.selectProfile(minecraft), /not ready/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
