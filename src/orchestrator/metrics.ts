import { execSync } from "child_process";
import type { CoordinatorMetrics } from "./types.js";

export interface SseEvent {
  id: number;
  type: string;
  data: Record<string, unknown>;
}

export function parseSseEvents(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  const blocks = raw.split("\n\n").filter(Boolean);

  for (const block of blocks) {
    const lines = block.split("\n");
    let id = 0;
    let type = "";
    let data = "";

    for (const line of lines) {
      if (line.startsWith("id: ")) id = parseInt(line.slice(4));
      else if (line.startsWith("event: ")) type = line.slice(7);
      else if (line.startsWith("data: ")) data = line.slice(6);
    }

    if (type && data) {
      try {
        events.push({ id, type, data: JSON.parse(data) });
      } catch {}
    }
  }
  return events;
}

export function computeMetrics(events: SseEvent[]): CoordinatorMetrics {
  const conflicts_by_layer: Record<string, number> = {};

  for (const e of events) {
    if (e.type === "impact_scored" && Array.isArray(e.data.reasons)) {
      for (const reason of e.data.reasons as string[]) {
        conflicts_by_layer[reason] = (conflicts_by_layer[reason] || 0) + 1;
      }
    }
  }

  const threadOpened = events.filter((e) => e.type === "thread_opened");
  const messagesPosted = events.filter((e) => e.type === "message_posted");
  const introspectionRequested = events.filter((e) => e.type === "introspection_requested");
  const introspectionCompleted = events.filter((e) => e.type === "introspection_completed");
  const resolutionProposed = events.filter((e) => e.type === "resolution_proposed");

  return {
    agents_count: 0,
    duration_total_ms: 0,
    threads_opened: threadOpened.length,
    threads_resolved_consensus: resolutionProposed.length,
    threads_auto_resolved: threadOpened.length - resolutionProposed.length,
    messages_exchanged: messagesPosted.length,
    conflicts_by_layer,
    introspections_triggered: introspectionRequested.length,
    introspections_concerned: introspectionCompleted.filter((e) => e.data.concerned).length,
    avg_resolution_time_ms: 0,
    hot_files: [],
  };
}

export async function fetchCoordinatorMetrics(coordinatorUrl: string): Promise<CoordinatorMetrics> {
  let sseRaw = "";
  try {
    sseRaw = execSync(`curl -s --max-time 3 -H "Last-Event-ID: 1" "${coordinatorUrl}/api/events"`, {
      encoding: "utf-8",
      timeout: 5000,
    });
  } catch (e: unknown) {
    // curl exits with code 28 on timeout but stdout still contains the data
    const err = e as { stdout?: string };
    if (err.stdout) sseRaw = err.stdout;
  }

  const events = parseSseEvents(sseRaw);
  const metrics = computeMetrics(events);

  try {
    const hotFilesResp = execSync(
      `curl -s --max-time 2 -X POST "${coordinatorUrl}/api/hot-files" -H "Content-Type: application/json" -d '{}'`,
      { encoding: "utf-8" }
    );
    const hotFiles = JSON.parse(hotFilesResp);
    metrics.hot_files = hotFiles.map((f: { file_path: string }) => f.file_path);
  } catch {}

  return metrics;
}


