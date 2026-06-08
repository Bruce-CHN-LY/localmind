import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  Download,
  FileText,
  FolderOpen,
  FolderPlus,
  Import,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Upload,
  WifiOff,
} from 'lucide-react';
import { createRoot } from 'react-dom/client';
import type {
  ChatMessage,
  KnowledgeBase,
  KnowledgeHealthReport,
  KnowledgeProgressEvent,
  ModelProvider,
  OllamaModel,
  OllamaStatus,
  SearchResult,
} from '../preload/types';
import type { NetworkModelConfig } from '../preload/types';
import './styles.css';

type UiMessage = ChatMessage & {
  id: string;
  citations?: SearchResult[];
};

type NetworkProviderPreset = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  note: string;
};

const NETWORK_PROVIDER_PRESETS: NetworkProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    note: '性价比高，适合中文知识库问答。',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    model: 'gpt-4o-mini',
    note: '通用能力强，适合英文和复杂任务。',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    model: 'openai/gpt-4o-mini',
    note: '可通过一个入口选择多家模型。',
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn',
    model: 'deepseek-ai/DeepSeek-V3',
    note: '国内常用 OpenAI-compatible 服务。',
  },
  {
    id: 'dashscope',
    name: '阿里百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
    model: 'qwen-plus',
    note: '适合通义千问系列模型。',
  },
];

const ONBOARDING_STORAGE_KEY = 'localmind:onboarding-dismissed';

function formatModelSize(size?: number) {
  if (!size) return '';
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getFileStatusText(status: string) {
  switch (status) {
    case 'stored':
      return '已存入本地';
    case 'parsing':
      return '正在解析';
    case 'parsed':
      return '已解析';
    case 'failed':
      return '解析失败';
    default:
      return status;
  }
}

function getMatchTypeText(matchType?: SearchResult['matchType']) {
  switch (matchType) {
    case 'hybrid':
      return '混合命中';
    case 'keyword':
      return '关键词命中';
    case 'vector':
      return '语义命中';
    default:
      return '检索命中';
  }
}

function App() {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [modelProvider, setModelProvider] = useState<ModelProvider>('ollama');
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedEmbeddingModel, setSelectedEmbeddingModel] = useState('');
  const [networkModels, setNetworkModels] = useState<NetworkModelConfig[]>([]);
  const [selectedNetworkModelId, setSelectedNetworkModelId] = useState('');
  const [networkBaseUrl, setNetworkBaseUrl] = useState('https://api.deepseek.com');
  const [networkName, setNetworkName] = useState('DeepSeek Chat');
  const [networkModel, setNetworkModel] = useState('deepseek-chat');
  const [networkApiKey, setNetworkApiKey] = useState('');
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState('');
  const [newKnowledgeBaseName, setNewKnowledgeBaseName] = useState('');
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '你好，我是 LocalMind。第一版已连接本地 Ollama，你可以先直接和本地模型聊天。',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStoppingChat, setIsStoppingChat] = useState(false);
  const [activeChatRequestId, setActiveChatRequestId] = useState('');
  const [isCreatingKnowledgeBase, setIsCreatingKnowledgeBase] = useState(false);
  const [isImportingFiles, setIsImportingFiles] = useState(false);
  const [isImportingArchive, setIsImportingArchive] = useState(false);
  const [isExportingArchive, setIsExportingArchive] = useState(false);
  const [isGeneratingIndex, setIsGeneratingIndex] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [busyFileId, setBusyFileId] = useState('');
  const [isSearchingKnowledgeBase, setIsSearchingKnowledgeBase] = useState(false);
  const [isSavingModelSettings, setIsSavingModelSettings] = useState(false);
  const [isTestingNetworkModel, setIsTestingNetworkModel] = useState(false);
  const [isNetworkSettingsOpen, setIsNetworkSettingsOpen] = useState(false);
  const [editingNetworkModelId, setEditingNetworkModelId] = useState('');
  const [knowledgeSearchQuery, setKnowledgeSearchQuery] = useState('');
  const [knowledgeSearchResults, setKnowledgeSearchResults] = useState<SearchResult[]>([]);
  const [healthReport, setHealthReport] = useState<KnowledgeHealthReport | null>(null);
  const [knowledgeProgress, setKnowledgeProgress] = useState<KnowledgeProgressEvent | null>(null);
  const [notice, setNotice] = useState('');
  const [networkTestMessage, setNetworkTestMessage] = useState('');
  const [isNetworkTestOk, setIsNetworkTestOk] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

  const selectedNetworkModel = useMemo(
    () => networkModels.find((model) => model.id === selectedNetworkModelId) ?? null,
    [networkModels, selectedNetworkModelId],
  );

  const canChat =
    modelProvider === 'ollama'
      ? Boolean(status?.reachable && selectedModel && !isLoading)
      : Boolean(selectedNetworkModel?.baseUrl.trim() && selectedNetworkModel.model.trim() && selectedNetworkModel.apiKey.trim() && !isLoading);

  const selectedModelDetail = useMemo(
    () => models.find((model) => model.name === selectedModel),
    [models, selectedModel],
  );

  const selectedKnowledgeBase = useMemo(
    () => knowledgeBases.find((item) => item.id === selectedKnowledgeBaseId) ?? null,
    [knowledgeBases, selectedKnowledgeBaseId],
  );
  const selectedKnowledgeBaseHasIndex = Boolean(selectedKnowledgeBase?.files.some((file) => file.vectorCount));
  const visibleKnowledgeProgress =
    knowledgeProgress && knowledgeProgress.knowledgeBaseId === selectedKnowledgeBaseId ? knowledgeProgress : null;
  const knowledgeProgressPercent = visibleKnowledgeProgress
    ? Math.round((visibleKnowledgeProgress.current / Math.max(visibleKnowledgeProgress.total, 1)) * 100)
    : 0;

  async function refreshKnowledgeBases() {
    const nextKnowledgeBases = await window.localMind.listKnowledgeBases();
    setKnowledgeBases(nextKnowledgeBases);
    setSelectedKnowledgeBaseId((current) => current || nextKnowledgeBases[0]?.id || '');
  }

  async function loadModelSettings() {
    const settings = await window.localMind.getModelSettings();
    setModelProvider(settings.provider);
    setNetworkModels(settings.networkModels);
    setSelectedNetworkModelId(settings.selectedNetworkModelId);
    const selectedNetwork = settings.networkModels.find((model) => model.id === settings.selectedNetworkModelId) ?? settings.networkModels[0];

    if (selectedNetwork) {
      setNetworkName(selectedNetwork.name);
      setNetworkBaseUrl(selectedNetwork.baseUrl);
      setNetworkModel(selectedNetwork.model);
      setNetworkApiKey(selectedNetwork.apiKey);
    }

    setIsNetworkSettingsOpen(settings.networkModels.length === 0 || !selectedNetwork?.apiKey);
  }

  async function refreshOllama() {
    setNotice('');
    const nextStatus = await window.localMind.getOllamaStatus();
    setStatus(nextStatus);

    if (!nextStatus.reachable) {
      setModels([]);
      setSelectedModel('');
      setNotice('没有连接到 Ollama。请先打开 Ollama，再刷新。');
      return;
    }

    try {
      const nextModels = await window.localMind.listOllamaModels();
      setModels(nextModels);
      setSelectedModel((current) => current || nextModels[0]?.name || '');
      setSelectedEmbeddingModel((current) => {
        if (current) return current;
        return nextModels.find((model) => model.name.includes('embed'))?.name || nextModels[0]?.name || '';
      });

      if (nextModels.length === 0) {
        setNotice('Ollama 已连接，但还没有模型。可以先拉取 qwen2.5:7b 或 llama3.1:8b。');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '读取模型列表失败');
    }
  }

  useEffect(() => {
    refreshOllama();
    refreshKnowledgeBases();
    loadModelSettings();

    if (localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'true') {
      setIsOnboardingOpen(true);
    }
  }, []);

  useEffect(() => {
    let clearTimer: number | undefined;
    const unsubscribe = window.localMind.onKnowledgeProgress((progress) => {
      setKnowledgeProgress(progress);

      if (clearTimer) {
        window.clearTimeout(clearTimer);
      }

      if (progress.done) {
        clearTimer = window.setTimeout(() => setKnowledgeProgress(null), 3200);
      }
    });

    return () => {
      if (clearTimer) {
        window.clearTimeout(clearTimer);
      }

      unsubscribe();
    };
  }, []);

  function handleDismissOnboarding() {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    setIsOnboardingOpen(false);
  }

  function handleUseNetworkFromOnboarding() {
    setModelProvider('network');
    setIsNetworkSettingsOpen(true);
    handleDismissOnboarding();
  }

  function handleApplyNetworkPreset(presetId: string) {
    const preset = NETWORK_PROVIDER_PRESETS.find((item) => item.id === presetId);

    if (!preset) return;

    setNetworkName(preset.name);
    setNetworkBaseUrl(preset.baseUrl);
    setNetworkModel(preset.model);
    setNetworkTestMessage('');
    setIsNetworkTestOk(false);
  }

  function clearNetworkTestResult() {
    setNetworkTestMessage('');
    setIsNetworkTestOk(false);
  }

  async function handleTestNetworkModel() {
    if (isTestingNetworkModel) return;

    setIsTestingNetworkModel(true);
    setNetworkTestMessage('');
    setIsNetworkTestOk(false);
    setNotice('');

    try {
      const result = await window.localMind.testNetworkModel({
        id: editingNetworkModelId || 'testing-network-model',
        name: networkName.trim() || networkModel.trim() || 'Network Model',
        baseUrl: networkBaseUrl,
        model: networkModel,
        apiKey: networkApiKey,
      });

      setIsNetworkTestOk(result.ok);
      setNetworkTestMessage(result.message);
    } catch (error) {
      setIsNetworkTestOk(false);
      setNetworkTestMessage(error instanceof Error ? error.message : '连接测试失败');
    } finally {
      setIsTestingNetworkModel(false);
    }
  }

  async function handleSaveModelSettings() {
    setIsSavingModelSettings(true);
    setNotice('');

    try {
      const modelId = editingNetworkModelId || crypto.randomUUID();
      const nextNetworkModel: NetworkModelConfig = {
        id: modelId,
        name: networkName.trim() || networkModel.trim(),
        baseUrl: networkBaseUrl,
        model: networkModel,
        apiKey: networkApiKey,
      };
      const nextNetworkModels = networkModels.some((model) => model.id === modelId)
        ? networkModels.map((model) => (model.id === modelId ? nextNetworkModel : model))
        : [...networkModels, nextNetworkModel];
      const settings = await window.localMind.saveModelSettings({
        provider: modelProvider,
        selectedNetworkModelId: modelId,
        networkModels: nextNetworkModels,
      });

      setModelProvider(settings.provider);
      setNetworkModels(settings.networkModels);
      setSelectedNetworkModelId(settings.selectedNetworkModelId);
      setEditingNetworkModelId('');
      setIsNetworkSettingsOpen(false);
      setNetworkTestMessage('');
      setIsNetworkTestOk(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存模型设置失败');
    } finally {
      setIsSavingModelSettings(false);
    }
  }

  function handleAddNetworkModel() {
    setEditingNetworkModelId('');
    setNetworkName('');
    setNetworkBaseUrl('https://api.deepseek.com');
    setNetworkModel('');
    setNetworkApiKey('');
    setNetworkTestMessage('');
    setIsNetworkTestOk(false);
    setIsNetworkSettingsOpen(true);
  }

  function handleEditNetworkModel() {
    if (!selectedNetworkModel) {
      handleAddNetworkModel();
      return;
    }

    setEditingNetworkModelId(selectedNetworkModel.id);
    setNetworkName(selectedNetworkModel.name);
    setNetworkBaseUrl(selectedNetworkModel.baseUrl);
    setNetworkModel(selectedNetworkModel.model);
    setNetworkApiKey(selectedNetworkModel.apiKey);
    setNetworkTestMessage('');
    setIsNetworkTestOk(false);
    setIsNetworkSettingsOpen(true);
  }

  async function handleCreateKnowledgeBase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newKnowledgeBaseName.trim();
    if (!name || isCreatingKnowledgeBase) return;

    setIsCreatingKnowledgeBase(true);
    setNotice('');

    try {
      const knowledgeBase = await window.localMind.createKnowledgeBase(name);
      setKnowledgeBases((current) => [knowledgeBase, ...current]);
      setSelectedKnowledgeBaseId(knowledgeBase.id);
      setNewKnowledgeBaseName('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '创建知识库失败');
    } finally {
      setIsCreatingKnowledgeBase(false);
    }
  }

  async function handleImportFiles() {
    if (!selectedKnowledgeBaseId || isImportingFiles) return;

    setIsImportingFiles(true);
    setNotice('');

    try {
      const updatedKnowledgeBase = await window.localMind.importKnowledgeFiles(selectedKnowledgeBaseId);
      setKnowledgeBases((current) =>
        current.map((knowledgeBase) =>
          knowledgeBase.id === updatedKnowledgeBase.id ? updatedKnowledgeBase : knowledgeBase,
        ),
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '导入文件失败');
    } finally {
      setIsImportingFiles(false);
    }
  }

  async function handleImportKnowledgeBaseArchive() {
    if (isImportingArchive) return;

    setIsImportingArchive(true);
    setNotice('');

    try {
      const knowledgeBase = await window.localMind.importKnowledgeBaseArchive();

      if (!knowledgeBase) return;

      setKnowledgeBases((current) => [knowledgeBase, ...current]);
      setSelectedKnowledgeBaseId(knowledgeBase.id);
      setNotice(`已导入知识库备份：${knowledgeBase.name}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '导入知识库备份失败');
    } finally {
      setIsImportingArchive(false);
    }
  }

  async function handleExportKnowledgeBaseArchive() {
    if (!selectedKnowledgeBaseId || isExportingArchive) return;

    setIsExportingArchive(true);
    setNotice('');

    try {
      const exportPath = await window.localMind.exportKnowledgeBase(selectedKnowledgeBaseId);

      if (exportPath) {
        setNotice(`已导出知识库备份：${exportPath}`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '导出知识库备份失败');
    } finally {
      setIsExportingArchive(false);
    }
  }

  async function handleGenerateIndex() {
    if (!selectedKnowledgeBaseId || !selectedEmbeddingModel || isGeneratingIndex) return;

    setIsGeneratingIndex(true);
    setNotice('');

    try {
      const updatedKnowledgeBase = await window.localMind.generateKnowledgeBaseEmbeddings(
        selectedKnowledgeBaseId,
        selectedEmbeddingModel,
      );
      setKnowledgeBases((current) =>
        current.map((knowledgeBase) =>
          knowledgeBase.id === updatedKnowledgeBase.id ? updatedKnowledgeBase : knowledgeBase,
        ),
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '生成索引失败');
    } finally {
      setIsGeneratingIndex(false);
    }
  }

  async function handleCheckKnowledgeBaseHealth() {
    if (!selectedKnowledgeBaseId || isCheckingHealth) return;

    setIsCheckingHealth(true);
    setNotice('');

    try {
      setHealthReport(await window.localMind.checkKnowledgeBaseHealth(selectedKnowledgeBaseId));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '知识库体检失败');
    } finally {
      setIsCheckingHealth(false);
    }
  }

  function replaceKnowledgeBase(updatedKnowledgeBase: KnowledgeBase) {
    setKnowledgeBases((current) =>
      current.map((knowledgeBase) =>
        knowledgeBase.id === updatedKnowledgeBase.id ? updatedKnowledgeBase : knowledgeBase,
      ),
    );
  }

  async function handleOpenKnowledgeBaseFolder() {
    if (!selectedKnowledgeBaseId) return;

    try {
      await window.localMind.openKnowledgeBaseFolder(selectedKnowledgeBaseId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '打开文件夹失败');
    }
  }

  function clearKnowledgeBaseDerivedViews() {
    setKnowledgeSearchResults([]);
    setHealthReport(null);
  }

  async function handleReparseFile(fileId: string) {
    if (!selectedKnowledgeBaseId || busyFileId) return;

    setBusyFileId(fileId);
    setNotice('');

    try {
      replaceKnowledgeBase(await window.localMind.reparseKnowledgeFile(selectedKnowledgeBaseId, fileId));
      clearKnowledgeBaseDerivedViews();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '重新解析失败');
    } finally {
      setBusyFileId('');
    }
  }

  async function handleReindexFile(fileId: string) {
    if (!selectedKnowledgeBaseId || !selectedEmbeddingModel || busyFileId) return;

    setBusyFileId(fileId);
    setNotice('');

    try {
      replaceKnowledgeBase(
        await window.localMind.reindexKnowledgeFile(selectedKnowledgeBaseId, fileId, selectedEmbeddingModel),
      );
      clearKnowledgeBaseDerivedViews();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '重新索引失败');
    } finally {
      setBusyFileId('');
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!selectedKnowledgeBaseId || busyFileId) return;

    setBusyFileId(fileId);
    setNotice('');

    try {
      replaceKnowledgeBase(await window.localMind.deleteKnowledgeFile(selectedKnowledgeBaseId, fileId));
      clearKnowledgeBaseDerivedViews();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除文件失败');
    } finally {
      setBusyFileId('');
    }
  }

  async function handleKnowledgeSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedKnowledgeBaseId || !selectedEmbeddingModel || !knowledgeSearchQuery.trim()) return;

    setIsSearchingKnowledgeBase(true);
    setNotice('');

    try {
      const results = await window.localMind.searchKnowledgeBase(
        selectedKnowledgeBaseId,
        knowledgeSearchQuery,
        selectedEmbeddingModel,
      );
      setKnowledgeSearchResults(results);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '检索失败');
    } finally {
      setIsSearchingKnowledgeBase(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || !canChat) return;

    const userMessage: UiMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };

    setMessages((current) => [...current, userMessage]);
    setInput('');
    setIsLoading(true);
    setIsStoppingChat(false);
    const requestId = crypto.randomUUID();
    setActiveChatRequestId(requestId);
    setNotice('');

    try {
      const networkConfig =
        modelProvider === 'network' && selectedNetworkModel
          ? {
              id: selectedNetworkModel.id,
              name: selectedNetworkModel.name,
              baseUrl: selectedNetworkModel.baseUrl,
              apiKey: selectedNetworkModel.apiKey,
              model: selectedNetworkModel.model,
            }
          : undefined;
      const model = modelProvider === 'network' && selectedNetworkModel ? selectedNetworkModel.model : selectedModel;
      const response =
        selectedKnowledgeBase && selectedKnowledgeBaseHasIndex && selectedEmbeddingModel
          ? await window.localMind.askKnowledgeBase({
              requestId,
              provider: modelProvider,
              model,
              messages: [],
              networkConfig,
              knowledgeBaseId: selectedKnowledgeBase.id,
              question: content,
              embeddingModel: selectedEmbeddingModel,
            })
          : {
              answer: await window.localMind.sendChat({
                requestId,
                provider: modelProvider,
                model,
                messages: [...messages, userMessage].map(({ role, content }) => ({ role, content })),
                networkConfig,
              }),
              citations: [],
            };

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.answer || '模型没有返回内容。',
          citations: response.citations,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送失败';

      if (message.includes('已停止生成')) {
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '已停止生成。',
          },
        ]);
      } else {
        setNotice(message);
      }
    } finally {
      setIsLoading(false);
      setIsStoppingChat(false);
      setActiveChatRequestId('');
    }
  }

  async function handleStopChat() {
    if (!activeChatRequestId || isStoppingChat) return;
    setIsStoppingChat(true);
    setNotice('');
    const stopped = await window.localMind.stopChat(activeChatRequestId);

    if (!stopped) {
      setIsLoading(false);
      setIsStoppingChat(false);
      setActiveChatRequestId('');
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Bot size={22} />
          </div>
          <div>
            <h1>LocalMind</h1>
            <p>本地知识库助手</p>
          </div>
        </div>

        <section className="panel">
          <div className="panel-title">
            <span>模型来源</span>
            <button className="icon-button" onClick={refreshOllama} aria-label="刷新本地模型状态">
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="provider-toggle">
            <button
              className={modelProvider === 'ollama' ? 'active' : ''}
              onClick={() => setModelProvider('ollama')}
              type="button"
            >
              本地
            </button>
            <button
              className={modelProvider === 'network' ? 'active' : ''}
              onClick={() => setModelProvider('network')}
              type="button"
            >
              网络 API
            </button>
          </div>

          {modelProvider === 'ollama' ? (
            <div className={status?.reachable ? 'status-card ok' : 'status-card muted'}>
              {status?.reachable ? <CheckCircle2 size={18} /> : <WifiOff size={18} />}
              <div>
                <strong>{status?.reachable ? 'Ollama 已连接' : 'Ollama 未连接'}</strong>
                <span>{status?.baseUrl ?? 'http://127.0.0.1:11434'}</span>
              </div>
            </div>
          ) : (
            <div className="network-card">
              {networkModels.length > 0 && !isNetworkSettingsOpen ? (
                <>
                  <label>
                    选择模型
                    <select
                      value={selectedNetworkModelId}
                      onChange={(event) => setSelectedNetworkModelId(event.target.value)}
                    >
                      {networkModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="network-summary">
                    <strong>{selectedNetworkModel?.model}</strong>
                    <span>{selectedNetworkModel?.baseUrl}</span>
                  </div>
                  <div className="network-actions">
                    <button onClick={handleAddNetworkModel} type="button">
                      添加模型
                    </button>
                    <button onClick={handleEditNetworkModel} type="button">
                      编辑当前
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label>
                    服务商模板
                    <select
                      value=""
                      onChange={(event) => handleApplyNetworkPreset(event.target.value)}
                    >
                      <option value="" disabled>
                        选择后自动填写地址和模型
                      </option>
                      {NETWORK_PROVIDER_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name} · {preset.model}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    显示名称
                    <input
                      value={networkName}
                      onChange={(event) => {
                        setNetworkName(event.target.value);
                        clearNetworkTestResult();
                      }}
                      placeholder="DeepSeek Chat"
                    />
                  </label>
                  <label>
                    API 地址
                    <input
                      value={networkBaseUrl}
                      onChange={(event) => {
                        setNetworkBaseUrl(event.target.value);
                        clearNetworkTestResult();
                      }}
                      placeholder="https://api.deepseek.com"
                    />
                  </label>
                  <label>
                    模型名
                    <input
                      value={networkModel}
                      onChange={(event) => {
                        setNetworkModel(event.target.value);
                        clearNetworkTestResult();
                      }}
                      placeholder="deepseek-chat"
                    />
                  </label>
                  <label>
                    API Key
                    <input
                      value={networkApiKey}
                      onChange={(event) => {
                        setNetworkApiKey(event.target.value);
                        clearNetworkTestResult();
                      }}
                      placeholder="输入后加密保存到本机"
                      type="password"
                    />
                  </label>
                  <p className="hint">
                    模板只会帮你填写地址和模型名，API Key 仍然加密保存在本机。
                  </p>
                  {networkTestMessage ? (
                    <div className={`network-test-result ${isNetworkTestOk ? 'ok' : 'error'}`}>
                      {networkTestMessage}
                    </div>
                  ) : null}
                  <div className="network-actions">
                    <button
                      className="test-model-button"
                      disabled={isTestingNetworkModel || !networkBaseUrl.trim() || !networkModel.trim() || !networkApiKey.trim()}
                      onClick={handleTestNetworkModel}
                      type="button"
                    >
                      {isTestingNetworkModel ? '测试中' : '测试连接'}
                    </button>
                    <button
                      className="save-settings-button"
                      disabled={isSavingModelSettings || !networkBaseUrl.trim() || !networkModel.trim()}
                      onClick={handleSaveModelSettings}
                      type="button"
                    >
                      {isSavingModelSettings ? '保存中' : editingNetworkModelId ? '更新模型' : '保存模型'}
                    </button>
                  </div>
                  <div className="network-actions">
                    {networkModels.length > 0 ? (
                      <button onClick={() => setIsNetworkSettingsOpen(false)} type="button">
                        取消
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {modelProvider === 'ollama' ? (
          <section className="panel">
            <div className="panel-title">
              <span>聊天模型</span>
            </div>

            <select
              className="select"
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              disabled={models.length === 0}
            >
              {models.length === 0 ? (
                <option>暂无模型</option>
              ) : (
                models.map((model) => <option key={model.name}>{model.name}</option>)
              )}
            </select>

            {selectedModelDetail ? (
              <p className="hint">模型大小：{formatModelSize(selectedModelDetail.size) || '未知'}</p>
            ) : (
              <p className="hint">推荐先安装 qwen2.5:7b。</p>
            )}

            <div className="panel-title secondary-title">
              <span>Embedding 模型</span>
            </div>
            <select
              className="select"
              value={selectedEmbeddingModel}
              onChange={(event) => setSelectedEmbeddingModel(event.target.value)}
              disabled={models.length === 0}
            >
              {models.length === 0 ? (
                <option>暂无模型</option>
              ) : (
                models.map((model) => <option key={model.name}>{model.name}</option>)
              )}
            </select>
            <p className="hint">推荐使用 nomic-embed-text。</p>
          </section>
        ) : (
          <section className="panel">
            <p className="hint">网络 API 会降低本地内存占用。知识库检索仍可保留在本地。</p>
          </section>
        )}

        <section className="panel knowledge-panel">
          <div className="panel-title">
            <span>知识库</span>
            <span>{knowledgeBases.length}</span>
          </div>

          <form className="kb-create" onSubmit={handleCreateKnowledgeBase}>
            <input
              value={newKnowledgeBaseName}
              onChange={(event) => setNewKnowledgeBaseName(event.target.value)}
              placeholder="新知识库名称"
            />
            <button
              aria-label="创建知识库"
              disabled={newKnowledgeBaseName.trim().length === 0 || isCreatingKnowledgeBase}
              type="submit"
            >
              <FolderPlus size={16} />
            </button>
          </form>

          <button
            className="kb-archive-button"
            disabled={isImportingArchive}
            onClick={handleImportKnowledgeBaseArchive}
            type="button"
          >
            {isImportingArchive ? <Loader2 size={15} /> : <Upload size={15} />}
            导入知识库备份
          </button>

          <div className="kb-list">
            {knowledgeBases.length === 0 ? (
              <div className="empty-box">
                <strong>还没有知识库</strong>
                <span>先创建一个，比如“工作资料”或“学习笔记”。</span>
              </div>
            ) : (
              knowledgeBases.map((knowledgeBase) => (
                <button
                  className={`kb-item ${knowledgeBase.id === selectedKnowledgeBaseId ? 'active' : ''}`}
                  key={knowledgeBase.id}
                  onClick={() => {
                    setSelectedKnowledgeBaseId(knowledgeBase.id);
                    clearKnowledgeBaseDerivedViews();
                  }}
                  type="button"
                >
                  <Database size={16} />
                  <span>{knowledgeBase.name}</span>
                  <small>{knowledgeBase.files.length} 个文件</small>
                </button>
              ))
            )}
          </div>
        </section>

        <button className="settings-button">
          <Settings size={16} />
          设置
        </button>
      </aside>

      {isOnboardingOpen ? (
        <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-label="首次使用向导">
          <section className="onboarding-card">
            <div className="onboarding-heading">
              <div className="brand-mark">
                <Sparkles size={22} />
              </div>
              <div>
                <h2>欢迎使用 LocalMind</h2>
                <p>按这 4 步走，很快就能让本地资料开始回答问题。</p>
              </div>
            </div>

            <div className="onboarding-steps">
              <article>
                <strong>1. 选择模型来源</strong>
                <span>本地 Ollama 更私密；网络 API 更省电脑内存。</span>
              </article>
              <article>
                <strong>2. 选择 Embedding 模型</strong>
                <span>推荐先用 Ollama 的 nomic-embed-text 来生成知识库索引。</span>
              </article>
              <article>
                <strong>3. 创建知识库并导入资料</strong>
                <span>每个知识库都有独立文件夹，支持 PDF、Word、Markdown、TXT。</span>
              </article>
              <article>
                <strong>4. 点击生成索引</strong>
                <span>之后提问时，只会检索相关片段，不会整库塞给模型。</span>
              </article>
            </div>

            <div className="onboarding-actions">
              <button className="secondary" onClick={handleUseNetworkFromOnboarding} type="button">
                使用网络 API
              </button>
              <button onClick={handleDismissOnboarding} type="button">
                开始使用
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <section className="chat-area">
        <header className="chat-header">
          <div>
            <h2>本地模型聊天</h2>
            <p>
              {selectedKnowledgeBase
                ? `当前知识库：${selectedKnowledgeBase.name}${selectedKnowledgeBaseHasIndex ? ' · 已启用知识库问答' : ' · 先生成索引后启用问答'}`
                : '先创建一个知识库，再导入资料。'}
            </p>
          </div>
          {isLoading ? (
            <div className="thinking">
              <Loader2 size={16} />
              生成中
            </div>
          ) : null}
        </header>

        {notice ? <div className="notice">{notice}</div> : null}

        <div className="messages">
          {messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <span>{message.role === 'user' ? '你' : 'LocalMind'}</span>
              <p>{message.content}</p>
              {message.citations?.length ? (
                <div className="message-citations">
                  {message.citations.map((citation, index) => (
                    <details key={citation.id}>
                      <summary>
                        [{index + 1}] {citation.fileName} · 片段 {citation.chunkIndex + 1} ·{' '}
                        {getMatchTypeText(citation.matchType)} · {(citation.score * 100).toFixed(1)}%
                      </summary>
                      <p>{citation.content}</p>
                    </details>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              modelProvider === 'network'
                ? '输入问题，使用网络 API...'
                : status?.reachable
                  ? '输入问题，先试试本地模型...'
                  : '请先启动 Ollama'
            }
            disabled={modelProvider === 'ollama' && !status?.reachable}
            rows={2}
          />
          {isLoading ? (
            <button className="stop-button" disabled={isStoppingChat} onClick={handleStopChat} type="button">
              {isStoppingChat ? <Loader2 size={17} /> : <Square size={17} />}
              {isStoppingChat ? '停止中' : '停止'}
            </button>
          ) : (
            <button type="submit" disabled={!canChat || input.trim().length === 0}>
              <Send size={18} />
              发送
            </button>
          )}
        </form>
      </section>

      <aside className="source-panel">
        <header>
          <h2>{selectedKnowledgeBase?.name ?? '知识库文件'}</h2>
          <p>
            {selectedKnowledgeBase
              ? `文件夹：${selectedKnowledgeBase.folderPath}`
              : '创建知识库后，会生成对应的本地文件夹。'}
          </p>
        </header>

        {selectedKnowledgeBase ? (
          <>
            <button
              className="import-button"
              disabled={isImportingFiles}
              onClick={handleImportFiles}
              type="button"
            >
              {isImportingFiles ? <Loader2 size={17} /> : <Import size={17} />}
              导入文件/文件夹
            </button>
            <button className="import-button folder-button" onClick={handleOpenKnowledgeBaseFolder} type="button">
              <FolderOpen size={17} />
              打开文件夹
            </button>
            <button
              className="import-button health-button"
              disabled={isCheckingHealth}
              onClick={handleCheckKnowledgeBaseHealth}
              type="button"
            >
              {isCheckingHealth ? <Loader2 size={17} /> : <AlertTriangle size={17} />}
              {isCheckingHealth ? '体检中' : '体检知识库'}
            </button>
            <button
              className="import-button archive-button"
              disabled={isExportingArchive}
              onClick={handleExportKnowledgeBaseArchive}
              type="button"
            >
              {isExportingArchive ? <Loader2 size={17} /> : <Download size={17} />}
              {isExportingArchive ? '导出中' : '导出备份'}
            </button>
            <button
              className="import-button index-button"
              disabled={isGeneratingIndex || !selectedEmbeddingModel}
              onClick={handleGenerateIndex}
              type="button"
            >
              {isGeneratingIndex ? <Loader2 size={17} /> : <Database size={17} />}
              {isGeneratingIndex ? '生成中' : '生成索引'}
            </button>

            {visibleKnowledgeProgress ? (
              <section className="knowledge-progress">
                <div className="knowledge-progress-title">
                  <strong>{visibleKnowledgeProgress.operation === 'import' ? '导入进度' : '索引进度'}</strong>
                  <span>{knowledgeProgressPercent}%</span>
                </div>
                <div className="knowledge-progress-bar">
                  <span style={{ width: `${knowledgeProgressPercent}%` }} />
                </div>
                <p>
                  {visibleKnowledgeProgress.message} · {visibleKnowledgeProgress.current}/
                  {visibleKnowledgeProgress.total}
                </p>
              </section>
            ) : null}

            {healthReport ? (
              <section className="health-report">
                <div className="health-score">
                  <strong>{healthReport.score}</strong>
                  <span>{healthReport.summary}</span>
                </div>
                <div className="health-checks">
                  {healthReport.checks.slice(0, 8).map((check, index) => (
                    <article className={`health-check ${check.status}`} key={`${check.title}-${index}`}>
                      <strong>{check.title}</strong>
                      <span>{check.detail}</span>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="file-list">
              {selectedKnowledgeBase.files.length === 0 ? (
                <div className="source-empty">
                  <FileText size={24} />
                  <strong>还没有文件</strong>
                  <span>支持先导入 PDF、Word、Markdown 和 TXT。</span>
                </div>
              ) : (
                selectedKnowledgeBase.files.map((file) => (
                  <article className={`file-item ${file.status}`} key={file.id}>
                    <FileText size={16} />
                    <div>
                      <strong>{file.name}</strong>
                      <span>
                        {formatFileSize(file.size)} · {getFileStatusText(file.status)}
                        {file.textLength ? ` · ${file.textLength.toLocaleString()} 字符` : ''}
                        {file.chunkCount ? ` · ${file.chunkCount.toLocaleString()} 个片段` : ''}
                        {file.vectorCount ? ` · ${file.vectorCount.toLocaleString()} 个向量` : ''}
                      </span>
                      {file.error ? <em>{file.error}</em> : null}
                      <div className="file-actions">
                        <button disabled={busyFileId === file.id} onClick={() => handleReparseFile(file.id)} type="button">
                          {busyFileId === file.id ? <Loader2 size={13} /> : <RefreshCw size={13} />}
                          解析
                        </button>
                        <button
                          disabled={busyFileId === file.id || file.status !== 'parsed' || !selectedEmbeddingModel}
                          onClick={() => handleReindexFile(file.id)}
                          type="button"
                        >
                          {busyFileId === file.id ? <Loader2 size={13} /> : <Database size={13} />}
                          索引
                        </button>
                        <button
                          className="danger"
                          disabled={busyFileId === file.id}
                          onClick={() => handleDeleteFile(file.id)}
                          type="button"
                        >
                          <Trash2 size={13} />
                          删除
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>

            <form className="knowledge-search" onSubmit={handleKnowledgeSearch}>
              <label>
                测试检索
                <textarea
                  value={knowledgeSearchQuery}
                  onChange={(event) => setKnowledgeSearchQuery(event.target.value)}
                  placeholder="输入一个问题，看看知识库会命中哪些片段"
                  rows={3}
                />
              </label>
              <button disabled={isSearchingKnowledgeBase || !knowledgeSearchQuery.trim()} type="submit">
                {isSearchingKnowledgeBase ? <Loader2 size={17} /> : <Search size={17} />}
                {isSearchingKnowledgeBase ? '检索中' : '检索片段'}
              </button>
            </form>

            {knowledgeSearchResults.length > 0 ? (
              <div className="search-results">
                {knowledgeSearchResults.map((result) => (
                  <article className="search-result" key={result.id}>
                    <strong>{result.fileName}</strong>
                    <span>
                      片段 {result.chunkIndex + 1} · {getMatchTypeText(result.matchType)} · 综合匹配度{' '}
                      {(result.score * 100).toFixed(1)}%
                    </span>
                    <p>{result.content}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="source-empty">
            <Database size={24} />
            <strong>等待创建知识库</strong>
            <span>每个知识库都会拥有独立文件夹。</span>
          </div>
        )}
      </aside>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
