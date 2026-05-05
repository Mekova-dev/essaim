import { describe, it, expect, beforeEach } from "vitest";
import {
  createCoordinationProtocol,
  type CoordinationProtocol,
  type WorkDescription,
  type AnnounceResult,
  type ProtocolAction,
} from "../../src/agent-loop/coordination-protocol.js";

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const WORK: WorkDescription = {
  subject: "Refactor auth module",
  targetModules: ["src/auth"],
  targetFiles: ["src/auth/login.ts", "src/auth/session.ts"],
};

function drainActions(protocol: CoordinationProtocol): ProtocolAction[] {
  const actions: ProtocolAction[] = [];
  let a = protocol.nextAction();
  while (a) {
    actions.push(a);
    a = protocol.nextAction();
  }
  return actions;
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("CoordinationProtocol", () => {
  let protocol: CoordinationProtocol;

  beforeEach(() => {
    protocol = createCoordinationProtocol("agent-1");
  });

  // â”€â”€ Initial state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("starts in idle phase with no thread", () => {
    expect(protocol.phase).toBe("idle");
    expect(protocol.currentThreadId).toBeNull();
    expect(protocol.nextAction()).toBeNull();
  });

  // â”€â”€ startWork â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("transitions to announcing on startWork", () => {
    protocol.startWork(WORK);
    expect(protocol.phase).toBe("announcing");

    const action = protocol.nextAction();
    expect(action).toEqual({ type: "announce", work: WORK });
    expect(protocol.nextAction()).toBeNull();
  });

  it("throws if startWork called while not idle", () => {
    protocol.startWork(WORK);
    expect(() => protocol.startWork(WORK)).toThrow('Cannot start work while in phase "announcing"');
  });

  // â”€â”€ Auto-resolve path: idle â†’ announcing â†’ working â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("goes directly to working when auto_resolved", () => {
    protocol.startWork(WORK);
    drainActions(protocol);

    const result: AnnounceResult = {
      threadId: "t-1",
      status: "auto_resolved",
      expectedRespondents: [],
      context: "",
    };
    protocol.onAnnounceResult(result);

    expect(protocol.phase).toBe("working");
    expect(protocol.currentThreadId).toBe("t-1");

    const action = protocol.nextAction();
    expect(action).toEqual({ type: "work" });

    const thread = protocol.getThreadState("t-1");
    expect(thread?.status).toBe("working");
    expect(thread?.round).toBe(1);
  });

  it("goes directly to working when no expected respondents", () => {
    protocol.startWork(WORK);
    drainActions(protocol);

    protocol.onAnnounceResult({
      threadId: "t-2",
      status: "open",
      expectedRespondents: [],
      context: "",
    });

    expect(protocol.phase).toBe("working");
    const action = protocol.nextAction();
    expect(action).toEqual({ type: "work" });
  });

  // â”€â”€ Full happy path: idle â†’ announcing â†’ waiting â†’ working â†’ resolving â†’ resolved â”€â”€

  it("follows full happy path with responses and resolution", () => {
    // 1. Start work
    protocol.startWork(WORK);
    drainActions(protocol);

    // 2. Announce result with respondents
    protocol.onAnnounceResult({
      threadId: "t-3",
      status: "open",
      expectedRespondents: ["agent-2", "agent-3"],
      context: "Agent-2 is working on src/auth/session.ts",
    });

    expect(protocol.phase).toBe("waiting");
    const waitAction = protocol.nextAction();
    expect(waitAction?.type).toBe("wait_responses");
    if (waitAction?.type === "wait_responses") {
      expect(waitAction.threadId).toBe("t-3");
      expect(waitAction.timeoutMs).toBeGreaterThan(0);
    }

    // 3. Receive messages from respondents
    protocol.onThreadMessage("t-3", "agent-2", "I can pause my work on session.ts");
    // Not all respondents yet â€” no new action
    expect(protocol.nextAction()).toBeNull();

    protocol.onThreadMessage("t-3", "agent-3", "No conflict from my side");
    // All respondents replied â€” ask_llm_decide queued
    const decideAction = protocol.nextAction();
    expect(decideAction?.type).toBe("ask_llm_decide");
    if (decideAction?.type === "ask_llm_decide") {
      expect(decideAction.threadId).toBe("t-3");
      expect(decideAction.responses).toContain("[agent-2]");
      expect(decideAction.responses).toContain("[agent-3]");
    }

    // 4. LLM decides to continue
    protocol.decideContinue();
    expect(protocol.phase).toBe("working");
    const workAction = protocol.nextAction();
    expect(workAction).toEqual({ type: "work" });

    // 5. Work done â€” propose resolution
    protocol.workDone();
    const proposeAction = protocol.nextAction();
    expect(proposeAction?.type).toBe("propose_resolution");
    if (proposeAction?.type === "propose_resolution") {
      expect(proposeAction.threadId).toBe("t-3");
    }

    // 6. Resolution proposed (callback from coordinator)
    protocol.onResolutionProposed("t-3");
    expect(protocol.phase).toBe("resolving");
    const approvalWait = protocol.nextAction();
    expect(approvalWait?.type).toBe("wait_approvals");

    // 7. Approvals
    protocol.onApproval("t-3", "agent-2");
    expect(protocol.nextAction()).toBeNull(); // still waiting for agent-3
    expect(protocol.phase).toBe("resolving");

    protocol.onApproval("t-3", "agent-3");
    expect(protocol.phase).toBe("idle");
    expect(protocol.currentThreadId).toBeNull();

    const doneAction = protocol.nextAction();
    expect(doneAction?.type).toBe("done");
    if (doneAction?.type === "done") {
      expect(doneAction.summary).toContain("t-3");
      expect(doneAction.summary).toContain("resolved");
    }

    const thread = protocol.getThreadState("t-3");
    expect(thread?.status).toBe("resolved");
  });

  // â”€â”€ Yield path: idle â†’ announcing â†’ waiting â†’ idle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("returns to idle when LLM decides to yield", () => {
    protocol.startWork(WORK);
    drainActions(protocol);

    protocol.onAnnounceResult({
      threadId: "t-4",
      status: "open",
      expectedRespondents: ["agent-2"],
      context: "",
    });
    drainActions(protocol);

    // Respondent replies
    protocol.onThreadMessage("t-4", "agent-2", "I'm deep in this module, please yield");
    drainActions(protocol); // ask_llm_decide

    // LLM decides to yield
    protocol.decideYield();
    expect(protocol.phase).toBe("idle");
    expect(protocol.currentThreadId).toBeNull();

    const action = protocol.nextAction();
    expect(action?.type).toBe("done");
    if (action?.type === "done") {
      expect(action.summary).toContain("Yielded");
    }

    const thread = protocol.getThreadState("t-4");
    expect(thread?.status).toBe("cancelled");
  });

  // â”€â”€ Contestation: resolving â†’ waiting (round 2) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("goes back to waiting on contestation", () => {
    protocol.startWork(WORK);
    drainActions(protocol);

    protocol.onAnnounceResult({
      threadId: "t-5",
      status: "open",
      expectedRespondents: ["agent-2"],
      context: "",
    });
    drainActions(protocol);

    // Round 1: respond, decide, work, propose
    protocol.onThreadMessage("t-5", "agent-2", "ok");
    drainActions(protocol);
    protocol.decideContinue();
    drainActions(protocol);
    protocol.workDone();
    drainActions(protocol);
    protocol.onResolutionProposed("t-5");
    drainActions(protocol);

    expect(protocol.phase).toBe("resolving");
    expect(protocol.getThreadState("t-5")?.round).toBe(1);

    // Contestation
    protocol.onContestation("t-5", "agent-2", "Your changes break my module");
    expect(protocol.phase).toBe("waiting");
    expect(protocol.getThreadState("t-5")?.round).toBe(2);

    const action = protocol.nextAction();
    expect(action?.type).toBe("wait_responses");

    // Respondent list is reset for the new round
    const thread = protocol.getThreadState("t-5");
    expect(thread?.respondedAgents).toEqual([]);
  });

  // â”€â”€ Max rounds: 3 contestations â†’ auto-resolve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("auto-resolves after max rounds", () => {
    protocol.startWork(WORK);
    drainActions(protocol);

    protocol.onAnnounceResult({
      threadId: "t-6",
      status: "open",
      expectedRespondents: ["agent-2"],
      context: "",
    });
    drainActions(protocol);

    // Helper: go through one full round
    function doRound(): void {
      protocol.onThreadMessage("t-6", "agent-2", "ok");
      drainActions(protocol);
      protocol.decideContinue();
      drainActions(protocol);
      protocol.workDone();
      drainActions(protocol);
      protocol.onResolutionProposed("t-6");
      drainActions(protocol);
    }

    // Round 1 â†’ contestation â†’ round 2
    doRound();
    protocol.onContestation("t-6", "agent-2", "problem 1");
    drainActions(protocol);
    expect(protocol.getThreadState("t-6")?.round).toBe(2);

    // Round 2 â†’ contestation â†’ round 3
    doRound();
    protocol.onContestation("t-6", "agent-2", "problem 2");
    drainActions(protocol);
    expect(protocol.getThreadState("t-6")?.round).toBe(3);

    // Round 3 â†’ contestation â†’ auto-resolve (max reached)
    doRound();
    protocol.onContestation("t-6", "agent-2", "problem 3");

    expect(protocol.phase).toBe("idle");
    expect(protocol.currentThreadId).toBeNull();

    const action = protocol.nextAction();
    expect(action?.type).toBe("done");
    if (action?.type === "done") {
      expect(action.summary).toContain("auto-resolved");
      expect(action.summary).toContain("3 rounds");
    }
  });

  // â”€â”€ Timeout while waiting for responses â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("emits ask_llm_decide on response timeout", () => {
    protocol.startWork(WORK);
    drainActions(protocol);

    protocol.onAnnounceResult({
      threadId: "t-7",
      status: "open",
      expectedRespondents: ["agent-2", "agent-3"],
      context: "",
    });
    drainActions(protocol);

    // Only one agent responded
    protocol.onThreadMessage("t-7", "agent-2", "I see the conflict");
    expect(protocol.nextAction()).toBeNull(); // not all responded yet

    // Timeout fires
    protocol.onTimeout("t-7");
    const action = protocol.nextAction();
    expect(action?.type).toBe("ask_llm_decide");
    if (action?.type === "ask_llm_decide") {
      expect(action.responses).toContain("[agent-2]");
    }
  });

  // â”€â”€ Timeout while waiting for approvals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("auto-resolves on approval timeout", () => {
    protocol.startWork(WORK);
    drainActions(protocol);

    protocol.onAnnounceResult({
      threadId: "t-8",
      status: "open",
      expectedRespondents: ["agent-2"],
      context: "",
    });
    drainActions(protocol);

    protocol.onThreadMessage("t-8", "agent-2", "fine");
    drainActions(protocol);
    protocol.decideContinue();
    drainActions(protocol);
    protocol.workDone();
    drainActions(protocol);
    protocol.onResolutionProposed("t-8");
    drainActions(protocol);

    expect(protocol.phase).toBe("resolving");

    // Approval timeout
    protocol.onTimeout("t-8");
    expect(protocol.phase).toBe("idle");
    expect(protocol.currentThreadId).toBeNull();

    const action = protocol.nextAction();
    expect(action?.type).toBe("done");
    if (action?.type === "done") {
      expect(action.summary).toContain("approval timeout");
    }
  });

  // â”€â”€ Duplicate messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("ignores duplicate respondent but still records the message", () => {
    protocol.startWork(WORK);
    drainActions(protocol);

    protocol.onAnnounceResult({
      threadId: "t-9",
      status: "open",
      expectedRespondents: ["agent-2"],
      context: "",
    });
    drainActions(protocol);

    protocol.onThreadMessage("t-9", "agent-2", "first message");
    // Should get ask_llm_decide since all respondents replied
    const action1 = protocol.nextAction();
    expect(action1?.type).toBe("ask_llm_decide");

    // Second message from same agent â€” respondent already tracked
    protocol.onThreadMessage("t-9", "agent-2", "follow-up");
    // Still triggers another ask_llm_decide since all respondents are still complete
    const action2 = protocol.nextAction();
    expect(action2?.type).toBe("ask_llm_decide");

    // Thread state shows the agent only once in respondedAgents
    const thread = protocol.getThreadState("t-9");
    expect(thread?.respondedAgents).toEqual(["agent-2"]);
  });

  // â”€â”€ Unknown thread â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("ignores events for unknown threads", () => {
    protocol.onThreadMessage("unknown", "agent-2", "hello");
    protocol.onApproval("unknown", "agent-2");
    protocol.onContestation("unknown", "agent-2", "reason");
    protocol.onTimeout("unknown");

    expect(protocol.phase).toBe("idle");
    expect(protocol.nextAction()).toBeNull();
  });

  // â”€â”€ getThreadState â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("returns null for unknown thread", () => {
    expect(protocol.getThreadState("nonexistent")).toBeNull();
  });

  // â”€â”€ Events in wrong phase are ignored â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("ignores onAnnounceResult when not in announcing phase", () => {
    // Still idle, not announcing
    protocol.onAnnounceResult({
      threadId: "t-10",
      status: "open",
      expectedRespondents: ["agent-2"],
      context: "",
    });
    expect(protocol.phase).toBe("idle");
    expect(protocol.nextAction()).toBeNull();
  });

  it("ignores onThreadMessage when not in waiting phase", () => {
    protocol.startWork(WORK);
    // Phase is announcing, not waiting
    protocol.onAnnounceResult({
      threadId: "t-11",
      status: "auto_resolved",
      expectedRespondents: [],
      context: "",
    });
    drainActions(protocol);
    // Phase is working
    protocol.onThreadMessage("t-11", "agent-2", "too late");
    expect(protocol.nextAction()).toBeNull();
  });

  it("ignores decideContinue and decideYield when not waiting", () => {
    protocol.decideContinue();
    expect(protocol.phase).toBe("idle");
    protocol.decideYield();
    expect(protocol.phase).toBe("idle");
  });

  it("ignores workDone when not working", () => {
    protocol.workDone();
    expect(protocol.nextAction()).toBeNull();
  });

  // â”€â”€ Can do a second work cycle after the first resolves â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it("supports sequential work cycles", () => {
    // First cycle: auto-resolve
    protocol.startWork(WORK);
    drainActions(protocol);
    protocol.onAnnounceResult({
      threadId: "t-12",
      status: "auto_resolved",
      expectedRespondents: [],
      context: "",
    });
    drainActions(protocol); // work action
    protocol.workDone();
    drainActions(protocol); // propose_resolution
    protocol.onResolutionProposed("t-12");
    drainActions(protocol); // wait_approvals

    // No respondents to approve â€” use timeout to auto-resolve
    protocol.onTimeout("t-12");
    drainActions(protocol); // done

    expect(protocol.phase).toBe("idle");

    // Second cycle
    const work2: WorkDescription = {
      subject: "Add user endpoint",
      targetModules: ["src/users"],
      targetFiles: ["src/users/handler.ts"],
    };
    protocol.startWork(work2);
    expect(protocol.phase).toBe("announcing");

    const action = protocol.nextAction();
    expect(action?.type).toBe("announce");
    if (action?.type === "announce") {
      expect(action.work.subject).toBe("Add user endpoint");
    }
  });
});

