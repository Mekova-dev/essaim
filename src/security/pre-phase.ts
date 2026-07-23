// src/security/pre-phase.ts — orchestration glue that the orchestrator calls (steps 3.5 + 6).
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AdapterRegistry, EngineId, Finding, MiniProjectSecurity, SecurityRunLedger, Severity,
} from "./types.js";
import { resolveScope, dropOutOfScope } from "./scope.js";
import { assertAuthorizedRun } from "./authorization.js";
import { loadBaseline, applyBaseline } from "./baseline.js";
import { resolveEngineSecrets, writeEnvFile, removeEnvFile } from "./secrets.js";
import { createDefaultRegistry, runSecurityScan, type ScanResult } from "./scan.js";
import { registerSyntheticAuthor, ingestFindings, syntheticAuthorId } from "./ingest.js";
import { verifyFixes, type VerifyItem, type VerifyResult } from "./verify.js";
import { isHaltRequested, sweepOrphanContainers } from "./killswitch.js";
import { normPath } from "./finding.js";
import { authHeaders } from "../coordinator-auth.js";
import { createLogger } from "../logger.js";

const log = createLogger("security");

export interface PrePhaseParams {
  coordinatorUrl: string;
  runId: string;
  projectPath: string;
  baseSha?: string;
  security: MiniProjectSecurity;
}

export interface PrePhaseResult {
  ledger: SecurityRunLedger;
  postedMap: { threadId: string; finding: Finding }[];
  engineId: EngineId;
}

export function buildLedger(
  scan: ScanResult,
  extra: { ingested: number; outOfScopeDropped: number; suppressed: number },
): SecurityRunLedger {
  const r = scan.results[0];
  const bySev: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of scan.findings) bySev[f.severity]++;
  return {
    engine: r?.engine ?? "strix",
    status: r?.status ?? "skipped",
    findingsBySeverity: bySev,
    ingested: extra.ingested,
    verified: 0,
    reopened: 0,
    falsePositives: 0,
    degraded: scan.degraded,
    durationMs: r?.durationMs ?? 0,
    exitCode: r?.exitCode,
    engineVersion: r?.engineVersion,
    license: "Apache-2.0",
    outOfScopeDropped: extra.outOfScopeDropped,
    suppressed: extra.suppressed,
  };
}

/** Assert the coordinator pool contains no foreign threads (belt-and-suspenders on top of reset-before-seed). */
async function assertPoolClean(coordinatorUrl: string, authorId: string): Promise<void> {
  const resp = await fetch(`${coordinatorUrl}/api/threads-active`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: "{}",
  }).catch(() => null);
  if (!resp || !resp.ok) return; // best-effort; a fresh in-process coordinator is empty anyway
  const threads = (await resp.json()) as Array<{ initiator_id?: string }>;
  const foreign = threads.filter((t) => t.initiator_id && t.initiator_id !== authorId);
  if (foreign.length > 0) {
    throw new Error(
      `security: coordinator pool is not clean — ${foreign.length} foreign thread(s) present. A v1 security ` +
        `run requires a fresh/reset essaim-managed coordinator (decision #3). Refusing to seed into a shared pool.`,
    );
  }
}

/** Best-effort redacted audit report. Refuses (skips) if reports/security/ is not gitignored (§9.7). */
function writeEngineReport(projectPath: string, runId: string, scan: ScanResult): void {
  const gi = existsSync(join(projectPath, ".gitignore")) ? readFileSync(join(projectPath, ".gitignore"), "utf8") : "";
  if (!gi.includes("reports/security/")) {
    log.warn("security: reports/security/ is not gitignored — skipping report write (run `essaim init --security`)");
    return;
  }
  const dir = join(projectPath, "reports", "security");
  mkdirSync(dir, { recursive: true });
  for (const r of scan.results) {
    writeFileSync(join(dir, `${r.engine}-${runId}.txt`), r.stdoutExcerpt ?? "", "utf8");
  }
}

/** Step 3.5: halt-check → authorize → scan → scope-filter → baseline → purity-check → ingest. */
export async function runSecurityPrePhase(
  p: PrePhaseParams,
  deps: { registry?: AdapterRegistry; halt?: () => boolean; sweep?: () => Promise<unknown> } = {},
): Promise<PrePhaseResult> {
  const cfg = p.security.config;
  const halt = deps.halt ?? (() => isHaltRequested(p.projectPath));
  if (halt()) {
    throw new Error("security: halt requested (reports/security/STOP or ESSAIM_SECURITY_HALT=1) — aborting before scan");
  }

  const scope = resolveScope(cfg, { repoPath: p.projectPath, baseSha: p.baseSha });
  assertAuthorizedRun(cfg, { resolvedDiffBase: scope.diffBase, envAffirmed: p.security.envAffirmed });

  const secrets = resolveEngineSecrets(p.security.secretsFile);
  const envFile = writeEnvFile(secrets);
  const registry = deps.registry ?? createDefaultRegistry({ runId: p.runId, envFile });
  const sweep = deps.sweep ?? (() => sweepOrphanContainers(p.runId));

  let scan: ScanResult;
  try {
    scan = await runSecurityScan(registry, cfg.engines, scope, AbortSignal.timeout(cfg.scanTimeoutMs));
  } finally {
    removeEnvFile(envFile);
    await sweep().catch(() => undefined); // teardown any orphan container
  }

  const inScope = dropOutOfScope(scan.findings, scope);
  if (inScope.dropped > 0) log.info(`security: dropped ${inScope.dropped} out-of-scope findings`);
  const baseline = loadBaseline(p.projectPath);
  const fresh = applyBaseline(inScope.kept, baseline);
  if (fresh.suppressed > 0) log.info(`security: suppressed ${fresh.suppressed} baselined findings`);

  const authorId = syntheticAuthorId(p.projectPath);
  await registerSyntheticAuthor(p.coordinatorUrl, authorId);
  await assertPoolClean(p.coordinatorUrl, authorId);
  const ingest = await ingestFindings(p.coordinatorUrl, authorId, fresh.fresh);
  writeEngineReport(p.projectPath, p.runId, scan);

  const ledger = buildLedger(scan, { ingested: ingest.posted.length, outOfScopeDropped: inScope.dropped, suppressed: fresh.suppressed });
  return { ledger, postedMap: ingest.posted, engineId: cfg.engines[0] };
}

function gitDiffNames(worktree: string, base: string): string[] {
  try {
    return execSync(`git diff --name-only ${base}`, { cwd: worktree, encoding: "utf-8" })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Map each posted finding to the worktree whose diff touched its file (deterministic, no coordinator). */
export function buildVerifyItems(
  params: { postedMap: { threadId: string; finding: Finding }[]; workspacePaths: Map<string, string>; baseSha?: string; engineId: EngineId },
  deps: { diffFn?: (worktree: string, base: string) => string[] } = {},
): VerifyItem[] {
  const diffFn = deps.diffFn ?? gitDiffNames;
  const base = params.baseSha ?? "HEAD~1";
  // Precompute each worktree's changed file set.
  const changed = new Map<string, Set<string>>();
  for (const wt of params.workspacePaths.values()) {
    changed.set(wt, new Set(diffFn(wt, base).map(normPath)));
  }
  const items: VerifyItem[] = [];
  for (const { threadId, finding } of params.postedMap) {
    if (!finding.file) continue;
    const target = normPath(finding.file);
    for (const [wt, files] of changed) {
      if (files.has(target)) {
        items.push({ finding, worktreePath: wt, threadId, engineId: params.engineId });
        break;
      }
    }
  }
  return items;
}

/** Step 6: build verify items from worktree diffs, re-scan, tally. Report-only. */
export async function runSecurityVerifyPhase(
  params: { postedMap: { threadId: string; finding: Finding }[]; workspacePaths: Map<string, string>; baseSha?: string; engineId: EngineId; scanTimeoutMs: number },
  deps: { registry?: AdapterRegistry; diffFn?: (worktree: string, base: string) => string[] } = {},
): Promise<{ verified: number; reopened: number; details: VerifyResult[] }> {
  const items = buildVerifyItems(params, { diffFn: deps.diffFn });
  const registry = deps.registry ?? createDefaultRegistry({ runId: "verify" });
  const details = await verifyFixes(registry, items, AbortSignal.timeout(params.scanTimeoutMs));
  return {
    verified: details.filter((d) => d.status === "verified").length,
    reopened: details.filter((d) => d.status === "reopened").length,
    details,
  };
}
