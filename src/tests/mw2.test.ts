import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { IW4L_RELEASE, MW2Installer, isMw2MultiplayerPath, releaseFiles } from '../core/mw2';
import { hashFile } from '../core/download';

test('IW4L archive accepts the pinned release layout and rejects escaped entries', () => {
  const source = zipSync({
    '2010-Rust-Rewrite-Mashup/iw4l.exe': new Uint8Array([1, 2]),
    '2010-Rust-Rewrite-Mashup/LICENSE': new Uint8Array([3]),
    '2010-Rust-Rewrite-Mashup/README.txt': new Uint8Array([4]),
  });
  assert.deepEqual(releaseFiles(source)['iw4l.exe'], new Uint8Array([1, 2]));
  assert.throws(() => releaseFiles(zipSync({ ...{
    '2010-Rust-Rewrite-Mashup/iw4l.exe': new Uint8Array([1]),
    '2010-Rust-Rewrite-Mashup/LICENSE': new Uint8Array([2]),
    '2010-Rust-Rewrite-Mashup/README.txt': new Uint8Array([3]),
    '2010-Rust-Rewrite-Mashup/../escaped.txt': new Uint8Array([4]),
  } })), /Unsafe IW4L archive entry/);
});

test('MW2 install rejects an executable whose hash differs from the pinned release', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mashup-mw2-'));
  const instance = new MW2Installer(root).instancePath();
  await mkdir(instance, { recursive: true });
  await writeFile(join(instance, 'iw4l.exe'), 'verified');
  const executableSha256 = await hashFile(join(instance, 'iw4l.exe'), 'sha256');
  await writeFile(join(instance, 'installation.json'), JSON.stringify({ tag: IW4L_RELEASE.tag, archiveSha256: IW4L_RELEASE.sha256, executableSha256 }));
  assert.equal(await new MW2Installer(root).verify(), false);
  await writeFile(join(instance, 'iw4l.exe'), 'changed');
  assert.equal(await new MW2Installer(root).verify(), false);
});

test('MW2 multiplayer detection accepts an installed non-English zone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mashup-mw2-locale-'));
  await writeFile(join(root, 'iw4mp.exe'), 'game');
  assert.equal(await isMw2MultiplayerPath(root), false);
  await mkdir(join(root, 'zone', 'french'), { recursive: true });
  await writeFile(join(root, 'zone', 'french', 'common_mp.ff'), 'assets');
  assert.equal(await isMw2MultiplayerPath(root), true);
});
