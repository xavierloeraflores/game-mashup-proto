import assert from 'node:assert/strict';
import test from 'node:test';
import { processListContainsMinecraftLauncher } from '../core/launcher-process';

test('launcher process check recognizes official Windows and Unix launchers', () => {
  assert.equal(processListContainsMinecraftLauncher('"Minecraft.exe","4728","Console","1","152,000 K"\r\n', true), true);
  assert.equal(processListContainsMinecraftLauncher('"javaw.exe","4728","Console","1","152,000 K"\r\n', true), false);
  assert.equal(processListContainsMinecraftLauncher('/Applications/Minecraft.app/Contents/MacOS/launcher\n', false), true);
  assert.equal(processListContainsMinecraftLauncher('/usr/bin/minecraft-launcher\n', false), true);
  assert.equal(processListContainsMinecraftLauncher('/usr/bin/java\n', false), false);
});
