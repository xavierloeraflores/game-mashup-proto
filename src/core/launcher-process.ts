import { execFile } from 'node:child_process';
import { platform } from 'node:os';

export function isMinecraftLauncherProcess(command: string): boolean {
  const normalized = command.trim().replace(/^"|"$/g, '').replace(/\\/g, '/').toLowerCase();
  const name = normalized.split('/').at(-1);
  return name === 'minecraft.exe' || name === 'minecraftlauncher.exe' ||
    name === 'minecraft-launcher' || name === 'minecraft launcher' || name === 'minecraft' ||
    normalized.endsWith('/minecraft.app/contents/macos/launcher');
}

export function processListContainsMinecraftLauncher(output: string, windows: boolean): boolean {
  return output.split(/\r?\n/).some(line => {
    const name = windows ? line.match(/^"([^"]+)"/)?.[1] : line;
    return !!name && isMinecraftLauncherProcess(name);
  });
}

export async function minecraftLauncherRunning(): Promise<boolean> {
  const windows = platform() === 'win32';
  const command = windows ? 'tasklist' : 'ps';
  const args = windows ? ['/fo', 'csv', '/nh'] : ['-A', '-o', 'comm='];
  const output = await new Promise<string>((resolve, reject) => {
    execFile(command, args, { timeout: 10000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) =>
      error ? reject(new Error(`Could not check whether Minecraft Launcher is running: ${error.message}`)) : resolve(stdout));
  });
  return processListContainsMinecraftLauncher(output, windows);
}

export async function requireMinecraftLauncherClosed(): Promise<void> {
  if (await minecraftLauncherRunning()) {
    throw new Error('Close Minecraft Launcher completely, then retry. The launcher can overwrite Fabric profiles while it is running.');
  }
}
