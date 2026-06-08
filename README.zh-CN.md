# LocalMind 中文介绍

LocalMind 是一个本地优先的桌面知识库 AI 助手，用来把你自己的文档整理成可检索、可问答的私人知识库。

它支持本地 Ollama 模型，也支持 OpenAI-compatible 网络 API。你可以根据场景选择：

- 本地模型：资料更私密，但会占用本机内存或显存
- 网络 API：本机压力更小，适合调用更强的大模型
- 混合模式：资料、解析、切块、检索都留在本地，只把命中的少量片段发给模型

## 当前能做什么

- 创建多个知识库
- 每个知识库自动生成独立本地文件夹
- 自动维护 `raw/`、`notes/`、`assets/`、`index.md`、`log.md`、`AI_CONFIG.md`
- 导入 PDF、Word、Markdown、TXT 文件，也支持选择文件夹批量导入
- 导入、解析、生成索引时显示进度提示
- 提取文档纯文本
- 自动切成适合检索的小片段
- 使用 Ollama 生成 embedding 向量
- 在本地做混合检索：关键词检索 + 向量相似度检索
- 对检索结果进行本地重排，减少误命中
- 根据命中片段进行知识库问答并显示引用来源
- 导入、导出知识库备份包
- 一键体检知识库结构、文件、解析结果和索引状态
- 允许每个知识库通过 `AI_CONFIG.md` 设置回答规则
- 连接 Ollama 本地聊天模型
- 连接 OpenAI-compatible 网络 API
- 保存多个网络模型配置
- 提供 DeepSeek、OpenAI、OpenRouter、硅基流动、阿里百炼等网络模型预设
- 保存网络模型前可先测试连接
- 使用 Electron `safeStorage` 加密保存 API Key
- 生成过程中可以点击停止
- 首次打开提供使用向导

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
- 网络模型连接测试
- 常用网络模型服务商预设
- 首次使用向导
- 停止生成按钮
- 知识库创建
- 文件导入
- 文件夹批量导入
- 文档解析
- 文本切块
- embedding 生成
- 导入和索引进度提示
- 本地混合检索测试
- 本地检索结果重排
- 正式知识库问答
- 回答引用来源片段
- 文件删除
- 文件重新解析
- 文件重新索引
- 打开知识库本地文件夹
- 知识库备份导入
- 知识库备份导出
- 知识库体检
- 知识库规则文件
- 自动维护知识库索引和操作日志
- macOS 打包配置

## 路线图

LocalMind 后续会按“先稳定易用，再增强检索，最后走向图谱化知识库”的节奏推进。

### 近期：让普通用户更容易使用

- 完善 macOS 发布包、应用图标和安装说明
- 增加 Windows 安装包
- 增加项目截图、使用动图和更清晰的新手教程

### 中期：增强知识库问答质量

- 增加 OCR，支持图片和扫描版 PDF
- 增加更多文档格式解析
- 增加知识库导入导出兼容性测试

### 远期：吸收 codegraph 思路，走向知识图谱

- 从文档中提取实体、主题、术语和引用关系
- 为每个知识库构建轻量本地图谱索引
- 提问时先查图谱，再查相关片段，减少 token 浪费
- 增加“知识图谱视图”，展示文件、主题、概念、片段之间的关系
- 支持代码库知识库，理解项目文件、函数、依赖和说明文档
- 支持 Markdown/Obsidian 笔记库的图谱化检索

这部分受到 [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) 启发，但 LocalMind 会优先保持桌面应用的一体化和普通用户友好。

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
- `AI_CONFIG.md` 知识库回答规则
- `index.md` 知识库目录摘要
- `log.md` 知识库操作日志
- 加密后的模型配置
- 运行日志

你也可以在界面中把单个知识库导出为 `.localmind.zip` 备份包，再导入到另一台电脑或另一个 LocalMind 环境。

## 知识库文件夹结构

每个知识库会自动维护：

```text
raw/          导入的原始资料
notes/        人工或 AI 辅助整理后的 Markdown 笔记
assets/       图片、附件等素材
texts/        自动解析出的纯文本
chunks/       自动切分的检索片段
embeddings/   本地向量索引
AI_CONFIG.md  当前知识库的回答规则
index.md      当前知识库目录摘要
log.md        操作日志
```

右侧面板的“体检知识库”会检查文件是否丢失、解析是否失败、索引是否缺失、是否有疑似重复文件或孤立索引文件。

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

## 致谢与灵感来源

LocalMind 在设计过程中受到这些开源项目启发：

- [zxfccmm4/Obsidian-OpenCode-Knowledge](https://github.com/zxfccmm4/Obsidian-OpenCode-Knowledge)：启发了知识库文件夹结构、`AI_CONFIG.md` 规则文件、索引文件和体检思路。
- [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph)：启发了“先构建本地索引，再减少上下文读取”的思路，尤其适合未来做代码库、Markdown 笔记和大型知识库的图谱化检索。

感谢这些项目和作者的开放分享。LocalMind 会保持本地优先、普通用户友好，同时吸收优秀开源项目中适合桌面知识库助手的设计。

## License

MIT
