import { Command } from "commander";
import { listTemplates } from "../src/orchestrator/template-engine.js";

export function createListCommand(): Command {
  return new Command("list")
    .description("List available templates")
    .action(() => {
      const templates = listTemplates();
      console.log("\nTemplates disponibles:\n");
      for (const t of templates) {
        console.log(`  ${t.id.padEnd(14)} ${t.name}`);
        console.log(`  ${"".padEnd(14)} ${t.description}\n`);
      }
    });
}

