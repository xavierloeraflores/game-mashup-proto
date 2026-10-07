import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { download, getJson, hashFile } from './download';
import { exists, isDirectory, readJson } from './fs';
import { commandWorks, run, type LogHandler } from './process';

export const MINECRAFT_VERSION = '1.21.4';
export const ROM_SHA1 = '9bef1128717f958171a4afac3ed78ee2bb4e86ce';
export const PROFILE_ID = 'game-mashup-mario64';
const REPOSITORY = 'Zckyy/mario64-in-minecraft';

interface GithubAsset { name: string; browser_download_url: string }
interface GithubRelease { tag_name: string; published_at: string; assets: GithubAsset[] }
interface ModrinthFile { filename: string; url: string; primary: boolean; hashes: { sha512?: string; sha1?: string } }
interface ModrinthVersion { version_number: string; files: ModrinthFile[]; version_type: string }
interface FabricInstallerVersion { version: string; url: string; stable: boolean }
interface FabricLoaderVersion { loader: { version: string; stable: boolean } }

export interface BuildReview {
  source: string;
  releaseTag: string;
  sourceCommit: string;
  scriptSha256: string;
  scriptPath: string;
  script: string;
  buildTools: BuildToolStatus;
  romSha1: string;
}

export interface BuildToolStatus { git: boolean; python: boolean; bash: boolean; compiler: boolean; java: boolean }

export interface InstallOptions {
  minecraftRoot: string;
  romPath: string;
  toolchainBinPath?: string;
  pythonBinPath?: string;
  javaBinPath?: string;
}

export interface InstallReceipt {
  repository: string;
  releaseTag: string;
  downloadUrl: string;
  downloadDate: string;
  installedVersion: string;
  sha256: string;
  fabricLoader: string;
  fabricApi: string;
  fabricApiFile: string;
  sourceCommit: string;
  instancePath: string;
  minecraftRoot: string;
  profileId: string;
}

export interface InstallationCheck { id: string; ok: boolean; detail: string }

function nativeLibraryName(): string {
  return platform() === 'win32' ? 'sm64.dll' : platform() === 'darwin' ? 'libsm64.dylib' : 'libsm64.so';
}

function versionAtLeast(actual: string, minimum: string): boolean {
  const a = actual.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

export function javaMajorVersion(output: string): number | undefined {
  const match = output.match(/(?:java|openjdk) version "(\d+)(?:\.(\d+))?/i);
  if (!match) return undefined;
  return Number(match[1]) === 1 ? Number(match[2]) : Number(match[1]);
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.mashup-tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await rename(temp, path);
}

export class MarioInstaller {
  constructor(readonly dataRoot: string, private readonly log: LogHandler = () => {}) {}

  instancePath(): string { return join(this.dataRoot, 'minecraft-instances', 'mario64'); }

  async validateRom(path: string): Promise<string> {
    if (!path.toLowerCase().endsWith('.z64')) throw new Error('Choose a .z64 Super Mario 64 USA ROM.');
    if (!await exists(path)) throw new Error('ROM file does not exist.');
    const actual = await hashFile(path, 'sha1');
    if (actual !== ROM_SHA1) throw new Error(`This does not appear to be the supported Super Mario 64 US ROM.\nExpected: ${ROM_SHA1}\nDetected: ${actual}`);
    return actual;
  }

  async inspectTools(options: Pick<InstallOptions, 'toolchainBinPath' | 'pythonBinPath' | 'javaBinPath'>): Promise<BuildToolStatus> {
    const env = this.buildEnvironment(options);
    const bash = await this.bashPath();
    return {
      git: await commandWorks('git'),
      python: await commandWorks('python', ['-c', 'import sys; assert sys.version_info.major == 3'], env) || await commandWorks('python3', ['-c', 'import sys; assert sys.version_info.major == 3'], env),
      bash: !!bash,
      compiler: await this.bashCommandWorks(bash, 'command -v gcc >/dev/null && command -v make >/dev/null', env),
      java: await this.java21Works(env),
    };
  }

  async prepare(options: InstallOptions): Promise<BuildReview> {
    await this.requireMinecraftVersion(options.minecraftRoot);
    const romSha1 = await this.validateRom(options.romPath);
    if (!await commandWorks('git')) throw new Error('Git is required to fetch the reviewed upstream source. Install Git, then retry.');
    const release = await this.release();
    const sourceDir = this.sourcePath(release.tag_name);
    if (!await isDirectory(join(sourceDir, '.git'))) {
      await mkdir(dirname(sourceDir), { recursive: true });
      await run('git', ['clone', '--depth', '1', '--branch', release.tag_name, `https://github.com/${REPOSITORY}.git`, sourceDir], { log: this.log });
    }
    const sourceCommit = await this.gitHead(sourceDir);
    await run('git', ['diff', '--quiet', 'HEAD', '--'], { cwd: sourceDir });
    const scriptPath = join(sourceDir, 'scripts', 'build-libsm64.sh');
    const script = await readFile(scriptPath, 'utf8');
    const scriptSha256 = createHash('sha256').update(script).digest('hex');
    const buildTools = await this.inspectTools(options);
    return { source: `https://github.com/${REPOSITORY}`, releaseTag: release.tag_name, sourceCommit, scriptSha256, scriptPath, script, buildTools, romSha1 };
  }

  async install(options: InstallOptions, approved: Pick<BuildReview, 'sourceCommit' | 'scriptSha256' | 'releaseTag'>): Promise<InstallReceipt> {
    const review = await this.prepare(options);
    if (review.sourceCommit !== approved.sourceCommit || review.scriptSha256 !== approved.scriptSha256 || review.releaseTag !== approved.releaseTag) {
      throw new Error('The source changed since review. Review the script again.');
    }
    const missing = Object.entries(review.buildTools).filter(([, ready]) => !ready).map(([tool]) => tool);
    if (missing.length) throw new Error(`Missing build tools: ${missing.join(', ')}. Install them and retry.`);
    const release = await this.release();
    if (release.tag_name !== review.releaseTag) throw new Error('Release changed since review. Review again.');
    const sourceDir = this.sourcePath(release.tag_name);
    const bash = await this.bashPath();
    if (!bash) throw new Error('Bash is required. On Windows, install Git for Windows.');
    this.log('Building libsm64 from reviewed upstream source...\n');
    await run(bash, ['scripts/build-libsm64.sh'], { cwd: sourceDir, env: this.buildEnvironment(options), log: this.log });
    const built = join(sourceDir, 'build', 'libsm64', 'dist', nativeLibraryName());
    if (!await exists(built)) throw new Error(`Build succeeded but ${built} was not found.`);

    const instance = this.instancePath();
    const modsDir = join(instance, 'mods');
    const configDir = join(instance, 'config', 'mario64');
    await mkdir(modsDir, { recursive: true });
    await mkdir(configDir, { recursive: true });
    const loader = await this.installFabric(options);
    const mod = release.assets.find(asset => /^mario64mc-[\w.-]+\.jar$/i.test(asset.name));
    if (!mod) throw new Error('Upstream release has no Fabric mod JAR.');
    const modCache = join(this.dataRoot, 'cache', 'mods', mod.name);
    const modHash = await download(mod.browser_download_url, modCache);

    const apiVersions = await getJson<ModrinthVersion[]>(`https://api.modrinth.com/v2/project/fabric-api/version?game_versions=%5B%22${MINECRAFT_VERSION}%22%5D&loaders=%5B%22fabric%22%5D`);
    const api = apiVersions.find(item => item.version_type === 'release' && item.files.some(file => file.filename.endsWith('.jar')));
    const apiFile = api?.files.find(file => file.primary && file.filename.endsWith('.jar')) ?? api?.files.find(file => file.filename.endsWith('.jar'));
    if (!api || !apiFile) throw new Error('No Fabric API JAR found for Minecraft 1.21.4.');
    if (basename(apiFile.filename) !== apiFile.filename) throw new Error('Unexpected Fabric API filename.');
    const apiCache = join(this.dataRoot, 'cache', 'mods', apiFile.filename);
    await download(apiFile.url, apiCache, apiFile.hashes.sha512 ? { algorithm: 'sha512', value: apiFile.hashes.sha512 } : undefined);
    const prior = await readJson<InstallReceipt>(join(instance, 'installation.json'));
    for (const oldName of [prior?.installedVersion ? `mario64mc-${prior.installedVersion}.jar` : undefined, prior?.fabricApiFile]) {
      if (oldName && oldName !== mod.name && oldName !== apiFile.filename && /^(mario64mc|fabric-api)-[\w.+-]+\.jar$/i.test(oldName)) {
        await rm(join(modsDir, oldName), { force: true });
      }
    }
    await copyFile(modCache, join(modsDir, mod.name));
    await copyFile(apiCache, join(modsDir, apiFile.filename));
    await copyFile(options.romPath, join(configDir, 'baserom.us.z64'));
    await copyFile(built, join(configDir, nativeLibraryName()));
    await this.writeProfile(options.minecraftRoot, loader);
    const receipt: InstallReceipt = {
      repository: REPOSITORY, releaseTag: release.tag_name, downloadUrl: mod.browser_download_url,
      downloadDate: new Date().toISOString(), installedVersion: mod.name.replace(/^mario64mc-/, '').replace(/\.jar$/, ''),
      sha256: modHash, fabricLoader: loader, fabricApi: api.version_number, fabricApiFile: apiFile.filename, sourceCommit: review.sourceCommit,
      instancePath: instance, minecraftRoot: options.minecraftRoot, profileId: PROFILE_ID,
    };
    await atomicJson(join(instance, 'installation.json'), receipt);
    const checks = await this.verify(options.minecraftRoot);
    const failed = checks.filter(item => !item.ok);
    if (failed.length) throw new Error(`Installation verification failed: ${failed.map(item => item.detail).join('; ')}`);
    return receipt;
  }

  async verify(minecraftRoot: string): Promise<InstallationCheck[]> {
    const instance = this.instancePath();
    const receipt = await readJson<InstallReceipt>(join(instance, 'installation.json'));
    const version = receipt?.fabricLoader ? `fabric-loader-${receipt.fabricLoader}-${MINECRAFT_VERSION}` : undefined;
    const profileFiles = ['launcher_profiles.json', 'launcher_profiles_microsoft_store.json'];
    let profileFound = false;
    for (const name of profileFiles) {
      const data = await readJson<{ profiles?: Record<string, { gameDir?: string; lastVersionId?: string }> }>(join(minecraftRoot, name));
      if (data?.profiles?.[PROFILE_ID]?.gameDir === instance && data.profiles[PROFILE_ID].lastVersionId === version) profileFound = true;
    }
    const modPath = receipt?.installedVersion && /^[\w.+-]+$/.test(receipt.installedVersion) ? join(instance, 'mods', `mario64mc-${receipt.installedVersion}.jar`) : undefined;
    const safeHash = async (path: string, algorithm: 'sha1' | 'sha256') => {
      try { return await hashFile(path, algorithm); } catch { return undefined; }
    };
    const modOk = !!modPath && await exists(modPath) && await safeHash(modPath, 'sha256') === receipt?.sha256;
    const apiOk = !!receipt?.fabricApiFile && basename(receipt.fabricApiFile) === receipt.fabricApiFile && await exists(join(instance, 'mods', receipt.fabricApiFile));
    const romPath = join(instance, 'config', 'mario64', 'baserom.us.z64');
    const romOk = await exists(romPath) && await safeHash(romPath, 'sha1') === ROM_SHA1;
    return [
      { id: 'minecraft-java', ok: await isDirectory(minecraftRoot), detail: 'Minecraft Java path exists' },
      { id: 'minecraft-version', ok: await exists(join(minecraftRoot, 'versions', MINECRAFT_VERSION, `${MINECRAFT_VERSION}.jar`)), detail: `Minecraft Java ${MINECRAFT_VERSION} exists` },
      { id: 'instance', ok: await isDirectory(instance), detail: 'Managed instance exists' },
      { id: 'fabric-profile', ok: !!version && versionAtLeast(receipt?.fabricLoader ?? '0', '0.16.10') && profileFound && await exists(join(minecraftRoot, 'versions', version, `${version}.json`)), detail: 'Fabric profile/config exists' },
      { id: 'fabric-api', ok: apiOk, detail: 'Fabric API JAR exists' },
      { id: 'mario-mod', ok: modOk, detail: 'mario64mc JAR exists with recorded SHA-256' },
      { id: 'native', ok: await exists(join(instance, 'config', 'mario64', nativeLibraryName())), detail: 'sm64 native library exists' },
      { id: 'rom', ok: await exists(romPath), detail: 'baserom.us.z64 exists' },
      { id: 'rom-hash', ok: romOk, detail: 'ROM checksum is supported' },
    ];
  }

  async selectProfile(minecraftRoot: string): Promise<void> {
    const checks = await this.verify(minecraftRoot);
    if (checks.some(item => !item.ok)) throw new Error('Installation is not ready to play.');
    for (const name of ['launcher_profiles_microsoft_store.json', 'launcher_profiles.json']) {
      const path = join(minecraftRoot, name);
      const data = await readJson<Record<string, unknown>>(path);
      if (data && typeof data.profiles === 'object' && data.profiles !== null && PROFILE_ID in data.profiles) {
        data.selectedProfile = PROFILE_ID;
        await atomicJson(path, data);
        return;
      }
    }
    throw new Error('Managed Minecraft profile not found.');
  }

  private async requireMinecraftVersion(root: string): Promise<void> {
    if (!await exists(join(root, 'versions', MINECRAFT_VERSION, `${MINECRAFT_VERSION}.jar`))) {
      throw new Error(`Minecraft Java installed, but Minecraft Java ${MINECRAFT_VERSION} installation/profile not found. Install and run that version once in Minecraft Launcher.`);
    }
  }

  private async release(): Promise<GithubRelease> {
    return await getJson<GithubRelease>(`https://api.github.com/repos/${REPOSITORY}/releases/latest`);
  }

  private sourcePath(tag: string): string { return join(this.dataRoot, 'sources', `mario64-in-minecraft-${tag.replace(/[^\w.-]/g, '_')}`); }

  private async gitHead(cwd: string): Promise<string> {
    return await new Promise<string>((resolve, reject) => execFile('git', ['rev-parse', 'HEAD'], { cwd }, (error, stdout) => error ? reject(error) : resolve(stdout.trim())));
  }

  private async java21Works(env: NodeJS.ProcessEnv): Promise<boolean> {
    return await new Promise<boolean>(resolve => {
      execFile('java', ['-version'], { env }, (error, stdout, stderr) => {
        if (error) { resolve(false); return; }
        resolve((javaMajorVersion(`${stdout}\n${stderr}`) ?? 0) >= 21);
      });
    });
  }

  private async bashPath(): Promise<string | undefined> {
    if (platform() !== 'win32') return await commandWorks('bash', ['--version']) ? 'bash' : undefined;
    const candidates = [
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
      join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
    ];
    for (const candidate of candidates) if (await exists(candidate)) return candidate;
    return await commandWorks('bash', ['--version']) ? 'bash' : undefined;
  }

  private buildEnvironment(options: Pick<InstallOptions, 'toolchainBinPath' | 'pythonBinPath' | 'javaBinPath'>): NodeJS.ProcessEnv {
    const extra = [options.toolchainBinPath, options.pythonBinPath, options.javaBinPath].filter((path): path is string => !!path);
    return { ...process.env, PATH: [...extra, process.env.PATH ?? ''].join(platform() === 'win32' ? ';' : ':') };
  }

  private async bashCommandWorks(bash: string | undefined, script: string, env: NodeJS.ProcessEnv): Promise<boolean> {
    if (!bash) return false;
    try { await run(bash, ['-c', script], { env }); return true; } catch { return false; }
  }

  private async installFabric(options: InstallOptions): Promise<string> {
    const minecraftRoot = options.minecraftRoot;
    const versions = await getJson<FabricLoaderVersion[]>(`https://meta.fabricmc.net/v2/versions/loader/${MINECRAFT_VERSION}`);
    const loader = versions.find(item => item.loader.stable && versionAtLeast(item.loader.version, '0.16.10'))?.loader.version;
    if (!loader) throw new Error('No compatible stable Fabric Loader found.');
    const installers = await getJson<FabricInstallerVersion[]>('https://meta.fabricmc.net/v2/versions/installer');
    const installer = installers.find(item => item.stable);
    if (!installer || !installer.url.startsWith('https://maven.fabricmc.net/')) throw new Error('No official Fabric installer available.');
    const installerPath = join(this.dataRoot, 'cache', 'tools', `fabric-installer-${installer.version}.jar`);
    await download(installer.url, installerPath);
    const args = ['-jar', installerPath, 'client', '-dir', minecraftRoot, '-mcversion', MINECRAFT_VERSION, '-loader', loader];
    if (platform() === 'win32') {
      args.push('-launcher', await exists(join(minecraftRoot, 'launcher_profiles_microsoft_store.json')) ? 'microsoft_store' : 'win32');
    }
    this.log(`Installing Fabric Loader ${loader}...\n`);
    await run('java', args, { env: this.buildEnvironment(options), log: this.log });
    return loader;
  }

  private async writeProfile(minecraftRoot: string, loader: string): Promise<void> {
    const name = await exists(join(minecraftRoot, 'launcher_profiles_microsoft_store.json')) ? 'launcher_profiles_microsoft_store.json' : 'launcher_profiles.json';
    const path = join(minecraftRoot, name);
    const data = await readJson<{ profiles?: Record<string, Record<string, unknown>>; [key: string]: unknown }>(path) ?? { profiles: {} };
    data.profiles ??= {};
    const version = `fabric-loader-${loader}-${MINECRAFT_VERSION}`;
    data.profiles[PROFILE_ID] = {
      ...data.profiles[PROFILE_ID], name: 'Mario 64 in Minecraft', type: 'custom', gameDir: this.instancePath(),
      lastVersionId: version, created: data.profiles[PROFILE_ID]?.created ?? new Date().toISOString(), lastUsed: new Date().toISOString(),
    };
    await atomicJson(path, data);
  }
}
