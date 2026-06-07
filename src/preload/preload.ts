import { contextBridge, ipcRenderer } from 'electron';
import type { ChatRequest, LocalMindApi, ModelSettings } from './types';

const api: LocalMindApi = {
  getOllamaStatus: () => ipcRenderer.invoke('ollama:status'),
  listOllamaModels: () => ipcRenderer.invoke('ollama:models'),
  sendChat: (request: ChatRequest) => ipcRenderer.invoke('ollama:chat', request),
  stopChat: (requestId: string) => ipcRenderer.invoke('ollama:stop-chat', requestId),
  getModelSettings: () => ipcRenderer.invoke('settings:get-model'),
  saveModelSettings: (settings: ModelSettings) => ipcRenderer.invoke('settings:save-model', settings),
  listKnowledgeBases: () => ipcRenderer.invoke('kb:list'),
  createKnowledgeBase: (name: string) => ipcRenderer.invoke('kb:create', name),
  importKnowledgeFiles: (knowledgeBaseId: string) => ipcRenderer.invoke('kb:import-files', knowledgeBaseId),
};

contextBridge.exposeInMainWorld('localMind', api);
