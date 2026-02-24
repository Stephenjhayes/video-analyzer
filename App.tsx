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

// ─── Result cache types ───────────────────────────────────────────────────────

interface TimecodeResult { type: 'timecodes'; timecodes: any[] }
interface DiagramResult  { type: 'diagram';   mermaid: string; plantuml: string; summary?: string }
interface JsonlResult    { type: 'jsonl';     contexts: any[]; metadata?: any }
type ModeResult = TimecodeResult | DiagramResult | JsonlResult;

// Cache key: "provider:model:mode"
type ResultCache = Record<string, ModeResult>;

function cacheKey(config: ProviderConfig, mode: string): string {
  return `${config.provider}:${config.model ?? ''}:${mode}`;
}

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

  // Cache: all results across all modes & providers, keyed by "provider:model:mode"
  const [resultCache, setResultCache] = useState<ResultCache>({});

  const [requestedTimecode, setRequestedTimecode] = useState<number | null>(null);
  const [selectedMode, setSelectedMode] = useState(Object.keys(modes)[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [theme] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  const scrollRef = useRef<HTMLElement | null>(null);

  // ─── Cache helpers ───────────────────────────────────────────────────────────

  const getCached = (mode: string): ModeResult | null =>
    providerConfig ? (resultCache[cacheKey(providerConfig, mode)] ?? null) : null;

  const setCached = (mode: string, result: ModeResult) => {
    if (!providerConfig) return;
    setResultCache((prev) => ({ ...prev, [cacheKey(providerConfig, mode)]: result }));
  };

  const clearCacheForMode = (mode: string) => {
    if (!providerConfig) return;
    setResultCache((prev) => {
      const next = { ...prev };
      delete next[cacheKey(providerConfig, mode)];
      return next;
    });
  };

  // ─── Video upload ───────────────────────────────────────────────────────────

  const uploadVideo = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!providerConfig) return;

    const videoFile = e.dataTransfer.files[0];
    if (!videoFile) return;

    setIsLoadingVideo(true);
    setVideoError(false);
    // Clear all cached results when a new video is loaded
    setResultCache({});

    const objectUrl = URL.createObjectURL(videoFile);
    setVidUrl(objectUrl);

    try {
      if (providerConfig.provider === 'gemini') {
        const res = await uploadFileToGemini(videoFile, providerConfig.apiKey);
        setFile(res);
      } else {
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

  const runMode = async (mode: string, force = false) => {
    if (!file || !providerConfig) return;

    // If cached and not forcing a re-run, just switch to it
    if (!force && getCached(mode)) {
      setSelectedMode(mode);
      return;
    }

    setSelectedMode(mode);
    setIsLoading(true);

    try {
      let uploadedFile = file;

      // Extract frames for non-Gemini providers (cached on the file object after first run)
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

      let captured: ModeResult | null = null;

      const fnMap: Record<string, (args: any) => void> = {
        set_timecodes: ({ timecodes }: any) => {
          captured = { type: 'timecodes', timecodes: timecodes.map((t: any) => ({ ...t, text: t.text?.replaceAll("\\'", "'") })) };
        },
        set_timecodes_with_objects: ({ timecodes }: any) => {
          captured = { type: 'timecodes', timecodes: timecodes.map((t: any) => ({ ...t, text: t.text?.replaceAll("\\'", "'") })) };
        },
        set_timecodes_with_numeric_values: ({ timecodes }: any) => {
          captured = { type: 'timecodes', timecodes };
        },
        set_workflow_diagrams: ({ mermaid, plantuml, summary }: any) => {
          captured = { type: 'diagram', mermaid, plantuml, summary };
        },
        set_jsonl_context: ({ contexts, metadata }: any) => {
          captured = { type: 'jsonl', contexts, metadata };
        },
      };

      const resp = await generateContent(prompt, functions(fnMap), uploadedFile, providerConfig);
      const call = (resp as any).functionCalls?.[0];
      if (call && fnMap[call.name]) {
        fnMap[call.name](call.args);
      }

      if (captured) setCached(mode, captured);

    } catch (err: any) {
      console.error('Generate error:', err);
      alert(`Analysis error: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      setIsExtractingFrames(false);
      window.scrollTo({ top: 0 });
    }
  };

  // Clicking a mode button: show cached result instantly, or prompt to analyse
  const onModeClick = (mode: string) => {
    setSelectedMode(mode);
  };

  // ─── Provider change — clear uploaded Gemini file ref but keep frame cache ──

  const handleProviderChange = (config: ProviderConfig) => {
    setProviderConfig(config);
    // If switching away from Gemini, reset the file so frames get re-extracted
    // (Gemini URI is not valid for other providers and vice versa)
    if (file && vidUrl) {
      if (config.provider === 'gemini') {
        // Will need to re-upload to Gemini — clear so upload is triggered again
        setFile(null);
        setVidUrl(null);
        setResultCache({});
      } else {
        // Keep local frames if already extracted
        setFile((prev) => prev ? { uri: vidUrl, mimeType: prev.mimeType, frames: prev.frames } : null);
      }
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
  const activeResult = getCached(selectedMode);

  // Count how many modes have cached results for the current provider+model
  const cachedModes = new Set(
    Object.keys(resultCache)
      .filter((k) => k.startsWith(`${providerConfig.provider}:${providerConfig.model ?? ''}:`))
      .map((k) => k.split(':').slice(2).join(':'))
  );

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
                  {Object.entries(modes).map(([mode, modeData]: [string, any]) => {
                    const isCached = cachedModes.has(mode);
                    return (
                      <button
                        key={mode}
                        className={c('button', { active: mode === selectedMode, cached: isCached })}
                        onClick={() => onModeClick(mode)}>
                        <span className="emoji">{modeData.emoji}</span>
                        {mode}
                        {isCached && <span className="cachedDot" title="Result cached" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                {/* Show re-run button if cached, run button otherwise */}
                {activeResult && !isLoading ? (
                  <div className="analyseButtons">
                    <button
                      className="button generateButton"
                      onClick={() => runMode(selectedMode, true)}>
                      🔄 Re-run
                    </button>
                  </div>
                ) : (
                  <button
                    className="button generateButton"
                    onClick={() => runMode(selectedMode)}
                    disabled={isLoading}>
                    {isLoading ? '⏳ Analysing...' : '▶️ Analyse'}
                  </button>
                )}
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
          timecodeList={activeResult?.type === 'timecodes' ? activeResult.timecodes : null}
          jumpToTimecode={setRequestedTimecode}
          isLoadingVideo={isLoadingVideo}
          videoError={videoError}
          onVideoReady={setVideoElement}
        />
      </section>

      {/* Output panel */}
      <div className={c('tools', { inactive: !vidUrl })}>
        <section
          className={c('output', { ['mode' + selectedMode]: selectedMode })}
          ref={scrollRef as any}>

          {isLoading ? (
            <div className="loading">
              {isExtractingFrames
                ? <>Extracting video frames<span>...</span></>
                : <>Waiting for {providerLabel}<span>...</span></>}
            </div>

          ) : activeResult?.type === 'diagram' ? (
            <DiagramView data={activeResult} />

          ) : activeResult?.type === 'jsonl' ? (
            <JSONLView data={activeResult} />

          ) : activeResult?.type === 'timecodes' ? (
            currentMode?.isList ? (
              <ul>
                {activeResult.timecodes.map(({ time, text }, i) => (
                  <li key={i} className="outputItem">
                    <button onClick={() => setRequestedTimecode(timeToSecs(time))}>
                      <time>{time}</time>
                      <p className="text">{text}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              activeResult.timecodes.map(({ time, text }, i) => (
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

          ) : vidUrl ? (
            <div className="noResult">
              <p>Select a mode and click <strong>▶️ Analyse</strong> to get started.</p>
            </div>
          ) : null}

        </section>
      </div>
    </main>
  );
}
