# LocalMind 中文介绍

LocalMind 是一个本地优先的桌面知识库 AI 助手，用来把你自己的文档整理成可检索、可问答的私人知识库。

它支持本地 Ollama 模型，也支持 OpenAI-compatible 网络 API。你可以根据场景选择：

- 本地模型：资料更私密，但会占用本机内存或显存
- 网络 API：本机压力更小，适合调用更强的大模型
- 混合模式：资料、解析、切块、检索都留在本地，只把命中的少量片段发给模型

## 当前能做什么

- 创建多个知识库
- 每个知识库自动生成独立本地文件夹
- 导入 PDF、Word、Markdown、TXT 文件
- 提取文档纯文本
- 自动切成适合检索的小片段
- 使用 Ollama 生成 embedding 向量
- 在本地做向量相似度检索
- 根据命中片段进行知识库问答并显示引用来源
- 导入、导出知识库备份包
- 连接 Ollama 本地聊天模型
- 连接 OpenAI-compatible 网络 API
- 保存多个网络模型配置
- 使用 Electron `safeStorage` 加密保存 API Key
- 生成过程中可以点击停止

## 为什么做这个项目

很多知识库工具会把文件上传到远端服务。LocalMind 的默认思路是：

> 文件留在本机，解析文本留在本机，未来的向量索引也留在本机。

如果你选择网络 API，LocalMind 的目标也不是把整个知识库上传出去，而是先在本地检索相关片段，再把少量片段发给模型回答。

## 适合谁用

- 有大量 PDF、Word、Markdown、TXT 资料的人
- 想用 Ollama 本地模型处理私有资料的人
- 想把本地模型和网络模型混合使用的人
- 想二次开发 RAG 桌面应用的开发者
- 想构建自己私人知识库助手的团队或个人

## 当前阶段

这是一个早期项目，目前已经完成基础骨架和知识库检索前置能力：

- Electron 桌面应用
- React 三栏界面
- Ollama 状态检测
- 本地模型列表读取
- 本地模型聊天
- 网络 API 聊天
- 多网络模型配置
- 停止生成按钮
- 知识库创建
- 文件导入
- 文档解析
- 文本切块
- embedding 生成
- 本地向量检索测试
- 正式知识库问答
- 回答引用来源片段
- 文件删除
- 文件重新解析
- 文件重新索引
- 打开知识库本地文件夹
- 知识库备份导入
- 知识库备份导出
- macOS 打包配置

下一步会继续做：

- Windows 安装包
- 更完善的发布流程
- 更强的检索和重排能力

## 运行方式

安装依赖：

```bash
npm install
```

启动开发版：

```bash
npm run dev
```

检查项目：

```bash
npm run typecheck
npm run build
```

生成 macOS 本地应用：

```bash
npm run pack
```

生成 macOS 发布包：

```bash
npm run dist:mac
```

如果 Electron 下载失败，可以使用镜像：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npx install-electron --no
```

## 本地数据位置

macOS 默认在：

```text
~/Library/Application Support/LocalMind
```

这里可能包含：

- 知识库文件夹
- 导入的原始文件
- 解析出的纯文本
- 文本片段
- embedding 向量
- 加密后的模型配置
- 运行日志

你也可以在界面中把单个知识库导出为 `.localmind.zip` 备份包，再导入到另一台电脑或另一个 LocalMind 环境。

这些内容不应该提交到 GitHub。

## 隐私说明

- 原始文件保存在本机
- 解析文本保存在本机
- 文本片段保存在本机
- embedding 向量保存在本机
- API Key 使用 Electron `safeStorage` 本地加密
- 使用网络 API 时，只应发送当前问题和本地检索命中的少量片段

## 开源方向

欢迎二次开发。比较适合贡献的方向：

- 接入更多模型服务商
- 优化文档解析
- 增强 RAG 检索
- 增加向量数据库支持
- 改进 UI 体验
- 增加打包和发布流程
- 增加自动化测试

请不要提交 API Key、私人文件、解析文本、向量文件或本地应用数据。

## License

MIT
