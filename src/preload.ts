import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('launcher', {
  snapshot: () => ipcRenderer.invoke('snapshot'),
  openMinecraftLauncher: () => ipcRenderer.invoke('open-minecraft-launcher'),
  chooseMinecraft: () => ipcRenderer.invoke('choose-minecraft'),
  chooseRom: () => ipcRenderer.invoke('choose-rom'),
  chooseToolchain: () => ipcRenderer.invoke('choose-toolchain'),
  choosePython: () => ipcRenderer.invoke('choose-python'),
  chooseJava: () => ipcRenderer.invoke('choose-java'),
  installManagedTools: () => ipcRenderer.invoke('install-managed-tools'),
  prepare: () => ipcRenderer.invoke('prepare'),
  install: (commit: string) => ipcRenderer.invoke('install', commit),
  play: () => ipcRenderer.invoke('play'),
  openSource: () => ipcRenderer.invoke('open-source'),
  installMw2: () => ipcRenderer.invoke('install-mw2'),
  playMw2: () => ipcRenderer.invoke('play-mw2'),
  onLog: (listener: (line: string) => void) => ipcRenderer.on('log', (_event, line: string) => listener(line)),
});
