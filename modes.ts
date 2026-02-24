/* tslint:disable */
// Video Analyzer - Workflow Analysis Modes
// Focused on UI workflow video analysis for enterprise/business use

export default {
  'Executive Summary': {
    emoji: '📊',
    prompt: `Analyse this UI workflow video recording at multiple levels. For each major section or transition in the video:
1. Identify the application/system being used and likely user persona (e.g. admin, end user, manager)
2. Summarise what business workflow or task is being performed
3. Note key decisions, data entry points, or critical steps observed
4. Highlight any errors, rework, or inefficiencies visible
5. Provide an overall executive assessment of the workflow complexity and likely business impact.
Call set_timecodes with a timecode and rich summary text for each distinct workflow phase observed.`,
    isList: true,
  },

  'Workflow Steps': {
    emoji: '🪜',
    prompt: `Analyse this UI workflow video and generate a precise step-by-step breakdown of every user action observed.
For each step, capture: the exact UI action taken (click, type, select, navigate), the screen or application area,
any data visible on screen, and the outcome or next state.
Be granular - each distinct user interaction should be its own step.
Call set_timecodes with the timecode and step description for each individual action.`,
    isList: true,
  },

  'Diagram': {
    emoji: '🗂️',
    prompt: `Analyse this UI workflow video and generate BOTH a Mermaid sequence diagram AND a PlantUML activity diagram
representing the complete workflow visible in the video.

For the Mermaid diagram: use sequenceDiagram format showing the interactions between User, UI screens/applications, and any backend systems visible.
For the PlantUML diagram: use @startuml/@enduml with activity diagram format showing the full workflow flow with decisions and parallel paths.

Include all major workflow steps, decision points, system interactions, and data flows you can observe.
Call set_workflow_diagrams once with both diagram texts as strings.`,
    isDiagram: true,
  },

  'JSONL Context': {
    emoji: '📦',
    prompt: `Perform a comprehensive deep analysis of this UI workflow video and generate structured JSONL context capturing everything observable.

For each significant moment in the video, extract and structure:
- Screen/application identification (app name, module, page/view)
- User persona and role indicators
- All visible UI elements (fields, buttons, menus, data values)
- User actions and interactions
- Data being entered, displayed, or processed
- Workflow state and business context
- Any error messages, validations, or system responses
- Navigation patterns and screen transitions

Call set_jsonl_context once with a comprehensive array of structured context objects, one per significant workflow moment.`,
    isJsonl: true,
  },
};
