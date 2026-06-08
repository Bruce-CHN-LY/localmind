import { contextBridge, ipcRenderer } from 'electron';
import type { ChatRequest, KnowledgeAnswerRequest, LocalMindApi, ModelSettings } from './types';

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
  exportKnowledgeBase: (knowledgeBaseId: string) => ipcRenderer.invoke('kb:export', knowledgeBaseId),
  importKnowledgeBaseArchive: () => ipcRenderer.invoke('kb:import-archive'),
  checkKnowledgeBaseHealth: (knowledgeBaseId: string) => ipcRenderer.invoke('kb:health', knowledgeBaseId),
  generateKnowledgeBaseEmbeddings: (knowledgeBaseId: string, model: string) =>
    ipcRenderer.invoke('kb:generate-embeddings', knowledgeBaseId, model),
  reparseKnowledgeFile: (knowledgeBaseId: string, fileId: string) =>
    ipcRenderer.invoke('kb:reparse-file', knowledgeBaseId, fileId),
  reindexKnowledgeFile: (knowledgeBaseId: string, fileId: string, model: string) =>
    ipcRenderer.invoke('kb:reindex-file', knowledgeBaseId, fileId, model),
  deleteKnowledgeFile: (knowledgeBaseId: string, fileId: string) =>
    ipcRenderer.invoke('kb:delete-file', knowledgeBaseId, fileId),
  openKnowledgeBaseFolder: (knowledgeBaseId: string) => ipcRenderer.invoke('kb:open-folder', knowledgeBaseId),
  searchKnowledgeBase: (knowledgeBaseId: string, query: string, model: string) =>
    ipcRenderer.invoke('kb:search', knowledgeBaseId, query, model),
  askKnowledgeBase: (request: KnowledgeAnswerRequest) => ipcRenderer.invoke('kb:ask', request),
};

contextBridge.exposeInMainWorld('localMind', api);
