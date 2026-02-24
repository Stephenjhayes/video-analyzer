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

// ─── PlantUML server rendering ────────────────────────────────────────────────

function getPlantUMLSvgUrl(source: string): string {
  // PlantUML server accepts ~h + hex-encoded UTF-8 bytes
  // This is the simplest reliable approach without external libraries
  const utf8Bytes = new TextEncoder().encode(source);
  const hex = Array.from(utf8Bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `https://www.plantuml.com/plantuml/svg/~h${hex}`;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !code) return;

    setRenderError(null);
    setRendered(false);

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

        // Use a hidden off-screen element as render target to avoid DOM issues
        const tempId = `mermaid-render-${Date.now()}`;
        const { svg } = await mermaid.render(tempId, code);

        // Clean up any orphaned elements mermaid may have left in <body>
        document.getElementById(tempId)?.remove();
        document.getElementById(`d${tempId}`)?.remove();

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          // Make SVG responsive
          const svgEl = containerRef.current.querySelector('svg');
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
        }
      }
    };

    render();

    return () => { cancelled = true; };
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
          <div className="diagramRender" ref={containerRef}>
            {!rendered && <div className="loading">Rendering diagram<span>...</span></div>}
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
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);

  // Use plantuml.com server for rendering
  const svgUrl = getPlantUMLSvgUrl(code);

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
            {imgLoading && <div className="loading">Loading diagram<span>...</span></div>}
            <img
              src={svgUrl}
              alt="PlantUML workflow diagram"
              style={{ display: imgLoading ? 'none' : 'block' }}
              onLoad={() => setImgLoading(false)}
              onError={() => { setImgError(true); setImgLoading(false); }}
            />
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
