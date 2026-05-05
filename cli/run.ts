import { Command } from "commander";
import { resolve } from "path";
import { execSync } from "child_process";
import { scanProject } from "../src/orchestrator/scanner.js";
import {
  buildProject,
  listTemplates,
} from "../src/orchestrator/template-engine.js";
import { runProject } from "../src/orchestrator/orchestrator.js";
import { writeReport } from "../src/orchestrator/reporter.js";
import { collect, parseSetParams } from "./params.js";
import { loadConfig } from "./config.js";

export function createRunCommand(): Command {
  return new Command("run")
    .description("Launch coordinated agents via a template")
    .argument("[template]", "Template to run (raid, melee, swarm, ...)")
    .option("-p, --project <path>", "Target project path", ".")
    .option("-n, --agents <count>", "Number of agents per dynamic role")
    .option("-t, --timeout <min>", "Timeout in minutes")
    .option("--cleanup", "Remove worktrees after execution")
    .option("--dry-run", "Preview agents and prompts without launching")
    .option("--set <key=value>", "BCE parameter (repeatable)", collect, [])
    .option("--url <url>", "Coordinator URL (override config)")
    .option("--base-ref <ref>", "Git ref for worktree snapshot (tag, branch, sha) â€” use for sandbox testing against a fixed codebase")
    .option("--max-quota-pct <pct>", "Abort pre-flight if Anthropic quota utilization is at/above this % (default 95, also reads MAX_QUOTA_PCT env)")
    .action(
      async (
        template: string | undefined,
        opts: {
          project: string;
          agents?: string;
          timeout?: string;
          cleanup?: boolean;
          dryRun?: boolean;
          set: string[];
          url?: string;
          baseRef?: string;
          maxQuotaPct?: string;
        },
      ) => {
        // List templates if none specified
        const templates = listTemplates();
        if (!template) {
          console.log("\nAvailable templates:\n");
          for (const t of templates) {
            console.log(`  ${t.id.padEnd(14)} ${t.name}`);
            console.log(`  ${"".padEnd(14)} ${t.description}\n`);
          }
          console.log("Usage: essaim run <template> [-p <path>]");
          return;
        }

        // Validate template
        if (!templates.find((t) => t.id === template)) {
          const available = templates.map((t) => t.id).join(", ");
          console.error(
            `Unknown template '${template}'. Available: ${available}`,
          );
          process.exit(1);
        }

        const projectPath = resolve(opts.project);
        const context = scanProject(projectPath);

        if (!context.has_git) {
          console.error(
            "Error: project must be a git repository (needed for worktrees)",
          );
          process.exit(1);
        }
        if (!context.is_clean) {
          console.warn(
            "Warning: project has uncommitted changes. Worktrees will copy dirty state.",
          );
        }

        // Parse options
        const agentCount = opts.agents ? parseInt(opts.agents, 10) : undefined;
        if (agentCount !== undefined && (isNaN(agentCount) || agentCount < 1)) {
          console.error("Error: --agents must be at least 1");
          process.exit(1);
        }

        const setParams = parseSetParams(opts.set);

        // Check coordinator is reachable (skip for dry-run)
        if (!opts.dryRun) {
          const config = loadConfig();
          const coordinatorUrl = opts.url ?? process.env.COORDINATOR_URL ?? config.defaults.coordinator_url;
          try {
            execSync(`curl -s --max-time 3 ${coordinatorUrl}/health`, {
              stdio: "pipe",
            });
          } catch {
            console.error(
              `Coordinator not reachable at ${coordinatorUrl}. Run: essaim server start`,
            );
            process.exit(1);
          }
        }

        // Build project
        const project = buildProject(template, context, {
          agentCount,
          setParams,
        });

        // Apply overrides
        if (opts.timeout) {
          project.timeout_minutes = parseInt(opts.timeout, 10);
        }
        if (opts.baseRef) {
          project.workspace.baseRef = opts.baseRef;
          console.log(`Sandbox mode: worktrees will snapshot ${opts.baseRef} (not HEAD)`);
        }

        if (opts.dryRun) {
          console.log(`\n=== Dry Run: ${project.name} ===\n`);
          console.log("Agents:");
          for (const agent of project.agents) {
            console.log(
              `  ${agent.id.padEnd(25)} ${agent.name} (${agent.profile})`,
            );
            console.log(
              `  ${"".padEnd(25)} Prompt: ${agent.prompt.length} chars`,
            );
          }
          console.log(`\nWorkspace:  ${project.workspace.type}`);
          console.log(
            `Stagger:    ${project.stagger.mode}${project.stagger.delay ? ` [${project.stagger.delay.join("-")}s]` : ""}`,
          );
          console.log(
            `Timeout:    ${project.timeout_minutes || 15} minutes`,
          );
          return;
        }

        const result = await runProject(
          project,
          "with_coordinator",
          opts.cleanup,
          {
            maxQuotaPct: opts.maxQuotaPct ? Number(opts.maxQuotaPct) : undefined,
          },
        );
        writeReport([result], "reports");
      },
    );
}

