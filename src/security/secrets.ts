// src/security/secrets.ts — read engine secrets lazily; hand them to the engine container via a
// temp 0600 env-file. NEVER placed in process.env, argv, prompts, threads, or logs.
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/** Parse a dotenv-style file into a map. Returns {} when no path is given or the file is absent. */
export function resolveEngineSecrets(secretsFile?: string): Record<string, string> {
  if (!secretsFile || !existsSync(secretsFile)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(secretsFile, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

/** Write secrets to a 0600 temp env-file for `docker run --env-file`. Returns undefined if empty. */
export function writeEnvFile(secrets: Record<string, string>): string | undefined {
  const keys = Object.keys(secrets);
  if (keys.length === 0) return undefined;
  const dir = mkdtempSync(join(tmpdir(), "essaim-sec-"));
  const path = join(dir, `${randomUUID()}.env`);
  const body = keys.map((k) => `${k}=${secrets[k]}`).join("\n") + "\n";
  writeFileSync(path, body, { mode: 0o600 });
  return path;
}

export function removeEnvFile(path: string | undefined): void {
  if (path && existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      /* best-effort */
    }
  }
}
