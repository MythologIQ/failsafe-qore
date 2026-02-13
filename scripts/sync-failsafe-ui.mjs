import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execFileSync } from "child_process";

const root = process.cwd();
const destination = path.resolve(root, "zo", "ui-shell", "shared");
const localSource = path.resolve(root, "..", "FailSafe", "FailSafe", "extension", "src", "roadmap", "ui");
const faviconSource = path.resolve(root, "assets", "branding", "ZoQoreLogo.png");
const sideBannerSource = fs.existsSync(path.resolve(root, "assets", "branding", "ZoQore-SideBanner.png"))
  ? path.resolve(root, "assets", "branding", "ZoQore-SideBanner.png")
  : path.resolve(root, "assets", "branding", "ZoQoreLogo.png");
const sideBannerTargetName = "zoqore-side-banner.png";
const customLegacySource = path.resolve(root, "zo", "ui-shell", "custom", "legacy");

// Security: Validate and sanitize environment variables before use
function sanitizeGitBranch(input) {
  if (!input || typeof input !== 'string') return 'main';
  // Only allow alphanumeric, hyphens, underscores, and forward slashes
  const sanitized = input.replace(/[^a-zA-Z0-9\-_/]/g, '');
  if (!sanitized) return 'main';
  return sanitized;
}

function sanitizeGitRepo(input) {
  if (!input || typeof input !== 'string') return 'https://github.com/MythologIQ/failsafe.git';
  // Only allow https:// or git:// URLs with safe characters
  const urlPattern = /^(https?|git):\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/;
  if (!urlPattern.test(input)) {
    throw new Error(`Invalid git repository URL: ${input}`);
  }
  return input;
}

function sanitizeGitPath(input) {
  if (!input || typeof input !== 'string') return 'FailSafe/extension/src/roadmap/ui';
  // Only allow alphanumeric, hyphens, underscores, forward slashes, and dots
  const sanitized = input.replace(/[^a-zA-Z0-9\-_/.]/g, '');
  if (!sanitized) return 'FailSafe/extension/src/roadmap/ui';
  // Prevent path traversal attacks
  if (sanitized.includes('..')) {
    throw new Error(`Invalid git path (contains path traversal): ${input}`);
  }
  return sanitized;
}

const branch = sanitizeGitBranch(process.env.FAILSAFE_UI_BRANCH);
const failsafeRepo = sanitizeGitRepo(process.env.FAILSAFE_UI_REPO);
const repoUiSubdir = sanitizeGitPath(process.env.FAILSAFE_UI_SUBDIR);

function log(message) {
  process.stdout.write(`[sync-failsafe-ui] ${message}\n`);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function countFiles(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += countFiles(full);
      continue;
    }
    total += 1;
  }
  return total;
}

function copyTree(sourceDir) {
  ensureDir(destination);
  fs.cpSync(sourceDir, destination, { recursive: true });
}

function removeIfExists(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function syncFromLocal() {
  if (!fs.existsSync(localSource)) {
    throw new Error(`local UI source not found: ${localSource}`);
  }
  log(`sync source: local (${localSource})`);
  copyTree(localSource);
}

function syncFromRemoteGit() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-ui-sync-"));
  try {
    log(`sync source: repo (${failsafeRepo}#${branch})`);
    
    // Security: Use argument arrays instead of string interpolation to prevent command injection.
    execFileSync("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", "--branch", branch, failsafeRepo, tempRoot], {
      stdio: "pipe",
    });
    execFileSync("git", ["-C", tempRoot, "sparse-checkout", "set", repoUiSubdir], { stdio: "pipe" });
    
    const remoteSource = path.join(tempRoot, ...repoUiSubdir.split("/"));
    if (!fs.existsSync(remoteSource)) {
      throw new Error(`UI path not found in cloned repo: ${repoUiSubdir}`);
    }
    copyTree(remoteSource);
  } finally {
    removeIfExists(tempRoot);
  }
}

function createBackup(sourceDir) {
  if (!fs.existsSync(sourceDir)) return null;
  const tempBackup = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-ui-backup-"));
  fs.cpSync(sourceDir, tempBackup, { recursive: true });
  return tempBackup;
}

function restoreBackup(sourceDir, backupDir) {
  if (!backupDir || !fs.existsSync(backupDir)) return;
  removeIfExists(sourceDir);
  ensureDir(sourceDir);
  fs.cpSync(backupDir, sourceDir, { recursive: true });
}

function syncFromRemoteRaw() {
  const rawBase = process.env.FAILSAFE_UI_RAW_BASE || `https://raw.githubusercontent.com/MythologIQ/failsafe/${branch}/${repoUiSubdir}`;
  const manifestUrl = `${rawBase}/.failsafe-ui-manifest.json`;
  log(`sync source fallback: raw (${rawBase})`);
  throw new Error(
    `git sparse sync failed and raw sync needs a manifest at ${manifestUrl}. Set FAILSAFE_UI_SOURCE=local or install git.`
  );
}

function upsertText(filePath, matcher, injector) {
  if (!fs.existsSync(filePath)) return;
  const input = fs.readFileSync(filePath, "utf8");
  if (matcher.test(input)) return;
  const next = injector(input);
  fs.writeFileSync(filePath, next, "utf8");
}

function replaceText(filePath, updater) {
  if (!fs.existsSync(filePath)) return;
  const input = fs.readFileSync(filePath, "utf8");
  const next = updater(input);
  if (next !== input) {
    fs.writeFileSync(filePath, next, "utf8");
  }
}

function applyZoQoreBannerOverlay() {
  if (!fs.existsSync(sideBannerSource) || !fs.existsSync(faviconSource)) {
    log(`branding assets not found, skipping overlay: banner=${sideBannerSource}, favicon=${faviconSource}`);
    return;
  }

  const faviconTargetName = "favicon.png";
  fs.copyFileSync(faviconSource, path.join(destination, faviconTargetName));
  const faviconHtml = '<link rel="icon" type="image/png" href="/favicon.png">';

  replaceText(path.join(destination, "index.html"), (input) => {
    let out = input;
    out = out.replace(/<link rel="icon"[^>]*>/g, faviconHtml);
    if (!out.includes('href="/favicon.png"')) {
      out = out.replace("<head>", `<head>\n  ${faviconHtml}`);
    }
    return out;
  });
  replaceText(path.join(destination, "legacy-index.html"), (input) => {
    let out = input;
    out = out.replace(/<link rel="icon"[^>]*>/g, faviconHtml);
    if (!out.includes('href="/favicon.png"')) {
      out = out.replace("<head>", `<head>\n  ${faviconHtml}`);
    }
    return out;
  });

  fs.copyFileSync(sideBannerSource, path.join(destination, sideBannerTargetName));

  const bannerHtml = '  <aside class="zoqore-side-banner zoqore-side-rail" aria-hidden="true">\n  </aside>\n';
  const toggleHtml =
    '  <nav class="zoqore-view-toggle" aria-label="View switch">\n' +
    '    <button type="button" data-zoqore-switch>Monitor</button>\n' +
    "  </nav>\n" +
    "  <script>\n" +
    "    (function(){\n" +
    "      var button=document.querySelector('[data-zoqore-switch]');\n" +
    "      if(!button){ return; }\n" +
    "      var path=window.location.pathname||'/';\n" +
    "      var params=new URLSearchParams(window.location.search||'');\n" +
    "      var onMonitor=path.indexOf('/ui/monitor')===0 || (path==='/' && params.get('ui')==='compact');\n" +
    "      button.textContent=onMonitor?'Command Center':'Monitor';\n" +
    "      if(onMonitor){\n" +
    "        var topBar=document.querySelector('.brand');\n" +
    "        var statusLine=document.getElementById('status-line');\n" +
    "        var nav=button.closest('.zoqore-view-toggle');\n" +
    "        if(topBar && nav){\n" +
    "          nav.classList.add('in-bar');\n" +
    "          topBar.appendChild(nav);\n" +
    "        }\n" +
    "        if(statusLine){\n" +
    "          statusLine.classList.add('is-hidden');\n" +
    "        }\n" +
    "      }\n" +
    "      function enforcePopupMonitorSize(){\n" +
    "        if(!onMonitor || params.get('popup')!=='1'){ return; }\n" +
    "        var desiredInnerWidth=parseInt(params.get('w')||'0',10);\n" +
    "        var desiredInnerHeight=parseInt(params.get('h')||'0',10);\n" +
    "        if(!(desiredInnerWidth>0)){\n" +
    "          var bodyW=(document.body&&document.body.scrollWidth)||0;\n" +
    "          var docW=(document.documentElement&&document.documentElement.scrollWidth)||0;\n" +
    "          desiredInnerWidth=Math.max(560, bodyW, docW) + 24;\n" +
    "        }\n" +
    "        if(!(desiredInnerHeight>0)){\n" +
    "          var bodyH=(document.body&&document.body.scrollHeight)||0;\n" +
    "          var docH=(document.documentElement&&document.documentElement.scrollHeight)||0;\n" +
    "          desiredInnerHeight=Math.max(760, bodyH, docH) + 24;\n" +
    "        }\n" +
    "        if(!window.resizeTo){ return; }\n" +
    "        var frameW=Math.max(0, (window.outerWidth||desiredInnerWidth) - (window.innerWidth||desiredInnerWidth));\n" +
    "        var frameH=Math.max(0, (window.outerHeight||desiredInnerHeight) - (window.innerHeight||desiredInnerHeight));\n" +
    "        var maxW=(window.screen && window.screen.availWidth) ? window.screen.availWidth : desiredInnerWidth + frameW;\n" +
    "        var maxH=(window.screen && window.screen.availHeight) ? window.screen.availHeight : desiredInnerHeight + frameH;\n" +
    "        var targetOuterW=Math.min(maxW, desiredInnerWidth + frameW);\n" +
    "        var targetOuterH=Math.min(maxH, desiredInnerHeight + frameH);\n" +
    "        try {\n" +
    "          window.resizeTo(targetOuterW, targetOuterH);\n" +
    "          var left=Math.max(0, Math.floor((((window.screen && window.screen.availWidth) || targetOuterW)-targetOuterW)/2));\n" +
    "          var top=Math.max(0, Math.floor((((window.screen && window.screen.availHeight) || targetOuterH)-targetOuterH)/2));\n" +
    "          if(window.moveTo){ window.moveTo(left, top); }\n" +
    "        } catch (error) {\n" +
    "        }\n" +
    "      }\n" +
    "      enforcePopupMonitorSize();\n" +
    "      function openMonitorPopup(){\n" +
    "        var width=410;\n" +
    "        var height=1060;\n" +
    "        var left=Math.max(0, Math.floor((window.screen.width-width)/2));\n" +
    "        var top=Math.max(0, Math.floor((window.screen.height-height)/2));\n" +
    "        var features='popup=yes,toolbar=no,menubar=no,location=yes,status=no,resizable=yes,scrollbars=yes,width=410,height=1060,left='+left+',top='+top;\n" +
    "        var monitorWindow=window.open('/?ui=compact&popup=1&w='+width+'&h='+height, 'zoqore_monitor', features);\n" +
    "        if(monitorWindow){\n" +
    "          monitorWindow.focus();\n" +
    "          return;\n" +
    "        }\n" +
    "        window.location.assign('/?ui=compact&popup=1&w='+width+'&h='+height);\n" +
    "      }\n" +
    "      function returnToCommandCenter(){\n" +
    "        if(window.opener && !window.opener.closed){\n" +
    "          try {\n" +
    "            window.opener.location.assign('/?ui=full');\n" +
    "            window.opener.focus();\n" +
    "            window.close();\n" +
    "            return;\n" +
    "          } catch (error) {\n" +
    "          }\n" +
    "        }\n" +
    "        window.location.assign('/?ui=full');\n" +
    "      }\n" +
    "      button.addEventListener('click', function(ev){\n" +
    "        ev.preventDefault();\n" +
    "        ev.stopPropagation();\n" +
    "        if(onMonitor){\n" +
    "          returnToCommandCenter();\n" +
    "          return;\n" +
    "        }\n" +
    "        openMonitorPopup();\n" +
    "      }, true);\n" +
    "    })();\n" +
    "  </script>\n";

  upsertText(path.join(destination, "index.html"), /class="zoqore-side-banner"/, (input) =>
    input.replace(/<body[^>]*>\r?\n/, (match) => `${match}${bannerHtml}`)
  );
  upsertText(path.join(destination, "legacy-index.html"), /class="zoqore-side-banner"/, (input) =>
    input.replace(/<body[^>]*>\r?\n/, (match) => `${match}${bannerHtml}`)
  );
  upsertText(path.join(destination, "index.html"), /class="zoqore-view-toggle"/, (input) =>
    input.replace(/<body[^>]*>\r?\n/, (match) => `${match}${toggleHtml}`)
  );
  upsertText(path.join(destination, "legacy-index.html"), /class="zoqore-view-toggle"/, (input) =>
    input.replace(/<body[^>]*>\r?\n/, (match) => `${match}${toggleHtml}`)
  );
  replaceText(path.join(destination, "index.html"), (input) =>
    input
      .replace(/<aside class="zoqore-side-banner" aria-hidden="true">\\n\s*<img src="\/zoqore-side-banner\.png" alt="">\\n\s*<\/aside>\\n/g, bannerHtml.trimEnd())
      .replace(/<nav class="zoqore-view-toggle" aria-label="View switch">[\s\S]*?<\/script>\s*/g, `${toggleHtml.trimEnd()}\n`)
      .replace(/class="zoqore-side-banner"/g, 'class="zoqore-side-banner zoqore-side-rail"')
  );
  replaceText(path.join(destination, "index.html"), (input) => {
    if (input.includes('class="zoqore-side-banner')) return input;
    return input.replace(/<body[^>]*>/, (match) => `${match}\n${bannerHtml.trimEnd()}`);
  });
  replaceText(path.join(destination, "legacy-index.html"), (input) =>
    input
      .replace(/<aside class="zoqore-side-banner" aria-hidden="true">\\n\s*<img src="\/zoqore-side-banner\.png" alt="">\\n\s*<\/aside>\\n/g, bannerHtml.trimEnd())
      .replace(/<nav class="zoqore-view-toggle" aria-label="View switch">[\s\S]*?<\/script>\s*/g, `${toggleHtml.trimEnd()}\n`)
      .replace(/class="zoqore-side-banner"/g, 'class="zoqore-side-banner zoqore-side-rail"')
  );
  replaceText(path.join(destination, "index.html"), (input) => {
    if (input.includes('class="zoqore-view-toggle"')) return input;
    return input.replace(/<body[^>]*>/, (match) => `${match}\n${toggleHtml.trimEnd()}`);
  });
  replaceText(path.join(destination, "legacy-index.html"), (input) => {
    if (input.includes('class="zoqore-view-toggle"')) return input;
    return input.replace(/<body[^>]*>/, (match) => `${match}\n${toggleHtml.trimEnd()}`);
  });

  const compactCss = `
.zoqore-side-rail {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(21vw, 320px);
  background:
    radial-gradient(circle at 22% 18%, rgba(36, 126, 255, 0.18), transparent 44%),
    radial-gradient(circle at 76% 86%, rgba(24, 194, 165, 0.13), transparent 48%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  pointer-events: none;
  opacity: 1;
}

.zoqore-view-toggle {
  position: fixed;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
  display: block;
}

.zoqore-view-toggle.in-bar {
  position: absolute;
  top: 50%;
  right: 12px;
  left: auto;
  transform: translateY(-50%);
  z-index: 6;
}

.status-line.is-hidden {
  display: none !important;
}

.zoqore-view-toggle button {
  cursor: pointer;
  text-decoration: none;
  color: #d6e6ff;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 700;
  background: rgba(2, 8, 18, 0.9);
  border: 1px solid rgba(78, 108, 154, 0.6);
  border-radius: 999px;
  padding: 6px 14px;
  backdrop-filter: blur(6px);
}

.zoqore-view-toggle button:hover {
  border-color: rgba(72, 127, 232, 0.6);
  background: rgba(45, 79, 145, 0.3);
}

@media (max-width: 1180px) {
  .zoqore-side-rail {
    display: none;
  }
  .zoqore-view-toggle {
    top: 10px;
    bottom: auto;
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    z-index: 20;
  }
  .zoqore-view-toggle.in-bar {
    left: auto;
    right: 10px;
    transform: translateY(-50%);
    top: 50%;
  }
}
`;

  const legacyCss = `
.zoqore-side-rail {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(22vw, 340px);
  background:
    radial-gradient(circle at 18% 16%, rgba(36, 126, 255, 0.2), transparent 42%),
    radial-gradient(circle at 78% 84%, rgba(24, 194, 165, 0.12), transparent 46%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 20px;
  z-index: 3;
  pointer-events: auto;
  overflow-y: auto;
}

.zoqore-side-rail img {
  display: none !important;
}

.zoqore-view-toggle {
  position: fixed;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
  display: block;
}

.zoqore-view-toggle button {
  cursor: pointer;
  text-decoration: none;
  color: #d6e6ff;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 700;
  background: rgba(2, 8, 18, 0.9);
  border: 1px solid rgba(67, 104, 158, 0.58);
  border-radius: 999px;
  padding: 6px 14px;
  backdrop-filter: blur(6px);
}

.zoqore-view-toggle button:hover {
  border-color: rgba(72, 127, 232, 0.62);
  background: rgba(45, 79, 145, 0.32);
}

.monitor-widget {
  width: 100%;
  background: rgba(13, 22, 35, 0.65);
  border: 1px solid rgba(61, 125, 255, 0.2);
  border-radius: 8px;
  padding: 10px;
  margin-top: auto;
  margin-bottom: 20px;
  font-size: 0.7rem;
  backdrop-filter: blur(4px);
}

.monitor-widget h2 {
  font-size: 0.75rem;
  margin: 0 0 8px;
  color: #89b3ff;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.monitor-grid {
  display: grid;
  gap: 6px;
}

.monitor-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.monitor-label {
  color: #8da2c0;
}

.monitor-value {
  color: #e2f0ff;
  font-weight: 600;
  text-align: right;
  overflow-wrap: anywhere;
  max-width: 60%;
}

.monitor-status {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 99px;
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.3);
  font-size: 0.65rem;
  margin-top: 6px;
  text-align: center;
  width: 100%;
}

@media (max-width: 900px) {
  .zoqore-side-rail {
    display: none;
  }
  .zoqore-view-toggle {
    top: auto;
    bottom: 10px;
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    z-index: 20;
  }
}
`;

  upsertText(path.join(destination, "roadmap.css"), /\.zoqore-side-rail/, (input) => `${input.trimEnd()}\n${compactCss}`);
  upsertText(path.join(destination, "legacy-roadmap.css"), /\.zoqore-side-rail/, (input) => `${input.trimEnd()}\n${legacyCss}`);

  log(`applied Zo-Qore side banner overlay: ${sideBannerTargetName}`);
}

function applyBrandingOverrides() {
  const indexPath = path.join(destination, "index.html");
  const legacyIndexPath = path.join(destination, "legacy-index.html");
  const roadmapCssPath = path.join(destination, "roadmap.css");
  const legacyRoadmapCssPath = path.join(destination, "legacy-roadmap.css");
  const orbitronLink =
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;800&display=swap">';
  const compactRuntimeBarHtml =
    `<section class="qore-runtime-ribbon-wrap">\n` +
    `  <div class="qore-runtime-ribbon" role="status" aria-live="polite">\n` +
    `    <span class="qore-ribbon-item"><span class="qore-ribbon-key">Qore</span><span id="qore-runtime-state" class="qore-ribbon-value">Unknown</span></span>\n` +
    `    <span class="qore-ribbon-sep">•</span>\n` +
    `    <span class="qore-ribbon-item"><span class="qore-ribbon-key">Policy</span><span id="qore-policy-version" class="qore-ribbon-value">n/a</span></span>\n` +
    `    <span class="qore-ribbon-sep">•</span>\n` +
    `    <span class="qore-ribbon-item"><span class="qore-ribbon-key">Latency</span><span id="qore-runtime-latency" class="qore-ribbon-value">n/a</span></span>\n` +
    `    <span id="qore-runtime-endpoint" class="qore-hidden-value">n/a</span>\n` +
    `    <button id="qore-runtime-check" class="qore-ribbon-refresh" type="button">Refresh</button>\n` +
    `  </div>\n` +
    `</section>`;
  const monitorHeaderHtml =
    `<header class="brand">\n` +
    `        <div class="brand-left">\n` +
    `          <img src="/favicon.png" alt="Zo-Qore logo" class="brand-icon">\n` +
    `          <div class="brand-text">\n` +
    `            <div class="brand-title" data-tooltip="Real-time governance monitoring and system health">Zo-Qore</div>\n` +
    `            <div class="brand-subtitle">Monitor</div>\n` +
    `          </div>\n` +
    `        </div>\n` +
    `        <div id="status-line" class="status-line">Connecting...</div>\n` +
    `      </header>`;

  // Keep source DOM structure intact; hide logos by CSS to avoid breaking UI scripts/layout assumptions.
  replaceText(indexPath, (input) => {
    let output = input;
    output = output.replace(/<link rel="icon" type="image\/png" href="\/failsafe-icon\.png">\r?\n?/g, "");
    if (!output.includes('href="/favicon.png"')) {
      output = output.replace("<head>", '<head>\n  <link rel="icon" type="image/png" href="/favicon.png">');
    }
    if (!output.includes("fonts.googleapis.com/css2?family=Orbitron")) {
      output = output.replace("</head>", `  ${orbitronLink}\n</head>`);
    }
    output = output.replace("<title>FailSafe Monitor</title>", "<title>Zo-Qore Monitor</title>");
    output = output.replace(/FailSafe Monitor/g, "Zo-Qore Monitor");
    output = output.replace(/FailSafe is an open source project/g, "Zo-Qore is an open source project");
    output = output.replace(/<img src="\/failsafe-icon\.png"[^>]*class="brand-icon"[^>]*>/g, '<img src="/favicon.png" alt="Zo-Qore logo" class="brand-icon">');
    output = output.replace(/<img src="\/favicon\.png" alt="ZoQore" class="header-logo">\s*/g, '<img src="/favicon.png" alt="Zo-Qore logo" class="brand-icon">\n');
    if (!/<img src="\/favicon\.png"[^>]*class="brand-icon"/.test(output)) {
      output = output.replace('<div class="brand-left">', '<div class="brand-left">\n          <img src="/favicon.png" alt="Zo-Qore logo" class="brand-icon">');
    }
    output = output.replace(/FailSafe/g, "Zo-Qore").replace(/FAILSAFE/g, "Zo-Qore");
    output = output.replace(/ZOQORE/g, "Zo-Qore");
    output = output.replace(/<header class="brand">[\s\S]*?<\/header>/, monitorHeaderHtml);
    output = output.replace(
      /<section class="card">\s*<header class="card-head">\s*<span class="eyebrow">Qore Runtime<\/span>[\s\S]*?<button id="qore-runtime-check"[\s\S]*?<\/section>/,
      compactRuntimeBarHtml
    );
    output = output.replace(
      /<section class="card qore-runtime-card">[\s\S]*?<\/section>/,
      compactRuntimeBarHtml
    );
    return output;
  });

  replaceText(legacyIndexPath, (input) => {
    let output = input;
    output = output.replace(/<link rel="icon" type="image\/png" href="\/failsafe-icon\.png">\r?\n?/g, "");
    if (!output.includes('href="/favicon.png"')) {
      output = output.replace("<head>", '<head>\n  <link rel="icon" type="image/png" href="/favicon.png">');
    }
    if (!output.includes("fonts.googleapis.com/css2?family=Orbitron")) {
      output = output.replace("</head>", `  ${orbitronLink}\n</head>`);
    }
    output = output.replace("<title>FailSafe Command Center</title>", "<title>Zo-Qore Command Center</title>");
    output = output.replace(/<h1>\s*FAILSAFE\s*<\/h1>/g, "<h1>Zo-Qore</h1>");
    output = output.replace(/FailSafe /g, "Zo-Qore ");
    output = output.replace(/aria-label="FailSafe Sections"/g, 'aria-label="Zo-Qore Sections"');
    output = output.replace(/<img src="\/failsafe-icon\.png"[^>]*class="brand-icon"[^>]*>/g, '<img src="/favicon.png" alt="Zo-Qore logo" class="brand-icon">');
    output = output.replace(/<img src="\/favicon\.png" alt="ZoQore" class="header-logo">\s*/g, '<img src="/favicon.png" alt="Zo-Qore logo" class="brand-icon">\n');
    if (!/<div class="bg-layer-logo"><\/div>/.test(output)) {
      output = output.replace('<div class="bg-layer-overlay"></div>', '<div class="bg-layer-logo"></div>\n    <div class="bg-layer-overlay"></div>');
    }
    if (!/<img src="\/favicon\.png"[^>]*class="brand-icon"/.test(output)) {
      output = output.replace('<div class="brand-left">', '<div class="brand-left">\n          <img src="/favicon.png" alt="Zo-Qore logo" class="brand-icon">');
    }
    output = output.replace(/FailSafe/g, "Zo-Qore").replace(/FAILSAFE/g, "Zo-Qore");
    output = output.replace(/ZOQORE/g, "Zo-Qore");
    return output;
  });

  replaceText(roadmapCssPath, (input) => input.replace(/\.brand-icon\s*\{\s*display:\s*none\s*!important;\s*\}\s*/g, ""));
  replaceText(legacyRoadmapCssPath, (input) =>
    input
      .replace(/\.bg-layer-logo\s*\{\s*display:\s*none\s*!important;[^}]*\}\s*/g, "")
      .replace(/\.brand-icon\s*\{\s*display:\s*none\s*!important;\s*\}\s*/g, "")
      .replace(/\.brand-left\s*\{\s*position:\s*relative\s*!important;\s*padding-left:\s*92px\s*!important;[^}]*\}\s*/g, "")
      .replace(/\.brand-left\s*\.brand-icon\s*\{\s*position:\s*absolute\s*!important;[^}]*\}\s*/g, "")
      .replace(/@media\s*\(max-width:\s*1100px\)\s*\{[\s\S]*?\.brand-left\s*\.brand-icon\s*\{[\s\S]*?\}\s*\}\s*/g, "")
  );

  upsertText(
    roadmapCssPath,
    /\.brand-icon \{ width: 62px !important; height: 62px !important; \}/,
    (input) => `${input.trimEnd()}\n.brand-icon { width: 62px !important; height: 62px !important; }\n`
  );
  upsertText(
    legacyRoadmapCssPath,
    /\.brand-icon \{ width: 88px !important; height: 88px !important; \}/,
    (input) => `${input.trimEnd()}\n.brand-icon { width: 88px !important; height: 88px !important; }\n`
  );
  upsertText(
    legacyRoadmapCssPath,
    /\.bg-layer-logo \{ display: none !important; background-image: none !important; \}/,
    (input) => `${input.trimEnd()}\n.bg-layer-logo { display: none !important; background-image: none !important; }\n`
  );

  // Normalize previously injected logo size override so repeated syncs converge.
  replaceText(roadmapCssPath, (input) =>
    input
      .replace(/\.brand-icon \{ width: 56px !important; height: 56px !important; \}\s*/g, "")
      .replace(/\.brand-icon \{ width: 68px !important; height: 68px !important; \}\s*/g, "")
      .replace(/\.brand-icon \{ width: 84px !important; height: 84px !important; \}\s*/g, "")
      .replace(/\.brand-icon \{ width: 96px !important; height: 96px !important; \}\s*/g, "")
      .replace(/\.brand-icon \{ width: 88px !important; height: 88px !important; \}\s*/g, "")
      .replace(/\.brand-icon \{ width: 62px !important; height: 62px !important; \}\s*\.brand-icon \{ width: 62px !important; height: 62px !important; \}\s*/g, ".brand-icon { width: 62px !important; height: 62px !important; }\n")
  );
  replaceText(legacyRoadmapCssPath, (input) =>
    input
      .replace(/\.brand-icon \{ width: 56px !important; height: 56px !important; \}\s*/g, "")
      .replace(/\.brand-icon \{ width: 68px !important; height: 68px !important; \}\s*/g, "")
      .replace(/\.brand-icon \{ width: 84px !important; height: 84px !important; \}\s*/g, "")
      .replace(/\.brand-icon \{ width: 96px !important; height: 96px !important; \}\s*/g, "")
      .replace(/\.brand-icon \{ width: 88px !important; height: 88px !important; \}\s*\.brand-icon \{ width: 88px !important; height: 88px !important; \}\s*/g, ".brand-icon { width: 88px !important; height: 88px !important; }\n")
  );

  // Zo-Qore type treatment
  upsertText(
    roadmapCssPath,
    /\.brand-title \{ font-family: "Orbitron", "Aptos", "Trebuchet MS", sans-serif !important; \}/,
    (input) => `${input.trimEnd()}\n.brand-title { font-family: "Orbitron", "Aptos", "Trebuchet MS", sans-serif !important; text-transform: none !important; letter-spacing: 0.03em !important; }\n`
  );
  replaceText(roadmapCssPath, (input) =>
    input
      .replace(/\.qore-runtime-card \{[^}]*\}\s*/g, "")
      .replace(/\.qore-status-bar \{[^}]*\}\s*/g, "")
      .replace(/\.qore-chip \{[^}]*\}\s*/g, "")
      .replace(/\.qore-chip-label \{[^}]*\}\s*/g, "")
      .replace(/\.qore-chip-value \{[^}]*\}\s*/g, "")
      .replace(/\.qore-check-compact \{[^}]*\}\s*/g, "")
      .replace(/@media \(max-width: 720px\) \{[^}]*qore-check-compact[^}]*\}\s*/g, "")
  );
  upsertText(
    roadmapCssPath,
    /\.qore-runtime-ribbon-wrap \{ margin-top: -2px !important; \}/,
    (input) =>
      `${input.trimEnd()}\n.qore-runtime-ribbon-wrap { margin-top: -2px !important; }\n.qore-runtime-ribbon { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 12px; border-top: 1px solid color-mix(in srgb, var(--line) 60%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); background: color-mix(in srgb, var(--bg) 88%, #01050f); overflow: hidden; }\n.qore-ribbon-item { display: inline-flex; align-items: baseline; gap: 5px; min-width: 0; }\n.qore-ribbon-key { font-size: 0.58rem; letter-spacing: 0.16em; text-transform: uppercase; color: #7fa3d6; white-space: nowrap; }\n.qore-ribbon-value { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #d9ebff; white-space: nowrap; }\n.qore-ribbon-sep { color: #3a6bb0; font-size: 0.62rem; }\n.qore-hidden-value { display: none !important; }\n.qore-ribbon-refresh { margin-left: auto; border: 0; background: transparent; color: #8ec1ff; font-size: 0.56rem; letter-spacing: 0.16em; text-transform: uppercase; cursor: pointer; padding: 2px 0; }\n.qore-ribbon-refresh:hover { color: #d6e9ff; }\n@media (max-width: 720px) { .qore-runtime-ribbon { gap: 6px; padding: 6px 8px; } .qore-ribbon-key { font-size: 0.52rem; letter-spacing: 0.12em; } .qore-ribbon-value { font-size: 0.58rem; } .qore-ribbon-sep { display: none; } }\n`
  );
  upsertText(
    legacyRoadmapCssPath,
    /\.brand-left h1 \{ font-family: "Orbitron", "Aptos", "Trebuchet MS", sans-serif !important; \}/,
    (input) =>
      `${input.trimEnd()}\n.brand-left h1 { font-family: "Orbitron", "Aptos", "Trebuchet MS", sans-serif !important; text-transform: none !important; letter-spacing: 0.08em !important; }\n`
  );
  upsertText(
    legacyRoadmapCssPath,
    /\.brand-subtitle \{ font-family: "Orbitron", "Aptos", "Trebuchet MS", sans-serif !important; \}/,
    (input) =>
      `${input.trimEnd()}\n.brand-subtitle { font-family: "Orbitron", "Aptos", "Trebuchet MS", sans-serif !important; text-transform: none !important; letter-spacing: 0.12em !important; }\n`
  );
  upsertText(
    legacyRoadmapCssPath,
    /\.header-content \{ position: relative !important; overflow: visible !important; \}/,
    (input) =>
      `${input.trimEnd()}\n.header-content { position: relative !important; overflow: visible !important; }\n`
  );
  upsertText(
    legacyRoadmapCssPath,
    /\.brand-left \{ position: relative !important; padding-left: 0 !important; min-height: 0 !important; align-items: center !important; \}/,
    (input) =>
      `${input.trimEnd()}\n.brand-left { position: relative !important; padding-left: 0 !important; min-height: 0 !important; align-items: center !important; }\n`
  );
  upsertText(
    legacyRoadmapCssPath,
    /\.brand-left \.brand-icon \{ position: static !important; left: auto !important; top: auto !important; transform: none !important; width: 78px !important; height: 78px !important; border-radius: 10px !important; margin-right: 8px !important; \}/,
    (input) =>
      `${input.trimEnd()}\n.brand-left .brand-icon { position: static !important; left: auto !important; top: auto !important; transform: none !important; width: 78px !important; height: 78px !important; border-radius: 10px !important; margin-right: 8px !important; }\n`
  );
  upsertText(
    legacyRoadmapCssPath,
    /@media \(max-width: 1100px\) \{[\s\S]*?\.brand-left \.brand-icon \{ position: static !important; left: auto !important; top: auto !important; transform: none !important; width: 62px !important; height: 62px !important; margin-right: 6px !important; \}[\s\S]*?\}/,
    (input) =>
      `${input.trimEnd()}\n@media (max-width: 1100px) {\n  .brand-left { padding-left: 0 !important; min-height: 0 !important; }\n  .brand-left .brand-icon { position: static !important; left: auto !important; top: auto !important; transform: none !important; width: 62px !important; height: 62px !important; margin-right: 6px !important; }\n}\n`
  );
  upsertText(
    legacyRoadmapCssPath,
    /\.brand-left h1 \{ font-size: 1\.02rem !important; line-height: 1\.05 !important; \}/,
    (input) =>
      `${input.trimEnd()}\n.brand-left h1 { font-size: 1.02rem !important; line-height: 1.05 !important; }\n`
  );
  upsertText(
    legacyRoadmapCssPath,
    /\.brand-subtitle \{ font-size: 0\.74rem !important; \}/,
    (input) =>
      `${input.trimEnd()}\n.brand-subtitle { font-size: 0.74rem !important; }\n`
  );

  log("applied branding overrides: Zo-Qore naming and logo set as primary brand");
}

function applyCustomLegacyOverrides() {
  if (!fs.existsSync(customLegacySource)) {
    return;
  }

  const fileMap = [
    { source: path.join(root, "zo", "ui-shell", "custom", "index.html"), target: path.join(destination, "index.html") },
    { source: path.join(root, "zo", "ui-shell", "custom", "roadmap.css"), target: path.join(destination, "roadmap.css") },
    { source: path.join(root, "zo", "ui-shell", "custom", "roadmap.js"), target: path.join(destination, "roadmap.js") },
    { source: path.join(customLegacySource, "legacy-index.html"), target: path.join(destination, "legacy-index.html") },
    { source: path.join(customLegacySource, "legacy-roadmap.css"), target: path.join(destination, "legacy-roadmap.css") },
    { source: path.join(customLegacySource, "main.js"), target: path.join(destination, "legacy", "main.js") },
    { source: path.join(customLegacySource, "skill-selection.js"), target: path.join(destination, "legacy", "skill-selection.js") },
    { source: path.join(customLegacySource, "intent-assistant.js"), target: path.join(destination, "legacy", "intent-assistant.js") },
  ];

  for (const mapping of fileMap) {
    if (!fs.existsSync(mapping.source)) continue;
    ensureDir(path.dirname(mapping.target));
    fs.copyFileSync(mapping.source, mapping.target);
  }

  log("applied custom legacy UI overrides");
}

function main() {
  const backupDir = createBackup(destination);
  removeIfExists(destination);
  ensureDir(destination);

  const forceRemote = process.env.FAILSAFE_UI_SOURCE === "remote";
  const forceLocal = process.env.FAILSAFE_UI_SOURCE === "local";

  if (forceLocal) {
    try {
      syncFromLocal();
      applyZoQoreBannerOverlay();
      applyBrandingOverrides();
      applyCustomLegacyOverrides();
      log(`synced ${countFiles(destination)} files to ${destination}`);
      return;
    } catch (error) {
      restoreBackup(destination, backupDir);
      throw error;
    } finally {
      removeIfExists(backupDir);
    }
  }

  if (!forceRemote && fs.existsSync(localSource)) {
    try {
      syncFromLocal();
      applyZoQoreBannerOverlay();
      applyBrandingOverrides();
      applyCustomLegacyOverrides();
      log(`synced ${countFiles(destination)} files to ${destination}`);
      return;
    } catch (error) {
      restoreBackup(destination, backupDir);
      throw error;
    } finally {
      removeIfExists(backupDir);
    }
  }

  try {
    syncFromRemoteGit();
    applyZoQoreBannerOverlay();
    applyBrandingOverrides();
    applyCustomLegacyOverrides();
    log(`synced ${countFiles(destination)} files to ${destination}`);
  } catch (error) {
    try {
      removeIfExists(destination);
      ensureDir(destination);
      syncFromRemoteRaw();
      applyZoQoreBannerOverlay();
      applyBrandingOverrides();
      applyCustomLegacyOverrides();
      log(`synced ${countFiles(destination)} files to ${destination}`);
    } catch (rawError) {
      restoreBackup(destination, backupDir);
      throw rawError;
    }
  } finally {
    removeIfExists(backupDir);
  }
}

Promise.resolve()
  .then(main)
  .catch((error) => {
  log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
  });
