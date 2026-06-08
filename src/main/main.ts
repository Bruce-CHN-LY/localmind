import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell, type OpenDialogOptions } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import type {
  ChatRequest,
  KnowledgeAnswer,
  KnowledgeAnswerRequest,
  KnowledgeBase,
  KnowledgeChunk,
  KnowledgeEmbedding,
  KnowledgeFile,
  KnowledgeHealthCheck,
  KnowledgeHealthReport,
  KnowledgeProgressEvent,
  ModelProvider,
  ModelSettings,
  NetworkModelConfig,
  NetworkModelTestResult,
  OllamaModel,
  SearchResult,
  OllamaStatus,
} from '../preload/types';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const APP_DATA_DIR = path.join(app.getPath('appData'), 'LocalMind');
const KNOWLEDGE_ARCHIVE_FORMAT = 'localmind-knowledge-base';
const KNOWLEDGE_ARCHIVE_VERSION = 1;
const KNOWLEDGE_BASE_DIRECTORIES = ['raw', 'notes', 'assets', 'texts', 'chunks', 'embeddings'];
const SUPPORTED_DOCUMENT_EXTENSIONS = new Set(['.pdf', '.docx', '.md', '.markdown', '.txt']);

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

type KnowledgeBaseArchiveManifest = {
  format: typeof KNOWLEDGE_ARCHIVE_FORMAT;
  version: typeof KNOWLEDGE_ARCHIVE_VERSION;
  exportedAt: string;
  knowledgeBase: KnowledgeBase;
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

function emitKnowledgeProgress(progress: KnowledgeProgressEvent) {
  mainWindow?.webContents.send('kb:progress', progress);
}

function isSupportedDocumentPath(filePath: string) {
  return SUPPORTED_DOCUMENT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function collectSupportedDocumentPaths(selectedPaths: string[]) {
  const collectedPaths: string[] = [];

  async function collect(currentPath: string) {
    const stats = await fs.stat(currentPath);

    if (stats.isDirectory()) {
      const entries = await fs.readdir(currentPath);

      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        await collect(path.join(currentPath, entry));
      }

      return;
    }

    if (stats.isFile() && isSupportedDocumentPath(currentPath)) {
      collectedPaths.push(currentPath);
    }
  }

  for (const selectedPath of selectedPaths) {
    await collect(selectedPath);
  }

  return [...new Set(collectedPaths)];
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

function findKnowledgeBase(store: LocalMindStore, knowledgeBaseId: string) {
  const knowledgeBase = store.knowledgeBases.find((item) => item.id === knowledgeBaseId);

  if (!knowledgeBase) {
    throw new Error('找不到这个知识库');
  }

  return knowledgeBase;
}

function findKnowledgeFile(knowledgeBase: KnowledgeBase, fileId: string) {
  const file = knowledgeBase.files.find((item) => item.id === fileId);

  if (!file) {
    throw new Error('找不到这个文件');
  }

  return file;
}

function getUniqueStoredPath(folderPath: string, fileName: string, index: number) {
  const parsed = path.parse(fileName);
  const suffix = index === 0 ? '' : `-${index + 1}`;
  return path.join(folderPath, 'raw', `${parsed.name}${suffix}${parsed.ext}`);
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

function getArchiveRelativePath(filePath: string | undefined, folderPath: string) {
  if (!filePath) return undefined;
  const relativePath = path.relative(folderPath, filePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return undefined;
  }

  return relativePath.replace(/\\/g, '/');
}

function getRestoredArchivePath(folderPath: string, relativePath: string | undefined) {
  if (!relativePath) return undefined;
  return path.join(folderPath, relativePath);
}

async function rewriteJsonArray<T extends { knowledgeBaseId?: string }>(filePath: string | undefined, knowledgeBaseId: string) {
  if (!filePath) return;

  try {
    const items = await readJsonFile<T[]>(filePath);
    await fs.writeFile(
      filePath,
      JSON.stringify(
        items.map((item) => ({
          ...item,
          knowledgeBaseId,
        })),
        null,
        2,
      ),
      'utf8',
    );
  } catch {
    await fs.rm(filePath, { force: true }).catch(() => {});
  }
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getKnowledgeBaseIndexPath(knowledgeBase: KnowledgeBase) {
  return path.join(knowledgeBase.folderPath, 'index.md');
}

function getKnowledgeBaseLogPath(knowledgeBase: KnowledgeBase) {
  return path.join(knowledgeBase.folderPath, 'log.md');
}

function getKnowledgeBaseRulesPath(knowledgeBase: KnowledgeBase) {
  return path.join(knowledgeBase.folderPath, 'AI_CONFIG.md');
}

function getDefaultKnowledgeRules(knowledgeBaseName: string) {
  return `# ${knowledgeBaseName} 知识库规则

回答规则：
- 优先使用本知识库中检索到的片段回答。
- 如果资料不足，请明确说明“知识库中没有找到足够信息”。
- 尽量使用中文，表达清晰、简洁。
- 涉及事实、数据、结论时，优先引用来源片段编号。

整理规则：
- raw/ 保存导入的原始资料。
- notes/ 可保存人工整理或 AI 辅助整理后的 Markdown 笔记。
- assets/ 可保存图片、附件等辅助素材。
- index.md 是知识库目录摘要。
- log.md 记录重要操作。
`;
}

async function appendKnowledgeLog(knowledgeBase: KnowledgeBase, message: string) {
  const timestamp = new Date().toISOString();
  await fs.appendFile(getKnowledgeBaseLogPath(knowledgeBase), `- [${timestamp}] ${message}\n`, 'utf8');
}

async function writeKnowledgeBaseIndex(knowledgeBase: KnowledgeBase) {
  const parsedCount = knowledgeBase.files.filter((file) => file.status === 'parsed').length;
  const indexedCount = knowledgeBase.files.filter((file) => file.vectorCount).length;
  const failedCount = knowledgeBase.files.filter((file) => file.status === 'failed').length;
  const fileLines = knowledgeBase.files.length
    ? knowledgeBase.files
        .map(
          (file) =>
            `- ${file.name} · ${file.status} · ${file.chunkCount ?? 0} 个片段 · ${file.vectorCount ?? 0} 个向量`,
        )
        .join('\n')
    : '- 暂无文件';

  const content = `# ${knowledgeBase.name}

这是 LocalMind 自动维护的知识库索引。

## 概览

- 文件数量：${knowledgeBase.files.length}
- 已解析文件：${parsedCount}
- 已索引文件：${indexedCount}
- 解析失败文件：${failedCount}
- 更新时间：${new Date().toLocaleString('zh-CN')}

## 文件

${fileLines}
`;

  await fs.writeFile(getKnowledgeBaseIndexPath(knowledgeBase), content, 'utf8');
}

async function ensureKnowledgeBaseScaffold(knowledgeBase: KnowledgeBase) {
  for (const directory of KNOWLEDGE_BASE_DIRECTORIES) {
    await fs.mkdir(path.join(knowledgeBase.folderPath, directory), { recursive: true });
  }

  const rulesPath = getKnowledgeBaseRulesPath(knowledgeBase);
  const logPath = getKnowledgeBaseLogPath(knowledgeBase);

  if (!(await exists(rulesPath))) {
    await fs.writeFile(rulesPath, getDefaultKnowledgeRules(knowledgeBase.name), 'utf8');
  }

  if (!(await exists(logPath))) {
    await fs.writeFile(logPath, `# ${knowledgeBase.name} 操作日志\n\n`, 'utf8');
  }

  await writeKnowledgeBaseIndex(knowledgeBase);
}

async function readKnowledgeBaseRules(knowledgeBase: KnowledgeBase) {
  try {
    return (await fs.readFile(getKnowledgeBaseRulesPath(knowledgeBase), 'utf8')).trim();
  } catch {
    return '';
  }
}

async function listJsonFiles(directoryPath: string) {
  try {
    return (await fs.readdir(directoryPath)).filter((fileName) => fileName.endsWith('.json'));
  } catch {
    return [];
  }
}

async function checkKnowledgeBaseHealth(knowledgeBase: KnowledgeBase): Promise<KnowledgeHealthReport> {
  await ensureKnowledgeBaseScaffold(knowledgeBase);

  const checks: KnowledgeHealthCheck[] = [];
  const addCheck = (status: KnowledgeHealthCheck['status'], title: string, detail: string) => {
    checks.push({ status, title, detail });
  };

  for (const directory of KNOWLEDGE_BASE_DIRECTORIES) {
    const directoryExists = await exists(path.join(knowledgeBase.folderPath, directory));
    addCheck(directoryExists ? 'ok' : 'error', `${directory}/ 文件夹`, directoryExists ? '结构正常。' : '缺少这个文件夹。');
  }

  for (const fileName of ['AI_CONFIG.md', 'index.md', 'log.md']) {
    const fileExists = await exists(path.join(knowledgeBase.folderPath, fileName));
    addCheck(fileExists ? 'ok' : 'warning', fileName, fileExists ? '文件存在。' : '缺少维护文件，建议重建。');
  }

  const duplicateGroups = new Map<string, KnowledgeFile[]>();

  for (const file of knowledgeBase.files) {
    const key = `${file.name}:${file.size}`;
    duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), file]);

    const storedExists = await exists(file.storedPath);
    addCheck(storedExists ? 'ok' : 'error', `原始文件：${file.name}`, storedExists ? '文件存在。' : '文件记录存在，但本地原始文件丢失。');

    if (file.status === 'failed') {
      addCheck('warning', `解析失败：${file.name}`, file.error || '这个文件需要重新解析。');
    }

    if (file.status === 'parsed') {
      const parsedExists = Boolean(file.parsedPath && (await exists(file.parsedPath)));
      const chunksExist = Boolean(file.chunksPath && (await exists(file.chunksPath)));
      addCheck(parsedExists ? 'ok' : 'warning', `解析文本：${file.name}`, parsedExists ? '解析文本存在。' : '缺少解析文本，建议重新解析。');
      addCheck(chunksExist ? 'ok' : 'warning', `文本片段：${file.name}`, chunksExist ? '文本片段存在。' : '缺少文本片段，建议重新解析。');
    }

    if (file.status === 'parsed' && !file.vectorCount) {
      addCheck('warning', `未生成索引：${file.name}`, '这个文件已解析，但还没有向量索引。');
    }

    if (file.vectorCount) {
      const embeddingsExist = Boolean(file.embeddingsPath && (await exists(file.embeddingsPath)));
      addCheck(embeddingsExist ? 'ok' : 'warning', `向量索引：${file.name}`, embeddingsExist ? '向量索引存在。' : '索引记录存在，但向量文件丢失。');
    }
  }

  const duplicateCount = [...duplicateGroups.values()].filter((group) => group.length > 1).length;
  addCheck(
    duplicateCount ? 'warning' : 'ok',
    '重复文件检查',
    duplicateCount ? `发现 ${duplicateCount} 组疑似重复文件。` : '没有发现同名同大小的重复文件。',
  );

  const knownFileIds = new Set(knowledgeBase.files.map((file) => file.id));
  const generatedJsonFiles = [
    ...(await listJsonFiles(path.join(knowledgeBase.folderPath, 'chunks'))),
    ...(await listJsonFiles(path.join(knowledgeBase.folderPath, 'embeddings'))),
  ];
  const orphanCount = generatedJsonFiles.filter((fileName) => !knownFileIds.has(path.basename(fileName, '.json'))).length;
  addCheck(
    orphanCount ? 'warning' : 'ok',
    '孤立索引文件',
    orphanCount ? `发现 ${orphanCount} 个没有对应文件记录的索引文件。` : '没有发现孤立索引文件。',
  );

  const errorCount = checks.filter((check) => check.status === 'error').length;
  const warningCount = checks.filter((check) => check.status === 'warning').length;
  const score = Math.max(0, 100 - errorCount * 18 - warningCount * 6);

  return {
    knowledgeBaseId: knowledgeBase.id,
    checkedAt: new Date().toISOString(),
    score,
    summary:
      errorCount > 0
        ? `发现 ${errorCount} 个严重问题、${warningCount} 个提醒。`
        : warningCount > 0
          ? `整体可用，但有 ${warningCount} 个地方建议处理。`
          : '知识库结构健康，可以放心使用。',
    checks,
  };
}

function createArchiveManifest(knowledgeBase: KnowledgeBase): KnowledgeBaseArchiveManifest {
  return {
    format: KNOWLEDGE_ARCHIVE_FORMAT,
    version: KNOWLEDGE_ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    knowledgeBase: {
      ...knowledgeBase,
      folderPath: '',
      files: knowledgeBase.files.map((file) => ({
        ...file,
        originalPath: getArchiveRelativePath(file.originalPath, knowledgeBase.folderPath) ?? file.name,
        storedPath: getArchiveRelativePath(file.storedPath, knowledgeBase.folderPath) ?? '',
        parsedPath: getArchiveRelativePath(file.parsedPath, knowledgeBase.folderPath),
        chunksPath: getArchiveRelativePath(file.chunksPath, knowledgeBase.folderPath),
        embeddingsPath: getArchiveRelativePath(file.embeddingsPath, knowledgeBase.folderPath),
      })),
    },
  };
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

function tokenizeForSearch(text: string) {
  const normalizedText = text.toLowerCase();
  const latinTokens = normalizedText.match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [];
  const chineseTokens = normalizedText.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  const chineseBigrams = chineseTokens.flatMap((token) =>
    Array.from({ length: Math.max(0, token.length - 1) }, (_item, index) => token.slice(index, index + 2)),
  );

  return [...new Set([...latinTokens, ...chineseTokens, ...chineseBigrams])].filter((token) => token.length >= 2);
}

function calculateKeywordScore(query: string, content: string, fileName: string) {
  const queryTokens = tokenizeForSearch(query);

  if (queryTokens.length === 0) return 0;

  const searchableText = `${fileName}\n${content}`.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = searchableText.match(new RegExp(escapedToken, 'g'))?.length ?? 0;

    if (matches > 0) {
      score += Math.min(1, 0.35 + matches * 0.15);
    }
  }

  return Math.min(1, score / queryTokens.length);
}

function getMatchType(vectorScore: number, keywordScore: number): SearchResult['matchType'] {
  if (vectorScore > 0 && keywordScore > 0.08) return 'hybrid';
  if (keywordScore > vectorScore) return 'keyword';
  return 'vector';
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
  delete file.embeddingsPath;
  delete file.embeddedAt;
  delete file.embeddingModel;
  delete file.vectorCount;

  try {
    await ensureKnowledgeBaseScaffold(knowledgeBase);
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

async function testNetworkModelConnection(config: NetworkModelConfig): Promise<NetworkModelTestResult> {
  if (!config.baseUrl.trim() || !config.apiKey.trim() || !config.model.trim()) {
    return {
      ok: false,
      message: '请先填写 API 地址、模型名和 API Key。',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const answer = await sendNetworkChat(
      {
        requestId: randomUUID(),
        provider: 'network',
        model: config.model,
        messages: [
          {
            role: 'user',
            content: '请只回复：OK',
          },
        ],
        networkConfig: config,
      },
      controller.signal,
    );

    return {
      ok: true,
      message: answer ? `连接成功，模型返回：${answer.slice(0, 80)}` : '连接成功，但模型没有返回文本。',
    };
  } catch (error) {
    return {
      ok: false,
      message:
        controller.signal.aborted
          ? '连接超时，请检查 API 地址、网络或服务商状态。'
          : error instanceof Error
            ? error.message
            : '连接测试失败。',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendChatRequest(request: ChatRequest, signal: AbortSignal) {
  if (request.provider === 'network') {
    return await sendNetworkChat(request, signal);
  }

  return await sendOllamaChat(request, signal);
}

async function searchKnowledgeBaseChunks(knowledgeBase: KnowledgeBase, query: string, model: string) {
  if (!query.trim()) {
    return [];
  }

  const indexedFiles = knowledgeBase.files.filter((file) => file.embeddingsPath);

  if (indexedFiles.length === 0) {
    throw new Error('请先为这个知识库生成索引');
  }

  const queryEmbedding = await createEmbedding(model.trim(), query.trim());
  const resultsById = new Map<string, SearchResult>();

  for (const file of indexedFiles) {
    const embeddings = await readJsonFile<KnowledgeEmbedding[]>(file.embeddingsPath!);

    for (const item of embeddings) {
      const vectorScore = cosineSimilarity(queryEmbedding, item.embedding);
      const keywordScore = calculateKeywordScore(query, item.content, item.fileName);
      const score = vectorScore * 0.72 + keywordScore * 0.28;

      resultsById.set(item.id, {
        id: item.id,
        knowledgeBaseId: item.knowledgeBaseId,
        fileId: item.fileId,
        fileName: item.fileName,
        chunkIndex: item.chunkIndex,
        content: item.content,
        startOffset: item.startOffset,
        endOffset: item.endOffset,
        score,
        vectorScore,
        keywordScore,
        matchType: getMatchType(vectorScore, keywordScore),
      });
    }
  }

  return [...resultsById.values()].sort((a, b) => b.score - a.score).slice(0, 8);
}

function buildKnowledgePrompt(question: string, citations: SearchResult[], knowledgeRules: string) {
  const context = citations
    .map(
      (citation, index) =>
        `[${index + 1}] ${citation.fileName} · 片段 ${citation.chunkIndex + 1} · 综合匹配度 ${(citation.score * 100).toFixed(1)}%\n${citation.content}`,
    )
    .join('\n\n---\n\n');

  return `你是 LocalMind 的知识库问答助手。请只根据下面提供的知识库片段回答用户问题。\n\n默认要求：\n- 如果片段中没有足够信息，请明确说“知识库中没有找到足够信息”。\n- 回答要清晰、具体、尽量使用中文。\n- 引用信息时，在句子后标注来源编号，例如 [1]、[2]。\n\n知识库自定义规则：\n${knowledgeRules || '暂无自定义规则。'}\n\n用户问题：\n${question}\n\n知识库片段：\n${context}`;
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
    return await sendChatRequest(request, controller.signal);
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

ipcMain.handle('network:test-model', async (_event, config: NetworkModelConfig): Promise<NetworkModelTestResult> => {
  return testNetworkModelConnection(config);
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
  await Promise.all(store.knowledgeBases.map((knowledgeBase) => ensureKnowledgeBaseScaffold(knowledgeBase)));
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

  const knowledgeBase: KnowledgeBase = {
    id,
    name: cleanName,
    folderPath,
    createdAt: new Date().toISOString(),
    files: [],
  };

  await ensureKnowledgeBaseScaffold(knowledgeBase);
  await appendKnowledgeLog(knowledgeBase, '创建知识库');
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
    title: '导入资料或文件夹到知识库',
    properties: ['openFile', 'openDirectory', 'multiSelections'],
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

  await ensureKnowledgeBaseScaffold(knowledgeBase);
  const importPaths = await collectSupportedDocumentPaths(result.filePaths);

  if (importPaths.length === 0) {
    throw new Error('没有找到支持的文件。当前支持 PDF、Word、Markdown 和 TXT。');
  }

  emitKnowledgeProgress({
    operation: 'import',
    knowledgeBaseId,
    current: 0,
    total: importPaths.length,
    message: `准备导入 ${importPaths.length} 个文件`,
  });

  for (const [index, originalPath] of importPaths.entries()) {
    emitKnowledgeProgress({
      operation: 'import',
      knowledgeBaseId,
      current: index,
      total: importPaths.length,
      message: `正在导入并解析：${path.basename(originalPath)}`,
    });

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
    await appendKnowledgeLog(knowledgeBase, `导入文件：${file.name}`);

    emitKnowledgeProgress({
      operation: 'import',
      knowledgeBaseId,
      current: index + 1,
      total: importPaths.length,
      message: `已完成：${file.name}`,
    });
  }

  await writeKnowledgeBaseIndex(knowledgeBase);
  await saveStore(store);
  emitKnowledgeProgress({
    operation: 'import',
    knowledgeBaseId,
    current: importPaths.length,
    total: importPaths.length,
    message: `导入完成：${importPaths.length} 个文件`,
    done: true,
  });
  return knowledgeBase;
});

ipcMain.handle('kb:export', async (_event, knowledgeBaseId: string): Promise<string> => {
  const store = await ensureStore();
  const knowledgeBase = findKnowledgeBase(store, knowledgeBaseId);
  const defaultPath = path.join(
    app.getPath('documents'),
    `${sanitizeFolderName(knowledgeBase.name)}.localmind.zip`,
  );
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, {
        title: '导出知识库备份',
        defaultPath,
        filters: [{ name: 'LocalMind Backup', extensions: ['zip'] }],
      })
    : await dialog.showSaveDialog({
        title: '导出知识库备份',
        defaultPath,
        filters: [{ name: 'LocalMind Backup', extensions: ['zip'] }],
      });

  if (result.canceled || !result.filePath) {
    return '';
  }

  const zip = new AdmZip();
  zip.addLocalFolder(knowledgeBase.folderPath, 'knowledge-base');
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(createArchiveManifest(knowledgeBase), null, 2), 'utf8'));
  zip.writeZip(result.filePath);

  return result.filePath;
});

ipcMain.handle('kb:import-archive', async (): Promise<KnowledgeBase | null> => {
  const store = await ensureStore();
  const dialogOptions: OpenDialogOptions = {
    title: '导入知识库备份',
    properties: ['openFile'],
    filters: [{ name: 'LocalMind Backup', extensions: ['zip'] }],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const zip = new AdmZip(result.filePaths[0]);
  const manifestEntry = zip.getEntry('manifest.json');

  if (!manifestEntry) {
    throw new Error('这个备份包不是 LocalMind 知识库备份');
  }

  const unsafeEntry = zip.getEntries().find((entry) => {
    const entryName = entry.entryName.replace(/\\/g, '/');
    return entryName.includes('../') || path.isAbsolute(entryName);
  });

  if (unsafeEntry) {
    throw new Error('备份包包含不安全路径，已拒绝导入');
  }

  const manifest = JSON.parse(manifestEntry.getData().toString('utf8')) as KnowledgeBaseArchiveManifest;

  if (manifest.format !== KNOWLEDGE_ARCHIVE_FORMAT || manifest.version !== KNOWLEDGE_ARCHIVE_VERSION) {
    throw new Error('备份包版本不兼容');
  }

  const id = randomUUID();
  const name = `${manifest.knowledgeBase.name || '导入的知识库'}（导入）`;
  const folderName = `${sanitizeFolderName(name)}-${id.slice(0, 8)}`;
  const folderPath = path.join(getKnowledgeBaseRoot(), folderName);
  const tempPath = path.join(APP_DATA_DIR, 'imports', id);

  await fs.rm(tempPath, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(tempPath, { recursive: true });

  try {
    zip.extractAllTo(tempPath, true);
    await fs.rename(path.join(tempPath, 'knowledge-base'), folderPath);

    const files = await Promise.all(
      manifest.knowledgeBase.files.map(async (file) => {
        const restoredFile: KnowledgeFile = {
          ...file,
          knowledgeBaseId: id,
          originalPath: getRestoredArchivePath(folderPath, file.storedPath) ?? path.join(folderPath, 'files', file.name),
          storedPath: getRestoredArchivePath(folderPath, file.storedPath) ?? path.join(folderPath, 'files', file.name),
          parsedPath: getRestoredArchivePath(folderPath, file.parsedPath),
          chunksPath: getRestoredArchivePath(folderPath, file.chunksPath),
          embeddingsPath: getRestoredArchivePath(folderPath, file.embeddingsPath),
        };

        await rewriteJsonArray<KnowledgeChunk>(restoredFile.chunksPath, id);
        await rewriteJsonArray<KnowledgeEmbedding>(restoredFile.embeddingsPath, id);

        return restoredFile;
      }),
    );

    const knowledgeBase: KnowledgeBase = {
      id,
      name,
      folderPath,
      createdAt: new Date().toISOString(),
      files,
    };

    await ensureKnowledgeBaseScaffold(knowledgeBase);
    await appendKnowledgeLog(knowledgeBase, `从备份包导入：${path.basename(result.filePaths[0])}`);
    store.knowledgeBases.unshift(knowledgeBase);
    await saveStore(store);
    return knowledgeBase;
  } finally {
    await fs.rm(tempPath, { recursive: true, force: true }).catch(() => {});
  }
});

ipcMain.handle('kb:generate-embeddings', async (_event, knowledgeBaseId: string, model: string): Promise<KnowledgeBase> => {
  const store = await ensureStore();
  const knowledgeBase = findKnowledgeBase(store, knowledgeBaseId);

  if (!model.trim()) {
    throw new Error('请选择 embedding 模型');
  }

  const parsedFiles = knowledgeBase.files.filter((file) => file.status === 'parsed' && file.chunksPath);

  if (parsedFiles.length === 0) {
    throw new Error('这个知识库还没有可索引的已解析文件');
  }

  emitKnowledgeProgress({
    operation: 'index',
    knowledgeBaseId,
    current: 0,
    total: parsedFiles.length,
    message: `准备生成 ${parsedFiles.length} 个文件的索引`,
  });

  for (const [index, file] of parsedFiles.entries()) {
    emitKnowledgeProgress({
      operation: 'index',
      knowledgeBaseId,
      current: index,
      total: parsedFiles.length,
      message: `正在生成索引：${file.name}`,
    });

    await generateFileEmbeddings(knowledgeBase, file, model.trim());

    emitKnowledgeProgress({
      operation: 'index',
      knowledgeBaseId,
      current: index + 1,
      total: parsedFiles.length,
      message: `已完成索引：${file.name}`,
    });
  }

  await appendKnowledgeLog(knowledgeBase, `生成知识库索引：${model.trim()}`);
  await writeKnowledgeBaseIndex(knowledgeBase);
  await saveStore(store);
  emitKnowledgeProgress({
    operation: 'index',
    knowledgeBaseId,
    current: parsedFiles.length,
    total: parsedFiles.length,
    message: `索引生成完成：${parsedFiles.length} 个文件`,
    done: true,
  });
  return knowledgeBase;
});

ipcMain.handle('kb:reparse-file', async (_event, knowledgeBaseId: string, fileId: string): Promise<KnowledgeBase> => {
  const store = await ensureStore();
  const knowledgeBase = findKnowledgeBase(store, knowledgeBaseId);
  const file = findKnowledgeFile(knowledgeBase, fileId);

  await parseKnowledgeFile(knowledgeBase, file);
  await appendKnowledgeLog(knowledgeBase, `重新解析文件：${file.name}`);
  await writeKnowledgeBaseIndex(knowledgeBase);
  await saveStore(store);
  return knowledgeBase;
});

ipcMain.handle('kb:reindex-file', async (_event, knowledgeBaseId: string, fileId: string, model: string): Promise<KnowledgeBase> => {
  const store = await ensureStore();
  const knowledgeBase = findKnowledgeBase(store, knowledgeBaseId);
  const file = findKnowledgeFile(knowledgeBase, fileId);

  if (!model.trim()) {
    throw new Error('请选择 embedding 模型');
  }

  if (file.status !== 'parsed') {
    throw new Error('请先解析这个文件');
  }

  await generateFileEmbeddings(knowledgeBase, file, model.trim());
  await appendKnowledgeLog(knowledgeBase, `重新索引文件：${file.name}`);
  await writeKnowledgeBaseIndex(knowledgeBase);
  await saveStore(store);
  return knowledgeBase;
});

ipcMain.handle('kb:delete-file', async (_event, knowledgeBaseId: string, fileId: string): Promise<KnowledgeBase> => {
  const store = await ensureStore();
  const knowledgeBase = findKnowledgeBase(store, knowledgeBaseId);
  const file = findKnowledgeFile(knowledgeBase, fileId);
  const pathsToRemove = [file.storedPath, file.parsedPath, file.chunksPath, file.embeddingsPath].filter(Boolean);

  for (const filePath of pathsToRemove) {
    await fs.rm(filePath!, { force: true }).catch(() => {});
  }

  knowledgeBase.files = knowledgeBase.files.filter((item) => item.id !== fileId);
  await appendKnowledgeLog(knowledgeBase, `删除文件：${file.name}`);
  await writeKnowledgeBaseIndex(knowledgeBase);
  await saveStore(store);
  return knowledgeBase;
});

ipcMain.handle('kb:open-folder', async (_event, knowledgeBaseId: string): Promise<boolean> => {
  const store = await ensureStore();
  const knowledgeBase = findKnowledgeBase(store, knowledgeBaseId);
  const error = await shell.openPath(knowledgeBase.folderPath);

  if (error) {
    throw new Error(error);
  }

  return true;
});

ipcMain.handle('kb:health', async (_event, knowledgeBaseId: string): Promise<KnowledgeHealthReport> => {
  const store = await ensureStore();
  const knowledgeBase = findKnowledgeBase(store, knowledgeBaseId);
  const report = await checkKnowledgeBaseHealth(knowledgeBase);

  await appendKnowledgeLog(knowledgeBase, `体检知识库：${report.score} 分`);
  await saveStore(store);
  return report;
});

ipcMain.handle('kb:search', async (_event, knowledgeBaseId: string, query: string, model: string): Promise<SearchResult[]> => {
  const store = await ensureStore();
  const knowledgeBase = findKnowledgeBase(store, knowledgeBaseId);

  return searchKnowledgeBaseChunks(knowledgeBase, query, model);
});

ipcMain.handle('kb:ask', async (_event, request: KnowledgeAnswerRequest): Promise<KnowledgeAnswer> => {
  const controller = new AbortController();
  activeChatRequests.set(request.requestId, controller);

  try {
    const store = await ensureStore();
    const knowledgeBase = findKnowledgeBase(store, request.knowledgeBaseId);

    const citations = await searchKnowledgeBaseChunks(knowledgeBase, request.question, request.embeddingModel);
    const knowledgeRules = await readKnowledgeBaseRules(knowledgeBase);
    const answer = await sendChatRequest(
      {
        ...request,
        messages: [
          {
            role: 'user',
            content: buildKnowledgePrompt(request.question, citations, knowledgeRules),
          },
        ],
      },
      controller.signal,
    );

    return {
      answer,
      citations,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('已停止生成');
    }

    throw error;
  } finally {
    activeChatRequests.delete(request.requestId);
  }
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
