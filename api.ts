/* tslint:disable */
// Video Analyzer - Multi-provider LLM API layer
// Supports: Google Gemini, OpenAI (GPT-4o), Anthropic (Claude)

import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Provider = 'gemini' | 'openai' | 'anthropic';

export interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  model?: string;
}

export interface UploadedFile {
  uri: string;
  mimeType: string;
  // For non-Gemini providers: base64 frames extracted client-side
  frames?: string[];
}

// ─── System instruction ───────────────────────────────────────────────────────

const systemInstruction = `You are an expert workflow and UI analyst. When given a video of a UI workflow application and a query,
call the relevant function only once with the appropriate timecodes and structured data for the video.
Focus on identifying user workflows, UI interactions, application screens, and business processes visible in the video.`;

// ─── Gemini provider ──────────────────────────────────────────────────────────

async function generateWithGemini(
  text: string,
  functionDeclarations: FunctionDeclaration[],
  file: UploadedFile,
  apiKey: string,
  model = 'gemini-2.5-flash',
) {
  const client = new GoogleGenAI({ apiKey });

  const response = await client.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { text },
          {
            fileData: {
              mimeType: file.mimeType,
              fileUri: file.uri,
            },
          },
        ],
      },
    ],
    config: {
      systemInstruction,
      temperature: 0.5,
      tools: [{ functionDeclarations }],
    },
  });

  return response;
}

// ─── OpenAI provider ──────────────────────────────────────────────────────────

async function generateWithOpenAI(
  text: string,
  functionDeclarations: FunctionDeclaration[],
  file: UploadedFile,
  apiKey: string,
  model = 'gpt-4o',
) {
  // Convert function declarations to OpenAI tools format
  const tools = functionDeclarations.map((fn) => ({
    type: 'function',
    function: {
      name: fn.name,
      description: fn.description,
      parameters: convertSchemaToOpenAI(fn.parameters),
    },
  }));

  // Build content with frames if available
  const userContent: object[] = [{ type: 'text', text }];

  if (file.frames && file.frames.length > 0) {
    // Sample up to 20 frames evenly
    const maxFrames = 20;
    const step = Math.max(1, Math.floor(file.frames.length / maxFrames));
    const sampledFrames = file.frames.filter((_, i) => i % step === 0).slice(0, maxFrames);

    sampledFrames.forEach((frame) => {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${frame}`, detail: 'high' },
      });
    });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userContent },
      ],
      tools,
      tool_choice: 'required',
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`OpenAI error: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

  if (toolCall) {
    return {
      functionCalls: [
        {
          name: toolCall.function.name,
          args: JSON.parse(toolCall.function.arguments),
        },
      ],
    };
  }

  return { functionCalls: [] };
}

// ─── Anthropic provider ───────────────────────────────────────────────────────

async function generateWithAnthropic(
  text: string,
  functionDeclarations: FunctionDeclaration[],
  file: UploadedFile,
  apiKey: string,
  model = 'claude-opus-4-5',
) {
  // Convert function declarations to Anthropic tools format
  const tools = functionDeclarations.map((fn) => ({
    name: fn.name,
    description: fn.description,
    input_schema: convertSchemaToOpenAI(fn.parameters), // Anthropic uses same JSON Schema format
  }));

  // Build content with frames if available
  const userContent: object[] = [];

  if (file.frames && file.frames.length > 0) {
    const maxFrames = 20;
    const step = Math.max(1, Math.floor(file.frames.length / maxFrames));
    const sampledFrames = file.frames.filter((_, i) => i % step === 0).slice(0, maxFrames);

    sampledFrames.forEach((frame) => {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: frame,
        },
      });
    });
  }

  userContent.push({ type: 'text', text });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8096,
      system: systemInstruction,
      messages: [{ role: 'user', content: userContent }],
      tools,
      tool_choice: { type: 'any' },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Anthropic error: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const toolUse = data.content?.find((c: { type: string }) => c.type === 'tool_use');

  if (toolUse) {
    return {
      functionCalls: [{ name: toolUse.name, args: toolUse.input }],
    };
  }

  return { functionCalls: [] };
}

// ─── Schema conversion helper ─────────────────────────────────────────────────

function convertSchemaToOpenAI(schema: any): any {
  if (!schema) return {};

  const result: any = {};

  if (schema.type) {
    result.type = schema.type.toLowerCase();
  }
  if (schema.description) result.description = schema.description;
  if (schema.required) result.required = schema.required;

  if (schema.properties) {
    result.properties = {};
    for (const [key, val] of Object.entries(schema.properties)) {
      result.properties[key] = convertSchemaToOpenAI(val);
    }
  }

  if (schema.items) {
    result.items = convertSchemaToOpenAI(schema.items);
  }

  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateContent(
  text: string,
  functionDeclarations: FunctionDeclaration[],
  file: UploadedFile,
  config: ProviderConfig,
) {
  switch (config.provider) {
    case 'openai':
      return generateWithOpenAI(text, functionDeclarations, file, config.apiKey, config.model);
    case 'anthropic':
      return generateWithAnthropic(text, functionDeclarations, file, config.apiKey, config.model);
    case 'gemini':
    default:
      return generateWithGemini(text, functionDeclarations, file, config.apiKey, config.model);
  }
}

// ─── Video upload (Gemini Files API) ─────────────────────────────────────────

export async function uploadFileToGemini(file: File, apiKey: string): Promise<UploadedFile> {
  const client = new GoogleGenAI({ apiKey });
  const blob = new Blob([file], { type: file.type });

  console.log('Uploading to Gemini Files API...');
  const uploadedFile = await client.files.upload({
    file: blob,
    config: { displayName: file.name },
  });

  let getFile = await client.files.get({ name: uploadedFile.name });
  while (getFile.state === 'PROCESSING') {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    getFile = await client.files.get({ name: uploadedFile.name });
    console.log(`File state: ${getFile.state}`);
  }

  if (getFile.state === 'FAILED') {
    throw new Error('File processing failed.');
  }

  console.log('Upload complete.');
  return { uri: getFile.uri!, mimeType: getFile.mimeType! };
}

// ─── Frame extraction (canvas, for non-Gemini providers) ─────────────────────

export async function extractFrames(
  videoElement: HTMLVideoElement,
  maxFrames = 30,
): Promise<string[]> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const frames: string[] = [];
    const duration = videoElement.duration;
    const interval = duration / maxFrames;
    let currentFrame = 0;

    canvas.width = 640;
    canvas.height = Math.round((videoElement.videoHeight / videoElement.videoWidth) * 640);

    const captureFrame = () => {
      if (currentFrame >= maxFrames) {
        resolve(frames);
        return;
      }

      const time = currentFrame * interval;
      videoElement.currentTime = time;
    };

    videoElement.addEventListener('seeked', function onSeeked() {
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      frames.push(dataUrl.split(',')[1]); // base64 only
      currentFrame++;
      captureFrame();

      if (currentFrame >= maxFrames) {
        videoElement.removeEventListener('seeked', onSeeked);
      }
    });

    captureFrame();
  });
}

// ─── Legacy export for compatibility ─────────────────────────────────────────

export { uploadFileToGemini as uploadFile };
