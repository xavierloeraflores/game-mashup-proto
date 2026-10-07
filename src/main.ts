import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { discoverGames, resolveGameRequirements } from './core/discovery';
import { readJson } from './core/fs';
import { MarioInstaller, managedFabricVersionId, type BuildReview, type InstallOptions, type InstallReceipt } from './core/mario';
import { ManagedTools } from './core/managed-tools';
import { CrossOverSteamProvider, SteamProvider } from './core/providers/steam';
import { ManualProvider, type Settings } from './core/providers/manual';
import { MinecraftLauncherProvider } from './core/providers/minecraft';
import { loadRegistry } from './core/registry';

let window: BrowserWindow | undefined;
let review: BuildReview | undefined;
let options: InstallOptions | undefined;
let busy = false;

const dataRoot = () => app.getPath('userData');
const settingsPath = () => join(dataRoot(), 'settings.json');
const installer = () => new MarioInstaller(dataRoot(), line => window?.webContents.send('log', line));

async function settings(): Promise<Settings> {
  return await readJson<Settings>(settingsPath()) ?? { manualPaths: {} };
}

async function updateSettings(change: Partial<Settings>): Promise<void> {
  const current = await settings();
  await mkdir(dataRoot(), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify({ ...current, ...change }, null, 2));
}

async function snapshot() {
  const registry = await loadRegistry();
  const minecraft = new MinecraftLauncherProvider();
  const installations = await discoverGames(registry, [minecraft, new SteamProvider(), new CrossOverSteamProvider(), new ManualProvider(settingsPath())]);
  const mcStatus = await minecraft.inspect();
  const saved = await settings();
  const buildTools = await installer().inspectTools(saved);
  let romValid = false;
  let romError = '';
  if (saved.romPath) {
    try { await installer().validateRom(saved.romPath); romValid = true; }
    catch (error) { romError = String(error instanceof Error ? error.message : error); }
  }
  const root = saved.manualPaths['minecraft-java']
    || mcStatus.installations.find(item => item.version === '1.21.4')?.rootPath
    || mcStatus.installations[0]?.rootPath
    || mcStatus.rootDirectories[0];
  const checks = root ? await installer().verify(root) : [];
  const installedRomValid = checks.find(item => item.id === 'rom-hash')?.ok ?? false;
  const gameRequirements = resolveGameRequirements(registry, 'mario64-in-minecraft', installations, { 'super-mario-64': romValid || installedRomValid });
  return {
    registry, installations, minecraft: mcStatus, gameRequirements, romValid, installedRomValid, romError,
    romPath: saved.romPath, toolchainBinPath: saved.toolchainBinPath, pythonBinPath: saved.pythonBinPath, javaBinPath: saved.javaBinPath,
    manualPaths: saved.manualPaths,
    minecraftRoot: root,
    checks,
    buildTools,
    managedToolsAvailable: process.platform === 'win32' && process.arch === 'x64',
    ready: checks.length > 0 && checks.every(item => item.ok),
    profileRepairable: checks.length > 0 && checks.some(item => item.id === 'fabric-profile' && !item.ok) &&
      checks.every(item => item.id === 'fabric-profile' || item.ok),
  };
}

async function chooseDirectory(): Promise<string | undefined> {
  if (!window) return;
  const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
  return result.canceled ? undefined : result.filePaths[0];
}

async function withBusy<T>(operation: () => Promise<T>): Promise<T> {
  if (busy) throw new Error('An installation operation is already running.');
  busy = true;
  try { return await operation(); } finally { busy = false; }
}

function registerIpc(): void {
  ipcMain.handle('snapshot', snapshot);
  ipcMain.handle('open-minecraft-launcher', async () => {
    await openMinecraftLauncher();
    return 'Minecraft Launcher opened. Install and run Java Edition 1.21.4, then rescan this app.';
  });
  ipcMain.handle('choose-minecraft', async () => {
    const path = await chooseDirectory();
    if (path) {
      const current = await settings();
      await updateSettings({ manualPaths: { ...current.manualPaths, 'minecraft-java': path } });
    }
    return await snapshot();
  });
  ipcMain.handle('choose-rom', async () => {
    if (!window) return await snapshot();
    const result = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'Super Mario 64 ROM', extensions: ['z64'] }] });
    if (!result.canceled) {
      await installer().validateRom(result.filePaths[0]);
      await updateSettings({ romPath: result.filePaths[0] });
    }
    return await snapshot();
  });
  ipcMain.handle('choose-toolchain', async () => {
    const path = await chooseDirectory();
    if (path) await updateSettings({ toolchainBinPath: path });
    return await snapshot();
  });
  ipcMain.handle('choose-python', async () => {
    const path = await chooseDirectory();
    if (path) await updateSettings({ pythonBinPath: path });
    return await snapshot();
  });
  ipcMain.handle('choose-java', async () => {
    const path = await chooseDirectory();
    if (path) await updateSettings({ javaBinPath: path });
    return await snapshot();
  });
  ipcMain.handle('install-managed-tools', () => withBusy(async () => {
    const paths = await new ManagedTools(dataRoot(), line => window?.webContents.send('log', line)).installWindows();
    await updateSettings(paths);
    return await snapshot();
  }));
  ipcMain.handle('prepare', () => withBusy(async () => {
    const state = await snapshot();
    if (!state.minecraftRoot || !state.romPath) throw new Error('Select a Minecraft Java directory and your SM64 US ROM first.');
    options = { minecraftRoot: state.minecraftRoot, romPath: state.romPath, toolchainBinPath: state.toolchainBinPath, pythonBinPath: state.pythonBinPath, javaBinPath: state.javaBinPath };
    review = await installer().prepare(options);
    return review;
  }));
  ipcMain.handle('install', (_event, approvedCommit: string) => withBusy(async () => {
    if (!review || !options || review.sourceCommit !== approvedCommit) throw new Error('Review the exact upstream script before running it.');
    const current = review;
    review = undefined;
    const receipt = await installer().install(options, current);
    return { receipt, state: await snapshot() };
  }));
  ipcMain.handle('play', () => withBusy(async () => {
    const state = await snapshot();
    if ((!state.ready && !state.profileRepairable) || !state.minecraftRoot) throw new Error('Installation is not ready.');
    await installer().selectProfile(state.minecraftRoot);
    const receipt = await readJson<InstallReceipt>(join(installer().instancePath(), 'installation.json'));
    await openMinecraftLauncher();
    return `Minecraft Launcher opened. Select “Mario 64 in Minecraft” with version “${managedFabricVersionId(receipt!.fabricLoader)}” in its bottom-left installation dropdown, then press Play. The official Launcher may ignore the saved profile selection.`;
  }));
  ipcMain.handle('open-source', async () => { await shell.openExternal('https://github.com/Zckyy/mario64-in-minecraft'); });
}

async function openMinecraftLauncher(): Promise<void> {
  const launcher = await launcherExecutable();
  if (launcher) {
    await launchDetached(launcher, []);
    return;
  }
  if (process.platform === 'win32') {
    const { exists } = await import('./core/fs');
    const packagePath = join(process.env.LOCALAPPDATA ?? '', 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe');
    if (await exists(packagePath)) {
      // The minecraft: URI belongs to Bedrock on some machines. Open the verified Launcher package instead.
      await launchDetached('explorer.exe', ['shell:AppsFolder\\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft']);
      return;
    }
  }
  if (process.platform === 'darwin') {
    await launchDetached('open', ['-a', 'Minecraft']);
    return;
  }
  throw new Error('Minecraft Launcher executable not found. Install the official Minecraft Launcher first.');
}

async function launchDetached(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

async function launcherExecutable(): Promise<string | undefined> {
  const { exists } = await import('./core/fs');
  const candidates = process.platform === 'win32'
    ? [join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Minecraft Launcher', 'MinecraftLauncher.exe'), join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Minecraft Launcher', 'MinecraftLauncher.exe')]
    : process.platform === 'darwin' ? ['/Applications/Minecraft.app/Contents/MacOS/launcher'] : ['/usr/bin/minecraft-launcher', '/usr/local/bin/minecraft-launcher'];
  for (const path of candidates) if (await exists(path)) return path;
  return undefined;
}

app.whenReady().then(() => {
  registerIpc();
  window = new BrowserWindow({
    width: 1120, height: 760, minWidth: 860, minHeight: 600,
    backgroundColor: '#11141b', title: 'Game Mashup Launcher',
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  void window.loadFile(join(__dirname, 'ui', 'index.html'));
  window.on('closed', () => { window = undefined; });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
