import { contextBridge, ipcRenderer } from 'electron';
import type { MonitorApi, Snapshot, UpdateState } from '../shared/types';
const api: MonitorApi = {
  command: (command) => ipcRenderer.invoke('monitor:command', command),
  snapshot: () => ipcRenderer.invoke('monitor:snapshot'),
  subscribe: (listener) => {
    const handler = (_: unknown, state: Snapshot) => listener(state);
    ipcRenderer.on('monitor:state', handler);
    return () => ipcRenderer.removeListener('monitor:state', handler);
  },
  subscribeUpdate: (listener) => {
    const handler = (_: unknown, state: UpdateState) => listener(state);
    ipcRenderer.on('monitor:update', handler);
    return () => ipcRenderer.removeListener('monitor:update', handler);
  },
};
contextBridge.exposeInMainWorld('monitor', api);
