import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { createWorkspaces, cleanupWorkspaces } from "../../src/orchestrator/workspace.js";
import type { AgentConfig, WorkspaceResult } from "../../src/orchestrator/types.js";

function testAgent(partial: Partial<AgentConfig> & Pick<AgentConfig, "id" | "name" | "profile">): AgentConfig {
  return {
    prompt: "",
    hooks: {},
    envVars: {},
    mcpTools: [],
    ...partial,
  };
}

const TMP_DIR = path.resolve("/tmp/test-workspace-" + Date.now());
const SANDBOX_DIR = path.join(TMP_DIR, "sandbox");
let lastWorkspace: WorkspaceResult | null = null;

function setupGitRepo(): void {
  fs.mkdirSync(SANDBOX_DIR, { recursive: true });
  execSync("git init && git config user.email 'test@test.com' && git config user.name 'Test'", { cwd: SANDBOX_DIR });
  fs.writeFileSync(path.join(SANDBOX_DIR, "file.txt"), "hello");
  execSync("git add . && git commit -m 'init'", { cwd: SANDBOX_DIR });
}

beforeEach(() => { lastWorkspace = null; setupGitRepo(); });
afterEach(() => {
  if (lastWorkspace) cleanupWorkspaces(lastWorkspace);
  try { fs.rmSync(TMP_DIR, { recursive: true }); } catch {}
});

describe("createWorkspaces", () => {
  it("creates N worktrees for worktree type", () => {
    const agents = [
      testAgent({ id: "alpha", name: "Alpha", profile: "codeur" }),
      testAgent({ id: "bravo", name: "Bravo", profile: "codeur" }),
      testAgent({ id: "charlie", name: "Charlie", profile: "codeur" }),
    ];
    const result = createWorkspaces({ type: "worktree", base: SANDBOX_DIR }, agents, TMP_DIR);
    lastWorkspace = result;
    expect(result.type).toBe("worktree");
    expect(result.paths.size).toBe(3);
    for (const [id, wsPath] of result.paths) {
      expect(fs.existsSync(wsPath)).toBe(true);
      expect(fs.existsSync(path.join(wsPath, "file.txt"))).toBe(true);
    }
  });

  it("returns same path for shared type", () => {
    const agents = [
      testAgent({ id: "alpha", name: "Alpha", profile: "codeur" }),
      testAgent({ id: "bravo", name: "Bravo", profile: "codeur" }),
    ];
    const result = createWorkspaces({ type: "shared", base: SANDBOX_DIR }, agents, TMP_DIR);
    expect(result.type).toBe("shared");
    const paths = [...result.paths.values()];
    expect(paths[0]).toBe(paths[1]);
    expect(paths[0]).toBe(SANDBOX_DIR);
  });

  it("returns base path for none type", () => {
    const result = createWorkspaces(
      { type: "none" },
      [testAgent({ id: "a", name: "A", profile: "communicant" })],
      TMP_DIR
    );
    expect(result.type).toBe("none");
    expect(result.paths.size).toBe(1);
  });
});

