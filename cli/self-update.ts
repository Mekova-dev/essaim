import { Command } from "commander";
import { execSync } from "child_process";
import { dirname } from "path";
import { getVersion } from "./version.js";

const REPO = "swoofer/essaim";

type Source = "curl" | "gh";

function hasGh(): boolean {
  try {
    execSync("command -v gh", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Try the anonymous public API first, fall back to gh for private repos.
 * Returns the resolved tag and which source succeeded.
 */
function fetchLatestTag(): { tag: string; source: Source } {
  // 1. Try curl (public API, no auth)
  try {
    const raw = execSync(
      `curl -sL "https://api.github.com/repos/${REPO}/releases/latest"`,
      { encoding: "utf-8", timeout: 10000 },
    );
    const data = JSON.parse(raw);
    if (data.tag_name) {
      return { tag: (data.tag_name as string).replace(/^v/, ""), source: "curl" };
    }
    // API returned a payload but no tag_name â€” usually 404 (private repo) or rate limit
    if (data.message !== "Not Found" && !String(data.message ?? "").includes("rate limit")) {
      throw new Error(`Unexpected response: ${data.message ?? "no tag_name"}`);
    }
  } catch (err) {
    // Only continue to gh fallback on parse/network errors
    if (err instanceof Error && !err.message.startsWith("Unexpected")) {
      throw err;
    }
  }

  // 2. Fall back to gh (auth'd access for private repos)
  if (!hasGh()) {
    throw new Error(
      "Release not found via public API. If the repo is private, install the 'gh' CLI and run 'gh auth login'.",
    );
  }
  const raw = execSync(`gh api repos/${REPO}/releases/latest`, {
    encoding: "utf-8",
    timeout: 10000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const data = JSON.parse(raw);
  return { tag: (data.tag_name as string).replace(/^v/, ""), source: "gh" };
}

function downloadAsset(
  source: Source,
  assetName: string,
  version: string,
  destPath: string,
): void {
  if (source === "gh") {
    execSync(
      `gh release download v${version} --repo ${REPO} --pattern "${assetName}.tar.gz" --dir "${dirname(destPath)}" --clobber`,
      { stdio: "pipe", timeout: 60000 },
    );
    execSync(`mv "${dirname(destPath)}/${assetName}.tar.gz" "${destPath}"`);
    return;
  }
  const url = `https://github.com/${REPO}/releases/download/v${version}/${assetName}.tar.gz`;
  execSync(`curl -fsSL "${url}" -o "${destPath}"`, {
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 60000,
  });
}

export function createSelfUpdateCommand(): Command {
  return new Command("self-update")
    .description("Update essaim to the latest version")
    .action(() => {
      const currentVersion = getVersion();

      console.log("Checking for updates...");
      let latest: string;
      let source: Source;
      try {
        ({ tag: latest, source } = fetchLatestTag());
      } catch (err) {
        console.error("Error: Could not fetch latest release from GitHub.");
        if (err instanceof Error) console.error(`  ${err.message}`);
        process.exit(1);
        return;
      }

      if (source === "gh") {
        console.log("  (using gh for authenticated access)");
      }

      if (latest === currentVersion) {
        console.log(`Already up to date (v${currentVersion}).`);
        return;
      }

      console.log(`Update available: v${currentVersion} â†’ v${latest}`);

      const platform = process.platform === "darwin" ? "darwin" : "linux";
      const arch = process.arch === "arm64" ? "arm64" : "x64";
      const assetName = `essaim-${latest}-${platform}-${arch}`;

      console.log(`Downloading ${assetName}.tar.gz...`);
      const tmpDir = execSync("mktemp -d", { encoding: "utf-8" }).trim();
      const tarPath = `${tmpDir}/release.tar.gz`;
      try {
        downloadAsset(source, assetName, latest, tarPath);
      } catch (err) {
        console.error(`Error: Failed to download ${assetName}.tar.gz`);
        if (err instanceof Error) console.error(`  ${err.message}`);
        execSync(`rm -rf "${tmpDir}"`);
        process.exit(1);
      }

      const installDir = dirname(process.execPath);
      console.log(`Installing to ${installDir}...`);
      execSync(
        `tar xzf "${tarPath}" -C "${installDir}" --strip-components=1`,
        { stdio: "pipe" },
      );

      execSync(`rm -rf "${tmpDir}"`);

      console.log(`Updated to v${latest}.`);
    });
}


