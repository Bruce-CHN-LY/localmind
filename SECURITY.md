# Security Policy

## Sensitive Data

LocalMind can handle private documents and model API keys. Please do not publish:

- API keys
- Private documents
- Parsed knowledge-base text
- Local application data
- Runtime logs that contain private prompts or paths

## API Keys

Network API keys are encrypted locally with Electron `safeStorage`.

If a key is accidentally exposed, revoke or rotate it immediately with the provider.

## Reporting Issues

For security issues, open a private report if GitHub security advisories are enabled for the repository. Otherwise, contact the repository owner directly.
