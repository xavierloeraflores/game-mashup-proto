import { readdir } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { exists, isDirectory, readJson } from '../fs';
import type { GameInstallation, GameMetadata, GameProvider } from '../types';

interface LauncherProfile { gameDir?: string; lastVersionId?: string; name?: string }
interface ProfilesFile { profiles?: Record<string, LauncherProfile> }

export interface MinecraftDiscovery {
  launcherInstalled: boolean;
  javaUsable: boolean;
  bedrockDetected: boolean;
  directories: string[];
  installations: GameInstallation[];
}

export class MinecraftLauncherProvider implements GameProvider {
  readonly id = 'minecraft-launcher';
  constructor(private readonly home = homedir(), private readonly os = platform(), private readonly env = process.env) {}

  async discover(game: GameMetadata): Promise<GameInstallation[]> {
    return (await this.inspect(game)).installations;
  }

  async inspect(game: GameMetadata = { id: 'minecraft-java', name: 'Minecraft: Java Edition', providerIds: [this.id] }): Promise<MinecraftDiscovery> {
    const roots = this.candidateRoots();
    const directories = new Set<string>();
    const installations: GameInstallation[] = [];
    let launcherInstalled = false;
    let bedrockDetected = false;

    for (const launcherPath of this.launcherCandidates()) {
      if (await exists(launcherPath)) launcherInstalled = true;
    }
    for (const bedrockPath of this.bedrockCandidates()) {
      if (await exists(bedrockPath)) bedrockDetected = true;
    }
    for (const root of roots) {
      if (!await isDirectory(root)) continue;
      directories.add(root);
      const profileFiles = ['launcher_profiles.json', 'launcher_profiles_microsoft_store.json'];
      for (const file of profileFiles) {
        const data = await readJson<ProfilesFile>(join(root, file));
        if (data) launcherInstalled = true;
        for (const [profileId, profile] of Object.entries(data?.profiles ?? {})) {
          if (profile.gameDir) directories.add(resolve(root, profile.gameDir));
          if (profile.lastVersionId) {
            const gameDir = profile.gameDir ? resolve(root, profile.gameDir) : root;
            const versionPath = join(root, 'versions', profile.lastVersionId, `${profile.lastVersionId}.json`);
            if (await exists(versionPath)) {
              const version = await readJson<{ inheritsFrom?: string }>(versionPath);
              const gameVersion = version?.inheritsFrom ?? profile.lastVersionId;
              if (await exists(join(root, 'versions', gameVersion, `${gameVersion}.jar`))) {
                installations.push({ gameId: game.id, providerId: this.id, path: gameDir, version: gameVersion, profileId, details: profile.name });
              }
            }
          }
        }
      }
      const versionsDir = join(root, 'versions');
      if (await isDirectory(versionsDir)) {
        for (const version of await readdir(versionsDir)) {
          if (!await exists(join(versionsDir, version, `${version}.json`))) continue;
          const vanillaVersion = /^\d+\.\d+(?:\.\d+)?$/.test(version) ? version : undefined;
          const inherited = await readJson<{ inheritsFrom?: string }>(join(versionsDir, version, `${version}.json`));
          const gameVersion = vanillaVersion ?? inherited?.inheritsFrom;
          if (!gameVersion) continue;
          // A version manifest alone may be left behind after uninstall. Vanilla's JAR must exist.
          if (!await exists(join(versionsDir, gameVersion, `${gameVersion}.jar`))) continue;
          installations.push({ gameId: game.id, providerId: this.id, path: root, version: gameVersion, profileId: version, details: version });
        }
      }
    }
    const unique = new Map<string, GameInstallation>();
    for (const item of installations) unique.set(`${item.path}|${item.version}|${item.profileId}`, item);
    return { launcherInstalled, javaUsable: unique.size > 0, bedrockDetected, directories: [...directories], installations: [...unique.values()] };
  }

  private candidateRoots(): string[] {
    if (this.os === 'win32') {
      const appdata = this.env.APPDATA ?? join(this.home, 'AppData', 'Roaming');
      const local = this.env.LOCALAPPDATA ?? join(this.home, 'AppData', 'Local');
      return [join(appdata, '.minecraft'), join(local, 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Roaming', '.minecraft')];
    }
    if (this.os === 'darwin') return [join(this.home, 'Library', 'Application Support', 'minecraft')];
    return [join(this.home, '.minecraft')];
  }

  private launcherCandidates(): string[] {
    if (this.os === 'win32') {
      return [join(this.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Minecraft Launcher', 'MinecraftLauncher.exe'), join(this.env.ProgramFiles ?? 'C:\\Program Files', 'Minecraft Launcher', 'MinecraftLauncher.exe'), join(this.env.LOCALAPPDATA ?? '', 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe')];
    }
    if (this.os === 'darwin') return ['/Applications/Minecraft.app', join(this.home, 'Applications', 'Minecraft.app')];
    return ['/usr/share/minecraft-launcher', '/opt/minecraft-launcher', join(this.home, '.local', 'share', 'applications', 'minecraft-launcher.desktop')];
  }

  private bedrockCandidates(): string[] {
    if (this.os !== 'win32') return [];
    return [join(this.env.LOCALAPPDATA ?? '', 'Packages', 'Microsoft.MinecraftUWP_8wekyb3d8bbwe')];
  }
}
