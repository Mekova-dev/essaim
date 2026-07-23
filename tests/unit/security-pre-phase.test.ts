import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSecurityPrePhase, buildVerifyItems } from "../../src/security/pre-phase.js";
import { createRegistry } from "../../src/security/registry.js";
import type { EngineAdapter, EngineId, Finding, MiniProjectSecurity } from "../../src/security/types.js";
import { DEFAULT_SECURITY_CONFIG } from "../../src/security/config.js";

function finding(fp: string, file = "src/a.ts"): Finding {
  return {
    id: fp, engine: "strix", ruleId: "r", title: "t", description: "d", severity: "high",
    category: "sqli", file, fingerprint: fp, status: "new", discoveredAt: "t", raw: null,
  };
}

function fakeRegistry(findings: Finding[]) {
  const reg = createRegistry();
  const a: EngineAdapter = {
    capabilities: { id: "strix", displayName: "s", modes: ["sast"], requiresRunningTarget: false, supportsDiffScope: true, transport: "process", license: "Apache-2.0" },
    async healthCheck() { return { ok: true, detail: "" }; },
    async run() {
      return { engine: "strix" as EngineId, status: findings.length ? "vulns_found" : "no_vulns", findings, startedAt: "t", finishedAt: "t", durationMs: 5, exitCode: findings.length ? 2 : 0 };
    },
  };
  reg.register(a);
  return reg;
}

afterEach(() => vi.unstubAllGlobals());

describe("runSecurityPrePhase", () => {
  it("scans, ingests, and returns a ledger + posted map", async () => {
    const dir = mkdtempSync(join(tmpdir(), "prephase-"));
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/register")) return { ok: true, json: async () => ({}) };
      if (url.includes("/api/threads-active")) return { ok: true, json: async () => [] }; // pool clean
      return { ok: true, json: async () => ({ thread_id: "t-1", status: "open" }) };
    });
    vi.stubGlobal("fetch", mockFetch);

    const security: MiniProjectSecurity = {
      config: { ...DEFAULT_SECURITY_CONFIG, authorization: { affirmed: true, authorized_by: "test" }, scope: { mode: "diff", diff_base: "HEAD~1", exclude_paths: [] } },
    };
    const res = await runSecurityPrePhase(
      { coordinatorUrl: "http://c", runId: "run-1", projectPath: dir, baseSha: "abc", security },
      { registry: fakeRegistry([finding("fp1")]), halt: () => false, sweep: async () => undefined },
    );

    expect(res.ledger.engine).toBe("strix");
    expect(res.ledger.ingested).toBe(1);
    expect(res.ledger.findingsBySeverity.high).toBe(1);
    expect(res.postedMap).toHaveLength(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses (throws) when authorization is not affirmed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "prephase-"));
    const security: MiniProjectSecurity = {
      config: { ...DEFAULT_SECURITY_CONFIG, authorization: { affirmed: false, authorized_by: "" } },
    };
    await expect(
      runSecurityPrePhase({ coordinatorUrl: "http://c", runId: "r", projectPath: dir, baseSha: "abc", security }, { registry: fakeRegistry([]) }),
    ).rejects.toThrow();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("buildVerifyItems (git-diff mapping)", () => {
  it("maps each posted finding to the worktree whose diff touched its file", () => {
    const postedMap = [
      { threadId: "t-1", finding: finding("fp1", "src/a.ts") },
      { threadId: "t-2", finding: finding("fp2", "src/b.ts") },
    ];
    const workspacePaths = new Map([["agentA", "/wt/a"], ["agentB", "/wt/b"]]);
    const diffFn = (worktree: string) => (worktree === "/wt/a" ? ["src/a.ts"] : ["src/b.ts"]);
    const items = buildVerifyItems({ postedMap, workspacePaths, baseSha: "abc", engineId: "strix" }, { diffFn });
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.finding.fingerprint === "fp1")?.worktreePath).toBe("/wt/a");
    expect(items.find((i) => i.finding.fingerprint === "fp2")?.worktreePath).toBe("/wt/b");
  });

  it("omits a finding no worktree touched (nobody fixed it)", () => {
    const postedMap = [{ threadId: "t-1", finding: finding("fp1", "src/a.ts") }];
    const workspacePaths = new Map([["agentA", "/wt/a"]]);
    const diffFn = () => ["src/other.ts"];
    const items = buildVerifyItems({ postedMap, workspacePaths, baseSha: "abc", engineId: "strix" }, { diffFn });
    expect(items).toHaveLength(0);
  });
});
