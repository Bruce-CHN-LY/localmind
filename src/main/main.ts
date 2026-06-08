import { app, BrowserWindow, dialog, ipcMain, safeStorage, type OpenDialogOptions } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import type {
  ChatRequest,
  KnowledgeBase,
  KnowledgeChunk,
  KnowledgeEmbedding,
  KnowledgeFile,
  ModelProvider,
  ModelSettings,
  NetworkModelConfig,
  OllamaModel,
  SearchResult,
  OllamaStatus,
} from '../preload/types';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const APP_DATA_DIR = path.join(app.getPath('appData'), 'LocalMind');

app.setName('LocalMind');
app.setPath('userData', APP_DATA_DIR);

let mainWindow: BrowserWindow | null = null;
const activeChatRequests = new Map<string, AbortController>();

type LocalMindStore = {
  knowledgeBases: KnowledgeBase[];
  modelSettings?: {
    provider: ModelProvider;
    selectedNetworkModelId?: string;
    network: {
      baseUrl: string;
      model: string;
      encryptedApiKey?: string;
    };
    networkModels?: Array<{
      id: string;
      name: string;
      baseUrl: string;
      model: string;
      encryptedApiKey?: string;
    }>;
  };
};

function getStorePath() {
  return path.join(APP_DATA_DIR, 'localmind-store.json');
}

function getKnowledgeBaseRoot() {
  return path.join(APP_DATA_DIR, 'knowledge-bases');
}

function getLogPath() {
  return path.join(APP_DATA_DIR, 'logs', 'main.log');
}

function getDefaultModelSettings(): ModelSettings {
  return {
    provider: 'ollama',
    selectedNetworkModelId: 'deepseek-chat',
    networkModels: [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        apiKey: '',
      },
    ],
  };
}

function encryptApiKey(apiKey: string) {
  if (!apiKey.trim()) return '';

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统不支持安全保存 API Key');
  }

  return safeStorage.encryptString(apiKey.trim()).toString('base64');
}

function decryptApiKey(encryptedApiKey?: string) {
  if (!encryptedApiKey) return '';

  try {
    if (!safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(Buffer.from(encryptedApiKey, 'base64'));
  } catch {
    return '';
  }
}

function readModelSettings(store: LocalMindStore): ModelSettings {
  const defaults = getDefaultModelSettings();
  const saved = store.modelSettings;

  if (!saved) return defaults;

  const savedModels = saved.networkModels?.length
    ? saved.networkModels
    : [
        {
          id: saved.network.model || defaults.selectedNetworkModelId,
          name: saved.network.model || 'Network Model',
          baseUrl: saved.network.baseUrl || defaults.networkModels[0].baseUrl,
          model: saved.network.model || defaults.networkModels[0].model,
          encryptedApiKey: saved.network.encryptedApiKey,
        },
      ];

  const networkModels = savedModels.map((model) => ({
    id: model.id,
    name: model.name,
    baseUrl: model.baseUrl,
    model: model.model,
    apiKey: decryptApiKey(model.encryptedApiKey),
  }));

  return {
    provider: saved.provider,
    selectedNetworkModelId:
      saved.selectedNetworkModelId && networkModels.some((model) => model.id === saved.selectedNetworkModelId)
        ? saved.selectedNetworkModelId
        : networkModels[0]?.id || defaults.selectedNetworkModelId,
    networkModels: networkModels.length ? networkModels : defaults.networkModels,
  };
}

function writeModelSettings(store: LocalMindStore, settings: ModelSettings) {
  store.modelSettings = {
    provider: settings.provider,
    selectedNetworkModelId: settings.selectedNetworkModelId,
    network: {
      baseUrl: settings.networkModels[0]?.baseUrl.trim() || 'https://api.deepseek.com',
      model: settings.networkModels[0]?.model.trim() || 'deepseek-chat',
      encryptedApiKey: encryptApiKey(settings.networkModels[0]?.apiKey || ''),
    },
    networkModels: settings.networkModels.map((model) => ({
      id: model.id,
      name: model.name.trim() || model.model.trim(),
      baseUrl: model.baseUrl.trim(),
      model: model.model.trim(),
      encryptedApiKey: encryptApiKey(model.apiKey),
    })),
  };
}

async function appendLog(message: string) {
  const timestamp = new Date().toISOString();
  await fs.mkdir(path.dirname(getLogPath()), { recursive: true });
  await fs.appendFile(getLogPath(), `[${timestamp}] ${message}\n`, 'utf8');
}

function sanitizeFolderName(name: string) {
  return name
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-')
    .slice(0, 64) || 'knowledge-base';
}

async function ensureStore(): Promise<LocalMindStore> {
  await fs.mkdir(getKnowledgeBaseRoot(), { recursive: true });

  try {
    const raw = await fs.readFile(getStorePath(), 'utf8');
    return JSON.parse(raw) as LocalMindStore;
  } catch {
    const store: LocalMindStore = { knowledgeBases: [] };
    await saveStore(store);
    return store;
  }
}

async function saveStore(store: LocalMindStore) {
  await fs.mkdir(APP_DATA_DIR, { recursive: true });
  await fs.writeFile(getStorePath(), JSON.stringify(store, null, 2), 'utf8');
}

function getUniqueStoredPath(folderPath: string, fileName: string, index: number) {
  const parsed = path.parse(fileName);
  const suffix = index === 0 ? '' : `-${index + 1}`;
  return path.join(folderPath, 'files', `${parsed.name}${suffix}${parsed.ext}`);
}

function getParsedTextPath(folderPath: string, fileId: string) {
  return path.join(folderPath, 'texts', `${fileId}.txt`);
}

function getChunksPath(folderPath: string, fileId: string) {
  return path.join(folderPath, 'chunks', `${fileId}.json`);
}

function getEmbeddingsPath(folderPath: string, fileId: string) {
  return path.join(folderPath, 'embeddings', `${fileId}.json`);
}

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function splitTextIntoChunks(text: string, options = { maxLength: 1200, overlap: 180 }) {
  const chunks: Array<{ content: string; startOffset: number; endOffset: number }> = [];
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  let cursor = 0;
  let pending = '';
  let pendingStart = 0;

  function pushPending(endOffset: number) {
    const content = pending.trim();

    if (!content) return;

    chunks.push({
      content,
      startOffset: pendingStart,
      endOffset,
    });

    const overlap = content.slice(Math.max(0, content.length - options.overlap));
    pending = overlap;
    pendingStart = Math.max(pendingStart, endOffset - overlap.length);
  }

  for (const paragraph of paragraphs) {
    const paragraphStart = text.indexOf(paragraph, cursor);
    const startOffset = paragraphStart >= 0 ? paragraphStart : cursor;
    const endOffset = startOffset + paragraph.length;
    cursor = endOffset;

    if (!pending) {
      pending = paragraph;
      pendingStart = startOffset;
      continue;
    }

    if (`${pending}\n\n${paragraph}`.length > options.maxLength) {
      pushPending(startOffset);
      pending = pending ? `${pending}\n\n${paragraph}` : paragraph;
    } else {
      pending = `${pending}\n\n${paragraph}`;
    }
  }

  if (pending.trim()) {
    chunks.push({
      content: pending.trim(),
      startOffset: pendingStart,
      endOffset: text.length,
    });
  }

  return chunks;
}

function createKnowledgeChunks(knowledgeBase: KnowledgeBase, file: KnowledgeFile, text: string): KnowledgeChunk[] {
  return splitTextIntoChunks(text).map((chunk, index) => ({
    id: `${file.id}:${index}`,
    knowledgeBaseId: knowledgeBase.id,
    fileId: file.id,
    fileName: file.name,
    chunkIndex: index,
    content: chunk.content,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
  }));
}

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;
  const length = Math.min(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    aMagnitude += a[index] * a[index];
    bMagnitude += b[index] * b[index];
  }

  if (!aMagnitude || !bMagnitude) return 0;
  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

async function createEmbedding(model: string, text: string) {
  const data = await fetchJson<{ embedding?: number[] }>(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: text,
    }),
  });

  if (!data.embedding?.length) {
    throw new Error('Embedding 模型没有返回向量');
  }

  return data.embedding;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

async function generateFileEmbeddings(knowledgeBase: KnowledgeBase, file: KnowledgeFile, model: string) {
  if (!file.chunksPath) {
    throw new Error(`${file.name} 还没有文本片段`);
  }

  const chunks = await readJsonFile<KnowledgeChunk[]>(file.chunksPath);
  const embeddings: KnowledgeEmbedding[] = [];

  await fs.mkdir(path.join(knowledgeBase.folderPath, 'embeddings'), { recursive: true });

  for (const chunk of chunks) {
    embeddings.push({
      ...chunk,
      embedding: await createEmbedding(model, chunk.content),
    });
  }

  const embeddingsPath = getEmbeddingsPath(knowledgeBase.folderPath, file.id);
  await fs.writeFile(embeddingsPath, JSON.stringify(embeddings, null, 2), 'utf8');

  file.embeddingsPath = embeddingsPath;
  file.embeddedAt = new Date().toISOString();
  file.embeddingModel = model;
  file.vectorCount = embeddings.length;
}

async function parseDocument(filePath: string): Promise<string> {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.txt' || extension === '.md' || extension === '.markdown') {
    return normalizeText(await fs.readFile(filePath, 'utf8'));
  }

  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return normalizeText(result.value);
  }

  if (extension === '.pdf') {
    const buffer = await fs.readFile(filePath);
    const result = await pdfParse(buffer);
    return normalizeText(result.text);
  }

  throw new Error(`暂不支持解析 ${extension || '这个'} 文件`);
}

async function parseKnowledgeFile(knowledgeBase: KnowledgeBase, file: KnowledgeFile) {
  file.status = 'parsing';
  delete file.error;

  try {
    await fs.mkdir(path.join(knowledgeBase.folderPath, 'texts'), { recursive: true });
    await fs.mkdir(path.join(knowledgeBase.folderPath, 'chunks'), { recursive: true });
    await fs.mkdir(path.join(knowledgeBase.folderPath, 'embeddings'), { recursive: true });
    const text = await parseDocument(file.storedPath);
    const parsedPath = getParsedTextPath(knowledgeBase.folderPath, file.id);
    const chunksPath = getChunksPath(knowledgeBase.folderPath, file.id);
    const chunks = createKnowledgeChunks(knowledgeBase, file, text);

    await fs.writeFile(parsedPath, text, 'utf8');
    await fs.writeFile(chunksPath, JSON.stringify(chunks, null, 2), 'utf8');

    file.status = 'parsed';
    file.parsedPath = parsedPath;
    file.chunksPath = chunksPath;
    file.parsedAt = new Date().toISOString();
    file.textLength = text.length;
    file.chunkCount = chunks.length;
  } catch (error) {
    file.status = 'failed';
    file.error = error instanceof Error ? error.message : '解析失败';
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    title: 'LocalMind',
    backgroundColor: '#f7f3ed',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'production') {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  } else {
    mainWindow.loadURL('http://127.0.0.1:5173');
  }

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    appendLog(`render-process-gone: ${JSON.stringify(details)}`).catch(() => {});
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    appendLog(`did-fail-load: ${errorCode} ${errorDescription} ${validatedURL}`).catch(() => {});
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${body ? `: ${body}` : ''}`);
  }

  return response.json() as Promise<T>;
}

function normalizeApiBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '');
}

async function sendOllamaChat(request: ChatRequest, signal: AbortSignal) {
  const data = await fetchJson<{ message?: { content?: string } }>(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      stream: false,
    }),
  });

  return data.message?.content?.trim() ?? '';
}

async function sendNetworkChat(request: ChatRequest, signal: AbortSignal) {
  const config = request.networkConfig;

  if (!config?.baseUrl.trim() || !config.apiKey.trim() || !config.model.trim()) {
    throw new Error('请先填写网络 API 地址、模型名和 API Key');
  }

  const data = await fetchJson<{
    choices?: Array<{ message?: { content?: string } }>;
  }>(`${normalizeApiBaseUrl(config.baseUrl)}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey.trim()}`,
    },
    signal,
    body: JSON.stringify({
      model: config.model.trim(),
      messages: request.messages,
      stream: false,
    }),
  });

  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

ipcMain.handle('ollama:status', async (): Promise<OllamaStatus> => {
  try {
    await fetchJson(`${OLLAMA_BASE_URL}/api/version`);
    return { reachable: true, baseUrl: OLLAMA_BASE_URL };
  } catch (error) {
    return {
      reachable: false,
      baseUrl: OLLAMA_BASE_URL,
      error: error instanceof Error ? error.message : '无法连接 Ollama',
    };
  }
});

ipcMain.handle('ollama:models', async (): Promise<OllamaModel[]> => {
  const data = await fetchJson<{
    models?: Array<{ name: string; modified_at?: string; size?: number }>;
  }>(`${OLLAMA_BASE_URL}/api/tags`);

  return (data.models ?? []).map((model) => ({
    name: model.name,
    modifiedAt: model.modified_at,
    size: model.size,
  }));
});

ipcMain.handle('ollama:chat', async (_event, request: ChatRequest): Promise<string> => {
  const controller = new AbortController();
  activeChatRequests.set(request.requestId, controller);

  try {
    if (request.provider === 'network') {
      return await sendNetworkChat(request, controller.signal);
    }

    return await sendOllamaChat(request, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('已停止生成');
    }

    throw error;
  } finally {
    activeChatRequests.delete(request.requestId);
  }
});

ipcMain.handle('ollama:stop-chat', async (_event, requestId: string): Promise<boolean> => {
  const controller = activeChatRequests.get(requestId);

  if (!controller) {
    return false;
  }

  controller.abort();
  activeChatRequests.delete(requestId);
  return true;
});

ipcMain.handle('settings:get-model', async (): Promise<ModelSettings> => {
  const store = await ensureStore();
  return readModelSettings(store);
});

ipcMain.handle('settings:save-model', async (_event, settings: ModelSettings): Promise<ModelSettings> => {
  const store = await ensureStore();
  writeModelSettings(store, settings);
  await saveStore(store);
  return readModelSettings(store);
});

ipcMain.handle('kb:list', async (): Promise<KnowledgeBase[]> => {
  const store = await ensureStore();
  return store.knowledgeBases;
});

ipcMain.handle('kb:create', async (_event, name: string): Promise<KnowledgeBase> => {
  const cleanName = name.trim();

  if (!cleanName) {
    throw new Error('知识库名称不能为空');
  }

  const store = await ensureStore();
  const id = randomUUID();
  const folderName = `${sanitizeFolderName(cleanName)}-${id.slice(0, 8)}`;
  const folderPath = path.join(getKnowledgeBaseRoot(), folderName);

  await fs.mkdir(path.join(folderPath, 'files'), { recursive: true });
  await fs.mkdir(path.join(folderPath, 'texts'), { recursive: true });
  await fs.mkdir(path.join(folderPath, 'chunks'), { recursive: true });
  await fs.mkdir(path.join(folderPath, 'embeddings'), { recursive: true });

  const knowledgeBase: KnowledgeBase = {
    id,
    name: cleanName,
    folderPath,
    createdAt: new Date().toISOString(),
    files: [],
  };

  store.knowledgeBases.unshift(knowledgeBase);
  await saveStore(store);
  return knowledgeBase;
});

ipcMain.handle('kb:import-files', async (_event, knowledgeBaseId: string): Promise<KnowledgeBase> => {
  const store = await ensureStore();
  const knowledgeBase = store.knowledgeBases.find((item) => item.id === knowledgeBaseId);

  if (!knowledgeBase) {
    throw new Error('找不到这个知识库');
  }

  const dialogOptions: OpenDialogOptions = {
    title: '导入资料到知识库',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Supported Documents', extensions: ['pdf', 'docx', 'md', 'markdown', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  };

  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || result.filePaths.length === 0) {
    return knowledgeBase;
  }

  await fs.mkdir(path.join(knowledgeBase.folderPath, 'files'), { recursive: true });
  await fs.mkdir(path.join(knowledgeBase.folderPath, 'texts'), { recursive: true });
  await fs.mkdir(path.join(knowledgeBase.folderPath, 'chunks'), { recursive: true });
  await fs.mkdir(path.join(knowledgeBase.folderPath, 'embeddings'), { recursive: true });

  for (const originalPath of result.filePaths) {
    const stats = await fs.stat(originalPath);
    let storedPath = getUniqueStoredPath(knowledgeBase.folderPath, path.basename(originalPath), 0);
    let copyIndex = 0;

    while (true) {
      try {
        await fs.access(storedPath);
        copyIndex += 1;
        storedPath = getUniqueStoredPath(knowledgeBase.folderPath, path.basename(originalPath), copyIndex);
      } catch {
        break;
      }
    }

    await fs.copyFile(originalPath, storedPath);

    const file: KnowledgeFile = {
      id: randomUUID(),
      knowledgeBaseId,
      name: path.basename(storedPath),
      originalPath,
      storedPath,
      size: stats.size,
      status: 'stored',
      createdAt: new Date().toISOString(),
    };

    knowledgeBase.files.unshift(file);
    await parseKnowledgeFile(knowledgeBase, file);
  }

  await saveStore(store);
  return knowledgeBase;
});

ipcMain.handle('kb:generate-embeddings', async (_event, knowledgeBaseId: string, model: string): Promise<KnowledgeBase> => {
  const store = await ensureStore();
  const knowledgeBase = store.knowledgeBases.find((item) => item.id === knowledgeBaseId);

  if (!knowledgeBase) {
    throw new Error('找不到这个知识库');
  }

  if (!model.trim()) {
    throw new Error('请选择 embedding 模型');
  }

  const parsedFiles = knowledgeBase.files.filter((file) => file.status === 'parsed' && file.chunksPath);

  if (parsedFiles.length === 0) {
    throw new Error('这个知识库还没有可索引的已解析文件');
  }

  for (const file of parsedFiles) {
    await generateFileEmbeddings(knowledgeBase, file, model.trim());
  }

  await saveStore(store);
  return knowledgeBase;
});

ipcMain.handle('kb:search', async (_event, knowledgeBaseId: string, query: string, model: string): Promise<SearchResult[]> => {
  const store = await ensureStore();
  const knowledgeBase = store.knowledgeBases.find((item) => item.id === knowledgeBaseId);

  if (!knowledgeBase) {
    throw new Error('找不到这个知识库');
  }

  if (!query.trim()) {
    return [];
  }

  const indexedFiles = knowledgeBase.files.filter((file) => file.embeddingsPath);

  if (indexedFiles.length === 0) {
    throw new Error('请先为这个知识库生成索引');
  }

  const queryEmbedding = await createEmbedding(model.trim(), query.trim());
  const results: SearchResult[] = [];

  for (const file of indexedFiles) {
    const embeddings = await readJsonFile<KnowledgeEmbedding[]>(file.embeddingsPath!);

    for (const item of embeddings) {
      results.push({
        id: item.id,
        knowledgeBaseId: item.knowledgeBaseId,
        fileId: item.fileId,
        fileName: item.fileName,
        chunkIndex: item.chunkIndex,
        content: item.content,
        startOffset: item.startOffset,
        endOffset: item.endOffset,
        score: cosineSimilarity(queryEmbedding, item.embedding),
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 8);
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

process.on('uncaughtException', (error) => {
  appendLog(`uncaughtException: ${error.stack ?? error.message}`).catch(() => {});
});

process.on('unhandledRejection', (error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  appendLog(`unhandledRejection: ${message}`).catch(() => {});
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
