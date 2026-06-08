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

export type NetworkModelTestResult = {
  ok: boolean;
  message: string;
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
  embeddingsPath?: string;
  embeddedAt?: string;
  embeddingModel?: string;
  vectorCount?: number;
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

export type KnowledgeEmbedding = KnowledgeChunk & {
  embedding: number[];
};

export type SearchResult = KnowledgeChunk & {
  score: number;
};

export type KnowledgeAnswerRequest = ChatRequest & {
  knowledgeBaseId: string;
  question: string;
  embeddingModel: string;
};

export type KnowledgeAnswer = {
  answer: string;
  citations: SearchResult[];
};

export type KnowledgeHealthCheck = {
  status: 'ok' | 'warning' | 'error';
  title: string;
  detail: string;
};

export type KnowledgeHealthReport = {
  knowledgeBaseId: string;
  checkedAt: string;
  score: number;
  summary: string;
  checks: KnowledgeHealthCheck[];
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
  testNetworkModel: (config: NetworkModelConfig) => Promise<NetworkModelTestResult>;
  getModelSettings: () => Promise<ModelSettings>;
  saveModelSettings: (settings: ModelSettings) => Promise<ModelSettings>;
  listKnowledgeBases: () => Promise<KnowledgeBase[]>;
  createKnowledgeBase: (name: string) => Promise<KnowledgeBase>;
  importKnowledgeFiles: (knowledgeBaseId: string) => Promise<KnowledgeBase>;
  exportKnowledgeBase: (knowledgeBaseId: string) => Promise<string>;
  importKnowledgeBaseArchive: () => Promise<KnowledgeBase | null>;
  checkKnowledgeBaseHealth: (knowledgeBaseId: string) => Promise<KnowledgeHealthReport>;
  generateKnowledgeBaseEmbeddings: (knowledgeBaseId: string, model: string) => Promise<KnowledgeBase>;
  reparseKnowledgeFile: (knowledgeBaseId: string, fileId: string) => Promise<KnowledgeBase>;
  reindexKnowledgeFile: (knowledgeBaseId: string, fileId: string, model: string) => Promise<KnowledgeBase>;
  deleteKnowledgeFile: (knowledgeBaseId: string, fileId: string) => Promise<KnowledgeBase>;
  openKnowledgeBaseFolder: (knowledgeBaseId: string) => Promise<boolean>;
  searchKnowledgeBase: (knowledgeBaseId: string, query: string, model: string) => Promise<SearchResult[]>;
  askKnowledgeBase: (request: KnowledgeAnswerRequest) => Promise<KnowledgeAnswer>;
};

declare global {
  interface Window {
    localMind: LocalMindApi;
  }
}
