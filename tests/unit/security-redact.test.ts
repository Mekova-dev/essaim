import { describe, it, expect } from "vitest";
import { redact, sanitizeUntrusted, renderUntrustedBlock } from "../../src/security/redact.js";

describe("redact", () => {
  it("masks OpenAI/Anthropic-style sk- keys", () => {
    const out = redact("token is sk-abcDEF0123456789ghijklmnop end");
    expect(out).not.toContain("sk-abcDEF0123456789ghijklmnop");
    expect(out).toContain("«REDACTED»");
  });

  it("masks Bearer tokens", () => {
    const out = redact("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
  });

  it("masks GitHub PATs and AWS keys", () => {
    expect(redact("ghp_0123456789abcdefghijABCDEFGHIJ01")).toContain("«REDACTED»");
    expect(redact("AKIAIOSFODNN7EXAMPLE")).toContain("«REDACTED»");
  });

  it("masks long high-entropy blobs but leaves ordinary prose", () => {
    expect(redact("dGhpcyBpcyBhIHZlcnkgbG9uZyBoaWdoIGVudHJvcHkgc2VjcmV0IHZhbHVl0123")).toContain("«REDACTED»");
    expect(redact("the quick brown fox jumps over the lazy dog")).toBe("the quick brown fox jumps over the lazy dog");
  });

  it("is a no-op on empty input", () => {
    expect(redact("")).toBe("");
  });
});

describe("sanitizeUntrusted", () => {
  it("strips control characters but keeps newlines and tabs", () => {
    const out = sanitizeUntrusted("a bc\td\ne");
    expect(out).toBe("abc\td\ne");
  });

  it("caps length", () => {
    const out = sanitizeUntrusted("x".repeat(50), 10);
    expect(out.startsWith("xxxxxxxxxx")).toBe(true);
    expect(out).toContain("[truncated]");
  });
});

describe("renderUntrustedBlock", () => {
  it("redacts, sanitizes, and fences the text; a secret never survives", () => {
    const out = renderUntrustedBlock("run this: sk-abcDEF0123456789ghijklmnop now");
    expect(out).not.toContain("sk-abcDEF0123456789ghijklmnop");
    expect(out).not.toContain(" ");
    expect(out).toContain("BEGINUNTRUSTED");
    expect(out).toContain("ENDUNTRUSTED");
  });
});
