// src/security/scope.ts — resolve the scan scope and filter findings to what's in scope.
import type { Finding, ResolvedScope, SecurityConfig } from "./types.js";
import { SecurityConfigError } from "./errors.js";
import { normPath } from "./finding.js";

/** Convert a simple glob (supporting * and **) to an anchored RegExp over normalized paths.
 *  NOTE: exclude_paths patterns must use forward slashes (only the finding's file is normalized). */
export function globToRegExp(glob: string): RegExp {
  const esc = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  // ** = across path segments (.*) ; * = within a single segment ([^/]*)
  const body = glob
    .split("**")
    .map((seg) => seg.split("*").map(esc).join("[^/]*"))
    .join(".*");
  return new RegExp("^" + body + "$");
}

/** Resolve config + run context into a concrete scope; REFUSES (throws) rather than widening. */
export function resolveScope(cfg: SecurityConfig, ctx: { repoPath: string; baseSha?: string }): ResolvedScope {
  const mode = cfg.scope.mode;
  let diffBase: string | undefined;
  if (mode === "diff") {
    diffBase = cfg.scope.diff_base?.trim() || ctx.baseSha;
    if (!diffBase) {
      throw new SecurityConfigError(
        "scope.mode=diff but no diff_base configured and no worktree baseSha resolved — refusing to silently widen scope to full tree",
      );
    }
  }
  return {
    targetPath: ctx.repoPath,
    mode,
    scanMode: cfg.scan_mode,
    diffBase,
    excludeMatchers: cfg.scope.exclude_paths.map(globToRegExp),
  };
}

/** A finding is in scope iff it has a file and that file matches no exclude pattern. */
export function isInScope(f: Finding, scope: ResolvedScope): boolean {
  if (!f.file) return false;
  const p = normPath(f.file);
  return !scope.excludeMatchers.some((re) => re.test(p));
}

/** Partition findings into kept (in scope) and a dropped count. Single chokepoint before any sink. */
export function dropOutOfScope(findings: Finding[], scope: ResolvedScope): { kept: Finding[]; dropped: number } {
  const kept: Finding[] = [];
  let dropped = 0;
  for (const f of findings) {
    if (isInScope(f, scope)) kept.push(f);
    else dropped++;
  }
  return { kept, dropped };
}
