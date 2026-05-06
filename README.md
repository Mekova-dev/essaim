<div align="center">

# essaim

**Spawn N coordinated Claude Code agents on your repo. Pick a preset, the orchestrator does the rest.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/essaim.svg)](https://www.npmjs.com/package/essaim)
[![Tests](https://github.com/swoofer/essaim/actions/workflows/test.yml/badge.svg)](https://github.com/swoofer/essaim/actions)

</div>

[Problem](#the-problem) · [How It Works](#how-it-works) · [Quickstart](#quickstart) · [Architecture](#architecture) · [BCE Catalog](#bce--behavior-composition-engine) · [Phases](#work-stealing-phases) · [Effort](#effort-profiles) · [Scoring](#impact-scoring) · [CLI](#cli) · [Templates](#portable-templates) · [Quota](#anthropic-quota-pre-flight) · [Observability](#token-observability) · [States](#agent-activity-states) · [Config](#configuration) · [Logging](#structured-logging) · [Auth](#authentication) · [Tests](#test-results) · [Migration](#migration-from-mcp-coordinator-v3) · [Related](#related-projects)

---

## The Problem

When multiple developers each use an AI coding agent in parallel on the same repo, things break:

- **Regressions** — Agent A rewrites a module that Agent B was depending on
- **Duplicated work** — Two agents implement the same feature from different directions
- **Architectural drift** — Agents make local decisions that conflict with each other's designs
- **Wasted reconciliation time** — Developers spend hours untangling what the agents did

Each agent works in isolation. None of them know what the others are doing.

essaim fixes this by giving agents a **shared nervous system** — they announce intentions before coding, conflicts are detected before a single line is written, and agents see each other's actions in real-time to agree on an approach.

---

## How It Works

```
Developer A                    Developer B
    |                               |
    |  announce_work                |  announce_work
    v                               v
+--------------+              +--------------+
|  Agent α     |  <-- MQTT -->|  Agent β     |
|  (essaim)    |   push-based |  (essaim)    |
+--------------+              +--------------+
        |         MCP HTTP / SSE        |
        +---------------+---------------+
                        |
             +----------v----------+
             |     mcp-coordinator |
             |  MCP tools + SQLite |
             |  MQTT broker        |
             +---------------------+
```

The **consultation cycle** has four steps, and the agent-loop runs them without a sidecar:

1. **Announce** — Agent calls `announce_work` with target files, `depends_on_files`, and target modules before coding.
2. **Detect** — Coordinator scores impact against all online agents and opens a thread if a score >= 90 matches.
3. **Consult** — MQTT pushes the new thread to every affected agent between its turns. Each agent posts context, constraints, or proposes a resolution.
4. **Resolve** — Agents approve, contest, or propose again. The thread closes when consensus is reached, or auto-resolves after timeout or in gray zones.

essaim ships the orchestrator (the agent-loop driver, the preset runner, the phase scheduler) and the behavior catalog (32 behaviors, 21 presets, 3 composition rules). The coordination server lives in `mcp-coordinator`. The prompt assembly engine lives in `@swoofer/promptweave`. essaim wires them together and provides the CLI that launches your swarm.

---

## Quickstart

### Prerequisites

- Node.js >= 20
- `claude` CLI on PATH (install from [claude.ai/code](https://claude.ai/code))
- `ANTHROPIC_API_KEY` environment variable set

### Install

```bash
npm install -g essaim
```

### Start the coordinator

essaim delegates all coordination state to `mcp-coordinator`. Start it once:

```bash
mcp-coordinator server start --daemon
```

### Run your first swarm

```bash
# Initialize your project (installs hooks + MCP config)
essaim init ~/my-project

# Launch 3 coordinated agents on a bug hunt
essaim run swarm -p ~/my-project --agents 3

# Or run a single agent without orchestration
essaim solo gardien -p ~/my-project
```

> The `swarm` preset runs discover → execute phases. Agents discover issues in read-only mode, share findings via the coordinator, then work-steal tasks from the shared pool until the pool is drained.

---

## Architecture

```
essaim (this package)
  |
  +-- @swoofer/promptweave   (BCE engine: assembles prompts from YAML behaviors)
  |
  +-- mcp-coordinator        (coordination server: MCP tools, SQLite, MQTT broker)
```

essaim owns:

- **Catalog** — 32 behaviors, 21 presets, 3 composition rules, 6 hook scripts
- **Orchestrator** — phase scheduler, effort router, work-stealing loop driver
- **CLI** — `run`, `solo`, `scan`, `init`, `list`, `self-update`

`@swoofer/promptweave` owns the BCE engine (resolver, validator, assembler). essaim feeds it YAML from its catalog and receives `prompt.md`, `hooks/*.sh`, and `.mcp.json` back.

`mcp-coordinator` owns the coordination server: the 26 MCP tools, the SQLite database, the embedded MQTT broker, and the live dashboard. essaim agents call its tools over MCP HTTP and subscribe to MQTT for push events. See [mcp-coordinator's README](https://github.com/swoofer/mcp-coordinator#readme) for the full topic map and server internals.

### MQTT push events

essaim agents subscribe to eight MQTT topics on connect:

`coordinator/consultations/new` · `coordinator/consultations/{id}/messages` · `coordinator/consultations/{id}/status` · `coordinator/consultations/{id}/claimed` · `coordinator/consultations/{id}/completed` · `coordinator/agents/{id}/status` · `coordinator/broadcast` · `coordinator/quota/update`

All push delivery, topic payloads, and broker configuration are documented in [mcp-coordinator's README](https://github.com/swoofer/mcp-coordinator#readme).

---

## BCE — Behavior Composition Engine

Every agent prompt, hook, and MCP config is assembled, not written. The BCE composes them from reusable YAML modules in essaim's catalog, processed by `@swoofer/promptweave`.

```
32 behaviors    21 presets    3 composition rules    6 hook scripts    3 workflow phases
```

### Architecture

```
                     +-----------+
                     |  Preset   |
                     |  YAML     |
                     +-----+-----+
                           |
             +-------------v-------------+
             |  @swoofer/promptweave     |
             |  (BCE engine)             |
             |                           |
             |  1. Resolve  preset       |
             |  2. Validate requires     |
             |  3. Compose  rules apply  |
             |  4. Assemble sort by #    |
             |  5. Warn     collisions   |
             +-------------+-------------+
                           |
          +-----------------+-----------------+
          v                 v                 v
    prompt.md         hooks/*.sh         .mcp.json
```

### Three behavioral layers

Each agent is assembled from three layers. Behaviors contribute numbered sections that sort deterministically.

| Layer | Sections | Responsibility | Key behaviors |
|-------|----------|----------------|---------------|
| Foundation | 000-009 | Who I am, which project | `project-context`, `coordinator-rules` |
| Patterns | 010-029 | How I coordinate | `worktree-isolation`, `shared-workspace`, `sequential-wait`, `announce-before-write`, `conflict-resolution` |
| Mission | 030-050 | What I actually do | `bug-hunting`, `test-writing`, `parallel-refactoring`, `quality-audit`, `relay-runner`, `code-review-author`, `code-review-reviewer`, `task-distribution`, `task-execution`, `phase-discover`, `phase-execute`, `phase-review`, `debate-position`, `quiz-master`, `quiz-player`, `conflict-test`, `translation`, `translation-review`, `sequential-implement`, `sequential-review`, `sequential-test` |
| Transversal | 050-099 | Constraints and style | `activity-tracking`, `read-only-mode` |

### Composition rules

Three rules adapt behaviors automatically based on the combination assembled.

| Rule | Trigger | Action |
|------|---------|--------|
| `announce-readonly-adaptation` | `announce-before-write` + `read-only-mode` | Section 020 becomes "before your analysis" instead of "before modifying" |
| `sequential-then-announce` | `sequential-wait` + `announce-before-write` | Injects section 012: "wait -> announce -> code" |
| `solo-mode-strip` | `coordinator-rules.solo_mode = true` | Strips announce / conflict-resolution entirely; agent works alone |

### BCE catalog commands

```bash
essaim list behaviors                                        # catalog
essaim list presets                                          # assembled roles
essaim bce build raid --dry-run                              # preview output
essaim bce build raid --dry-run --set coordinator-rules.solo_mode=true
essaim bce build raid --set bug-hunting.modules='["src/auth"]'
essaim bce validate --all                                    # schema check
```

---

## Work-stealing Phases

BCE behaviors can declare an optional `phase`. When a preset contains phased behaviors, the orchestrator executes each phase sequentially with different tool permissions.

```
 PHASE      TOOLS       LOOP   PURPOSE
 -----------------------------------------------------------------
 discover   read_only   no     Scan code, list findings
 review     none        no     Dedup against existing threads
 execute    full        yes    Work-stealing — one task at a time
 (no phase) full        no     One-shot (backward-compat)
```

**Key mechanisms:**

- **`keep_open: true`** — tasks stay `open` until claimed (no auto-resolve)
- **`/api/claim-task`** — atomic `UPDATE ... WHERE claimed_by IS NULL` (SQLite write lock)
- **MQTT push** — `claimed` / `completed` notifications arrive between turns
- **Grace period** — 3 retries x 10s before an agent decides the pool is drained
- **Agent departure** — crashed agents' claims are released automatically via heartbeat timeout
- **`phase-review` dedup** — agents compare findings to existing threads and emit `NEW | DUPLICATE | ENRICHES`, keeping the pool clean when multiple agents discover the same issue

---

## Effort Profiles

Model selection is phase-aware. Instead of picking Opus for everything, each phase requests a level and the orchestrator maps it to a model + thinking keyword + turn budget.

| Level | Model | Thinking | maxTurns | Cost | Use case |
|-------|-------|----------|---------:|------|----------|
| `low` | `claude-haiku-4-5` | none | 15 | $ | Coordination chatter, trivial review |
| `mid` | `claude-sonnet-4-6` | `think` | 8 | $$ | Discover, standard execute, dispatched work |
| `high` | `claude-opus-4-6` | `think-hard` | 20 | $$$ | Complex execute with thinking headroom |
| `max` | `claude-opus-4-6` | `ultrathink` | 60 | $$$$ | Architecture debates, deep reasoning |
| `auto` | resolved by context | — | — | — | `read_only`/no-tools -> low; loop -> high; else mid |

- **Thinking headroom** — thinking tokens count against the turn budget, so levels with extended thinking ship with a bigger `maxTurns`.
- **Severity upgrade** — discoveries prefixed with `critical:` auto-promote `low` to `mid`. Higher levels are respected as-is.
- **Directed dispatch** — lead-worker presets (maitre, revue, arene, babel) inject the resolved effort into the dispatched prompt so workers reach for the right model.
- **Per-phase overrides** — a preset can set `phase-discover.effort=mid`, `phase-execute.effort=high` independently.

---

## Impact Scoring

Every `announce_work` call scores all online agents across multiple detection layers. The highest matching layer wins. Scores are computed in `mcp-coordinator`; essaim agents trigger the call.

| Layer | Signal | Score | Trigger |
|-------|--------|------:|---------|
| 0a | Same file announced in active thread | 100 | `target_files` ∩ their `target_files` |
| 0b | They modify a file you depend on | 80 | `depends_on_files` ∩ their `target_files` |
| 0c | You modify a file they depend on | 80 | `target_files` ∩ their `depends_on_files` |
| 1 | Same file recently edited | 100 | File tracker conflict (last 60s) |
| 2 | Dependency file recently edited | 80 | `depends_on_files` recently touched |
| 3 | Same module prefix | 30 | `target_modules` overlap |

| Score | Category | Action |
|-------|----------|--------|
| >= 90 | `concerned` | Thread opened, consultation required |
| 30-89 | `gray_zone` | Thread auto-resolved, introspection recommended |
| < 30 | `pass` | No conflict, proceed immediately |

> **Layer 0 is critical.** Without announced intentions, two agents both working in `src/auth/` would score only 30 (gray zone, auto-resolved). With `announce_work`, the same scenario scores 100 and triggers a full consultation.

For the full scoring algorithm and detection layer documentation, see [mcp-coordinator's README](https://github.com/swoofer/mcp-coordinator#readme).

---

## MCP Tools

essaim agents call 26 MCP tools registered in `mcp-coordinator`. The tools live in the coordinator, but essaim's prompts and hooks drive them. Categories: agent registry, consultation lifecycle, file tracking, dependency map, MQTT, and system status.

Key tools agents call most often:

| Tool | Called when |
|------|-------------|
| `register_agent` | Session starts |
| `announce_work` | Before modifying any file |
| `post_to_thread` | Responding to a consultation |
| `propose_resolution` | Submitting a resolution |
| `approve_resolution` | Accepting another agent's proposal |
| `close_thread` | Work is complete |
| `heartbeat` | Every turn |
| `wait_for_peers` | Before first announce (prevents race) |

For the full 26-tool reference, see [mcp-coordinator's README](https://github.com/swoofer/mcp-coordinator#readme).

---

## CLI

essaim ships a CLI binary. All commands:

| Command | Description |
|---------|-------------|
| `essaim run <template> [-p path] [--agents N] [--timeout min] [--set k=v] [--dry-run] [--base-ref ref] [--max-quota-pct pct]` | Launch coordinated agents using a template |
| `essaim solo <template> [-p path] [--timeout min] [--set k=v]` | Launch a single agent without orchestration |
| `essaim scan <path>` | Auto-detect project language, structure, test framework |
| `essaim init [path] [--url url] [--name name] [--modules list]` | Install hooks + MCP config on a project |
| `essaim list [behaviors|presets|compositions]` | List catalog entries |
| `essaim self-update` | Update to the latest release |
| `essaim bce build <preset> [--dry-run] [--set k=v]` | Assemble a prompt from a preset |
| `essaim bce list <type>` | List behaviors, presets, or compositions |
| `essaim bce validate [file] [--all]` | Validate BCE YAML files |

### Examples

```bash
# Detect your project's stack
essaim scan ~/my-project
# -> Language: typescript, Tests: vitest, Modules: src/auth, src/users

# Bug hunt with 3 agents
essaim run raid -p ~/my-project --agents 3

# Parallel test writing with 4 agents
essaim run melee -p ~/my-project --agents 4

# Volume refactoring (essaim template)
essaim run swarm -p ~/my-project --agents 4

# Single read-only audit
essaim solo gardien -p ~/my-project

# Architecture debate (3 positions, no code written)
essaim run debat -p ~/my-project

# Preview what prompt a preset assembles
essaim bce build raid --dry-run

# Solo mode (strip coordination overhead)
essaim bce build raid --dry-run --set coordinator-rules.solo_mode=true
```

---

## Portable Templates

Language-agnostic templates. `essaim scan` auto-detects the stack; the template generates prompts tuned to the result.

| Template | Pattern | Agents | Phases |
|----------|---------|--------|--------|
| `raid` | Bug hunt | 2-3 | discover -> execute |
| `melee` | Parallel test writing | 2-6 | discover -> execute |
| `swarm` | Volume refactoring | 3-6 | discover -> execute |
| `chaine` | Sequential pipeline | 3 | one-shot, staggered |
| `relais` | Relay improvements | 3 | one-shot, staggered |
| `revue` | Authors + cross reviewers | 4-8 | one-shot |
| `maitre` | Lead + workers | 3-5 | one-shot (lead dispatches) |
| `gardien` | Read-only audit | 1 | one-shot |
| `debat` | Architecture debate | 3 | one-shot, keep_open |
| `arene` | Code quiz / trivia | 3 | one-shot, keep_open |
| `carrefour` | Intentional conflict test | 2-3 | one-shot |
| `babel` | Documentation translation | 2 | sequential |

### Template details

| Template | Description | Preset roles |
|----------|-------------|--------------|
| **raid** | Parallel bug hunt. Read-only discovery, phase-review dedup, work-steal fixes. `worktree-isolation` per agent. | `raid` |
| **melee** | Parallel test writing. Same discover -> execute pattern; mission is finding and filling coverage gaps. | `melee` |
| **swarm** | Volume refactoring. Agents discover code smells then work-steal refactoring tasks from the shared pool. | `swarm` |
| **chaine** | Three-agent sequential pipeline: implementer -> reviewer -> tester. Each step waits for the previous. | `chaine-implement`, `chaine-review`, `chaine-test` |
| **relais** | Three-agent relay: cleanup -> architecture -> finishing. Each agent documents for the next. | `relais-1`, `relais-2`, `relais-3` |
| **revue** | N authors + N reviewers in rotation. Authors improve modules; reviewers approve or contest. | `revue-author`, `revue-reviewer` |
| **maitre** | Lead dispatches tasks via consultation threads; workers execute. Scales 1+2 to 1+4. | `maitre-lead`, `maitre-worker` |
| **gardien** | Single read-only audit across 6 quality categories. Produces a scored report. No files modified. | `gardien` |
| **debat** | Three agents argue three architectural positions, converge on a recommendation. No code written. | `debat` |
| **arene** | Quizmaster poses 5 code comprehension questions; two players answer by citing code. | `arene-quizmaster`, `arene-player` |
| **carrefour** | 2-3 agents intentionally assigned the same files with different approaches. Tests full consultation cycle. | `carrefour` |
| **babel** | Translator produces translated markdown; reviewer checks fidelity and naturalness. Code blocks untouched. | `babel-translator`, `babel-reviewer` |

---

## Anthropic Quota Pre-flight

`run` and `solo` check your Anthropic workspace quota before launching N agents, to avoid 429 storms mid-session.

```bash
essaim run raid -p ~/my-app --agents 4 --max-quota-pct 90
# Aborts if workspace utilization >= 90%
```

- Reads usage from the Anthropic API using the key in the environment.
- Threshold via `--max-quota-pct` flag or `MAX_QUOTA_PCT` env var (default `95`).
- Back-off when the usage endpoint itself returns 429.
- Live widget in the mcp-coordinator dashboard with manual refresh and historical buckets.
- `quota_update` events show in the timeline by default.

---

## Token Observability

Every agent turn is logged with token breakdown. Aggregated per run.

- **Logs** — component logger `tokens` emits `input_tokens`, `output_tokens`, `cache_read`, `cache_creation`, `thinking`, model id, turn index.
- **Report** — `reports/YYYY-MM-DD-<run-id>.md` totals tokens by agent, by phase, and by effort level.
- **Dashboard** — live per-agent token gauge, cumulative run total, quota widget (via mcp-coordinator dashboard at `http://localhost:3100/dashboard`).
- **Phase review optimization** — dedup reduces thread proliferation; observable in the report as `deduped: N` per run.

---

## Dashboard

The live dashboard is served by `mcp-coordinator` at `http://localhost:3100/dashboard`.

- **Timeline** — all threads + `quota_update` events with scores and resolution types
- **Agent panel** — online/offline, working/idle/waiting, current file, thread being waited on
- **Scoring breakdown** — which detection layer triggered each conflict
- **Quota widget** — live utilization %, stacked buckets, manual refresh button
- **Consensus metrics** — per run: consensus / timeout / auto-resolved split, token totals

All events arrive via SSE. No polling.

---

## Agent Activity States

| Status | Indicator | Meaning |
|--------|-----------|---------|
| working | pulsing blue | Actively editing files |
| idle | solid green | Online, no recent activity |
| waiting | pulsing yellow | Blocked on a consultation thread |
| offline | solid red | Disconnected or session ended |

Activity is derived from heartbeats enriched with the current file and thread context from the file tracker.

---

## Configuration

### Local data

essaim stores coordination state in `mcp-coordinator`'s data directory. Project-level config is written by `essaim init`:

```
~/.mcp-coordinator/         <- coordinator server data (managed by mcp-coordinator)
  config.json
  data/
    coordinator.db
  server.pid
  logs/
    server.log

<project>/.claude/
  .coordinator-env           <- written by essaim init
  settings.json              <- MCP tool registration
  hooks/                     <- BCE-assembled shell hooks
```

### Server env vars

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | HTTP port for the coordinator (also serves MQTT-over-WebSocket on `/mqtt`) |
| `COORDINATOR_DATA_DIR` | `./data` | Directory for the SQLite database |
| `MAX_QUOTA_PCT` | `95` | Pre-flight abort threshold for Anthropic quota |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `NODE_ENV` | — | `development` for pretty logs |
| `COORDINATOR_AUTH_ENABLED` | `false` | Enable JWT authentication |
| `COORDINATOR_JWT_SECRET` | — | HMAC signing key (min 32 chars) |
| `COORDINATOR_JWT_EXPIRY` | `24h` | Token lifetime (e.g., `1h`, `7d`) |
| `COORDINATOR_REGISTRATION_SECRET` | — | Shared secret for agent auto-register |
| `COORDINATOR_ADMIN_SECRET` | — | Separate secret for admin token creation |

### Client env vars (written by `essaim init` to `.claude/.coordinator-env`)

| Variable | Example |
|----------|---------|
| `COORDINATOR_URL` | `http://localhost:3100` |
| `COORDINATOR_AGENT_ID` | `alice-12345` |
| `COORDINATOR_AGENT_NAME` | `Alice` |
| `COORDINATOR_AGENT_MODULES` | `src/auth,src/users` |

Resolution priority (highest to lowest): CLI flag -> env var -> config.json -> default.

### v3 compatibility note

essaim reads `~/.mcp-coordinator/` for coordinator config, matching the path used by `mcp-coordinator-v3`. If you ran v3 before, the data directory is already in place. Coordinator state (agents, threads, files) is stored in `coordinator.db` and is forward-compatible.

---

## Structured Logging

[Pino](https://getpino.io/) emits JSON per subsystem. Component loggers: `orchestrator`, `agent-loop`, `phase-scheduler`, `work-stealing`, `effort`, `quota`, `tokens`.

Production (default):

```json
{"level":"info","time":1712345678901,"component":"orchestrator","msg":"run started","template":"raid","agents":3}
```

Dev (`NODE_ENV=development`):

```
[14:21:03.456] INFO (orchestrator): run started
    template: raid
    agents: 3
```

Levels controlled via `LOG_LEVEL`.

---

## Authentication

essaim agents authenticate to `mcp-coordinator` using opt-in JWT (HS256). Authentication is off by default.

To enable, set the required env vars before starting the coordinator and pass `--auth-token` when running essaim:

```bash
export COORDINATOR_AUTH_ENABLED=true
export COORDINATOR_JWT_SECRET="your-secret-at-least-32-characters-long"
export COORDINATOR_REGISTRATION_SECRET="team-shared-secret"
```

essaim's `init` command handles token provisioning when auth is enabled. For the full auth API (register, refresh, revoke, exempt routes), see [mcp-coordinator's README](https://github.com/swoofer/mcp-coordinator#readme).

---

## Test Results

All four coordination scenarios are validated end-to-end (292/303 passing):

| Scenario | Layer | Score | Category | Outcome |
|----------|-------|------:|----------|---------|
| S1 — Same file | 0a | 100 | concerned | Thread opened -> consensus |
| S2 — Same module | 3 | 30 | gray_zone | Auto-resolved, introspection |
| S3 — Dependency | 0b | 80 | gray_zone | Auto-resolved, introspection |
| S4 — No overlap | — | 0 | pass | Auto-resolved immediately |

**Performance:**

| Component | Time |
|-----------|------|
| Agent-loop connect (HTTP + MQTT) | < 2s |
| Full consultation cycle (S1) | 30-45s |
| Conflict detection (no LLM) | < 5ms |
| MQTT push delivery | < 50ms end-to-end |

essaim is exercised by its own catalog — the `swarm` template was used to refactor essaim's own source during development, producing a working dogfood loop.

### Development

```bash
# Tests
npm test
npm run test:watch

# CLI in dev
npm run dev -- list
npm run dev -- run raid -p ~/my-project --dry-run

# Build
npm run build
```

---

## Migration from mcp-coordinator v3

If you were using `mcp-coordinator-v3` directly, here is the command-by-command mapping:

| v3 command | essaim equivalent |
|-----------|-------------------|
| `mcp-coordinator run raid -p ~/proj --agents 3` | `essaim run raid -p ~/proj --agents 3` |
| `mcp-coordinator solo gardien -p ~/proj` | `essaim solo gardien -p ~/proj` |
| `mcp-coordinator scan ~/proj` | `essaim scan ~/proj` |
| `mcp-coordinator init ~/proj` | `essaim init ~/proj` |
| `mcp-coordinator list` | `essaim list` |
| `mcp-coordinator self-update` | `essaim self-update` |
| `mcp-coordinator bce build raid --dry-run` | `essaim bce build raid --dry-run` |
| `mcp-coordinator bce list behaviors` | `essaim bce list behaviors` |
| `mcp-coordinator server start` | `mcp-coordinator server start` (unchanged — server is still in mcp-coordinator) |
| `mcp-coordinator server stop` | `mcp-coordinator server stop` (unchanged) |
| `mcp-coordinator dashboard` | Visit `http://localhost:3100/dashboard` directly |

**Template name change:** The `essaim` template in v3 is now called `swarm` in essaim v0.1.0 to avoid a naming collision with the package itself. All other template names are unchanged.

**Preset count:** v3 shipped 20 presets; essaim v0.1.0 ships 21 (added `babel-reviewer`).

**Behavior count:** v3 shipped 32 behaviors; essaim v0.1.0 ships 32 (same set, some renamed for clarity).

**Data directory:** `~/.mcp-coordinator/` is unchanged. Your existing `coordinator.db` is forward-compatible.

---

## Related Projects

| Package | Role |
|---------|------|
| [`mcp-coordinator`](https://github.com/swoofer/mcp-coordinator) | Coordination server: 26 MCP tools, SQLite, embedded MQTT broker, live dashboard. essaim agents talk to it over MCP HTTP; push events arrive over MQTT. |
| [`@swoofer/promptweave`](https://github.com/swoofer/promptweave) | BCE engine: resolves presets, validates behavior YAML, composes outputs. essaim feeds it the catalog; promptweave returns prompt.md, hooks, and MCP config. |

---

## Support

Solo maintainer. If this project saves you time, consider supporting development:

- [GitHub Sponsors](https://github.com/sponsors/swoofer)
- [Buy Me A Coffee](https://buymeacoffee.com/swoofer)

A star on the repo also helps surface the project to other developers.

---

## License

MIT
