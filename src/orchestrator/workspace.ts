import { execSync } from "child_process";
import path from "path";
import type { AgentConfig, WorkspaceResult } from "./types.js";

export function createWorkspaces(
  workspace: { type: "worktree" | "shared" | "none"; base?: string; baseRef?: string },
  agents: AgentConfig[],
  outputDir: string
): WorkspaceResult {
  const paths = new Map<string, string>();
  const basePath = workspace.base || process.cwd();
  const ref = workspace.baseRef || "HEAD";

  if (workspace.type === "worktree") {
    // Prune stale worktree references from previous runs
    try { execSync(`git worktree prune`, { cwd: basePath, stdio: "pipe" }); } catch {}

    for (const agent of agents) {
      const worktreePath = path.join(outputDir, `worktree-${agent.id}`);
      const branchName = `mini-project-${agent.id}`;
      const branchRef = `refs/heads/${branchName}`;

      // Force-remove any previous worktree that still holds this branch
      // (handles leftover from a previous run at a different path)
      try {
        const porcelain = execSync(`git worktree list --porcelain`, { cwd: basePath, encoding: "utf-8" });
        let currentPath = "";
        for (const line of porcelain.split("\n")) {
          if (line.startsWith("worktree ")) currentPath = line.slice("worktree ".length);
          if (line === `branch ${branchRef}` && currentPath) {
            try { execSync(`git worktree remove "${currentPath}" --force`, { cwd: basePath, stdio: "pipe" }); } catch {}
          }
        }
      } catch {}

      try { execSync(`git branch -D "${branchName}"`, { cwd: basePath, stdio: "pipe" }); } catch {}
      execSync(`git worktree add "${worktreePath}" -b "${branchName}" ${ref}`, { cwd: basePath, stdio: "pipe" });
      paths.set(agent.id, worktreePath);
    }
  } else if (workspace.type === "shared") {
    for (const agent of agents) {
      paths.set(agent.id, basePath);
    }
  } else {
    for (const agent of agents) {
      paths.set(agent.id, basePath);
    }
  }

  return { type: workspace.type, basePath, paths };
}

export function cleanupWorkspaces(workspace: WorkspaceResult): void {
  if (workspace.type !== "worktree") return;
  for (const [agentId, worktreePath] of workspace.paths) {
    const branchName = `mini-project-${agentId}`;
    try { execSync(`git worktree remove "${worktreePath}" --force`, { cwd: workspace.basePath, stdio: "pipe" }); } catch {}
    try { execSync(`git branch -D "${branchName}"`, { cwd: workspace.basePath, stdio: "pipe" }); } catch {}
  }
}

export function resetBase(basePath: string): void {
  execSync("git checkout -- .", { cwd: basePath, stdio: "pipe" });
  execSync("git clean -fd", { cwd: basePath, stdio: "pipe" });
}


