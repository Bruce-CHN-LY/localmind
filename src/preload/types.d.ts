export type OllamaModel = {
  name: string;
  modifiedAt?: string;
  size?: number;
};

export type OllamaStatus = {
  reachable: boolean;
  baseUrl: string;
  error?: string;
};

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type ModelProvider = 'ollama' | 'network';

export type NetworkModelConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ModelSettings = {
  provider: ModelProvider;
  selectedNetworkModelId: string;
  networkModels: NetworkModelConfig[];
};

export type ChatRequest = {
  requestId: string;
  provider: ModelProvider;
  model: string;
  messages: ChatMessage[];
  networkConfig?: NetworkModelConfig;
};

export type KnowledgeFile = {
  id: string;
  knowledgeBaseId: string;
  name: string;
  originalPath: string;
  storedPath: string;
  size: number;
  status: 'stored' | 'parsing' | 'parsed' | 'failed';
  parsedPath?: string;
  chunksPath?: string;
  parsedAt?: string;
  textLength?: number;
  chunkCount?: number;
  error?: string;
  createdAt: string;
};

export type KnowledgeChunk = {
  id: string;
  knowledgeBaseId: string;
  fileId: string;
  fileName: string;
  chunkIndex: number;
  content: string;
  startOffset: number;
  endOffset: number;
};

export type KnowledgeBase = {
  id: string;
  name: string;
  folderPath: string;
  createdAt: string;
  files: KnowledgeFile[];
};

export type LocalMindApi = {
  getOllamaStatus: () => Promise<OllamaStatus>;
  listOllamaModels: () => Promise<OllamaModel[]>;
  sendChat: (request: ChatRequest) => Promise<string>;
  stopChat: (requestId: string) => Promise<boolean>;
  getModelSettings: () => Promise<ModelSettings>;
  saveModelSettings: (settings: ModelSettings) => Promise<ModelSettings>;
  listKnowledgeBases: () => Promise<KnowledgeBase[]>;
  createKnowledgeBase: (name: string) => Promise<KnowledgeBase>;
  importKnowledgeFiles: (knowledgeBaseId: string) => Promise<KnowledgeBase>;
};

declare global {
  interface Window {
    localMind: LocalMindApi;
  }
}
