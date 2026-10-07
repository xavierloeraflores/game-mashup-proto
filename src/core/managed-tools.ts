import { mkdtemp, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { download, getJson } from './download';
import { exists } from './fs';
import { commandWorks, run, type LogHandler } from './process';
import { extractorPath } from './archive';

const PYTHON = {
  name: 'python-3.13.14',
  url: 'https://www.python.org/ftp/python/3.13.14/python-3.13.14-embed-amd64.zip',
  sha256: '90b4e5b9898b72d744650524bff92377c367f44bd5fbd09e3148656c080ad907',
};
const COMPILER = {
  name: 'w64devkit-2.10.0',
  url: 'https://github.com/skeeto/w64devkit/releases/download/v2.10.0/w64devkit-x64-2.10.0.7z.exe',
  sha256: '18d0a4c71a166f8401ab6305781bec5882b40b5e06ba9807c61cb5f3b3c6325e',
};

interface AdoptiumAsset { binary?: { package?: { link?: string; checksum?: string; name?: string } }; version?: { major?: number } }
export interface ManagedToolPaths { toolchainBinPath: string; pythonBinPath: string; javaBinPath: string }

export function selectJavaPackage(assets: AdoptiumAsset[]): { link: string; checksum: string; name: string } | undefined {
  for (const asset of assets) {
    const candidate = asset.binary?.package;
    if (asset.version?.major === 21 && candidate?.link && candidate.checksum && candidate.name &&
      /^https:\/\/github\.com\/adoptium\/temurin21-binaries\/releases\/download\//.test(candidate.link) &&
      /^[a-f0-9]{64}$/i.test(candidate.checksum) &&
      /^OpenJDK21U-jre_x64_windows_hotspot_[\w.+-]+\.zip$/.test(candidate.name)) return candidate as { link: string; checksum: string; name: string };
  }
  return undefined;
}

async function findBin(root: string, executable: string): Promise<string | undefined> {
  const pending = [{ path: root, depth: 0 }];
  while (pending.length) {
    const current = pending.shift()!;
    if (await exists(join(current.path, executable))) return current.path;
    if (current.depth >= 3) continue;
    for (const item of await readdir(current.path, { withFileTypes: true })) {
      if (item.isDirectory()) pending.push({ path: join(current.path, item.name), depth: current.depth + 1 });
    }
  }
  return undefined;
}

export class ManagedTools {
  constructor(private readonly dataRoot: string, private readonly log: LogHandler = () => {}) {}

  async installWindows(): Promise<ManagedToolPaths> {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Managed build tools currently support Windows x64 only. Select local tool directories instead.');
    const assets = await getJson<AdoptiumAsset[]>('https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse');
    const java = selectJavaPackage(assets);
    if (!java) throw new Error('The official Adoptium API did not provide a verified Java 21 JRE ZIP.');

    const pythonBinPath = await this.installArchive(PYTHON.name, PYTHON.url, PYTHON.sha256, 'python.exe', ['-c', 'import sys; assert sys.version_info >= (3, 13)']);
    const toolchainBinPath = await this.installArchive(COMPILER.name, COMPILER.url, COMPILER.sha256, 'gcc.exe', ['--version']);
    if (!await commandWorks(join(toolchainBinPath, 'make.exe'))) throw new Error('Extracted compiler did not include a working Make executable.');
    const javaBinPath = await this.installArchive('java-21', java.link, java.checksum, 'java.exe', ['-version']);
    return { toolchainBinPath, pythonBinPath, javaBinPath };
  }

  private async installArchive(name: string, url: string, sha256: string, executable: string, args: string[]): Promise<string> {
    const toolsRoot = join(this.dataRoot, 'tools');
    const destination = join(toolsRoot, name);
    const existing = await exists(destination) ? await findBin(destination, executable) : undefined;
    if (existing && await commandWorks(join(existing, executable), args)) return existing;
    if (await exists(destination)) throw new Error(`${destination} contains an incomplete tool installation. Move it aside, then retry.`);
    await mkdir(toolsRoot, { recursive: true });
    const archive = join(this.dataRoot, 'cache', 'tools', url.split('/').at(-1)!);
    this.log(`Downloading ${name} from its official release...\n`);
    await download(url, archive, { algorithm: 'sha256', value: sha256 });
    const stage = await mkdtemp(join(toolsRoot, '.extract-'));
    try {
      this.log(`Extracting ${name} into launcher data...\n`);
      await run(extractorPath(), ['x', '-y', `-o${stage}`, archive]);
      const bin = await findBin(stage, executable);
      if (!bin || !await commandWorks(join(bin, executable), args)) throw new Error(`${name} did not contain a working ${executable}.`);
      await rename(stage, destination);
      const finalBin = resolve(destination, relative(stage, bin));
      if (!finalBin.startsWith(`${resolve(destination)}${sep}`) && finalBin !== resolve(destination)) throw new Error('Extracted tool path escaped its destination.');
      return finalBin;
    } finally {
      // stage is returned by mkdtemp inside toolsRoot, never a user-supplied path.
      if (await exists(stage)) await rm(stage, { recursive: true, force: true });
    }
  }
}
