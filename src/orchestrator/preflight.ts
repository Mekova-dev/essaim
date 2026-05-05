// Pre-flight check against the coordinator's quota endpoint. Called once at
// the start of a raid â€” aborts the run if 5-hour or 7-day utilization is
// already at/above the configured max. Returns an object with a
// human-friendly reason so the CLI can surface a clear error.
//
// Fail-open: if the coordinator returns 503 ("quota unavailable" â€” e.g. the
// token is not readable on this platform), we let the run proceed with a
// warning. This matches the project decision: quota-check is a guardrail,
// not a gate.

import { createLogger } from "../logger.js";

const log = createLogger("preflight");

export interface PreflightOptions {
  coordinatorUrl: string;
  /** 0â€“100. A utilization at or above this value blocks the run. */
  maxUtilizationPct: number;
  /** Fetch implementation override for tests. */
  fetchFn?: typeof fetch;
}

export interface PreflightResult {
  canProceed: boolean;
  /** Human-readable when canProceed=false, optional otherwise. */
  reason?: string;
  /** Raw quota payload for logging (null when endpoint returned 503). */
  quota?: {
    five_hour: { utilization: number; resetsAt: string; minutesUntilReset: number };
    seven_day: { utilization: number; resetsAt: string; minutesUntilReset: number };
    seven_day_sonnet: { utilization: number; resetsAt: string; minutesUntilReset: number } | null;
  };
}

/**
 * Default max utilization. Resolved at runtime from CLI > ENV > 95.
 * Exported so the CLI layer has a single source of truth.
 */
export const DEFAULT_MAX_UTILIZATION_PCT = 95;

export function resolveMaxUtilizationPct(cliValue?: number, envValue?: string): number {
  if (typeof cliValue === "number" && Number.isFinite(cliValue)) return cliValue;
  if (envValue) {
    const parsed = Number(envValue);
    if (Number.isFinite(parsed)) return parsed;
  }
  return DEFAULT_MAX_UTILIZATION_PCT;
}

export async function preflightQuotaCheck(opts: PreflightOptions): Promise<PreflightResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  let resp: Response;
  try {
    resp = await fetchFn(`${opts.coordinatorUrl}/api/quota`);
  } catch (err) {
    // Coordinator unreachable â€” don't block the run on pre-flight failure,
    // the user can still see the raid fail quickly if the coordinator is down.
    log.warn(`pre-flight: coordinator unreachable (${(err as Error).message}) â€” proceeding without check`);
    return { canProceed: true, reason: "coordinator unreachable" };
  }

  if (resp.status === 503) {
    let detail = "quota unavailable";
    try {
      const body = await resp.json() as { reason?: string };
      if (body?.reason) detail = `quota unavailable: ${body.reason}`;
    } catch { /* ignore */ }
    log.warn(`pre-flight: ${detail} â€” proceeding without guardrail`);
    return { canProceed: true, reason: detail };
  }

  if (!resp.ok) {
    log.warn(`pre-flight: unexpected HTTP ${resp.status} â€” proceeding without check`);
    return { canProceed: true, reason: `HTTP ${resp.status}` };
  }

  let data: PreflightResult["quota"];
  try {
    data = await resp.json() as PreflightResult["quota"];
  } catch (err) {
    log.warn(`pre-flight: non-JSON body (${(err as Error).message}) â€” proceeding without check`);
    return { canProceed: true };
  }

  if (!data) {
    return { canProceed: true };
  }

  const five = data.five_hour.utilization;
  const seven = data.seven_day.utilization;
  const max = opts.maxUtilizationPct;

  // Block if either bucket is at/above the configured max â€” per decision B on
  // which buckets we surveille.
  if (five >= max) {
    return {
      canProceed: false,
      reason: `five_hour at ${five.toFixed(1)}% (â‰¥ ${max}% max). Resets in ${data.five_hour.minutesUntilReset} min.`,
      quota: data,
    };
  }
  if (seven >= max) {
    return {
      canProceed: false,
      reason: `seven_day at ${seven.toFixed(1)}% (â‰¥ ${max}% max). Resets in ${data.seven_day.minutesUntilReset} min.`,
      quota: data,
    };
  }

  return { canProceed: true, quota: data };
}


