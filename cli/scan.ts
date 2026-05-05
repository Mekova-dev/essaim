import { Command } from "commander";
import { resolve } from "path";
import { scanProject } from "../src/orchestrator/scanner.js";

export function createScanCommand(): Command {
  return new Command("scan")
    .description("Scan a project for context")
    .argument("<path>", "Project path")
    .action((pathArg: string) => {
      const context = scanProject(resolve(pathArg));
      console.log("\nProject Context:\n");
      console.log(`  Path:       ${context.path}`);
      console.log(`  Language:   ${context.language}`);
      console.log(`  Source:     ${context.source_dirs.join(", ") || "(root)"}`);
      console.log(`  Tests:      ${context.test_dirs.join(", ") || "(none)"}`);
      console.log(`  Test cmd:   ${context.test_command}`);
      console.log(`  Files:      ${context.source_files.length}`);
      console.log(`  Modules:    ${context.modules.join(", ") || "(none)"}`);
      console.log(`  Git:        ${context.has_git ? (context.is_clean ? "clean" : "dirty") : "no"}`);
      console.log(`\n  Templates:  ${context.applicable_templates.join(", ")}\n`);
    });
}

