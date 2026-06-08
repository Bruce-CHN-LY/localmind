# LocalMind

[中文介绍](./README.zh-CN.md)

LocalMind is a local-first desktop knowledge assistant for building a private AI knowledge base from your own documents.

It supports local Ollama models and OpenAI-compatible network APIs, so users can choose between privacy-first local inference and lower-memory cloud inference.

## What It Does

- Creates multiple local knowledge bases
- Creates a dedicated folder for each knowledge base
- Maintains `raw/`, `notes/`, `assets/`, `index.md`, `log.md`, and `AI_CONFIG.md`
- Imports PDF, Word, Markdown, and TXT files
- Extracts document text into local `texts` folders
- Generates local text chunks and Ollama embeddings
- Runs local vector search and citation-backed Q&A
- Imports and exports knowledge-base backup archives
- Runs knowledge-base health checks for files, parsing, and indexes
- Lets each knowledge base define answer rules in `AI_CONFIG.md`
- Connects to Ollama local models
- Connects to OpenAI-compatible network APIs
- Saves network API keys locally with Electron `safeStorage`
- Tests network model connections before saving profiles
- Includes presets for DeepSeek, OpenAI, OpenRouter, SiliconFlow, and DashScope-compatible APIs
- Shows a first-run onboarding guide
- Stops long-running model generation
- Keeps user files and parsed text out of the source repository

## Why LocalMind

Many knowledge-base tools upload files to a remote service. LocalMind is designed around a different default:

> Keep documents, parsed text, and future retrieval indexes on the user's own computer.

When network APIs are used, the intended RAG flow is still local-first: retrieve only a few relevant chunks locally, then send those selected chunks to the model provider.

## Current Status

This is an early-stage desktop app. The current version already includes:

- Electron desktop shell
- React three-column interface
- Ollama status detection
- Ollama model listing
- Local model chat
- OpenAI-compatible network API chat
- Multiple saved network model profiles
- Network model connection tests
- Common network provider presets
- First-run onboarding guide
- Stop generation button
- Knowledge base creation
- Local file import
- PDF, DOCX, Markdown, and TXT text extraction
- Local text chunk generation
- Ollama embedding generation
- Local vector similarity search
- Citation-backed knowledge-base Q&A
- File deletion, re-parsing, and re-indexing
- Opening the local knowledge-base folder
- Knowledge-base backup import/export
- Knowledge-base health checks
- Per-knowledge-base answer rules
- Auto-maintained index and operation log
- macOS packaging configuration

## Screens

The app is organized around three working areas:

- Left: model source, model settings, and knowledge-base list
- Center: chat
- Right: imported files and future citations

## Model Sources

### Local Ollama

LocalMind reads models from the local Ollama server:

```text
http://127.0.0.1:11434
```

Recommended starter models:

- `qwen2.5:7b`
- `llama3.1:8b`
- `nomic-embed-text` for future embeddings

### Network APIs

LocalMind supports OpenAI-compatible chat completions.

Example DeepSeek settings:

```text
API base URL: https://api.deepseek.com
Model: deepseek-chat
```

Network model profiles can be saved and selected from a dropdown. The API key is encrypted locally with Electron `safeStorage`. It is not committed to the repository.

## Install

```bash
npm install
```

If Electron binary download fails in some regions:

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npx install-electron --no
```

## Run

```bash
npm run dev
```

## Verify

```bash
npm run typecheck
npm run build
```

## Package

Create a local macOS app bundle:

```bash
npm run pack
```

Create macOS release artifacts:

```bash
npm run dist:mac
```

## Data Storage

Local app data is stored outside the repository, under the system application data directory.

On macOS:

```text
~/Library/Application Support/LocalMind
```

This directory may contain:

- Knowledge-base folders
- Imported source files
- Parsed text files
- Text chunks and embedding vectors
- `AI_CONFIG.md` answer rules
- `index.md` knowledge-base summary
- `log.md` operation log
- Encrypted model settings
- Runtime logs

Do not commit this data.

Knowledge bases can be exported from the app as `.localmind.zip` backup archives and imported into another LocalMind environment.

## Knowledge Folder Structure

Each knowledge base maintains:

```text
raw/          Imported source files
notes/        Human or AI-assisted Markdown notes
assets/       Images and attachments
texts/        Parsed plain text
chunks/       Retrieval chunks
embeddings/   Local vector indexes
AI_CONFIG.md  Answer rules for this knowledge base
index.md      Knowledge-base summary
log.md        Operation log
```

The right-panel health check inspects missing files, failed parsing, missing indexes, likely duplicate files, and orphaned generated index files.

## Privacy Notes

- Local files stay on the user's machine.
- Parsed text stays on the user's machine.
- API keys are encrypted locally.
- Network model calls only send the current prompt and selected context.
- Future RAG retrieval should send only relevant chunks, not entire knowledge bases.

## Roadmap

LocalMind will move in three stages: make the app easier to use, improve retrieval quality, then evolve toward graph-aware knowledge bases.

### Near Term: Usability and Release Polish

- Improve macOS release packaging, app icon, and installation notes
- Add Windows packaging
- Add progress indicators for import, parsing, and indexing
- Add screenshots, short demos, and clearer onboarding docs

### Mid Term: Better Knowledge-Base Q&A

- Add hybrid retrieval: keyword search + vector search
- Add reranking to reduce false-positive matches
- Add folder batch import
- Add OCR for images and scanned PDFs
- Add support for more document formats
- Add compatibility tests for knowledge-base import/export

### Long Term: Graph-Aware Retrieval Inspired by codegraph

- Extract entities, topics, terms, and citation relationships from documents
- Build a lightweight local graph index for each knowledge base
- Query the graph before retrieving chunks to reduce token waste
- Add a knowledge graph view for files, topics, concepts, and chunks
- Support codebase knowledge bases with files, functions, dependencies, and docs
- Support graph-aware search for Markdown and Obsidian-style note vaults

This direction is inspired by [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph), while LocalMind will stay focused on an integrated desktop experience for non-technical users.

## Contributing

Contributions are welcome. Good starting areas:

- Model providers
- Document parsers
- RAG retrieval
- UI polish
- Packaging
- Tests

Please do not submit API keys, private documents, parsed knowledge-base text, or local app data.

## Acknowledgements

LocalMind is inspired by several open-source projects:

- [zxfccmm4/Obsidian-OpenCode-Knowledge](https://github.com/zxfccmm4/Obsidian-OpenCode-Knowledge): inspired the knowledge-folder structure, `AI_CONFIG.md` rule file, maintained index, operation log, and health-check ideas.
- [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph): inspired the “build a local index first, then reduce context reads” direction, which is especially relevant for future codebase, Markdown-note, and large-knowledge-base graph retrieval.

Thanks to these projects and their authors for sharing their work openly. LocalMind aims to stay local-first and friendly for non-technical users while learning from strong open-source ideas.

## License

MIT
