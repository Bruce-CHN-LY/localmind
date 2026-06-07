import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Database,
  FileText,
  FolderPlus,
  Import,
  Loader2,
  RefreshCw,
  Send,
  Settings,
  Square,
  WifiOff,
} from 'lucide-react';
import { createRoot } from 'react-dom/client';
import type { ChatMessage, KnowledgeBase, ModelProvider, OllamaModel, OllamaStatus } from '../preload/types';
import type { NetworkModelConfig } from '../preload/types';
import './styles.css';

type UiMessage = ChatMessage & {
  id: string;
};

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

function App() {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [modelProvider, setModelProvider] = useState<ModelProvider>('ollama');
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
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
  const [isSavingModelSettings, setIsSavingModelSettings] = useState(false);
  const [isNetworkSettingsOpen, setIsNetworkSettingsOpen] = useState(false);
  const [editingNetworkModelId, setEditingNetworkModelId] = useState('');
  const [notice, setNotice] = useState('');

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
  }, []);

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
      const answer = await window.localMind.sendChat({
        requestId,
        provider: modelProvider,
        model: selectedModel,
        messages: [...messages, userMessage].map(({ role, content }) => ({ role, content })),
        networkConfig:
          modelProvider === 'network' && selectedNetworkModel
            ? {
                id: selectedNetworkModel.id,
                name: selectedNetworkModel.name,
                baseUrl: selectedNetworkModel.baseUrl,
                apiKey: selectedNetworkModel.apiKey,
                model: selectedNetworkModel.model,
              }
            : undefined,
      });

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: answer || '模型没有返回内容。',
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
                    显示名称
                    <input
                      value={networkName}
                      onChange={(event) => setNetworkName(event.target.value)}
                      placeholder="DeepSeek Chat"
                    />
                  </label>
                  <label>
                    API 地址
                    <input
                      value={networkBaseUrl}
                      onChange={(event) => setNetworkBaseUrl(event.target.value)}
                      placeholder="https://api.deepseek.com"
                    />
                  </label>
                  <label>
                    模型名
                    <input
                      value={networkModel}
                      onChange={(event) => setNetworkModel(event.target.value)}
                      placeholder="deepseek-chat"
                    />
                  </label>
                  <label>
                    API Key
                    <input
                      value={networkApiKey}
                      onChange={(event) => setNetworkApiKey(event.target.value)}
                      placeholder="输入后加密保存到本机"
                      type="password"
                    />
                  </label>
                  <div className="network-actions">
                    <button
                      className="save-settings-button"
                      disabled={isSavingModelSettings || !networkBaseUrl.trim() || !networkModel.trim()}
                      onClick={handleSaveModelSettings}
                      type="button"
                    >
                      {isSavingModelSettings ? '保存中' : editingNetworkModelId ? '更新模型' : '保存模型'}
                    </button>
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
                  onClick={() => setSelectedKnowledgeBaseId(knowledgeBase.id)}
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

      <section className="chat-area">
        <header className="chat-header">
          <div>
            <h2>本地模型聊天</h2>
            <p>
              {selectedKnowledgeBase
                ? `当前知识库：${selectedKnowledgeBase.name}`
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
              导入文件
            </button>

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
                      </span>
                      {file.error ? <em>{file.error}</em> : null}
                    </div>
                  </article>
                ))
              )}
            </div>
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
