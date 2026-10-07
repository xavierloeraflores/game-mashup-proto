import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectJavaPackage } from '../core/managed-tools';

test('managed Java download accepts only a Java 21 JRE ZIP from Adoptium releases', () => {
  const valid = {
    version: { major: 21 },
    binary: { package: {
      name: 'OpenJDK21U-jre_x64_windows_hotspot_21.0.12.1_1.zip',
      link: 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_x64_windows_hotspot_21.0.12.1_1.zip',
      checksum: 'a'.repeat(64),
    } },
  };
  assert.deepEqual(selectJavaPackage([{ ...valid, version: { major: 17 } }, { ...valid, binary: { package: { ...valid.binary.package, link: 'https://example.com/java.zip' } } }, valid]), valid.binary.package);
  assert.equal(selectJavaPackage([{ ...valid, binary: { package: { ...valid.binary.package, checksum: 'bad' } } }]), undefined);
});
