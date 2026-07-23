// src/security/ingest.ts — turn normalized Findings into coordinator threads via the EXISTING
// /api/announce. Redaction + sanitization happen HERE (the single mandatory chokepoint).
import { basename } from "node:path";
import type { Finding } from "./types.js";
import { toSubjectSeverity } from "./finding.js";
import { sanitizeUntrusted, renderUntrustedBlock, redact } from "./redact.js";
import { authHeaders } from "../coordinator-auth.js";
import { createLogger } from "../logger.js";

const log = createLogger("security");

export interface AnnouncePayload {
  agent_id: string;
  subject: string;
  plan: string;
  target_files: string[];
  target_modules: string[];
  keep_open: true;
}

export interface IngestResult {
  posted: { threadId: string; finding: Finding }[];
  failed: number;
}

/** Redacted + sanitized context for the fixer. Raw PoC never included — only a fenced summary + fingerprint. */
export function renderPlan(f: Finding): string {
  const lines = [
    `Severity: ${f.severity}${f.cwe ? ` (${f.cwe})` : ""}`,
    `Category: ${f.category}`,
    f.file ? `Location: ${f.file}${f.line ? `:${f.line}` : ""}` : "",
    "",
    "Description:",
    renderUntrustedBlock(f.description),
    f.remediation ? `\nRemediation hint:\n${renderUntrustedBlock(f.remediation)}` : "",
    f.evidence ? `\nEvidence (redacted):\n${renderUntrustedBlock(f.evidence)}` : "",
    "",
    `[fingerprint:${f.fingerprint}]`,
  ];
  return lines.filter((l) => l !== "").join("\n");
}

export function findingToAnnounce(f: Finding, agentId: string): AnnouncePayload {
  const loc = f.file ? ` (${f.file}${f.line ? `:${f.line}` : ""})` : "";
  const safeTitle = sanitizeUntrusted(redact(f.title), 160);
  const subject = `${toSubjectSeverity(f.severity)}: ${safeTitle}${loc}`.slice(0, 200);
  return {
    agent_id: agentId,
    subject,
    plan: renderPlan(f),
    target_files: f.file ? [f.file] : [],
    target_modules: [],
    keep_open: true,
  };
}

export function syntheticAuthorId(projectPath: string): string {
  return `security-scanner@${basename(projectPath)}`;
}

async function coordPost(url: string, body: unknown): Promise<Record<string, unknown>> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`coordinator ${url} -> ${resp.status}`);
  return (await resp.json()) as Record<string, unknown>;
}

/** Register the poster-only synthetic author (needed for the composite-PK FK on announce). */
export async function registerSyntheticAuthor(coordinatorUrl: string, agentId: string): Promise<void> {
  await coordPost(`${coordinatorUrl}/api/register`, { agent_id: agentId, name: agentId, modules: [] });
}

export async function ingestFindings(coordinatorUrl: string, agentId: string, findings: Finding[]): Promise<IngestResult> {
  const posted: { threadId: string; finding: Finding }[] = [];
  let failed = 0;
  for (const f of findings) {
    try {
      const data = await coordPost(`${coordinatorUrl}/api/announce`, findingToAnnounce(f, agentId));
      posted.push({ threadId: String(data.thread_id ?? ""), finding: f });
    } catch (err) {
      failed++;
      log.error("security: failed to ingest finding", { fingerprint: f.fingerprint, err: (err as Error).message });
    }
  }
  return { posted, failed };
}
