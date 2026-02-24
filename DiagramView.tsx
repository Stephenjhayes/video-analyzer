/* tslint:disable */
// DiagramView - Renders Mermaid sequence diagrams and PlantUML activity diagrams
// with copy-to-clipboard and download functionality

import { useEffect, useRef, useState } from 'react';

interface DiagramData {
  mermaid: string;
  plantuml: string;
  summary?: string;
}

interface DiagramViewProps {
  data: DiagramData;
}

// ─── Copy / Download helpers ──────────────────────────────────────────────────

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function downloadFile(content: string, filename: string, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PlantUML encoding ────────────────────────────────────────────────────────
// PlantUML server requires: deflate(utf8(source)) → custom base64 alphabet
// We use the browser's CompressionStream API for deflate-raw.

const PLANTUML_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';

function encodePlantUMLBase64(data: Uint8Array): string {
  let result = '';
  for (let i = 0; i < data.length; i += 3) {
    const b0 = data[i];
    const b1 = i + 1 < data.length ? data[i + 1] : 0;
    const b2 = i + 2 < data.length ? data[i + 2] : 0;
    result += PLANTUML_ALPHABET[(b0 >> 2) & 0x3f];
    result += PLANTUML_ALPHABET[((b0 & 0x3) << 4) | ((b1 >> 4) & 0xf)];
    result += PLANTUML_ALPHABET[((b1 & 0xf) << 2) | ((b2 >> 6) & 0x3)];
    result += PLANTUML_ALPHABET[b2 & 0x3f];
  }
  return result;
}

async function getPlantUMLSvgUrl(source: string): Promise<string> {
  try {
    const utf8 = new TextEncoder().encode(source);

    // Use CompressionStream (deflate-raw) — supported in all modern browsers
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(utf8);
    writer.close();

    const compressedChunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      compressedChunks.push(value);
    }

    const totalLength = compressedChunks.reduce((sum, c) => sum + c.length, 0);
    const compressed = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of compressedChunks) {
      compressed.set(chunk, offset);
      offset += chunk.length;
    }

    const encoded = encodePlantUMLBase64(compressed);
    return `https://www.plantuml.com/plantuml/svg/${encoded}`;
  } catch {
    // Fallback: ~h hex encoding (may fail for very long diagrams)
    const utf8Bytes = new TextEncoder().encode(source);
    const hex = Array.from(utf8Bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `https://www.plantuml.com/plantuml/svg/~h${hex}`;
  }
}

// ─── Copy button component ────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button className="exportBtn" onClick={handleCopy}>
      <span className="icon">{copied ? 'check' : 'content_copy'}</span>
      {copied ? 'Copied!' : label}
    </button>
  );
}

// ─── Mermaid panel ────────────────────────────────────────────────────────────

let mermaidInitialized = false;

function MermaidPanel({ code }: { code: string }) {
  // renderHost is a non-React-managed div we insert Mermaid SVG into.
  // We keep a ref to the wrapper React owns, and manually append/remove
  // the host element — this avoids React's reconciler touching innerHTML.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!wrapperRef.current || !code) return;

    setRenderError(null);
    setRendered(false);

    // Create a fresh host div outside React's management
    const host = document.createElement('div');
    host.style.cssText = 'width:100%;overflow:auto;';
    hostRef.current = host;
    wrapperRef.current.appendChild(host);

    let cancelled = false;

    const render = async () => {
      try {
        const mermaid = (await import('mermaid')).default;

        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
            securityLevel: 'loose',
          });
          mermaidInitialized = true;
        }

        const tempId = `mermaid-render-${Date.now()}`;
        const { svg } = await mermaid.render(tempId, code);

        // Clean up any elements Mermaid may have left in <body>
        document.getElementById(tempId)?.remove();
        document.getElementById(`d${tempId}`)?.remove();

        if (!cancelled && hostRef.current) {
          hostRef.current.innerHTML = svg;
          const svgEl = hostRef.current.querySelector('svg');
          if (svgEl) {
            svgEl.removeAttribute('height');
            svgEl.style.maxWidth = '100%';
            svgEl.style.height = 'auto';
          }
          setRendered(true);
        }
      } catch (err: any) {
        if (!cancelled) {
          setRenderError(err?.message || 'Failed to render diagram');
          hostRef.current?.remove();
        }
      }
    };

    render();

    return () => {
      cancelled = true;
      // Detach the host element so React doesn't try to manage it
      hostRef.current?.remove();
      hostRef.current = null;
    };
  }, [code]);

  return (
    <div className="diagramPanel">
      <div className="diagramPanelHeader">
        <h3>Mermaid Sequence Diagram</h3>
        <div className="exportActions">
          <CopyButton text={code} label="Copy Mermaid" />
          <button
            className="exportBtn"
            onClick={() => downloadFile(code, 'workflow-diagram.mmd')}>
            <span className="icon">download</span>
            .mmd
          </button>
          <button
            className="exportBtn"
            onClick={() => downloadFile(code, 'workflow-diagram.txt')}>
            <span className="icon">download</span>
            .txt
          </button>
        </div>
      </div>

      {renderError ? (
        <div className="diagramError">
          <p>⚠️ Render error: {renderError}</p>
          <pre className="diagramCode">{code}</pre>
        </div>
      ) : (
        <>
          {/* wrapperRef is owned by React but we imperatively manage its child */}
          <div className="diagramRender">
            {!rendered && <div className="loading">Rendering diagram<span>...</span></div>}
            <div ref={wrapperRef} />
          </div>
          <details className="diagramSource">
            <summary>View source</summary>
            <pre className="diagramCode">{code}</pre>
          </details>
        </>
      )}
    </div>
  );
}

// ─── PlantUML panel ───────────────────────────────────────────────────────────

function PlantUMLPanel({ code }: { code: string }) {
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);

  useEffect(() => {
    setImgError(false);
    setImgLoading(true);
    setSvgUrl(null);
    getPlantUMLSvgUrl(code).then(setSvgUrl);
  }, [code]);

  return (
    <div className="diagramPanel">
      <div className="diagramPanelHeader">
        <h3>PlantUML Activity Diagram</h3>
        <div className="exportActions">
          <CopyButton text={code} label="Copy PlantUML" />
          <button
            className="exportBtn"
            onClick={() => downloadFile(code, 'workflow-diagram.puml')}>
            <span className="icon">download</span>
            .puml
          </button>
          <button
            className="exportBtn"
            onClick={() => downloadFile(code, 'workflow-diagram-plantuml.txt')}>
            <span className="icon">download</span>
            .txt
          </button>
        </div>
      </div>

      {imgError ? (
        <div className="diagramError">
          <p>⚠️ Could not render via plantuml.com server. View source below.</p>
          <pre className="diagramCode">{code}</pre>
        </div>
      ) : (
        <>
          <div className="diagramRender plantumlRender">
            {(!svgUrl || imgLoading) && <div className="loading">Loading diagram<span>...</span></div>}
            {svgUrl && (
              <img
                src={svgUrl}
                alt="PlantUML workflow diagram"
                style={{ display: imgLoading ? 'none' : 'block' }}
                onLoad={() => setImgLoading(false)}
                onError={() => { setImgError(true); setImgLoading(false); }}
              />
            )}
          </div>
          <details className="diagramSource">
            <summary>View source</summary>
            <pre className="diagramCode">{code}</pre>
          </details>
        </>
      )}
    </div>
  );
}

// ─── Main DiagramView component ───────────────────────────────────────────────

export default function DiagramView({ data }: DiagramViewProps) {
  const { mermaid, plantuml, summary } = data;

  const handleDownloadBoth = () => {
    const combined = `# Workflow Diagrams\n\n## Mermaid Sequence Diagram\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n\n## PlantUML Activity Diagram\n\`\`\`plantuml\n${plantuml}\n\`\`\`\n`;
    downloadFile(combined, 'workflow-diagrams.md', 'text/markdown');
  };

  return (
    <div className="diagramView">
      {summary && (
        <div className="diagramSummary">
          <p>{summary}</p>
        </div>
      )}

      <div className="diagramExportAll">
        <CopyButton
          text={`Mermaid:\n${mermaid}\n\nPlantUML:\n${plantuml}`}
          label="Copy both"
        />
        <button className="exportBtn" onClick={handleDownloadBoth}>
          <span className="icon">download</span>
          Download both (.md)
        </button>
      </div>

      <MermaidPanel code={mermaid} />
      <PlantUMLPanel code={plantuml} />
    </div>
  );
}
