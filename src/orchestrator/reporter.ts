import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { RunResult, AgentResult, WorkspaceResult } from "./types.js";

export function collectAgentResults(workspace: WorkspaceResult): AgentResult[] {
  const results: AgentResult[] = [];

  for (const [agentId, wsPath] of workspace.paths) {
    const diff = workspace.type === "worktree"
      ? safeExec("git diff HEAD", wsPath)
      : "";

    const compilationOk = workspace.type !== "none"
      ? !safeExec("npx tsc --noEmit 2>&1", wsPath).includes("error")
      : undefined;

    results.push({
      agent_id: agentId,
      agent_name: agentId,
      exit_code: 0,
      diff,
      compilation_ok: compilationOk,
      stdout_length: 0,
    });
  }

  return results;
}

export function writeReport(results: RunResult[], outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const ts = Date.now();

  const jsonPath = path.join(outputDir, `report-${ts}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  const mdPath = path.join(outputDir, `report-${ts}.md`);
  let md = `# Mini-projet Report\n\n*${new Date().toISOString()}*\n\n`;

  for (const r of results) {
    md += `## ${r.project_name} (${r.mode})\n\n`;
    md += `| Métrique | Valeur |\n|----------|--------|\n`;
    md += `| Durée | ${(r.duration_ms / 1000).toFixed(1)}s |\n`;
    md += `| Agents | ${r.coordinator_metrics.agents_count} |\n`;
    md += `| Threads ouverts | ${r.coordinator_metrics.threads_opened} |\n`;
    md += `| Consensus | ${r.coordinator_metrics.threads_resolved_consensus} |\n`;
    md += `| Auto-resolved | ${r.coordinator_metrics.threads_auto_resolved} |\n`;
    md += `| Messages | ${r.coordinator_metrics.messages_exchanged} |\n`;
    md += `| Introspections | ${r.coordinator_metrics.introspections_triggered} |\n`;
    md += `| Hot files | ${r.coordinator_metrics.hot_files.length} |\n`;

    if (Object.keys(r.coordinator_metrics.conflicts_by_layer).length > 0) {
      md += `\n### Conflits par layer\n\n`;
      for (const [layer, count] of Object.entries(r.coordinator_metrics.conflicts_by_layer)) {
        md += `- ${layer}: ${count}\n`;
      }
    }

    if (Object.keys(r.custom_metrics).length > 0) {
      md += `\n### Métriques spécifiques\n\n`;
      for (const [key, value] of Object.entries(r.custom_metrics)) {
        md += `- ${key}: ${JSON.stringify(value)}\n`;
      }
    }

    md += `\n### Agents\n\n`;
    md += `| Agent | Exit | Compilation | Diff (lignes) |\n|-------|------|-------------|---------------|\n`;
    for (const a of r.agent_results) {
      const diffLines = a.diff.split("\n").length;
      md += `| ${a.agent_name} | ${a.exit_code} | ${a.compilation_ok === undefined ? "N/A" : a.compilation_ok ? "OK" : "FAIL"} | ${diffLines} |\n`;
    }

    // Token + cost breakdown (populated from agent-loop runs)
    const agentsWithTokens = r.agent_results.filter((a) => a.tokens);
    if (agentsWithTokens.length > 0) {
      md += `\n### Coût par agent\n\n`;
      md += `| Agent | Turns | Cost | Input | Output | Cache read | Cache write | Cache hit |\n`;
      md += `|-------|-------|------|-------|--------|------------|-------------|-----------|\n`;
      let sumCost = 0, sumIn = 0, sumOut = 0, sumCacheR = 0, sumCacheW = 0;
      for (const a of agentsWithTokens) {
        const t = a.tokens!;
        const totalIn = t.input + t.cacheRead + t.cacheCreation;
        const hit = totalIn > 0 ? Math.round((t.cacheRead / totalIn) * 100) : 0;
        md += `| ${a.agent_name} | ${a.turns_count ?? "-"} | $${(a.total_cost_usd ?? 0).toFixed(4)} | ${fmtTokens(t.input)} | ${fmtTokens(t.output)} | ${fmtTokens(t.cacheRead)} | ${fmtTokens(t.cacheCreation)} | ${hit}% |\n`;
        sumCost += a.total_cost_usd ?? 0;
        sumIn += t.input;
        sumOut += t.output;
        sumCacheR += t.cacheRead;
        sumCacheW += t.cacheCreation;
      }
      const totalInAll = sumIn + sumCacheR + sumCacheW;
      const totalHit = totalInAll > 0 ? Math.round((sumCacheR / totalInAll) * 100) : 0;
      md += `| **Total** | - | **$${sumCost.toFixed(4)}** | ${fmtTokens(sumIn)} | ${fmtTokens(sumOut)} | ${fmtTokens(sumCacheR)} | ${fmtTokens(sumCacheW)} | **${totalHit}%** |\n`;

      // Per-phase breakdown across all agents
      const phaseTotals: Record<string, number> = {};
      const modelTotals: Record<string, number> = {};
      for (const a of agentsWithTokens) {
        for (const [p, c] of Object.entries(a.cost_by_phase ?? {})) {
          phaseTotals[p] = (phaseTotals[p] || 0) + c;
        }
        for (const [m, c] of Object.entries(a.cost_by_model ?? {})) {
          modelTotals[m] = (modelTotals[m] || 0) + c;
        }
      }
      if (Object.keys(phaseTotals).length > 0) {
        md += `\n**Coût par phase** (agents agrégés):\n\n`;
        md += `| Phase | Cost | % |\n|-------|------|---|\n`;
        const sortedPhases = Object.entries(phaseTotals).sort(([, a], [, b]) => b - a);
        for (const [phase, cost] of sortedPhases) {
          const pct = sumCost > 0 ? ((cost / sumCost) * 100).toFixed(1) : "0.0";
          md += `| ${phase} | $${cost.toFixed(4)} | ${pct}% |\n`;
        }
      }
      if (Object.keys(modelTotals).length > 0) {
        md += `\n**Coût par modèle** (agents agrégés):\n\n`;
        md += `| Modèle | Cost | % |\n|--------|------|---|\n`;
        const sortedModels = Object.entries(modelTotals).sort(([, a], [, b]) => b - a);
        for (const [model, cost] of sortedModels) {
          const pct = sumCost > 0 ? ((cost / sumCost) * 100).toFixed(1) : "0.0";
          md += `| ${model} | $${cost.toFixed(4)} | ${pct}% |\n`;
        }
      }
    }
    if (r.worktrees && r.worktrees.length > 0) {
      md += `\n### Worktrees\n\n`;
      md += `| Agent | Branch | Path |\n|-------|--------|------|\n`;
      for (const wt of r.worktrees) {
        md += `| ${wt.agent_id} | \`${wt.branch}\` | \`${wt.path}\` |\n`;
      }
    }

    md += "\n---\n\n";
  }

  fs.writeFileSync(mdPath, md);
  console.log(`Report: ${mdPath}`);
  return mdPath;
}

function fmtTokens(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function safeExec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", stdio: "pipe" });
  } catch (e) {
    return (e as { stdout?: string }).stdout || "";
  }
}


