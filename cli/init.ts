import { Command } from "commander";
import { resolve } from "path";
import { setupProject } from "../src/orchestrator/orchestrator.js";

export function createInitCommand(): Command {
  return new Command("init")
    .description("Setup coordination in a project")
    .argument("[path]", "Project path", ".")
    .option("--url <url>", "Coordinator URL", "http://localhost:3100")
    .option("--name <name>", "Agent name", process.env.USER || "developer")
    .option("--modules <list>", "Comma-separated modules", "")
    .action((pathArg: string, opts: { url: string; name: string; modules: string }) => {
      setupProject(resolve(pathArg), opts);
    });
}

