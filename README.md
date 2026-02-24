# 🎬 Workflow Video Analyzer

Analyse UI workflow videos using AI to generate executive summaries, step-by-step breakdowns, sequence diagrams, and rich JSONL context — all in the browser.

**Live:** [stephenjhayes.ie/video-analyzer](https://www.stephenjhayes.ie/video-analyzer/)

---

## Features

- **Multi-provider LLM support** — Google Gemini, OpenAI, and Anthropic Claude, selectable at runtime with in-browser API key entry (stored in session memory only, never persisted)
- **4 analysis modes:**
  - 📊 **Executive Summary** — High-level overview of what the workflow accomplishes
  - 🪜 **Workflow Steps** — Timestamped step-by-step breakdown with clickable timecodes
  - 🗂️ **Diagram** — Mermaid sequence diagram + PlantUML activity diagram rendered inline, with copy/download exports (`.mmd`, `.puml`, `.txt`, `.md`)
  - 📦 **JSONL Context** — Structured per-moment context cards with screen state, user actions, UI elements, and metadata; exportable as `.jsonl`, `.json`, `.md`, `.txt`
- **Video frame extraction** — For OpenAI and Anthropic, frames are extracted from the video locally in-browser via canvas and sent as images (no upload to third-party servers other than the chosen LLM API)
- **Native Gemini video** — For Gemini, the video is uploaded directly via the Files API for richer analysis

---

## Running Locally

**Prerequisites:** Node.js 20+

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), select your LLM provider, paste your API key, and drag a video file onto the player.

No `.env` file needed — API keys are entered in the UI and stored in session storage only.

---

## Building

```bash
npm run build
```

To build for a subdirectory deployment (e.g. `/video-analyzer/`):

```bash
VITE_BASE_PATH=/video-analyzer/ npm run build
```

---

## Deployment

This repo deploys automatically via GitHub Actions on push to `main`:

- **Production** → `https://www.stephenjhayes.ie/video-analyzer/` (FTP to Maxer hosting)
- **Preview** → `https://www.stephenjhayes.ie/video-analyzer-dev/` (on push to `dev` branch or PR to `main`)

Required GitHub secrets: `FTP_USERNAME`, `FTP_PASSWORD`

---

## Tech Stack

- [React 19](https://react.dev/) + TypeScript
- [Vite 6](https://vitejs.dev/)
- [Mermaid](https://mermaid.js.org/) — sequence diagram rendering
- [PlantUML](https://plantuml.com/) — activity diagram rendering via plantuml.com server (deflate-encoded URLs)
- [Google Gemini API](https://ai.google.dev/) / [OpenAI API](https://platform.openai.com/) / [Anthropic API](https://www.anthropic.com/)
- [D3](https://d3js.org/) — chart utilities
