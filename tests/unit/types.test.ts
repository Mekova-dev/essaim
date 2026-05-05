import { describe, it, expect } from "vitest";
import type {
  Thread,
  ThreadMessage,
  CoordinatorEvent,
  ConflictReport,
} from "mcp-coordinator/types";

describe("Types", () => {
  it("Thread status values are exhaustive", () => {
    const statuses: Thread["status"][] = ["open", "resolving", "resolved", "cancelled"];
    expect(statuses).toHaveLength(4);
  });

  it("MessageType values are exhaustive", () => {
    const types: ThreadMessage["type"][] = ["context", "suggestion", "warning", "resolution", "approve", "contest"];
    expect(types).toHaveLength(6);
  });

  it("EventType values are exhaustive", () => {
    const types: CoordinatorEvent["type"][] = [
      "agent_online", "agent_offline", "thread_opened", "message_posted",
      "resolution_proposed", "thread_resolved", "thread_cancelled", "file_edited", "action_summary",
    ];
    expect(types).toHaveLength(9);
  });

  it("ConflictReport types are exhaustive", () => {
    const types: ConflictReport["type"][] = ["module_overlap", "api_contract", "file_overlap", "dependency_chain"];
    expect(types).toHaveLength(4);
  });
});

