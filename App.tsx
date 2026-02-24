/* tslint:disable */
// Video Analyzer - Main App Component
// Multi-provider workflow video analysis tool

import c from 'classnames';
import { useRef, useState } from 'react';
import {
  extractFrames,
  generateContent,
  Provider,
  ProviderConfig,
  uploadFileToGemini,
  UploadedFile,
} from './api';
import DiagramView from './DiagramView.jsx';
import functions from './functions';
import JSONLView from './JSONLView.jsx';
import modes from './modes';
import { timeToSecs } from './utils';
import VideoPlayer from './VideoPlayer.jsx';

// ─── Provider configuration ───────────────────────────────────────────────────

const PROVIDERS: { id: Provider; label: string; defaultModel: string; models: string[] }[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: [
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4.1-nano',
      'gpt-4o',
      'gpt-4o-mini',
      'o4-mini',
      'o3',
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-opus-4-6',
    models: [
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-haiku-4-5',
      'claude-opus-4-5',
      'claude-sonnet-4-5',
    ],
  },
];

// ─── Session storage helpers ──────────────────────────────────────────────────

const STORAGE_KEY = 'va_provider_config';

function loadStoredConfig(): Partial<Record<Provider, { apiKey: string; model: string }>> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveStoredConfig(config: Partial<Record<Provider, { apiKey: string; model: string }>>) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

// ─── Provider Setup Panel ─────────────────────────────────────────────────────

function ProviderSetup({ onReady }: { onReady: (config: ProviderConfig) => void }) {
  const stored = loadStoredConfig();
  const [provider, setProvider] = useState<Provider>('gemini');
  const [model, setModel] = useState(PROVIDERS[0].defaultModel);
  const [apiKey, setApiKey] = useState(stored['gemini']?.apiKey || '');
  const [showKey, setShowKey] = useState(false);

  const providerInfo = PROVIDERS.find((p) => p.id === provider)!;

  const handleProviderChange = (p: Provider) => {
    setProvider(p);
    const info = PROVIDERS.find((x) => x.id === p)!;
    setModel(stored[p]?.model || info.defaultModel);
    setApiKey(stored[p]?.apiKey || '');
  };

  const handleSubmit = () => {
    if (!apiKey.trim()) return;
    const cfg: ProviderConfig = { provider, apiKey: apiKey.trim(), model };
    saveStoredConfig({ ...stored, [provider]: { apiKey: apiKey.trim(), model } });
    onReady(cfg);
  };

  return (
    <div className="providerSetup">
      <div className="providerSetupInner">
        <h1 className="providerTitle">🎬 Workflow Video Analyzer</h1>
        <p className="providerSubtitle">
          Analyse UI workflow videos to generate executive summaries, step-by-step breakdowns,
          sequence diagrams, and rich JSONL context.
        </p>

        <div className="providerForm">
          <div className="providerFormGroup">
            <label>LLM Provider</label>
            <div className="providerTabs">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  className={c('providerTab', { active: provider === p.id })}
                  onClick={() => handleProviderChange(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="providerFormGroup">
            <label>Model</label>
            <div className="modelSelector">
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {providerInfo.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="providerFormGroup">
            <label>API Key</label>
            <div className="apiKeyInput">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder={`Paste your ${providerInfo.label} API key...`}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                autoComplete="off"
                spellCheck={false}
              />
              <button className="apiKeyToggle" onClick={() => setShowKey(!showKey)} type="button">
                <span className="icon">{showKey ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
            <p className="apiKeyNote">
              Keys are stored in session memory only and sent directly to the {providerInfo.label} API.
              {provider !== 'gemini' && ' Frames are extracted locally from your video and sent as images.'}
            </p>
          </div>

          <button
            className="button generateButton providerStartBtn"
            onClick={handleSubmit}
            disabled={!apiKey.trim()}>
            Start Analysing →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(null);
  const [vidUrl, setVidUrl] = useState<string | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [timecodeList, setTimecodeList] = useState<any[] | null>(null);
  const [diagramData, setDiagramData] = useState<{ mermaid: string; plantuml: string; summary?: string } | null>(null);
  const [jsonlData, setJsonlData] = useState<{ contexts: any[]; metadata?: any } | null>(null);
  const [requestedTimecode, setRequestedTimecode] = useState<number | null>(null);
  const [selectedMode, setSelectedMode] = useState(Object.keys(modes)[0]);
  const [activeMode, setActiveMode] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [theme] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  const scrollRef = useRef<HTMLElement | null>(null);

  // ─── Response handlers ──────────────────────────────────────────────────────

  const setTimecodes = ({ timecodes }: { timecodes: any[] }) =>
    setTimecodeList(timecodes.map((t) => ({ ...t, text: t.text?.replaceAll("\\'", "'") })));

  const setWorkflowDiagrams = ({ mermaid, plantuml, summary }: any) =>
    setDiagramData({ mermaid, plantuml, summary });

  const setJsonlContext = ({ contexts, metadata }: any) =>
    setJsonlData({ contexts, metadata });

  // ─── Video upload ───────────────────────────────────────────────────────────

  const uploadVideo = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!providerConfig) return;

    const videoFile = e.dataTransfer.files[0];
    if (!videoFile) return;

    setIsLoadingVideo(true);
    setVideoError(false);
    setTimecodeList(null);
    setDiagramData(null);
    setJsonlData(null);

    const objectUrl = URL.createObjectURL(videoFile);
    setVidUrl(objectUrl);

    try {
      if (providerConfig.provider === 'gemini') {
        const res = await uploadFileToGemini(videoFile, providerConfig.apiKey);
        setFile(res);
      } else {
        // For non-Gemini: store reference; frames extracted on first analyse
        setFile({ uri: objectUrl, mimeType: videoFile.type, frames: [] });
      }
      setIsLoadingVideo(false);
    } catch (err) {
      console.error('Upload error:', err);
      setVideoError(true);
      setIsLoadingVideo(false);
    }
  };

  // ─── Mode execution ─────────────────────────────────────────────────────────

  const onModeSelect = async (mode: string) => {
    if (!file || !providerConfig) return;

    setActiveMode(mode);
    setIsLoading(true);
    setTimecodeList(null);
    setDiagramData(null);
    setJsonlData(null);

    try {
      let uploadedFile = file;

      // Extract frames for non-Gemini providers
      if (providerConfig.provider !== 'gemini' && videoElement) {
        if (!file.frames || file.frames.length === 0) {
          setIsExtractingFrames(true);
          const frames = await extractFrames(videoElement, 30);
          setIsExtractingFrames(false);
          uploadedFile = { ...file, frames };
          setFile(uploadedFile);
        }
      }

      const modeConfig = (modes as any)[mode];
      const prompt = typeof modeConfig.prompt === 'string'
        ? modeConfig.prompt
        : modeConfig.prompt('');

      const fnMap: Record<string, (args: any) => void> = {
        set_timecodes: setTimecodes,
        set_timecodes_with_objects: setTimecodes,
        set_timecodes_with_numeric_values: ({ timecodes }: any) => setTimecodeList(timecodes),
        set_workflow_diagrams: setWorkflowDiagrams,
        set_jsonl_context: setJsonlContext,
      };

      const resp = await generateContent(prompt, functions(fnMap), uploadedFile, providerConfig);

      const call = (resp as any).functionCalls?.[0];
      if (call && fnMap[call.name]) {
        fnMap[call.name](call.args);
      }
    } catch (err: any) {
      console.error('Generate error:', err);
      alert(`Analysis error: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      setIsExtractingFrames(false);
      scrollRef.current?.scrollTo({ top: 0 });
    }
  };

  // ─── Provider setup screen ──────────────────────────────────────────────────

  if (!providerConfig) {
    return (
      <div className={theme}>
        <ProviderSetup onReady={setProviderConfig} />
      </div>
    );
  }

  const currentMode = (modes as any)[selectedMode];
  const providerLabel = PROVIDERS.find((p) => p.id === providerConfig.provider)?.label || '';

  return (
    <main
      className={theme}
      onDrop={uploadVideo}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={() => {}}
      onDragLeave={() => {}}>

      {/* Top: sidebar + video player */}
      <section className="top">
        {vidUrl && !isLoadingVideo && (
          <>
            <div className={c('modeSelector', { hide: !showSidebar })}>
              <div>
                {/* Active provider chip */}
                <div className="activeProv">
                  <span className="activeProvLabel">
                    {providerLabel} · {providerConfig.model || PROVIDERS.find((p) => p.id === providerConfig.provider)?.defaultModel}
                  </span>
                  <button className="changeProvBtn" onClick={() => setProviderConfig(null)}>
                    Change
                  </button>
                </div>

                <h2>Analyse video via:</h2>
                <div className="modeList">
                  {Object.entries(modes).map(([mode, modeData]: [string, any]) => (
                    <button
                      key={mode}
                      className={c('button', { active: mode === selectedMode })}
                      onClick={() => setSelectedMode(mode)}>
                      <span className="emoji">{modeData.emoji}</span>
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <button
                  className="button generateButton"
                  onClick={() => onModeSelect(selectedMode)}
                  disabled={isLoading}>
                  {isLoading ? '⏳ Analysing...' : '▶️ Analyse'}
                </button>
              </div>
            </div>

            <button
              className="collapseButton"
              onClick={() => setShowSidebar(!showSidebar)}>
              <span className="icon">
                {showSidebar ? 'chevron_left' : 'chevron_right'}
              </span>
            </button>
          </>
        )}

        <VideoPlayer
          url={vidUrl}
          requestedTimecode={requestedTimecode}
          timecodeList={timecodeList}
          jumpToTimecode={setRequestedTimecode}
          isLoadingVideo={isLoadingVideo}
          videoError={videoError}
          onVideoReady={setVideoElement}
        />
      </section>

      {/* Output: diagrams below video pane for diagram mode, inline otherwise */}
      <div className={c('tools', { inactive: !vidUrl })}>
        <section
          className={c('output', { ['mode' + activeMode]: activeMode })}
          ref={scrollRef as any}>
          {isLoading ? (
            <div className="loading">
              {isExtractingFrames
                ? <>Extracting video frames<span>...</span></>
                : <>Waiting for {providerLabel}<span>...</span></>}
            </div>
          ) : diagramData ? (
            <DiagramView data={diagramData} />
          ) : jsonlData ? (
            <JSONLView data={jsonlData} />
          ) : timecodeList ? (
            currentMode?.isList ? (
              <ul>
                {timecodeList.map(({ time, text }, i) => (
                  <li key={i} className="outputItem">
                    <button onClick={() => setRequestedTimecode(timeToSecs(time))}>
                      <time>{time}</time>
                      <p className="text">{text}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              timecodeList.map(({ time, text }, i) => (
                <span key={i}>
                  <span
                    className="sentence"
                    role="button"
                    onClick={() => setRequestedTimecode(timeToSecs(time))}>
                    <time>{time}</time>
                    <span>{text}</span>
                  </span>{' '}
                </span>
              ))
            )
          ) : null}
        </section>
      </div>
    </main>
  );
}
