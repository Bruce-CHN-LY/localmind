# Contributing to LocalMind

Thanks for helping improve LocalMind.

## Good First Areas

- Add a new OpenAI-compatible provider preset
- Improve document parsing
- Add tests for file import and parsing
- Improve UI states and error messages
- Add packaging workflows

## Local Setup

```bash
npm install
npm run dev
```

## Checks

Before opening a pull request:

```bash
npm run typecheck
npm run build
```

## Security

Do not commit:

- API keys
- `.env` files
- Imported knowledge-base files
- Parsed knowledge-base text
- Local application data

