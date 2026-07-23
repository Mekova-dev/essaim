import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Walk src/security/*.ts and assert no module-scope (top-level) spawn/fetch and no hard-coded engine hosts.
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("security modules are hermetic by construction", () => {
  const files = walk(join(__dirname, "..", "..", "src", "security"));

  it("finds the security source tree", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("never hard-codes a non-loopback engine host", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // no absolute http(s) URLs except localhost/127.0.0.1 in source
      const urls = src.match(/https?:\/\/[^\s"'`)]+/g) ?? [];
      for (const u of urls) {
        expect(u, `${f} hard-codes ${u}`).toMatch(/localhost|127\.0\.0\.1|opencontainers|example\.com/);
      }
    }
  });

  it("does not call spawn/fetch at module top-level (only inside functions)", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // crude but effective: any spawn(/fetch( must be indented (inside a function), never column 0.
      const lines = src.split(/\r?\n/);
      for (const line of lines) {
        if (/^(spawn|fetch|execSync)\s*\(/.test(line)) {
          throw new Error(`${f}: top-level ${line.trim()} — must be inside a function`);
        }
      }
    }
  });
});
