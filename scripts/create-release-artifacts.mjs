#!/usr/bin/env node
import { createHash } from "crypto";
import { createReadStream, existsSync, mkdirSync, rmSync, copyFileSync, cpSync, writeFileSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(join(__dirname, ".."));

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
const version = process.env.RELEASE_VERSION || pkg.version;
if (!version || typeof version !== "string") {
  throw new Error("Unable to resolve release version");
}

const releaseDir = join(root, "dist", "release", `v${version}`);
const stagingDir = join(root, "dist", "release-staging");
const bundleName = `failsafe-qore-zo-bundle-v${version}.tgz`;
const bundlePath = join(releaseDir, bundleName);
const shaPath = join(releaseDir, "SHA256SUMS");
const notesPath = join(releaseDir, "RELEASE_NOTES.md");

const items = [
  "deploy",
  "docs",
  "ledger",
  "policy",
  "risk",
  "runtime",
  "scripts",
  "tests",
  "zo",
  ".failsafe",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "eslint.config.cjs",
  "vitest.config.ts",
  "README.md",
  "LICENSE",
];

function log(message) {
  process.stdout.write(`[release-artifacts] ${message}\n`);
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function sha256(filePath) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectHash);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

log("running release gate");
run("npm", ["run", "release:gate"]);

if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true });
if (existsSync(releaseDir)) rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
mkdirSync(releaseDir, { recursive: true });

for (const item of items) {
  const source = join(root, item);
  if (!existsSync(source)) continue;
  const dest = join(stagingDir, item);
  cpSync(source, dest, { recursive: true, force: true });
}

log(`creating bundle ${bundleName}`);
run("tar", ["-czf", bundlePath, "."], stagingDir);

const hash = await sha256(bundlePath);
writeFileSync(shaPath, `${hash}  ${bundleName}\n`, "utf-8");

const notes = [
  `# FailSafe-Qore v${version}`,
  "",
  "## Assets",
  "",
  `- \`${bundleName}\``,
  "- `SHA256SUMS`",
  "",
  "## Verify",
  "",
  "```bash",
  `sha256sum -c SHA256SUMS`,
  "```",
  "",
  "## Install",
  "",
  "```bash",
  "sudo bash -c \"$(curl -fsSL https://raw.githubusercontent.com/MythologIQ/failsafe-qore/main/deploy/zo/take-this-and-go.sh)\"",
  "```",
  "",
  "## Notes",
  "",
  "- Auto model selection is best-effort and operator-owned.",
  "- Configure `/etc/failsafe-qore/env` before production use.",
  "",
].join("\n");
writeFileSync(notesPath, notes, "utf-8");

const handoffSource = join(root, "deploy", "zo", "TAKE_THIS_AND_GO.md");
const handoffDest = join(releaseDir, "TAKE_THIS_AND_GO.md");
if (existsSync(handoffSource)) {
  copyFileSync(handoffSource, handoffDest);
}

rmSync(stagingDir, { recursive: true, force: true });
log(`release artifacts created at ${releaseDir}`);
