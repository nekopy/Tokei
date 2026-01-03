import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const cacheDir = path.join(repoRoot, "puppeteer-cache");

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function findChromeExe(root) {
  if (!exists(root)) return null;
  const queue = [{ dir: root, depth: 0 }];
  const maxDepth = 6;
  while (queue.length) {
    const { dir, depth } = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isFile() && ent.name.toLowerCase() === "chrome.exe") return full;
      if (ent.isDirectory() && depth < maxDepth) queue.push({ dir: full, depth: depth + 1 });
    }
  }
  return null;
}

function runCli(args) {
  const cliPath = path.join(repoRoot, "node_modules", "puppeteer", "lib", "cjs", "puppeteer", "node", "cli.js");
  if (!exists(cliPath)) {
    throw new Error(`puppeteer CLI not found at ${cliPath}. Run npm install first.`);
  }
  const env = { ...process.env, PUPPETEER_CACHE_DIR: cacheDir };
  const r = spawnSync(process.execPath, [cliPath, ...args], { cwd: repoRoot, env, stdio: "inherit" });
  if (typeof r.status === "number" && r.status !== 0) process.exit(r.status);
  if (r.error) throw r.error;
}

function main() {
  fs.mkdirSync(cacheDir, { recursive: true });

  const existing = findChromeExe(cacheDir);
  if (existing) {
    console.log(`Puppeteer cache already contains Chrome: ${existing}`);
    return;
  }

  console.log(`Preparing Puppeteer browser cache at ${cacheDir}`);
  runCli(["browsers", "install", "chrome"]);
  runCli(["browsers", "install", "chrome-headless-shell"]);
}

main();

