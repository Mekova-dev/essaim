import { describe, it, expect, afterEach, vi } from "vitest";
import { findingToAnnounce, ingestFindings, registerSyntheticAuthor, syntheticAuthorId } from "../../src/security/ingest.js";
import type { Finding } from "../../src/security/types.js";

function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: "id-1", engine: "strix", ruleId: "sqli-concat", title: "SQL injection", description: "user input in query",
    severity: "high", category: "sqli", cwe: "CWE-89", file: "src/db.ts", line: 42,
    evidence: "q = '...' + id // sk-abcDEF0123456789ghijklmnop", remediation: "use params",
    fingerprint: "abc123def456", status: "new", discoveredAt: "t", raw: null, ...over,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("findingToAnnounce", () => {
  it("builds a coordinator payload with 3-level subject prefix, target_files, keep_open", () => {
    const p = findingToAnnounce(finding(), "security-scanner@repo");
    expect(p.subject.startsWith("critical: ")).toBe(true); // high → critical prefix
    expect(p.subject).toContain("src/db.ts:42");
    expect(p.target_files).toEqual(["src/db.ts"]);
    expect(p.keep_open).toBe(true);
    expect(p.agent_id).toBe("security-scanner@repo");
  });

  it("NEVER leaks a raw secret into the plan (redaction chokepoint)", () => {
    const p = findingToAnnounce(finding(), "a");
    expect(p.plan).not.toContain("sk-abcDEF0123456789ghijklmnop");
    expect(p.plan).toContain("[fingerprint:abc123def456]");
    expect(p.plan).toContain("CWE-89");
  });

  it("caps the subject at 200 chars", () => {
    const p = findingToAnnounce(finding({ title: "x".repeat(500) }), "a");
    expect(p.subject.length).toBeLessThanOrEqual(200);
  });
});

describe("ingestFindings + registerSyntheticAuthor", () => {
  it("registers the author then announces each finding, collecting thread ids", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      if (url.includes("/api/register")) return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => ({ thread_id: `t-${calls.length}`, status: "open" }) };
    });
    vi.stubGlobal("fetch", mockFetch);

    await registerSyntheticAuthor("http://c", "security-scanner@repo");
    const res = await ingestFindings("http://c", "security-scanner@repo", [finding(), finding({ id: "id-2", fingerprint: "f2" })]);

    expect(calls[0].url).toContain("/api/register");
    expect(calls[1].url).toContain("/api/announce");
    expect(calls[1].body).toMatchObject({ keep_open: true, target_files: ["src/db.ts"] });
    expect(res.posted).toHaveLength(2);
    expect(res.posted[0].threadId).toBe("t-2");
    // no secret anywhere in any request body
    expect(JSON.stringify(calls)).not.toContain("sk-abcDEF0123456789ghijklmnop");
  });

  it("counts failures without throwing", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/announce")) return { ok: false, status: 500 };
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", mockFetch);
    const res = await ingestFindings("http://c", "a", [finding()]);
    expect(res.failed).toBe(1);
    expect(res.posted).toHaveLength(0);
  });
});

describe("syntheticAuthorId", () => {
  it("derives a stable id from the project basename", () => {
    expect(syntheticAuthorId("C:/Users/gagno/projet/essaim-new")).toBe("security-scanner@essaim-new");
  });
});
