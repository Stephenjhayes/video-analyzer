/* tslint:disable */
// JSONLView - Renders structured JSONL context from workflow video analysis
// with copy-to-clipboard and download functionality

import { useState } from 'react';

interface UIElement {
  type?: string;
  label?: string;
  value?: string;
  state?: string;
}

interface ContextEntry {
  timecode: string;
  screen?: {
    application?: string;
    module?: string;
    view?: string;
  };
  user?: {
    persona?: string;
    action?: string;
  };
  workflow?: {
    phase?: string;
    step?: string;
    businessContext?: string;
  };
  uiElements?: UIElement[];
  data?: {
    visible?: string[];
    entered?: string[];
  };
  systemResponse?: string;
  notes?: string;
}

interface JSONLMetadata {
  totalSteps?: number;
  applications?: string[];
  workflowName?: string;
  estimatedDuration?: string;
  complexityScore?: number;
}

interface JSONLData {
  contexts: ContextEntry[];
  metadata?: JSONLMetadata;
}

interface JSONLViewProps {
  data: JSONLData;
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

// ─── Format helpers ───────────────────────────────────────────────────────────

function toJSONL(contexts: ContextEntry[]): string {
  return contexts.map((c) => JSON.stringify(c)).join('\n');
}

function toJSON(data: JSONLData): string {
  return JSON.stringify(data, null, 2);
}

function toMarkdown(data: JSONLData): string {
  const lines: string[] = [];

  if (data.metadata?.workflowName) {
    lines.push(`# Workflow: ${data.metadata.workflowName}\n`);
  }

  if (data.metadata) {
    const m = data.metadata;
    lines.push('## Overview\n');
    if (m.applications?.length) lines.push(`**Applications:** ${m.applications.join(', ')}`);
    if (m.totalSteps) lines.push(`**Total Steps:** ${m.totalSteps}`);
    if (m.estimatedDuration) lines.push(`**Duration:** ${m.estimatedDuration}`);
    if (m.complexityScore) lines.push(`**Complexity:** ${m.complexityScore}/10`);
    lines.push('');
  }

  lines.push('## Workflow Context\n');

  data.contexts.forEach((ctx, i) => {
    lines.push(`### Step ${i + 1} [${ctx.timecode}]`);

    if (ctx.screen?.application) {
      lines.push(`**Screen:** ${ctx.screen.application}${ctx.screen.module ? ` › ${ctx.screen.module}` : ''}${ctx.screen.view ? ` › ${ctx.screen.view}` : ''}`);
    }
    if (ctx.user?.persona) lines.push(`**User:** ${ctx.user.persona}`);
    if (ctx.user?.action) lines.push(`**Action:** ${ctx.user.action}`);
    if (ctx.workflow?.phase) lines.push(`**Phase:** ${ctx.workflow.phase}`);
    if (ctx.workflow?.step) lines.push(`**Step:** ${ctx.workflow.step}`);
    if (ctx.workflow?.businessContext) lines.push(`**Context:** ${ctx.workflow.businessContext}`);

    if (ctx.uiElements?.length) {
      lines.push('\n**UI Elements:**');
      ctx.uiElements.forEach((el) => {
        lines.push(`- ${el.type || 'element'}${el.label ? `: ${el.label}` : ''}${el.value ? ` = "${el.value}"` : ''}${el.state ? ` (${el.state})` : ''}`);
      });
    }

    if (ctx.data?.visible?.length) {
      lines.push(`\n**Visible data:** ${ctx.data.visible.join(', ')}`);
    }
    if (ctx.data?.entered?.length) {
      lines.push(`**Entered data:** ${ctx.data.entered.join(', ')}`);
    }
    if (ctx.systemResponse) lines.push(`**System response:** ${ctx.systemResponse}`);
    if (ctx.notes) lines.push(`**Notes:** ${ctx.notes}`);

    lines.push('');
  });

  return lines.join('\n');
}

// ─── Context entry card ───────────────────────────────────────────────────────

function ContextCard({ entry, index }: { entry: ContextEntry; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="jsonlCard">
      <button
        className="jsonlCardHeader"
        onClick={() => setExpanded(!expanded)}>
        <span className="jsonlTimecode">{entry.timecode}</span>
        <span className="jsonlStep">
          {entry.workflow?.phase && <span className="jsonlBadge phase">{entry.workflow.phase}</span>}
          {entry.screen?.application && <span className="jsonlBadge app">{entry.screen.application}</span>}
          <span className="jsonlStepText">{entry.workflow?.step || entry.user?.action || `Step ${index + 1}`}</span>
        </span>
        <span className="icon">{expanded ? 'expand_less' : 'expand_more'}</span>
      </button>

      {expanded && (
        <div className="jsonlCardBody">
          {entry.screen && (
            <div className="jsonlSection">
              <h4>Screen</h4>
              <dl>
                {entry.screen.application && <><dt>Application</dt><dd>{entry.screen.application}</dd></>}
                {entry.screen.module && <><dt>Module</dt><dd>{entry.screen.module}</dd></>}
                {entry.screen.view && <><dt>View</dt><dd>{entry.screen.view}</dd></>}
              </dl>
            </div>
          )}

          {entry.user && (
            <div className="jsonlSection">
              <h4>User</h4>
              <dl>
                {entry.user.persona && <><dt>Persona</dt><dd>{entry.user.persona}</dd></>}
                {entry.user.action && <><dt>Action</dt><dd>{entry.user.action}</dd></>}
              </dl>
            </div>
          )}

          {entry.workflow && (
            <div className="jsonlSection">
              <h4>Workflow</h4>
              <dl>
                {entry.workflow.phase && <><dt>Phase</dt><dd>{entry.workflow.phase}</dd></>}
                {entry.workflow.step && <><dt>Step</dt><dd>{entry.workflow.step}</dd></>}
                {entry.workflow.businessContext && <><dt>Context</dt><dd>{entry.workflow.businessContext}</dd></>}
              </dl>
            </div>
          )}

          {entry.uiElements && entry.uiElements.length > 0 && (
            <div className="jsonlSection">
              <h4>UI Elements ({entry.uiElements.length})</h4>
              <div className="jsonlUiElements">
                {entry.uiElements.map((el, i) => (
                  <div key={i} className="jsonlUiElement">
                    <span className="jsonlBadge">{el.type}</span>
                    {el.label && <strong>{el.label}</strong>}
                    {el.value && <span className="jsonlValue">= "{el.value}"</span>}
                    {el.state && <span className="jsonlState">({el.state})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(entry.data?.visible?.length || entry.data?.entered?.length) && (
            <div className="jsonlSection">
              <h4>Data</h4>
              {entry.data?.visible?.length && (
                <div><span className="jsonlLabel">Visible:</span> {entry.data.visible.join(', ')}</div>
              )}
              {entry.data?.entered?.length && (
                <div><span className="jsonlLabel">Entered:</span> {entry.data.entered.join(', ')}</div>
              )}
            </div>
          )}

          {entry.systemResponse && (
            <div className="jsonlSection">
              <h4>System Response</h4>
              <p>{entry.systemResponse}</p>
            </div>
          )}

          {entry.notes && (
            <div className="jsonlSection jsonlNotes">
              <h4>Notes</h4>
              <p>{entry.notes}</p>
            </div>
          )}

          <div className="jsonlRaw">
            <details>
              <summary>Raw JSON</summary>
              <pre>{JSON.stringify(entry, null, 2)}</pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main JSONLView component ─────────────────────────────────────────────────

export default function JSONLView({ data }: JSONLViewProps) {
  const { contexts, metadata } = data;

  const jsonlText = toJSONL(contexts);
  const jsonText = toJSON(data);
  const mdText = toMarkdown(data);

  return (
    <div className="jsonlView">
      {/* Metadata summary */}
      {metadata && (
        <div className="jsonlMetadata">
          {metadata.workflowName && <h2>{metadata.workflowName}</h2>}
          <div className="jsonlMetaGrid">
            {metadata.applications?.length && (
              <div className="jsonlMetaItem">
                <span className="jsonlLabel">Applications</span>
                <span>{metadata.applications.join(', ')}</span>
              </div>
            )}
            {metadata.totalSteps && (
              <div className="jsonlMetaItem">
                <span className="jsonlLabel">Steps</span>
                <span>{metadata.totalSteps}</span>
              </div>
            )}
            {metadata.estimatedDuration && (
              <div className="jsonlMetaItem">
                <span className="jsonlLabel">Duration</span>
                <span>{metadata.estimatedDuration}</span>
              </div>
            )}
            {metadata.complexityScore && (
              <div className="jsonlMetaItem">
                <span className="jsonlLabel">Complexity</span>
                <span>{metadata.complexityScore}/10</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Export actions */}
      <div className="jsonlExportBar">
        <span className="jsonlCount">{contexts.length} context entries</span>
        <div className="exportActions">
          <CopyButton text={jsonlText} label="Copy JSONL" />
          <CopyButton text={jsonText} label="Copy JSON" />
          <CopyButton text={mdText} label="Copy Markdown" />
          <button
            className="exportBtn"
            onClick={() => downloadFile(jsonlText, 'workflow-context.jsonl', 'application/x-ndjson')}>
            <span className="icon">download</span>
            .jsonl
          </button>
          <button
            className="exportBtn"
            onClick={() => downloadFile(jsonText, 'workflow-context.json', 'application/json')}>
            <span className="icon">download</span>
            .json
          </button>
          <button
            className="exportBtn"
            onClick={() => downloadFile(mdText, 'workflow-context.md', 'text/markdown')}>
            <span className="icon">download</span>
            .md
          </button>
          <button
            className="exportBtn"
            onClick={() => downloadFile(mdText, 'workflow-context.txt')}>
            <span className="icon">download</span>
            .txt
          </button>
        </div>
      </div>

      {/* Context cards */}
      <div className="jsonlCards">
        {contexts.map((entry, i) => (
          <ContextCard key={i} entry={entry} index={i} />
        ))}
      </div>
    </div>
  );
}
