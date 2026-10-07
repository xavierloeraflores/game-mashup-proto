import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { access } from 'node:fs/promises';
import { discoverGames, resolveGameRequirements } from './core/discovery';
import { MarioInstaller } from './core/mario';
import { CrossOverSteamProvider, SteamProvider } from './core/providers/steam';
import { MinecraftLauncherProvider } from './core/providers/minecraft';
import { loadRegistry } from './core/registry';

async function main(): Promise<void> {
  // npm's Windows script runner may pass literal cmd.exe escape carets in quoted paths.
  const args = process.argv.slice(2).map(arg => process.platform === 'win32' && process.env.npm_lifecycle_event === 'doctor' ? arg.replace(/\^/g, '') : arg);
  const value = (name: string) => {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    const next = args.findIndex((item, offset) => offset > index && item.startsWith('--'));
    return args.slice(index + 1, next < 0 ? undefined : next).join(' ') || undefined;
  };
  const registry = await loadRegistry();
  const minecraft = new MinecraftLauncherProvider();
  const mcStatus = await minecraft.inspect();
  const installations = await discoverGames(registry, [minecraft, new SteamProvider(), new CrossOverSteamProvider()]);
  const manualRoot = value('--minecraft');
  if (manualRoot) {
    const root = resolve(manualRoot);
    console.log('Manual Minecraft directory:', root);
    try {
      await access(resolve(root, 'versions', '1.21.4', '1.21.4.jar'));
      await access(resolve(root, 'versions', '1.21.4', '1.21.4.json'));
      console.log('Minecraft Java 1.21.4: found');
      installations['minecraft-java'].push({ gameId: 'minecraft-java', providerId: 'manual', path: root, version: '1.21.4' });
    }
    catch { console.log('Minecraft Java 1.21.4: missing'); }
    if (value('--data-root')) {
      const installer = new MarioInstaller(resolve(value('--data-root')!));
      console.log('Managed installation checks:', await installer.verify(root));
    }
  }
  const rom = value('--rom');
  let romValid = false;
  if (rom) {
    try {
      await new MarioInstaller(resolve(homedir(), '.game-mashup-doctor')).validateRom(resolve(rom));
      romValid = true;
    } catch (error) { console.log('ROM:', error instanceof Error ? error.message : String(error)); }
  }
  console.log('Minecraft Launcher installed:', mcStatus.launcherInstalled);
  console.log('Minecraft Java usable:', mcStatus.javaUsable);
  console.log('Minecraft Bedrock detected:', mcStatus.bedrockDetected);
  console.log('Game installations:', JSON.stringify(installations, null, 2));
  console.log('Mario requirements:', resolveGameRequirements(registry, 'mario64-in-minecraft', installations, { 'super-mario-64': romValid }));
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
