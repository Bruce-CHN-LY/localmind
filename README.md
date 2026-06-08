# LocalMind

[中文介绍](./README.zh-CN.md)

LocalMind is a local-first desktop knowledge assistant for building a private AI knowledge base from your own documents.

It supports local Ollama models and OpenAI-compatible network APIs, so users can choose between privacy-first local inference and lower-memory cloud inference.

## What It Does

- Creates multiple local knowledge bases
- Creates a dedicated folder for each knowledge base
- Imports PDF, Word, Markdown, and TXT files
- Extracts document text into local `texts` folders
- Generates local text chunks and Ollama embeddings
- Runs local vector search and citation-backed Q&A
- Imports and exports knowledge-base backup archives
- Connects to Ollama local models
- Connects to OpenAI-compatible network APIs
- Saves network API keys locally with Electron `safeStorage`
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
- Encrypted model settings
- Runtime logs

Do not commit this data.

Knowledge bases can be exported from the app as `.localmind.zip` backup archives and imported into another LocalMind environment.

## Privacy Notes

- Local files stay on the user's machine.
- Parsed text stays on the user's machine.
- API keys are encrypted locally.
- Network model calls only send the current prompt and selected context.
- Future RAG retrieval should send only relevant chunks, not entire knowledge bases.

## Roadmap

- Add import/export for knowledge bases
- Add more model providers
- Add Windows packaging
- Add tests for parsers and model adapters

## Contributing

Contributions are welcome. Good starting areas:

- Model providers
- Document parsers
- RAG retrieval
- UI polish
- Packaging
- Tests

Please do not submit API keys, private documents, parsed knowledge-base text, or local app data.

## License

MIT
