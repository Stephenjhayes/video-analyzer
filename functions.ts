/* tslint:disable */
// Video Analyzer - Function declarations for structured LLM output
// Covers: timecodes, workflow diagrams, JSONL context

import { FunctionDeclaration, Type } from '@google/genai';

const functions: FunctionDeclaration[] = [
  // ─── Standard timecode output (Executive Summary, Workflow Steps) ──────────
  {
    name: 'set_timecodes',
    description: 'Set the timecodes for the video with associated descriptive text',
    parameters: {
      type: Type.OBJECT,
      properties: {
        timecodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.STRING, description: 'Timecode in MM:SS or HH:MM:SS format' },
              text: { type: Type.STRING, description: 'Description or analysis for this timecode' },
            },
            required: ['time', 'text'],
          },
        },
      },
      required: ['timecodes'],
    },
  },

  // ─── Timecode with objects (kept for compatibility) ───────────────────────
  {
    name: 'set_timecodes_with_objects',
    description: 'Set timecodes with associated text and list of visible objects or UI elements',
    parameters: {
      type: Type.OBJECT,
      properties: {
        timecodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.STRING },
              text: { type: Type.STRING },
              objects: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['time', 'text', 'objects'],
          },
        },
      },
      required: ['timecodes'],
    },
  },

  // ─── Numeric timecode output ──────────────────────────────────────────────
  {
    name: 'set_timecodes_with_numeric_values',
    description: 'Set timecodes with associated numeric values for charting',
    parameters: {
      type: Type.OBJECT,
      properties: {
        timecodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.STRING },
              value: { type: Type.NUMBER },
            },
            required: ['time', 'value'],
          },
        },
      },
      required: ['timecodes'],
    },
  },

  // ─── Workflow diagram output (Diagram mode) ───────────────────────────────
  {
    name: 'set_workflow_diagrams',
    description: 'Set both a Mermaid sequence diagram and a PlantUML activity diagram for the workflow video',
    parameters: {
      type: Type.OBJECT,
      properties: {
        mermaid: {
          type: Type.STRING,
          description: 'Complete Mermaid sequenceDiagram code representing the workflow',
        },
        plantuml: {
          type: Type.STRING,
          description: 'Complete PlantUML @startuml/@enduml activity diagram code representing the workflow',
        },
        summary: {
          type: Type.STRING,
          description: 'Brief 2-3 sentence summary of the workflow represented in the diagrams',
        },
      },
      required: ['mermaid', 'plantuml'],
    },
  },

  // ─── JSONL context output ─────────────────────────────────────────────────
  {
    name: 'set_jsonl_context',
    description: 'Set comprehensive structured JSONL context objects extracted from the workflow video',
    parameters: {
      type: Type.OBJECT,
      properties: {
        contexts: {
          type: Type.ARRAY,
          description: 'Array of structured context objects, one per significant workflow moment',
          items: {
            type: Type.OBJECT,
            properties: {
              timecode: { type: Type.STRING, description: 'Timecode in MM:SS format' },
              screen: {
                type: Type.OBJECT,
                properties: {
                  application: { type: Type.STRING, description: 'Application or system name' },
                  module: { type: Type.STRING, description: 'Module, section, or page name' },
                  view: { type: Type.STRING, description: 'Specific view or dialog name' },
                },
              },
              user: {
                type: Type.OBJECT,
                properties: {
                  persona: { type: Type.STRING, description: 'Likely user role (e.g. admin, agent, manager)' },
                  action: { type: Type.STRING, description: 'What the user is doing' },
                },
              },
              workflow: {
                type: Type.OBJECT,
                properties: {
                  phase: { type: Type.STRING, description: 'Workflow phase or stage name' },
                  step: { type: Type.STRING, description: 'Specific step being performed' },
                  businessContext: { type: Type.STRING, description: 'Business process context' },
                },
              },
              uiElements: {
                type: Type.ARRAY,
                description: 'Visible UI elements at this moment',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING, description: 'Element type (button, field, table, etc.)' },
                    label: { type: Type.STRING, description: 'Element label or name' },
                    value: { type: Type.STRING, description: 'Current value if applicable' },
                    state: { type: Type.STRING, description: 'Element state (active, disabled, error, etc.)' },
                  },
                },
              },
              data: {
                type: Type.OBJECT,
                properties: {
                  visible: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Data values visible on screen' },
                  entered: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Data being entered by user' },
                },
              },
              systemResponse: { type: Type.STRING, description: 'Any system messages, errors, or validations shown' },
              notes: { type: Type.STRING, description: 'Additional analyst observations' },
            },
            required: ['timecode', 'workflow'],
          },
        },
        metadata: {
          type: Type.OBJECT,
          properties: {
            totalSteps: { type: Type.NUMBER },
            applications: { type: Type.ARRAY, items: { type: Type.STRING } },
            workflowName: { type: Type.STRING },
            estimatedDuration: { type: Type.STRING },
            complexityScore: { type: Type.NUMBER, description: '1-10 complexity rating' },
          },
        },
      },
      required: ['contexts'],
    },
  },
];

export default (fnMap: Record<string, (args: any) => void>) =>
  functions.map((fn) => ({
    ...fn,
    callback: fnMap[fn.name],
  }));
