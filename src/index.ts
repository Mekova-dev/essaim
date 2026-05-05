// Public package surface for programmatic consumers
export { runProject, type RunProjectOptions } from "./orchestrator/orchestrator.js";
export type { RunResult } from "./orchestrator/types.js";
export { scanProject } from "./orchestrator/scanner.js";
export { buildProject, listTemplates } from "./orchestrator/template-engine.js";
export type {
  AgentConfig,
  MiniProject,
  AgentProcess,
  WorkspaceResult,
  CoordinatorMetrics,
  AgentResult,
  ProjectContext,
} from "./orchestrator/types.js";

// Bridge re-exports for advanced consumers wiring their own runner.
export { buildProjectFromBce, buildSoloPrompt, listBceTemplates } from "./bridge.js";
