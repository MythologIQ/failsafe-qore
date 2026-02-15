import * as http from "http";
import { afterEach, describe, expect, it } from "vitest";
import { QoreUiShellServer } from "../zo/ui-shell/server";

function withRuntimeStub(handler: (url: string) => Promise<void>): Promise<void> {
  const server = http.createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";

    if (method === "GET" && url === "/health") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ status: "ok", initialized: true }));
      return;
    }
    if (method === "GET" && url === "/policy/version") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ policyVersion: "policy-test-v1" }));
      return;
    }
    if (method === "POST" && url === "/evaluate") {
      let raw = "";
      for await (const chunk of req) {
        raw += Buffer.from(chunk).toString("utf8");
      }
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ decision: "ALLOW", echo: JSON.parse(raw || "{}") }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("stub server address not available"));
        return;
      }
      try {
        await handler(`http://127.0.0.1:${address.port}`);
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
  });
}

const startedServers: QoreUiShellServer[] = [];
const savedEnv = { ...process.env };

afterEach(async () => {
  while (startedServers.length > 0) {
    const next = startedServers.pop();
    if (next) await next.stop();
  }
  process.env = { ...savedEnv };
});

describe("QoreUiShellServer", () => {
  it("serves hub and evaluate proxy successfully", async () => {
    await withRuntimeStub(async (runtimeBaseUrl) => {
      const ui = new QoreUiShellServer({
        host: "127.0.0.1",
        port: 0,
        runtimeBaseUrl,
        runtimeApiKey: "test-key",
      });
      startedServers.push(ui);
      await ui.start();
      const uiAddr = ui.getAddress();
      const baseUrl = `http://127.0.0.1:${uiAddr.port}`;

      const hubRes = await fetch(`${baseUrl}/api/hub`);
      expect(hubRes.status).toBe(200);
      expect(hubRes.headers.get("x-content-type-options")).toBe("nosniff");
      expect(hubRes.headers.get("x-frame-options")).toBe("DENY");
      const hub = (await hubRes.json()) as { qoreRuntime?: { connected?: boolean; policyVersion?: string } };
      expect(hub.qoreRuntime?.connected).toBe(true);
      expect(hub.qoreRuntime?.policyVersion).toBe("policy-test-v1");

      const monitorRes = await fetch(`${baseUrl}/ui/monitor`);
      expect(monitorRes.status).toBe(200);

      const consoleRes = await fetch(`${baseUrl}/ui/console`);
      expect(consoleRes.status).toBe(200);
      const consoleHtml = await consoleRes.text();
      expect(consoleHtml.includes('data-route="skills"')).toBe(true);
      expect(consoleHtml.includes('data-route="library"')).toBe(true);
      expect(consoleHtml.includes('id="intent-template"')).toBe(true);
      expect(consoleHtml.includes('<option value="planning">Planning</option>')).toBe(true);
      expect(consoleHtml.includes('id="intent-model-mode"')).toBe(true);
      expect(consoleHtml.includes('id="intent-skill-select"')).toBe(true);
      expect(consoleHtml.includes('id="intent-context-input"')).toBe(true);
      expect(consoleHtml.includes('id="intent-send"')).toBe(true);
      expect(consoleHtml.includes('id="intent-chat-output"')).toBe(true);
      expect(consoleHtml.includes('id="intent-chat-logs"')).toBe(true);
      expect(consoleHtml.includes('id="intent-chat-log-modal"')).toBe(true);
      expect(consoleHtml.includes('id="session-chat-id"')).toBe(true);
      expect(consoleHtml.includes('id="session-chat-new"')).toBe(true);
      expect(consoleHtml.includes('id="session-chat-memory"')).toBe(true);
      expect(consoleHtml.includes("Open Skill Library")).toBe(false);
      expect(consoleHtml.includes('id="intent-copy"')).toBe(false);
      expect(consoleHtml.includes('id="skill-scribe-generate"')).toBe(true);
      expect(consoleHtml.includes('id="skill-scribe-add-context"')).toBe(true);
      expect(consoleHtml.includes('id="skill-scribe-context-log"')).toBe(true);
      expect(consoleHtml.includes('id="skill-scribe-alert"')).toBe(true);
      expect(consoleHtml.includes("Prompt Pipeline")).toBe(true);
      expect(consoleHtml.includes("Skill Library")).toBe(true);
      expect(consoleHtml.includes('data-route="persona"')).toBe(true);
      expect(consoleHtml.includes('data-route="workflows"')).toBe(true);
      expect(consoleHtml.includes('data-route="projects"')).toBe(true);
      expect(consoleHtml.includes("Persona profile management UI is in progress")).toBe(true);
      expect(consoleHtml.includes("Workflow authoring and sequencing controls are in progress")).toBe(true);
      expect(consoleHtml.includes('data-view="gantt"')).toBe(true);
      expect(consoleHtml.includes('data-view="kanban"')).toBe(true);
      expect(consoleHtml.includes("Persona Management UI is planned")).toBe(true);
      expect(consoleHtml.includes("Add Projects tab with project selector")).toBe(true);
      expect(consoleHtml.includes("Add dedicated Agent Persona and Workflows tabs")).toBe(true);
      expect(consoleHtml.includes(">Comms<")).toBe(true);
      expect(consoleHtml.includes('id="session-user"')).toBe(true);
      expect(consoleHtml.includes('id="session-logout"')).toBe(true);
      expect(consoleHtml.includes('id="settings-gear"')).toBe(true);
      expect(consoleHtml.includes("Open Source Beta")).toBe(true);
      expect(consoleHtml.includes("Build Zo-Qore With Us")).toBe(true);
      expect(consoleHtml.includes("Join the Beta on GitHub")).toBe(true);
      expect(consoleHtml.includes("https://github.com/MythologIQ/failsafe-qore")).toBe(true);
      expect(consoleHtml.includes('src="/zoqore-side-banner.png"')).toBe(true);
      expect(consoleHtml.includes("Activity Logs")).toBe(true);
      expect(consoleHtml.includes('data-route="activity" type="button"')).toBe(false);
      expect(consoleHtml.includes('data-route="settings" type="button"')).toBe(false);
      expect(consoleHtml.indexOf('data-route="skills"')).toBeLessThan(
        consoleHtml.indexOf('data-route="run"'),
      );
      expect(consoleHtml.indexOf('data-route="governance"')).toBeLessThan(
        consoleHtml.indexOf('data-route="library"'),
      );

      const routesRes = await fetch(`${baseUrl}/api/ui/routes`);
      expect(routesRes.status).toBe(200);
      const routes = (await routesRes.json()) as { monitor?: string; console?: string };
      expect(routes.monitor).toBe("/ui/monitor");
      expect(routes.console).toBe("/ui/console");

      const secRes = await fetch(`${baseUrl}/api/admin/security`);
      expect(secRes.status).toBe(200);
      const sec = (await secRes.json()) as { sessions?: { activeMfaSessions?: number } };
      expect(typeof sec.sessions?.activeMfaSessions).toBe("number");

      const evalRes = await fetch(`${baseUrl}/api/qore/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: "req-ui-1",
          actorId: "did:myth:test",
          action: "read",
          targetPath: "repo://docs/readme.md",
        }),
      });
      expect(evalRes.status).toBe(200);
      const evalBody = (await evalRes.json()) as { decision?: string };
      expect(evalBody.decision).toBe("ALLOW");
    });
  });

  it("enforces admin token and exposes session and MFA recovery controls", async () => {
    await withRuntimeStub(async (runtimeBaseUrl) => {
      process.env.QORE_UI_REQUIRE_ADMIN_TOKEN = "true";
      process.env.QORE_UI_ADMIN_TOKEN = "test-admin-token";

      const ui = new QoreUiShellServer({
        host: "127.0.0.1",
        port: 0,
        runtimeBaseUrl,
        runtimeApiKey: "test-key",
      });
      startedServers.push(ui);
      await ui.start();
      const uiAddr = ui.getAddress();
      const baseUrl = `http://127.0.0.1:${uiAddr.port}`;

      const denied = await fetch(`${baseUrl}/api/admin/security`);
      expect(denied.status).toBe(401);

      const headers = { "x-qore-admin-token": "test-admin-token", "content-type": "application/json" };
      const security = await fetch(`${baseUrl}/api/admin/security`, { headers });
      expect(security.status).toBe(200);
      const secBody = (await security.json()) as { auth?: { requireAdminToken?: boolean; adminTokenConfigured?: boolean } };
      expect(secBody.auth?.requireAdminToken).toBe(true);
      expect(secBody.auth?.adminTokenConfigured).toBe(true);

      const sessions = await fetch(`${baseUrl}/api/admin/sessions`, { headers });
      expect(sessions.status).toBe(200);
      const sessionBody = (await sessions.json()) as { sessions?: unknown[] };
      expect(Array.isArray(sessionBody.sessions)).toBe(true);

      const devices = await fetch(`${baseUrl}/api/admin/devices`, { headers });
      expect(devices.status).toBe(200);
      const deviceBody = (await devices.json()) as { devices?: unknown[] };
      expect(Array.isArray(deviceBody.devices)).toBe(true);

      const mfaReset = await fetch(`${baseUrl}/api/admin/mfa/recovery/reset`, {
        method: "POST",
        headers,
        body: JSON.stringify({ confirm: "RESET_MFA" }),
      });
      expect(mfaReset.status).toBe(200);
      const resetBody = (await mfaReset.json()) as { secret?: string; otpAuthUrl?: string };
      expect((resetBody.secret ?? "").length).toBeGreaterThan(10);
      expect(String(resetBody.otpAuthUrl ?? "").startsWith("otpauth://")).toBe(true);

      const revoke = await fetch(`${baseUrl}/api/admin/sessions/revoke`, {
        method: "POST",
        headers,
        body: JSON.stringify({ all: true }),
      });
      expect(revoke.status).toBe(200);
      const revokeBody = (await revoke.json()) as { mode?: string };
      expect(revokeBody.mode).toBe("all");
    });
  });

  it("supports IDE panel embedding headers when enabled", async () => {
    await withRuntimeStub(async (runtimeBaseUrl) => {
      process.env.QORE_UI_ALLOW_FRAME_EMBED = "true";
      process.env.QORE_UI_FRAME_ANCESTORS = "'self' https://*.vscode-cdn.net vscode-webview:";

      const ui = new QoreUiShellServer({
        host: "127.0.0.1",
        port: 0,
        runtimeBaseUrl,
        runtimeApiKey: "test-key",
      });
      startedServers.push(ui);
      await ui.start();
      const uiAddr = ui.getAddress();
      const baseUrl = `http://127.0.0.1:${uiAddr.port}`;

      const monitorRes = await fetch(`${baseUrl}/ui/monitor`);
      expect(monitorRes.status).toBe(200);
      expect(monitorRes.headers.get("x-frame-options")).toBeNull();
      const csp = String(monitorRes.headers.get("content-security-policy") ?? "");
      expect(csp.includes("frame-ancestors")).toBe(true);
      expect(csp.includes("vscode-webview:")).toBe(true);
    });
  });

  it("serves monitor and console routes with trailing slash variants", async () => {
    await withRuntimeStub(async (runtimeBaseUrl) => {
      const ui = new QoreUiShellServer({
        host: "127.0.0.1",
        port: 0,
        runtimeBaseUrl,
        runtimeApiKey: "test-key",
      });
      startedServers.push(ui);
      await ui.start();
      const uiAddr = ui.getAddress();
      const baseUrl = `http://127.0.0.1:${uiAddr.port}`;

      const monitorSlash = await fetch(`${baseUrl}/ui/monitor/`);
      expect(monitorSlash.status).toBe(200);

      const consoleSlash = await fetch(`${baseUrl}/ui/console/`);
      expect(consoleSlash.status).toBe(200);
    });
  });
});
