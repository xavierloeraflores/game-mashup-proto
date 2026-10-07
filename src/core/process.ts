import { spawn } from 'node:child_process';

export type LogHandler = (line: string) => void;

export async function run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; log?: LogHandler } = {}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env, windowsHide: true, shell: false });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk: Buffer) => {
        const value = chunk.toString();
        output = (output + value).slice(-12000);
        options.log?.(value);
      });
    }
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}\n${output}`)));
  });
}

export async function commandWorks(command: string, args: string[] = ['--version'], env?: NodeJS.ProcessEnv): Promise<boolean> {
  try { await run(command, args, { env }); return true; } catch { return false; }
}
