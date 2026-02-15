import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as crypto from "crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { RuntimeError } from "../../runtime/service/errors";
import { getSecretStore } from "../../runtime/support/SecureSecretStore";
import { getUpdateManager } from "./update-manager";
import {
  encodeBase32,
  generateSessionToken,
  parseCookies,
  verifyTotpCode,
} from "./mfa";

type JsonResult =
  | { ok: true; status: number; body: unknown; latencyMs: number }
  | { ok: false; error: string; detail?: string };

type RuntimeSnapshot = {
  enabled: boolean;
  connected: boolean;
  baseUrl: string;
  policyVersion?: string;
  latencyMs?: number;
  lastCheckedAt: string;
  error?: string;
};

type PlanArtifact = { id: string; title: string; touched: boolean };

type PlanPhase = {
  id: string;
  title: string;
  status: "pending" | "active" | "completed";
  progress?: number;
  artifacts: PlanArtifact[];
};

type Blocker = {
  id: string;
  title: string;
  reason: string;
  severity: "soft" | "hard";
  resolvedAt?: string;
};

type Risk = { id: string; title: string; level: "info" | "watch" | "danger" };

type Milestone = {
  id: string;
  title: string;
  completedAt?: string;
  targetDate?: string;
};

type ActivePlan = {
  id: string;
  title: string;
  currentPhaseId: string;
  phases: PlanPhase[];
  blockers: Blocker[];
  milestones: Milestone[];
  risks: Risk[];
  updatedAt: string;
};

type Verdict = {
  decision: "PASS" | "WARN" | "BLOCK" | "ESCALATE" | "QUARANTINE";
  summary: string;
  timestamp: string;
  reason?: string;
  filePath?: string;
};

type SkillRecord = {
  id: string;
  displayName: string;
  localName: string;
  key: string;
  label: string;
  desc: string;
  creator: string;
  sourceRepo: string;
  sourcePath: string;
  versionPin: string;
  trustTier: string;
  sourceType: string;
  sourcePriority: number;
  admissionState: string;
  requiredPermissions: string[];
};

type CheckpointRecord = {
  checkpointId: string;
  runId: string;
  checkpointType: string;
  phase: string;
  policyVerdict: string;
  timestamp: string;
};

type MfaSessionRecord = {
  tokenId: string;
  createdAt: number;
  expiresAt: number;
  clientIp: string;
  userAgent: string;
  deviceId: string;
  lastSeenAt: number;
};

type AuthSessionRecord = {
  tokenId: string;
  createdAt: number;
  expiresAt: number;
  clientIp: string;
  userAgent: string;
  deviceId: string;
  lastSeenAt: number;
};

type HubPayload = {
  generatedAt: string;
  activePlan: ActivePlan;
  currentSprint: { id: string; name: string; status: string };
  sprints: Array<{ id: string; name: string; status: string }>;
  sentinelStatus: {
    running: boolean;
    queueDepth: number;
    lastVerdict: {
      decision: "PASS" | "WARN" | "BLOCK" | "ESCALATE" | "QUARANTINE";
      summary: string;
    };
  };
  l3Queue: Array<{
    id: string;
    actor: string;
    filePath: string;
    riskGrade: string;
    requestedAt: string;
  }>;
  recentVerdicts: Verdict[];
  trustSummary: {
    totalAgents: number;
    avgTrust: number;
    quarantined: number;
    stageCounts: { CBT: number; KBT: number; IBT: number };
  };
  nodeStatus: Array<{
    id: string;
    label: string;
    state: "nominal" | "degraded" | "offline";
  }>;
  checkpointSummary: {
    total: number;
    chainValid: boolean;
    latestType: string;
    latestVerdict: string;
    latestAt: string;
  };
  recentCheckpoints: CheckpointRecord[];
  qoreRuntime: RuntimeSnapshot;
  monitor: {
    state: "connected" | "degraded" | "offline";
    statusLine: string;
    recommendation: string;
  };
};

export interface QoreUiShellOptions {
  host?: string;
  port?: number;
  runtimeBaseUrl: string;
  runtimeApiKey?: string;
  zoApiBaseUrl?: string;
  requestTimeoutMs?: number;
  assetsDir?: string;
}

export class QoreUiShellServer {
  private server: http.Server | undefined;
  private ws: WebSocketServer | undefined;
  private refreshTimer: NodeJS.Timeout | undefined;
  private readonly assetsDir: string;
  private readonly requireUiAuth: boolean;
  private readonly requireUiMfa: boolean;
  private readonly requireAdminToken: boolean;
  private uiAuthUser: string;
  private uiAuthPass: string;
  private readonly uiAdminToken: string;
  private uiTotpSecret: string;
  private readonly uiSessionSecret: string;
  private readonly uiSessionTtlMs: number;
  private readonly allowedIps: string[];
  private readonly authMaxFailures: number;
  private readonly authLockoutMs: number;
  private readonly mfaMaxFailures: number;
  private readonly mfaLockoutMs: number;
  private readonly trustProxyHeaders: boolean;
  private readonly allowFrameEmbedding: boolean;
  private readonly frameAncestors: string;
  private readonly mfaSessions = new Map<string, MfaSessionRecord>();
  private readonly authSessions = new Map<string, AuthSessionRecord>();
  private readonly authFailures = new Map<
    string,
    { count: number; lockUntil: number }
  >();
  private readonly mfaFailures = new Map<
    string,
    { count: number; lockUntil: number }
  >();
  private readonly skills: SkillRecord[] = [];
  private monitoringEnabled = true;
  private checkpointStore: CheckpointRecord[] = [];

  private readonly activePlan: ActivePlan = {
    id: "zo-standalone-plan",
    title: "FailSafe-Qore Zo Execution",
    currentPhaseId: "phase-implement",
    phases: [
      {
        id: "phase-plan",
        title: "Plan",
        status: "completed",
        progress: 100,
        artifacts: [
          { id: "plan-doc", title: "Architecture Plan", touched: true },
        ],
      },
      {
        id: "phase-audit",
        title: "Audit",
        status: "completed",
        progress: 100,
        artifacts: [
          { id: "audit-doc", title: "Adversarial Review", touched: true },
        ],
      },
      {
        id: "phase-implement",
        title: "Implement",
        status: "active",
        progress: 70,
        artifacts: [{ id: "zo-runtime", title: "Zo Runtime", touched: true }],
      },
      {
        id: "phase-debug",
        title: "Debug",
        status: "pending",
        progress: 0,
        artifacts: [
          { id: "perf-report", title: "Performance Report", touched: false },
        ],
      },
      {
        id: "phase-substantiate",
        title: "Substantiate",
        status: "pending",
        progress: 0,
        artifacts: [
          { id: "release-pack", title: "Release Bundle", touched: false },
        ],
      },
    ],
    blockers: [],
    milestones: [
      {
        id: "m-zo-discovery",
        title: "Zo environment discovery completed",
        completedAt: new Date().toISOString(),
      },
    ],
    risks: [],
    updatedAt: new Date().toISOString(),
  };

  constructor(private readonly options: QoreUiShellOptions) {
    this.assetsDir = this.resolveAssetsDir(options.assetsDir);

    // Load secrets from SecureSecretStore (reads ~/.config/failsafe-qore/secrets.env)
    const secrets = getSecretStore().getAllSecrets();
    this.uiAuthUser = String(secrets.QORE_UI_BASIC_AUTH_USER ?? "");
    this.uiAuthPass = String(secrets.QORE_UI_BASIC_AUTH_PASS ?? "");
    this.uiAdminToken = String(secrets.QORE_UI_ADMIN_TOKEN ?? "").trim();
    this.uiTotpSecret = String(secrets.QORE_UI_TOTP_SECRET ?? "").trim();
    this.uiSessionSecret =
      String(process.env.QORE_UI_SESSION_SECRET ?? "").trim() ||
      crypto.randomBytes(32).toString("hex");
    this.uiSessionTtlMs = Number(
      process.env.QORE_UI_SESSION_TTL_MS ?? "43200000",
    );
    this.allowedIps = String(process.env.QORE_UI_ALLOWED_IPS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    this.authMaxFailures = Number(process.env.QORE_UI_AUTH_MAX_FAILURES ?? "6");
    this.authLockoutMs = Number(
      process.env.QORE_UI_AUTH_LOCKOUT_MS ?? "900000",
    );
    this.mfaMaxFailures = Number(process.env.QORE_UI_MFA_MAX_FAILURES ?? "6");
    this.mfaLockoutMs = Number(process.env.QORE_UI_MFA_LOCKOUT_MS ?? "900000");
    this.trustProxyHeaders =
      String(
        process.env.QORE_UI_TRUST_PROXY_HEADERS ?? "false",
      ).toLowerCase() === "true";
    this.allowFrameEmbedding =
      String(process.env.QORE_UI_ALLOW_FRAME_EMBED ?? "false").toLowerCase() ===
      "true";
    this.frameAncestors =
      String(process.env.QORE_UI_FRAME_ANCESTORS ?? "'self'").trim() ||
      "'self'";
    const defaultRequireAuth = (options.host ?? "127.0.0.1") === "0.0.0.0";
    const defaultRequireAdminToken =
      (options.host ?? "127.0.0.1") === "0.0.0.0";
    this.requireUiAuth =
      String(
        process.env.QORE_UI_REQUIRE_AUTH ??
          (defaultRequireAuth ? "true" : "false"),
      ).toLowerCase() === "true";
    // MFA is always opt-in - user must explicitly enable via env var
    this.requireUiMfa =
      String(process.env.QORE_UI_REQUIRE_MFA ?? "false").toLowerCase() ===
      "true";
    this.requireAdminToken =
      String(
        process.env.QORE_UI_REQUIRE_ADMIN_TOKEN ??
          (defaultRequireAdminToken ? "true" : "false"),
      ).toLowerCase() === "true";
    this.seedDefaultCheckpoints();
  }

  async start(): Promise<void> {
    if (this.server) return;

    this.server = http.createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (error) {
        this.sendJson(res, 500, {
          error: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "unknown error",
        });
      }
    });

    this.ws = new WebSocketServer({ server: this.server });
    this.ws.on("connection", (client, req) => {
      const clientIp = this.getClientIp(req);
      if (!this.isClientAllowed(clientIp)) {
        client.close(1008, "IP denied");
        return;
      }
      if (!this.isAuthorized(req.headers.authorization)) {
        client.close(1008, "Unauthorized");
        return;
      }
      if (this.requireUiMfa && !this.isMfaAuthorized(req.headers.cookie)) {
        client.close(1008, "MFA required");
        return;
      }
      this.sendWs(client, {
        type: "init",
        payload: this.buildHubPayloadSync(),
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(
        this.options.port ?? 9380,
        this.options.host ?? "127.0.0.1",
        () => resolve(),
      );
    });

    this.refreshTimer = setInterval(() => {
      this.broadcast({ type: "hub.refresh" });
    }, 15000);
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => (error ? reject(error) : resolve()));
    });
    this.server = undefined;
  }

  getAddress(): { host: string; port: number } {
    if (!this.server)
      throw new RuntimeError("NOT_INITIALIZED", "UI server not started");
    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new RuntimeError(
        "NOT_INITIALIZED",
        "UI server address unavailable",
      );
    }
    return {
      host: address.address,
      port: address.port,
    };
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;

    if (method === "GET" && pathname === "/mfa") {
      return this.serveMfaPage(req, res);
    }

    if (method === "GET" && pathname === "/login") {
      return this.serveLoginPage(req, res);
    }

    if (method === "GET" && pathname === "/settings") {
      return this.serveSettingsPage(req, res);
    }

    if (method === "GET" && pathname === "/updates") {
      return this.serveUpdatesPage(req, res);
    }

    if (method === "POST" && pathname === "/api/auth/login") {
      return this.handleAuthLogin(req, res);
    }

    if (method === "POST" && pathname === "/mfa/verify") {
      return this.handleMfaVerify(req, res);
    }

    if (!this.enforceAuth(req, res, pathname)) {
      return;
    }

    if (method === "GET" && pathname === "/health") {
      const runtime = await this.fetchRuntimeSnapshot();
      return this.sendJson(res, 200, {
        ready:
          this.hasUiAsset("index.html") || this.hasUiAsset("legacy-index.html"),
        assetsDir: this.assetsDir,
        runtime,
      });
    }

    if (method === "GET" && pathname === "/api/hub") {
      const payload = await this.buildHubPayload();
      return this.sendJson(res, 200, payload);
    }

    if (method === "GET" && pathname === "/api/roadmap") {
      return this.sendJson(res, 200, {
        activePlan: this.activePlan,
        currentSprint: {
          id: "zo-standalone",
          name: "Zo Standalone Runtime",
          status: "active",
        },
        sprints: [
          {
            id: "zo-standalone",
            name: "Zo Standalone Runtime",
            status: "active",
          },
        ],
      });
    }

    if (method === "GET" && pathname === "/api/plans") {
      return this.sendJson(res, 200, {
        plans: [this.activePlan],
        activePlanId: this.activePlan.id,
      });
    }

    if (method === "GET" && pathname.startsWith("/api/sprint/")) {
      const sprintId =
        pathname.substring("/api/sprint/".length) || "zo-standalone";
      return this.sendJson(res, 200, {
        sprint: {
          id: sprintId,
          name: "Zo Standalone Runtime",
          status: "active",
          planId: this.activePlan.id,
        },
      });
    }

    if (method === "GET" && pathname === "/api/skills") {
      return this.sendJson(res, 200, { skills: this.skills });
    }

    if (method === "POST" && pathname === "/api/skills/ingest/auto") {
      this.broadcast({ type: "event", payload: { skillEvent: "auto_ingest" } });
      return this.sendJson(res, 200, { ingested: 0, skills: this.skills });
    }

    if (method === "POST" && pathname === "/api/skills/ingest/manual") {
      const body = (await this.readBody(req)) as { items?: unknown[] };
      const count = Array.isArray(body?.items) ? body.items.length : 0;
      this.broadcast({
        type: "event",
        payload: { skillEvent: "manual_ingest", count },
      });
      return this.sendJson(res, 200, { ingested: 0, skills: this.skills });
    }

    if (method === "GET" && pathname === "/api/skills/relevance") {
      const phase = String(url.searchParams.get("phase") ?? "plan");
      return this.sendJson(res, 200, {
        phase,
        recommended: [],
        allRelevant: [],
        otherAvailable: [],
      });
    }

    if (method === "GET" && pathname === "/api/checkpoints") {
      return this.sendJson(res, 200, {
        chainValid: true,
        checkpoints: this.checkpointStore,
      });
    }

    if (method === "GET" && pathname === "/api/admin/security") {
      const now = Date.now();
      return this.sendJson(res, 200, {
        auth: {
          requireAuth: this.requireUiAuth,
          requireMfa: this.requireUiMfa,
          requireAdminToken: this.requireAdminToken,
          adminTokenConfigured: Boolean(this.uiAdminToken),
          allowedIps: this.allowedIps,
          trustProxyHeaders: this.trustProxyHeaders,
          authMaxFailures: this.authMaxFailures,
          authLockoutMs: this.authLockoutMs,
          mfaMaxFailures: this.mfaMaxFailures,
          mfaLockoutMs: this.mfaLockoutMs,
        },
        sessions: {
          activeMfaSessions: [...this.mfaSessions.values()].filter(
            (session) => session.expiresAt > now,
          ).length,
        },
      });
    }

    if (method === "GET" && pathname === "/api/admin/sessions") {
      return this.sendJson(res, 200, {
        sessions: this.listSessions(),
      });
    }

    if (method === "GET" && pathname === "/api/admin/devices") {
      const devices = new Map<
        string,
        {
          deviceId: string;
          sessions: number;
          latestSeenAt: string;
          ips: string[];
          userAgent: string;
        }
      >();
      for (const session of this.listSessions()) {
        const existing = devices.get(session.deviceId) ?? {
          deviceId: session.deviceId,
          sessions: 0,
          latestSeenAt: session.lastSeenAt,
          ips: [],
          userAgent: session.userAgent,
        };
        existing.sessions += 1;
        existing.latestSeenAt =
          existing.latestSeenAt > session.lastSeenAt
            ? existing.latestSeenAt
            : session.lastSeenAt;
        if (!existing.ips.includes(session.clientIp)) {
          existing.ips.push(session.clientIp);
        }
        devices.set(session.deviceId, existing);
      }
      return this.sendJson(res, 200, {
        devices: [...devices.values()].sort((a, b) =>
          a.latestSeenAt < b.latestSeenAt ? 1 : -1,
        ),
      });
    }

    if (method === "POST" && pathname === "/api/admin/sessions/revoke") {
      const body = (await this.readBody(req)) as {
        all?: boolean;
        sessionId?: string;
        deviceId?: string;
      };
      let revoked = 0;
      if (body?.all === true) {
        revoked = this.mfaSessions.size;
        this.mfaSessions.clear();
      } else if (body?.sessionId) {
        const before = this.mfaSessions.size;
        for (const [token, session] of this.mfaSessions.entries()) {
          if (session.tokenId === body.sessionId) {
            this.mfaSessions.delete(token);
          }
        }
        revoked = before - this.mfaSessions.size;
      } else if (body?.deviceId) {
        const before = this.mfaSessions.size;
        for (const [token, session] of this.mfaSessions.entries()) {
          if (session.deviceId === body.deviceId) {
            this.mfaSessions.delete(token);
          }
        }
        revoked = before - this.mfaSessions.size;
      } else {
        const token = parseCookies(req.headers.cookie).qore_ui_mfa;
        if (token && this.mfaSessions.has(token)) {
          this.mfaSessions.delete(token);
          revoked = 1;
        }
      }
      res.setHeader(
        "set-cookie",
        "qore_ui_mfa=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      );
      return this.sendJson(res, 200, {
        ok: true,
        revoked,
        mode:
          body?.all === true
            ? "all"
            : body?.sessionId
              ? "session"
              : body?.deviceId
                ? "device"
                : "current",
      });
    }

    if (method === "POST" && pathname === "/api/admin/mfa/recovery/reset") {
      const body = (await this.readBody(req)) as {
        confirm?: string;
        secret?: string;
        account?: string;
        issuer?: string;
      };
      if (String(body?.confirm ?? "") !== "RESET_MFA") {
        return this.sendJson(res, 400, {
          error: "CONFIRMATION_REQUIRED",
          message: "Set confirm=RESET_MFA to rotate MFA secret.",
        });
      }
      const nextSecret =
        this.normalizeTotpSecret(body?.secret) ??
        encodeBase32(crypto.randomBytes(20));
      this.uiTotpSecret = nextSecret;
      const account = String(
        body?.account ?? process.env.QORE_MFA_ACCOUNT ?? "failsafe-admin",
      );
      const issuer = String(
        body?.issuer ?? process.env.QORE_MFA_ISSUER ?? "FailSafe-Qore",
      );
      const otpAuthUrl = this.buildOtpAuthUrl(nextSecret, account, issuer);
      const revokedSessions = this.mfaSessions.size;
      this.mfaSessions.clear();
      return this.sendJson(res, 200, {
        ok: true,
        secret: nextSecret,
        otpAuthUrl,
        revokedSessions,
      });
    }

    // Settings API - get current settings state
    if (method === "GET" && pathname === "/api/settings") {
      return this.sendJson(res, 200, {
        hasCredentials: Boolean(this.uiAuthUser && this.uiAuthPass),
        username: this.uiAuthUser || null,
        mfaEnabled: this.requireUiMfa,
        mfaConfigured: Boolean(this.uiTotpSecret),
        configPath: getSecretStore().getUserConfigDir(),
      });
    }

    // Settings API - update credentials
    if (method === "POST" && pathname === "/api/settings/credentials") {
      const body = (await this.readBody(req)) as {
        username?: string;
        password?: string;
        currentPassword?: string;
      };

      // If credentials already exist, require current password
      if (this.uiAuthPass && body?.currentPassword !== this.uiAuthPass) {
        return this.sendJson(res, 401, {
          error: "INVALID_CURRENT_PASSWORD",
          message: "Current password is incorrect",
        });
      }

      const newUser = String(body?.username ?? "").trim();
      const newPass = String(body?.password ?? "");

      if (!newUser || !newPass) {
        return this.sendJson(res, 400, {
          error: "INVALID_INPUT",
          message: "Username and password are required",
        });
      }

      if (newPass.length < 8) {
        return this.sendJson(res, 400, {
          error: "WEAK_PASSWORD",
          message: "Password must be at least 8 characters",
        });
      }

      // Save to SecureSecretStore
      const store = getSecretStore();
      const secrets = store.getAllSecrets();
      secrets.QORE_UI_BASIC_AUTH_USER = newUser;
      secrets.QORE_UI_BASIC_AUTH_PASS = newPass;
      store.writeSecrets(secrets);

      // Update in-memory values
      this.uiAuthUser = newUser;
      this.uiAuthPass = newPass;

      // Revoke all sessions so user must re-auth
      this.authSessions.clear();

      return this.sendJson(res, 200, {
        ok: true,
        message: "Credentials updated successfully",
        configPath: store.getUserConfigDir(),
      });
    }

    // Settings API - enable MFA
    if (method === "POST" && pathname === "/api/settings/mfa/enable") {
      const body = (await this.readBody(req)) as {
        account?: string;
        issuer?: string;
      };

      // Generate new TOTP secret
      const newSecret = encodeBase32(crypto.randomBytes(20));
      const account = String(body?.account ?? "failsafe-admin");
      const issuer = String(body?.issuer ?? "FailSafe-Qore");
      const otpAuthUrl = this.buildOtpAuthUrl(newSecret, account, issuer);

      // Save to SecureSecretStore
      const store = getSecretStore();
      const secrets = store.getAllSecrets();
      secrets.QORE_UI_TOTP_SECRET = newSecret;
      store.writeSecrets(secrets);

      // Update in-memory value
      this.uiTotpSecret = newSecret;

      return this.sendJson(res, 200, {
        ok: true,
        secret: newSecret,
        otpAuthUrl,
        message: "Scan the QR code with your authenticator app, then set QORE_UI_REQUIRE_MFA=true to enable",
      });
    }

    // Settings API - disable MFA
    if (method === "POST" && pathname === "/api/settings/mfa/disable") {
      const body = (await this.readBody(req)) as { code?: string };

      // Verify MFA code before disabling
      if (this.uiTotpSecret && this.requireUiMfa) {
        const code = String(body?.code ?? "");
        if (!verifyTotpCode(code, this.uiTotpSecret)) {
          return this.sendJson(res, 401, {
            error: "INVALID_CODE",
            message: "Invalid MFA code",
          });
        }
      }

      // Clear TOTP secret
      const store = getSecretStore();
      const secrets = store.getAllSecrets();
      delete secrets.QORE_UI_TOTP_SECRET;
      store.writeSecrets(secrets);

      // Update in-memory value
      this.uiTotpSecret = "";

      // Clear MFA sessions
      this.mfaSessions.clear();

      return this.sendJson(res, 200, {
        ok: true,
        message: "MFA has been disabled",
      });
    }

    // Updates API - get current version and update status
    if (method === "GET" && pathname === "/api/updates") {
      const mgr = getUpdateManager();
      const lastCheck = mgr.getLastCheckResult();
      const autoCheck = mgr.getAutoCheckSettings();
      return this.sendJson(res, 200, {
        currentVersion: mgr.getCurrentVersion(),
        lastCheck,
        autoCheck,
        canRollback: mgr.canRollback(),
        rollbackVersions: mgr.getRollbackVersions(),
      });
    }

    // Updates API - check for updates
    if (method === "POST" && pathname === "/api/updates/check") {
      const mgr = getUpdateManager();
      const result = await mgr.checkForUpdates();
      return this.sendJson(res, 200, result);
    }

    // Updates API - get update history
    if (method === "GET" && pathname === "/api/updates/history") {
      const mgr = getUpdateManager();
      return this.sendJson(res, 200, {
        history: mgr.getHistory(),
        backupDir: mgr.getBackupDir(),
      });
    }

    // Updates API - update auto-check settings
    if (method === "POST" && pathname === "/api/updates/settings") {
      const body = (await this.readBody(req)) as {
        autoCheckEnabled?: boolean;
        autoCheckIntervalMs?: number;
      };
      const mgr = getUpdateManager();
      mgr.setAutoCheckSettings(
        body.autoCheckEnabled ?? true,
        body.autoCheckIntervalMs,
      );
      return this.sendJson(res, 200, {
        ok: true,
        settings: mgr.getAutoCheckSettings(),
      });
    }

    // Updates API - create backup before update
    if (method === "POST" && pathname === "/api/updates/backup") {
      const mgr = getUpdateManager();
      const backupPath = await mgr.createBackup();
      return this.sendJson(res, 200, {
        ok: true,
        backupPath,
        version: mgr.getCurrentVersion(),
      });
    }

    // Updates API - record that an update was installed
    if (method === "POST" && pathname === "/api/updates/record") {
      const body = (await this.readBody(req)) as {
        version: string;
        installedBy?: string;
        releaseNotes?: string;
      };

      if (!body.version) {
        return this.sendJson(res, 400, {
          error: "VERSION_REQUIRED",
          message: "Version is required",
        });
      }

      const mgr = getUpdateManager();
      mgr.recordUpdate(
        body.version,
        body.installedBy || "ui",
        body.releaseNotes,
      );

      return this.sendJson(res, 200, {
        ok: true,
        recorded: body.version,
      });
    }

    if (method === "POST" && pathname === "/api/actions/resume-monitoring") {
      this.monitoringEnabled = true;
      this.appendCheckpoint("monitoring.resumed", "phase-implement", "PASS");
      this.broadcast({ type: "hub.refresh" });
      return this.sendJson(res, 200, { ok: true, monitoring: "running" });
    }

    if (method === "POST" && pathname === "/api/actions/panic-stop") {
      this.monitoringEnabled = false;
      this.appendCheckpoint("monitoring.stopped", "phase-implement", "WARN");
      this.broadcast({ type: "hub.refresh" });
      return this.sendJson(res, 200, { ok: true, monitoring: "stopped" });
    }

    if (method === "GET" && pathname === "/api/qore/runtime") {
      const runtime = await this.fetchRuntimeSnapshot();
      return this.sendJson(res, 200, runtime);
    }

    if (method === "GET" && pathname === "/api/qore/health") {
      const runtimeHealth = await this.fetchQoreJson("/health");
      if (!runtimeHealth.ok) {
        return this.sendJson(res, 502, runtimeHealth);
      }
      return this.sendJson(res, 200, runtimeHealth.body);
    }

    if (method === "GET" && pathname === "/api/qore/policy-version") {
      const policy = await this.fetchQoreJson("/policy/version");
      if (!policy.ok) {
        return this.sendJson(res, 502, policy);
      }
      return this.sendJson(res, 200, policy.body);
    }

    if (method === "POST" && pathname === "/api/qore/evaluate") {
      const body = await this.readBody(req);
      const evaluate = await this.fetchQoreJson("/evaluate", "POST", body);
      if (!evaluate.ok) {
        return this.sendJson(res, 502, evaluate);
      }
      return this.sendJson(res, 200, evaluate.body);
    }

    // Prompt-specific governance evaluation endpoint
    if (method === "POST" && pathname === "/api/prompt/evaluate") {
      const body = await this.readBody(req);
      const promptPayload = body as { prompt?: string; projectId?: string; actorId?: string };
      const prompt = String(promptPayload?.prompt || "").trim();
      const projectId = String(promptPayload?.projectId || "default");
      const actorId = String(promptPayload?.actorId || "unknown");

      if (!prompt) {
        return this.sendJson(res, 400, { error: "prompt_required", detail: "Prompt text is required" });
      }

      // Import scanners dynamically to avoid startup cost
      try {
        const { scanForInjection, scanForJailbreak, scanForSensitiveData } = await import("../prompt-governance/scanners.js");
        const { countTokens } = await import("../prompt-governance/tokenizer.js");

        // Run all governance scans
        const injectionResult = scanForInjection(prompt, "standard");
        const jailbreakResult = scanForJailbreak(prompt);
        const sensitiveResult = scanForSensitiveData(prompt);
        const tokenCount = countTokens(prompt);

        // Determine decision
        let decision: "ALLOW" | "DENY" | "ESCALATE" | "WARN" = "ALLOW";
        const reasons: string[] = [];
        const gatesTriggered: string[] = [];

        if (injectionResult.detected && injectionResult.score > 0.7) {
          decision = "DENY";
          reasons.push(`Injection detected: ${injectionResult.reason || "suspicious patterns"}`);
          gatesTriggered.push("injection");
        }

        if (jailbreakResult.detected) {
          decision = "DENY";
          reasons.push(`Jailbreak pattern: ${jailbreakResult.matches.slice(0, 3).join(", ")}`);
          gatesTriggered.push("jailbreak");
        }

        if (sensitiveResult.detected && sensitiveResult.types.length > 0) {
          if (decision === "ALLOW") decision = "WARN";
          reasons.push(`Sensitive data detected: ${sensitiveResult.types.join(", ")}`);
          gatesTriggered.push("pii");
        }

        // Token budget check (default: 32000 tokens)
        const maxTokens = 32000;
        if (tokenCount > maxTokens) {
          decision = "DENY";
          reasons.push(`Token count ${tokenCount} exceeds limit of ${maxTokens}`);
          gatesTriggered.push("budget");
        }

        // Create audit entry hash
        const promptHash = crypto.createHash("sha256").update(prompt).digest("hex");

        return this.sendJson(res, 200, {
          decision,
          reasons,
          gatesTriggered,
          tokenCount,
          promptHash,
          injectionScore: injectionResult.score,
          jailbreakMatch: jailbreakResult.detected,
          sensitiveDataTypes: sensitiveResult.types,
          projectId,
          actorId,
        });
      } catch (scanError) {
        const errorMessage = scanError instanceof Error ? scanError.message : String(scanError);
        return this.sendJson(res, 500, { error: "scan_failed", detail: errorMessage });
      }
    }

    // Embedding generation endpoint
    if (method === "POST" && pathname === "/api/embeddings/generate") {
      const body = await this.readBody(req);
      const embeddingPayload = body as { text?: string };
      const text = String(embeddingPayload?.text || "").trim();

      if (!text) {
        return this.sendJson(res, 400, { error: "text_required", detail: "Text is required for embedding generation" });
      }

      try {
        const { LocalEmbeddingService } = await import("../embeddings/local-service.js");
        const service = new LocalEmbeddingService();
        const result = await service.embed(text);
        return this.sendJson(res, 200, {
          id: result.id,
          dimensions: result.vector.dimensions,
          model: result.vector.model,
          inputHash: result.inputHash,
          computedAt: result.computedAt,
        });
      } catch (embeddingError) {
        const errorMessage = embeddingError instanceof Error ? embeddingError.message : String(embeddingError);
        return this.sendJson(res, 500, { error: "embedding_failed", detail: errorMessage });
      }
    }

    // Similarity search endpoint
    if (method === "POST" && pathname === "/api/embeddings/similar") {
      const body = await this.readBody(req);
      const similarPayload = body as { vector?: number[]; k?: number; projectId?: string };
      const vector = similarPayload?.vector;
      const k = Number(similarPayload?.k ?? 10);
      const projectId = similarPayload?.projectId;

      if (!Array.isArray(vector) || vector.length === 0) {
        return this.sendJson(res, 400, { error: "vector_required", detail: "Vector array is required" });
      }

      try {
        const { createDuckDBClient } = await import("../storage/duckdb-client.js");
        const { EmbeddingSimilaritySearch } = await import("../embeddings/similarity.js");
        const client = await createDuckDBClient({ dbPath: ":memory:" });
        const search = new EmbeddingSimilaritySearch(client);
        const results = await search.findSimilar(vector, k, { projectId });
        await client.close();
        return this.sendJson(res, 200, { results });
      } catch (searchError) {
        const errorMessage = searchError instanceof Error ? searchError.message : String(searchError);
        return this.sendJson(res, 500, { error: "search_failed", detail: errorMessage });
      }
    }

    // Void UI session management endpoints
    if (method === "POST" && pathname === "/api/void/session") {
      const body = await this.readBody(req);
      const voidPayload = body as { projectId?: string; mode?: string };
      const projectId = String(voidPayload?.projectId || "default-project");
      const mode = String(voidPayload?.mode || "genesis");

      const sessionId = crypto.randomUUID();
      // In production, this would persist to DuckDB via ProjectTabStorage
      // For now, return session ID - client uses localStorage for persistence
      return this.sendJson(res, 200, {
        sessionId,
        projectId,
        mode,
        thoughtCount: 0,
        state: "capturing",
      });
    }

    if (method === "GET" && pathname.startsWith("/api/void/session/")) {
      const sessionId = pathname.substring("/api/void/session/".length);
      if (!sessionId) {
        return this.sendJson(res, 400, { error: "session_id_required" });
      }
      // Return session state - in production would fetch from DuckDB
      return this.sendJson(res, 200, {
        sessionId,
        thoughtCount: 0,
        state: "capturing",
        readyForReveal: false,
        completenessScore: 0,
      });
    }

    if (method === "POST" && pathname === "/api/void/thought") {
      const body = await this.readBody(req);
      const thoughtPayload = body as { sessionId?: string; content?: string };
      const sessionId = String(thoughtPayload?.sessionId || "");
      const content = String(thoughtPayload?.content || "").trim();

      if (!sessionId) {
        return this.sendJson(res, 400, { error: "session_id_required" });
      }
      if (!content) {
        return this.sendJson(res, 400, { error: "content_required" });
      }

      const thoughtId = crypto.randomUUID();
      // In production, would persist via ProjectTabStorage.createThought
      // and queue via GenesisPipeline.queueThought
      return this.sendJson(res, 200, {
        ok: true,
        thoughtId,
        sessionId,
      });
    }

    if (method === "POST" && pathname === "/api/void/prompt/dismiss") {
      const body = await this.readBody(req);
      const dismissPayload = body as { sessionId?: string };
      const sessionId = String(dismissPayload?.sessionId || "");
      // Acknowledge prompt dismissal
      return this.sendJson(res, 200, { ok: true, sessionId });
    }

    if (method === "POST" && pathname === "/api/void/accept-reveal") {
      const body = await this.readBody(req);
      const revealPayload = body as { sessionId?: string };
      const sessionId = String(revealPayload?.sessionId || "");
      // Transition session to revealing state
      return this.sendJson(res, 200, { ok: true, sessionId, state: "revealing" });
    }

    if (method === "POST" && pathname === "/api/void/decline-offer") {
      const body = await this.readBody(req);
      const declinePayload = body as { sessionId?: string };
      const sessionId = String(declinePayload?.sessionId || "");
      // Return to capturing state
      return this.sendJson(res, 200, { ok: true, sessionId, state: "capturing" });
    }

    if (method === "POST" && pathname === "/api/void/mode") {
      const body = await this.readBody(req);
      const modePayload = body as { sessionId?: string; mode?: string };
      const sessionId = String(modePayload?.sessionId || "");
      const mode = String(modePayload?.mode || "genesis");
      // Update session mode
      return this.sendJson(res, 200, { ok: true, sessionId, mode });
    }

    // Reveal UI endpoints
    if (method === "GET" && pathname.startsWith("/api/reveal/")) {
      const sessionId = pathname.substring("/api/reveal/".length);
      if (!sessionId) {
        return this.sendJson(res, 400, { error: "session_id_required" });
      }
      // Return reveal state - in production would fetch from RevealService
      return this.sendJson(res, 200, {
        sessionId,
        projectId: "default-project",
        state: "interactive",
        clusters: [],
        thoughts: [],
        outliers: [],
      });
    }

    if (method === "POST" && pathname.match(/^\/api\/reveal\/[^/]+\/confirm$/)) {
      const sessionId = pathname.split("/")[3];
      return this.sendJson(res, 200, { ok: true, sessionId, state: "confirmed" });
    }

    if (method === "POST" && pathname.match(/^\/api\/reveal\/[^/]+\/cancel$/)) {
      const sessionId = pathname.split("/")[3];
      return this.sendJson(res, 200, { ok: true, sessionId });
    }

    if (method === "PATCH" && pathname.match(/^\/api\/reveal\/[^/]+\/cluster\/[^/]+$/)) {
      const parts = pathname.split("/");
      const sessionId = parts[3];
      const clusterId = parts[5];
      const body = await this.readBody(req);
      const { name, position } = body as { name?: string; position?: { x: number; y: number } };
      return this.sendJson(res, 200, { ok: true, sessionId, clusterId, name, position });
    }

    if (method === "POST" && pathname.match(/^\/api\/reveal\/[^/]+\/move-thought$/)) {
      const sessionId = pathname.split("/")[3];
      const body = await this.readBody(req);
      const { thoughtId, toClusterId } = body as { thoughtId: string; toClusterId: string };
      return this.sendJson(res, 200, { ok: true, sessionId, thoughtId, toClusterId });
    }

    // Constellation UI endpoints
    if (method === "GET" && pathname.match(/^\/api\/constellation\/[^/]+$/)) {
      const projectId = pathname.split("/")[3];
      return this.sendJson(res, 200, {
        projectId,
        view: "hierarchical",
        clusters: [],
        spatialClusters: [],
        thoughts: [],
        viewport: { x: 0, y: 0, scale: 1, velocityX: 0, velocityY: 0 },
        selectedClusterId: null,
        focusedClusterId: null,
      });
    }

    if (method === "PATCH" && pathname.match(/^\/api\/constellation\/[^/]+\/view$/)) {
      const projectId = pathname.split("/")[3];
      const body = await this.readBody(req);
      const { view } = body as { view: string };
      return this.sendJson(res, 200, { ok: true, projectId, view });
    }

    if (method === "POST" && pathname.match(/^\/api\/constellation\/[^/]+\/merge$/)) {
      const projectId = pathname.split("/")[3];
      const body = await this.readBody(req);
      const { sourceId, targetId } = body as { sourceId: string; targetId: string };
      return this.sendJson(res, 200, { ok: true, projectId, sourceId, targetId });
    }

    if (method === "POST" && pathname.match(/^\/api\/constellation\/[^/]+\/connection$/)) {
      const projectId = pathname.split("/")[3];
      const body = await this.readBody(req);
      const { fromId, toId } = body as { fromId: string; toId: string };
      return this.sendJson(res, 200, { ok: true, projectId, fromId, toId });
    }

    // Path API endpoints
    if (method === "GET" && pathname.match(/^\/api\/path\/[^/]+$/)) {
      const projectId = pathname.split("/")[3];
      return this.sendJson(res, 200, {
        projectId,
        phases: [],
        criticalPath: [],
        totalDurationDays: null,
        hasScheduleConflicts: false,
      });
    }

    if (method === "POST" && pathname.match(/^\/api\/path\/[^/]+\/generate$/)) {
      const projectId = pathname.split("/")[3];
      const body = await this.readBody(req);
      const { autoSchedule } = body as { autoSchedule?: boolean };
      return this.sendJson(res, 200, { ok: true, projectId, autoSchedule });
    }

    if (method === "PATCH" && pathname.match(/^\/api\/path\/[^/]+\/phase\/[^/]+$/)) {
      const parts = pathname.split("/");
      const projectId = parts[3];
      const phaseId = parts[5];
      const body = await this.readBody(req) as { startDate?: string; endDate?: string };
      return this.sendJson(res, 200, { ok: true, projectId, phaseId, startDate: body.startDate, endDate: body.endDate });
    }

    if (method === "POST" && pathname.match(/^\/api\/path\/[^/]+\/dependency$/)) {
      const projectId = pathname.split("/")[3];
      const body = await this.readBody(req);
      const { fromId, toId } = body as { fromId: string; toId: string };
      return this.sendJson(res, 200, { ok: true, projectId, fromId, toId });
    }

    // ========================================================================
    // Risk API Endpoints
    // ========================================================================

    if (method === "GET" && pathname.match(/^\/api\/risk\/[^/]+$/)) {
      const projectId = pathname.split("/")[3];
      return this.sendJson(res, 200, {
        projectId,
        risks: [],
        matrix: [[], [], []],
        unresolvedCount: 0,
        mitigatedCount: 0,
      });
    }

    if (method === "POST" && pathname.match(/^\/api\/risk\/[^/]+$/)) {
      const projectId = pathname.split("/")[3];
      const body = await this.readBody(req) as {
        description: string;
        likelihood: string;
        impact: string;
      };
      const riskId = `risk-${Date.now()}`;
      return this.sendJson(res, 200, {
        ok: true,
        projectId,
        riskId,
        description: body.description,
        likelihood: body.likelihood,
        impact: body.impact,
      });
    }

    if (method === "PATCH" && pathname.match(/^\/api\/risk\/[^/]+\/[^/]+$/)) {
      const parts = pathname.split("/");
      const projectId = parts[3];
      const riskId = parts[4];
      const body = await this.readBody(req) as { status?: string };
      return this.sendJson(res, 200, { ok: true, projectId, riskId, status: body.status });
    }

    if (method === "POST" && pathname.match(/^\/api\/risk\/[^/]+\/[^/]+\/guardrail$/)) {
      const parts = pathname.split("/");
      const projectId = parts[3];
      const riskId = parts[4];
      const guardrailId = `guard-${Date.now()}`;
      return this.sendJson(res, 200, { ok: true, projectId, riskId, guardrailId });
    }

    // ========================================================================
    // Autonomy API Endpoints
    // ========================================================================

    if (method === "GET" && pathname.match(/^\/api\/autonomy\/[^/]+\/readiness$/)) {
      const projectId = pathname.split("/")[3];
      return this.sendJson(res, 200, {
        projectId,
        isReady: false,
        checks: [],
        blockerCount: 0,
        warningCount: 0,
      });
    }

    if (method === "POST" && pathname.match(/^\/api\/autonomy\/[^/]+\/start$/)) {
      const projectId = pathname.split("/")[3];
      const executionId = `exec-${Date.now()}`;
      return this.sendJson(res, 200, { ok: true, projectId, executionId });
    }

    // ========================================================================
    // Navigation State API Endpoint
    // ========================================================================

    if (method === "GET" && pathname.match(/^\/api\/project\/[^/]+\/nav-state$/)) {
      const projectId = pathname.split("/")[3];
      const routes = {
        void: { hasData: true, count: 0 },
        reveal: { hasData: false, count: 0 },
        constellation: { hasData: false, count: 0 },
        path: { hasData: false, count: 0 },
        risk: { hasData: false, count: 0 },
        autonomy: { hasData: false, isReady: false },
      };
      const recommendedNext = "void";
      return this.sendJson(res, 200, { projectId, routes, recommendedNext });
    }

    // ========================================================================
    // Direct View Routes (Open Navigation)
    // ========================================================================

    if (method === "GET" && pathname === "/void") {
      return this.serveUiEntry(res, null);
    }

    if (method === "GET" && pathname === "/reveal") {
      return this.serveUiEntry(res, null);
    }

    if (method === "GET" && pathname === "/constellation") {
      return this.serveUiEntry(res, null);
    }

    if (method === "GET" && pathname === "/path") {
      return this.serveUiEntry(res, null);
    }

    if (method === "GET" && pathname === "/risk") {
      return this.serveUiEntry(res, null);
    }

    if (method === "GET" && pathname === "/autonomy") {
      return this.serveUiEntry(res, null);
    }

    if (method === "POST" && pathname === "/api/zo/ask") {
      const zoBaseUrl = this.options.zoApiBaseUrl || process.env.ZO_API_BASE_URL || "https://api.zo.computer";
      const body = await this.readBody(req);
      const zoResult = await this.fetchExternalJson(zoBaseUrl, "/zo/ask", "POST", body);
      if (!zoResult.ok) {
        return this.sendJson(res, 502, zoResult);
      }
      return this.sendJson(res, 200, zoResult.body);
    }

    if (method === "GET" && pathname === "/") {
      return this.serveUiEntry(res, url.searchParams.get("ui"));
    }

    if (
      method === "GET" &&
      (pathname === "/ui/monitor" || pathname === "/ui/monitor/")
    ) {
      return this.serveUiEntry(res, "compact");
    }

    if (
      method === "GET" &&
      (pathname === "/ui/console" || pathname === "/ui/console/")
    ) {
      return this.serveUiEntry(res, "full");
    }

    if (method === "GET" && pathname === "/api/ui/routes") {
      return this.sendJson(res, 200, {
        default: "/",
        monitor: "/ui/monitor",
        console: "/ui/console",
      });
    }

    // Diagnostic endpoint for debugging asset resolution
    if (method === "GET" && pathname === "/api/ui/debug") {
      return this.sendJson(res, 200, {
        assetsDir: this.assetsDir,
        cwd: process.cwd(),
        hasLegacyIndex: this.hasUiAsset("legacy-index.html"),
        hasIndex: this.hasUiAsset("index.html"),
        filesInDir: fs.existsSync(this.assetsDir)
          ? fs.readdirSync(this.assetsDir).filter((f) => f.endsWith(".html"))
          : [],
      });
    }

    if (method !== "GET") {
      this.sendJson(res, 404, {
        error: "NOT_FOUND",
        message: "Route not found",
        path: pathname,
      });
      return;
    }

    this.serveStaticPath(res, pathname);
  }

  private resolveAssetsDir(override?: string): string {
    const candidates = [
      override ? path.resolve(override) : "",
      process.env.QORE_UI_ASSETS_DIR
        ? path.resolve(process.env.QORE_UI_ASSETS_DIR)
        : "",
      path.resolve(process.cwd(), "zo", "ui-shell", "shared"),
      path.resolve(process.cwd(), "zo", "ui-shell", "assets"),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (
        fs.existsSync(path.join(candidate, "legacy-index.html")) ||
        fs.existsSync(path.join(candidate, "index.html"))
      ) {
        return candidate;
      }
    }
    return path.resolve(process.cwd(), "zo", "ui-shell", "assets");
  }

  private hasUiAsset(fileName: string): boolean {
    return fs.existsSync(path.join(this.assetsDir, fileName));
  }

  private serveUiEntry(
    res: http.ServerResponse,
    requestedMode: string | null,
  ): void {
    const useCompact = requestedMode === "compact";
    const primary = useCompact ? "index.html" : "legacy-index.html";
    const fallback = useCompact ? "legacy-index.html" : "index.html";

    if (this.hasUiAsset(primary)) {
      this.serveFile(res, primary);
      return;
    }
    if (this.hasUiAsset(fallback)) {
      this.serveFile(res, fallback);
      return;
    }

    this.sendJson(res, 503, {
      error: "ASSET_MISSING",
      message: "No UI entrypoint found in assets directory",
      assetsDir: this.assetsDir,
    });
  }

  private serveStaticPath(res: http.ServerResponse, pathname: string): void {
    const rel = pathname.replace(/^\/+/, "");
    const fullPath = path.resolve(this.assetsDir, rel);

    if (!fullPath.startsWith(this.assetsDir)) {
      this.sendJson(res, 400, {
        error: "INVALID_PATH",
        message: "Invalid asset path",
      });
      return;
    }

    let candidate = fullPath;
    if (
      !fs.existsSync(candidate) &&
      rel === "index.html" &&
      this.hasUiAsset("legacy-index.html")
    ) {
      candidate = path.resolve(this.assetsDir, "legacy-index.html");
    }

    if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
      this.sendJson(res, 404, {
        error: "NOT_FOUND",
        message: "Asset not found",
        path: pathname,
      });
      return;
    }

    res.statusCode = 200;
    this.applySecurityHeaders(res);
    res.setHeader(
      "content-type",
      this.contentTypeFor(path.extname(candidate).toLowerCase()),
    );
    res.end(fs.readFileSync(candidate));
  }

  private contentTypeFor(ext: string): string {
    const map: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".ico": "image/x-icon",
    };
    return map[ext] ?? "application/octet-stream";
  }

  private async buildHubPayload(): Promise<HubPayload> {
    const runtime = await this.fetchRuntimeSnapshot();
    const verdict = runtime.connected
      ? {
          decision: "PASS" as const,
          summary: "Runtime reachable and policy endpoint healthy.",
        }
      : {
          decision: "WARN" as const,
          summary: "Runtime unreachable. Verify process and API key.",
        };

    const recentVerdicts: Verdict[] = [
      {
        decision: verdict.decision,
        summary: verdict.summary,
        timestamp: new Date().toISOString(),
      },
    ];

    const monitorState: HubPayload["monitor"]["state"] = runtime.connected
      ? "connected"
      : "degraded";

    return {
      generatedAt: new Date().toISOString(),
      activePlan: {
        ...this.activePlan,
        updatedAt: new Date().toISOString(),
      },
      currentSprint: {
        id: "zo-standalone",
        name: "Zo Standalone Runtime",
        status: "active",
      },
      sprints: [
        {
          id: "zo-standalone",
          name: "Zo Standalone Runtime",
          status: "active",
        },
      ],
      sentinelStatus: {
        running: this.monitoringEnabled,
        queueDepth: 0,
        lastVerdict: verdict,
      },
      l3Queue: [],
      recentVerdicts,
      trustSummary: {
        totalAgents: 1,
        avgTrust: runtime.connected ? 0.92 : 0.4,
        quarantined: runtime.connected ? 0 : 1,
        stageCounts: { CBT: 1, KBT: 0, IBT: 0 },
      },
      nodeStatus: [
        {
          id: "qore-runtime",
          label: "Qore Runtime",
          state: runtime.connected ? "nominal" : "degraded",
        },
        { id: "zo-ui", label: "Zo UI Host", state: "nominal" },
      ],
      checkpointSummary: this.getCheckpointSummary(verdict.decision),
      recentCheckpoints: this.checkpointStore.slice(0, 10),
      qoreRuntime: runtime,
      monitor: {
        state: monitorState,
        statusLine: runtime.connected
          ? "Runtime Connected"
          : "Runtime Unreachable",
        recommendation: runtime.connected
          ? "Telemetry active. Continue monitored execution."
          : `Verify runtime process/service and API key at ${runtime.baseUrl}.`,
      },
    };
  }

  private buildHubPayloadSync(): HubPayload {
    return {
      generatedAt: new Date().toISOString(),
      activePlan: this.activePlan,
      currentSprint: {
        id: "zo-standalone",
        name: "Zo Standalone Runtime",
        status: "active",
      },
      sprints: [
        {
          id: "zo-standalone",
          name: "Zo Standalone Runtime",
          status: "active",
        },
      ],
      sentinelStatus: {
        running: this.monitoringEnabled,
        queueDepth: 0,
        lastVerdict: {
          decision: "PASS",
          summary: "Waiting for initial runtime probe.",
        },
      },
      l3Queue: [],
      recentVerdicts: [],
      trustSummary: {
        totalAgents: 1,
        avgTrust: 0.5,
        quarantined: 0,
        stageCounts: { CBT: 1, KBT: 0, IBT: 0 },
      },
      nodeStatus: [
        { id: "qore-runtime", label: "Qore Runtime", state: "degraded" },
        { id: "zo-ui", label: "Zo UI Host", state: "nominal" },
      ],
      checkpointSummary: this.getCheckpointSummary("PASS"),
      recentCheckpoints: this.checkpointStore.slice(0, 10),
      qoreRuntime: {
        enabled: true,
        connected: false,
        baseUrl: this.options.runtimeBaseUrl,
        lastCheckedAt: new Date().toISOString(),
        error: "initializing",
      },
      monitor: {
        state: "degraded",
        statusLine: "Initializing",
        recommendation: "Waiting for first runtime probe.",
      },
    };
  }

  private getCheckpointSummary(
    latestVerdict: string,
  ): HubPayload["checkpointSummary"] {
    const latest = this.checkpointStore[0];
    return {
      total: this.checkpointStore.length,
      chainValid: true,
      latestType: latest?.checkpointType ?? "snapshot.created",
      latestVerdict,
      latestAt: latest?.timestamp ?? new Date().toISOString(),
    };
  }

  private seedDefaultCheckpoints(): void {
    this.checkpointStore = [
      {
        checkpointId: `cp-${Date.now()}-1`,
        runId: "zo-standalone",
        checkpointType: "snapshot.created",
        phase: "plan",
        policyVerdict: "PASS",
        timestamp: new Date().toISOString(),
      },
      {
        checkpointId: `cp-${Date.now()}-2`,
        runId: "zo-standalone",
        checkpointType: "phase.entered",
        phase: "implement",
        policyVerdict: "PASS",
        timestamp: new Date().toISOString(),
      },
    ];
  }

  private appendCheckpoint(type: string, phase: string, verdict: string): void {
    this.checkpointStore.unshift({
      checkpointId: `cp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      runId: "zo-standalone",
      checkpointType: type,
      phase,
      policyVerdict: verdict,
      timestamp: new Date().toISOString(),
    });
    this.checkpointStore = this.checkpointStore.slice(0, 100);
  }

  private async fetchRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    const health = await this.fetchQoreJson("/health");
    if (!health.ok) {
      return {
        enabled: true,
        connected: false,
        baseUrl: this.options.runtimeBaseUrl,
        lastCheckedAt: new Date().toISOString(),
        error: health.error,
      };
    }

    const policy = await this.fetchQoreJson("/policy/version");
    return {
      enabled: true,
      connected: true,
      baseUrl: this.options.runtimeBaseUrl,
      policyVersion: policy.ok
        ? String(
            (policy.body as { policyVersion?: string }).policyVersion ??
              "unknown",
          )
        : "unknown",
      latencyMs: health.latencyMs,
      lastCheckedAt: new Date().toISOString(),
      error: policy.ok ? undefined : policy.error,
    };
  }

  private async fetchQoreJson(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    body?: unknown,
  ): Promise<JsonResult> {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.requestTimeoutMs ?? 5000,
    );

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (this.options.runtimeApiKey) {
        headers["x-qore-api-key"] = this.options.runtimeApiKey;
      }

      const response = await fetch(
        `${this.options.runtimeBaseUrl}${endpoint}`,
        {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);

      if (!response.ok) {
        return {
          ok: false,
          error: `upstream_${response.status}`,
          detail: await response.text(),
        };
      }

      return {
        ok: true,
        status: response.status,
        body: await response.json(),
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      clearTimeout(timeout);
      return {
        ok: false,
        error: "request_failed",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async fetchExternalJson(
    baseUrl: string,
    endpoint: string,
    method: "GET" | "POST" = "GET",
    body?: unknown,
  ): Promise<JsonResult> {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.requestTimeoutMs ?? 30000,
    );

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };

      const response = await fetch(
        `${baseUrl}${endpoint}`,
        {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);

      if (!response.ok) {
        return {
          ok: false,
          error: `upstream_${response.status}`,
          detail: await response.text(),
        };
      }

      return {
        ok: true,
        status: response.status,
        body: await response.json(),
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      clearTimeout(timeout);
      return {
        ok: false,
        error: "request_failed",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async readBody(req: http.IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }

    if (chunks.length === 0) return {};

    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    } catch {
      return {};
    }
  }

  private serveFile(res: http.ServerResponse, fileName: string): void {
    const fullPath = path.join(this.assetsDir, fileName);
    if (!fs.existsSync(fullPath)) {
      this.sendJson(res, 503, {
        error: "ASSET_MISSING",
        message: `Missing UI asset: ${fileName}`,
      });
      return;
    }

    res.statusCode = 200;
    this.applySecurityHeaders(res);
    res.setHeader(
      "content-type",
      this.contentTypeFor(path.extname(fullPath).toLowerCase()),
    );
    res.end(fs.readFileSync(fullPath));
  }

  private sendWs(client: WebSocket, payload: unknown): void {
    if (client.readyState !== client.OPEN) return;
    client.send(JSON.stringify(payload));
  }

  private broadcast(payload: unknown): void {
    if (!this.ws) return;
    for (const client of this.ws.clients) {
      this.sendWs(client as WebSocket, payload);
    }
  }

  private sendJson(
    res: http.ServerResponse,
    statusCode: number,
    payload: unknown,
  ): void {
    res.statusCode = statusCode;
    this.applySecurityHeaders(res);
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  }

  private serveMfaPage(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    if (!this.requireUiMfa) {
      res.statusCode = 302;
      res.setHeader("location", "/");
      res.end();
      return;
    }
    if (!this.isAuthorized(req.headers.authorization)) {
      this.sendBasicAuthChallenge(res);
      return;
    }
    if (this.isMfaAuthorized(req.headers.cookie)) {
      res.statusCode = 302;
      res.setHeader("location", "/");
      res.end();
      return;
    }

    res.statusCode = 200;
    this.applySecurityHeaders(res);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FailSafe-Qore MFA</title><style>body{font-family:Arial,sans-serif;background:#0b1220;color:#e6eefb;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}.card{background:#13233f;border:1px solid #2e4770;border-radius:10px;padding:20px;max-width:360px;width:100%}h1{font-size:20px;margin:0 0 12px}p{font-size:14px;color:#9fb1cd}input,button{width:100%;padding:10px;border-radius:8px;border:1px solid #2e4770}input{background:#0f1a2f;color:#e6eefb;margin-bottom:10px}button{background:#3d7dff;color:#fff;font-weight:700;cursor:pointer}.error{color:#ff8a8a;font-size:13px;min-height:20px}</style></head><body><div class="card"><h1>Two-Factor Verification</h1><p>Enter the 6-digit code from your authenticator app.</p><div id="e" class="error"></div><input id="c" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456"/><button id="b">Verify</button></div><script>const b=document.getElementById('b');const c=document.getElementById('c');const e=document.getElementById('e');async function v(){e.textContent='';const code=(c.value||'').trim();const r=await fetch('/mfa/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});if(r.ok){location.href='/';return;}const j=await r.json().catch(()=>({message:'Verification failed'}));e.textContent=j.message||'Verification failed';}b.addEventListener('click',v);c.addEventListener('keydown',(ev)=>{if(ev.key==='Enter')v();});</script></body></html>`,
    );
  }

  private serveLoginPage(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    if (
      this.isAuthorized(req.headers.authorization) ||
      this.isCookieAuthorized(req.headers.cookie)
    ) {
      res.statusCode = 302;
      res.setHeader("location", "/");
      res.end();
      return;
    }

    if (this.hasUiAsset("login.html")) {
      this.serveFile(res, "login.html");
      return;
    }

    res.statusCode = 200;
    this.applySecurityHeaders(res);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(
      '<!doctype html><html><head><title>Login</title></head><body><h1>Login Required</h1><form action="/api/auth/login" method="post"><input name="username" placeholder="User"><input name="password" type="password" placeholder="Pass"><button>Login</button></form></body></html>',
    );
  }

  private serveSettingsPage(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    // Require authentication for settings page
    if (
      !this.isAuthorized(req.headers.authorization) &&
      !this.isCookieAuthorized(req.headers.cookie)
    ) {
      res.statusCode = 302;
      res.setHeader("location", "/login?next=/settings");
      res.end();
      return;
    }

    if (this.hasUiAsset("settings.html")) {
      this.serveFile(res, "settings.html");
      return;
    }

    // Fallback inline settings page
    res.statusCode = 200;
    this.applySecurityHeaders(res);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(this.getSettingsPageHtml());
  }

  private getSettingsPageHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FailSafe-Qore | Settings</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; color: #e7efff; background: radial-gradient(circle at 15% 10%, #1d365f, #0a1220 45%); min-height: 100vh; padding: 16px; }
.container { max-width: 600px; margin: 0 auto; }
h1 { margin: 0 0 8px; font-size: 24px; }
.subtitle { color: #a9bad7; margin: 0 0 24px; }
.card { background: #13223a; border: 1px solid #2f4a70; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
.card h2 { margin: 0 0 16px; font-size: 18px; }
.input-group { display: grid; gap: 6px; margin-bottom: 16px; }
.input-group label { font-size: 13px; color: #c7d8f5; }
input { width: 100%; border-radius: 8px; border: 1px solid #35537b; background: #0f1b30; color: #e7efff; padding: 10px 12px; font: inherit; font-size: 14px; outline: none; }
input:focus { border-color: #5a8ed0; }
button { border-radius: 8px; border: 1px solid #35537b; background: #1c3f72; color: #e7efff; padding: 10px 16px; font: inherit; font-weight: 600; cursor: pointer; }
button:hover { filter: brightness(1.15); }
button:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-danger { background: #7a2f3f; border-color: #a04050; }
.message { padding: 10px; border-radius: 8px; margin-top: 12px; font-size: 13px; }
.message.success { background: #1a3f2a; border: 1px solid #2f7050; color: #7de6a8; }
.message.error { background: #3f1a2a; border: 1px solid #a04050; color: #ff8a9a; }
.status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px; background: #102643; border: 1px solid #3b5a84; }
.status-badge.enabled { color: #7de6a8; }
.status-badge.disabled { color: #a9bad7; }
.back-link { display: inline-block; margin-bottom: 16px; color: #5a8ed0; text-decoration: none; font-size: 14px; }
.back-link:hover { text-decoration: underline; }
.mfa-secret { font-family: monospace; background: #0f1b30; padding: 12px; border-radius: 8px; word-break: break-all; margin: 12px 0; font-size: 14px; }
</style>
</head>
<body>
<div class="container">
<a href="/" class="back-link">&larr; Back to Console</a>
<h1>Settings</h1>
<p class="subtitle">Manage your authentication and security settings</p>

<div class="card">
<h2>Credentials</h2>
<div id="credentials-status"></div>
<form id="credentials-form">
<div class="input-group" id="current-pass-group" style="display:none;">
<label for="currentPassword">Current Password</label>
<input type="password" id="currentPassword" autocomplete="current-password">
</div>
<div class="input-group">
<label for="username">Username</label>
<input type="text" id="username" autocomplete="username" required>
</div>
<div class="input-group">
<label for="password">New Password</label>
<input type="password" id="password" autocomplete="new-password" minlength="8" required>
</div>
<div class="input-group">
<label for="confirmPassword">Confirm Password</label>
<input type="password" id="confirmPassword" autocomplete="new-password" required>
</div>
<button type="submit" id="save-creds-btn">Save Credentials</button>
</form>
<div id="credentials-message"></div>
</div>

<div class="card">
<h2>Two-Factor Authentication (MFA)</h2>
<div id="mfa-status"></div>
<div id="mfa-actions"></div>
<div id="mfa-secret-display" style="display:none;">
<p>Scan this secret with your authenticator app:</p>
<div class="mfa-secret" id="mfa-secret-value"></div>
<p style="color:#a9bad7;font-size:13px;">After scanning, set the environment variable <code>QORE_UI_REQUIRE_MFA=true</code> and restart the server to enable MFA enforcement.</p>
</div>
<div id="mfa-message"></div>
</div>

<div class="card">
<h2>Configuration Location</h2>
<p style="color:#a9bad7;font-size:13px;">Secrets are stored in:</p>
<div class="mfa-secret" id="config-path">Loading...</div>
</div>
</div>

<script>
async function loadSettings() {
const res = await fetch('/api/settings');
const data = await res.json();

document.getElementById('config-path').textContent = data.configPath + '/secrets.env';

const credStatus = document.getElementById('credentials-status');
const currentPassGroup = document.getElementById('current-pass-group');
if (data.hasCredentials) {
credStatus.innerHTML = '<span class="status-badge enabled">Configured</span>';
document.getElementById('username').value = data.username || '';
currentPassGroup.style.display = 'block';
} else {
credStatus.innerHTML = '<span class="status-badge disabled">Not configured</span>';
}

const mfaStatus = document.getElementById('mfa-status');
const mfaActions = document.getElementById('mfa-actions');
if (data.mfaConfigured) {
mfaStatus.innerHTML = '<span class="status-badge ' + (data.mfaEnabled ? 'enabled' : 'disabled') + '">' + (data.mfaEnabled ? 'Enabled' : 'Configured but not enforced') + '</span>';
mfaActions.innerHTML = '<button type="button" class="btn-danger" onclick="disableMfa()">Remove MFA</button>';
} else {
mfaStatus.innerHTML = '<span class="status-badge disabled">Not configured</span>';
mfaActions.innerHTML = '<button type="button" onclick="enableMfa()">Setup MFA</button>';
}
}

document.getElementById('credentials-form').addEventListener('submit', async (e) => {
e.preventDefault();
const msg = document.getElementById('credentials-message');
const pass = document.getElementById('password').value;
const confirm = document.getElementById('confirmPassword').value;

if (pass !== confirm) {
msg.innerHTML = '<div class="message error">Passwords do not match</div>';
return;
}

const body = {
username: document.getElementById('username').value,
password: pass,
currentPassword: document.getElementById('currentPassword').value || undefined
};

const res = await fetch('/api/settings/credentials', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(body)
});
const data = await res.json();

if (res.ok) {
msg.innerHTML = '<div class="message success">' + data.message + '</div>';
setTimeout(() => location.href = '/login', 1500);
} else {
msg.innerHTML = '<div class="message error">' + (data.message || 'Failed to update') + '</div>';
}
});

async function enableMfa() {
const res = await fetch('/api/settings/mfa/enable', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({})
});
const data = await res.json();
const msg = document.getElementById('mfa-message');

if (res.ok) {
document.getElementById('mfa-secret-display').style.display = 'block';
document.getElementById('mfa-secret-value').textContent = data.secret;
msg.innerHTML = '<div class="message success">MFA secret generated</div>';
loadSettings();
} else {
msg.innerHTML = '<div class="message error">' + (data.message || 'Failed') + '</div>';
}
}

async function disableMfa() {
if (!confirm('Are you sure you want to disable MFA?')) return;
const code = prompt('Enter your current MFA code to confirm:');
if (!code) return;

const res = await fetch('/api/settings/mfa/disable', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ code })
});
const data = await res.json();
const msg = document.getElementById('mfa-message');

if (res.ok) {
document.getElementById('mfa-secret-display').style.display = 'none';
msg.innerHTML = '<div class="message success">' + data.message + '</div>';
loadSettings();
} else {
msg.innerHTML = '<div class="message error">' + (data.message || 'Failed') + '</div>';
}
}

loadSettings();
</script>
</body>
</html>`;
  }

  private serveUpdatesPage(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    // Require authentication for updates page
    if (
      !this.isAuthorized(req.headers.authorization) &&
      !this.isCookieAuthorized(req.headers.cookie)
    ) {
      res.statusCode = 302;
      res.setHeader("location", "/login?next=/updates");
      res.end();
      return;
    }

    if (this.hasUiAsset("updates.html")) {
      this.serveFile(res, "updates.html");
      return;
    }

    res.statusCode = 200;
    this.applySecurityHeaders(res);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(this.getUpdatesPageHtml());
  }

  private getUpdatesPageHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FailSafe-Qore | Updates</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; color: #e7efff; background: radial-gradient(circle at 15% 10%, #1d365f, #0a1220 45%); min-height: 100vh; padding: 16px; }
.container { max-width: 700px; margin: 0 auto; }
h1 { margin: 0 0 8px; font-size: 24px; }
.subtitle { color: #a9bad7; margin: 0 0 24px; }
.card { background: #13223a; border: 1px solid #2f4a70; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
.card h2 { margin: 0 0 16px; font-size: 18px; display: flex; align-items: center; gap: 10px; }
button { border-radius: 8px; border: 1px solid #35537b; background: #1c3f72; color: #e7efff; padding: 10px 16px; font: inherit; font-weight: 600; cursor: pointer; }
button:hover { filter: brightness(1.15); }
button:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-sm { padding: 6px 12px; font-size: 13px; }
.btn-success { background: #1a5f3a; border-color: #2f8050; }
.btn-danger { background: #7a2f3f; border-color: #a04050; }
.message { padding: 10px; border-radius: 8px; margin-top: 12px; font-size: 13px; }
.message.success { background: #1a3f2a; border: 1px solid #2f7050; color: #7de6a8; }
.message.error { background: #3f1a2a; border: 1px solid #a04050; color: #ff8a9a; }
.message.info { background: #1a2f4a; border: 1px solid #3b5a84; color: #7db8e8; }
.status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px; background: #102643; border: 1px solid #3b5a84; }
.status-badge.current { color: #7de6a8; }
.status-badge.available { color: #f0c674; }
.back-link { display: inline-block; margin-bottom: 16px; color: #5a8ed0; text-decoration: none; font-size: 14px; }
.back-link:hover { text-decoration: underline; }
.version-display { font-family: monospace; font-size: 18px; color: #7de6a8; }
.info-text { color: #a9bad7; font-size: 13px; margin: 8px 0; }
.update-list { list-style: none; padding: 0; margin: 16px 0 0; }
.update-item { background: #0f1b30; border: 1px solid #2f4a70; border-radius: 8px; padding: 14px; margin-bottom: 10px; }
.update-item h3 { margin: 0 0 6px; font-size: 15px; display: flex; justify-content: space-between; align-items: center; }
.update-item .notes { font-size: 13px; color: #a9bad7; margin: 8px 0 0; white-space: pre-wrap; max-height: 100px; overflow: auto; }
.update-item .meta { font-size: 12px; color: #7a8fa8; margin-top: 8px; }
.history-item { background: #0f1b30; border: 1px solid #29415f; border-radius: 8px; padding: 12px; margin-bottom: 8px; }
.history-item .version { font-family: monospace; color: #7de6a8; }
.history-item .date { font-size: 12px; color: #7a8fa8; }
.toggle-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.toggle { position: relative; width: 44px; height: 24px; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider { position: absolute; cursor: pointer; inset: 0; background: #29415f; border-radius: 24px; transition: 0.2s; }
.toggle-slider::before { content: ''; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background: #e7efff; border-radius: 50%; transition: 0.2s; }
.toggle input:checked + .toggle-slider { background: #2f8050; }
.toggle input:checked + .toggle-slider::before { transform: translateX(20px); }
.actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
</style>
</head>
<body>
<div class="container">
<a href="/" class="back-link">&larr; Back to Console</a>
<h1>Updates</h1>
<p class="subtitle">Manage application updates and version history</p>

<div class="card">
<h2>Current Version</h2>
<div class="version-display" id="current-version">Loading...</div>
<p class="info-text" id="last-check">Last checked: Never</p>
<div class="actions">
<button onclick="checkUpdates()" id="check-btn">Check for Updates</button>
<button onclick="createBackup()" class="btn-sm">Create Backup</button>
</div>
<div id="update-message"></div>
</div>

<div class="card" id="updates-card" style="display:none;">
<h2>Available Updates <span class="status-badge available" id="update-count"></span></h2>
<ul class="update-list" id="update-list"></ul>
</div>

<div class="card">
<h2>Auto-Check Settings</h2>
<div class="toggle-row">
<span>Automatically check for updates</span>
<label class="toggle">
<input type="checkbox" id="auto-check-toggle" onchange="updateAutoCheck()">
<span class="toggle-slider"></span>
</label>
</div>
<p class="info-text">When enabled, checks for updates every 24 hours.</p>
</div>

<div class="card" id="rollback-card" style="display:none;">
<h2>Rollback</h2>
<p class="info-text">Restore to a previous version if needed.</p>
<div id="rollback-versions"></div>
</div>

<div class="card">
<h2>Update History</h2>
<div id="history-list">
<p class="info-text">No update history yet.</p>
</div>
</div>
</div>

<script>
async function loadStatus() {
const res = await fetch('/api/updates');
const data = await res.json();

document.getElementById('current-version').textContent = 'v' + data.currentVersion;
document.getElementById('auto-check-toggle').checked = data.autoCheck?.enabled ?? true;

if (data.lastCheck?.lastChecked) {
document.getElementById('last-check').textContent = 'Last checked: ' + new Date(data.lastCheck.lastChecked).toLocaleString();
}

if (data.lastCheck?.updateAvailable) {
showUpdates(data.lastCheck);
}

if (data.canRollback && data.rollbackVersions?.length > 0) {
document.getElementById('rollback-card').style.display = 'block';
const html = data.rollbackVersions.map(v =>
'<button class="btn-sm btn-danger" onclick="rollback(\\'' + v + '\\')">Rollback to v' + v + '</button>'
).join(' ');
document.getElementById('rollback-versions').innerHTML = html;
}

loadHistory();
}

async function loadHistory() {
const res = await fetch('/api/updates/history');
const data = await res.json();
const list = document.getElementById('history-list');

if (data.history?.length > 0) {
list.innerHTML = data.history.map(h =>
'<div class="history-item"><span class="version">v' + h.version + '</span> <span class="date">' + new Date(h.installedAt).toLocaleString() + '</span></div>'
).join('');
}
}

async function checkUpdates() {
const btn = document.getElementById('check-btn');
const msg = document.getElementById('update-message');
btn.disabled = true;
btn.textContent = 'Checking...';
msg.innerHTML = '';

try {
const res = await fetch('/api/updates/check', { method: 'POST' });
const data = await res.json();

document.getElementById('last-check').textContent = 'Last checked: ' + new Date(data.lastChecked).toLocaleString();

if (data.error) {
msg.innerHTML = '<div class="message error">' + data.error + '</div>';
} else if (data.updateAvailable) {
msg.innerHTML = '<div class="message success">Updates available!</div>';
showUpdates(data);
} else {
msg.innerHTML = '<div class="message info">You are on the latest version.</div>';
}
} catch (err) {
msg.innerHTML = '<div class="message error">Failed to check for updates</div>';
}

btn.disabled = false;
btn.textContent = 'Check for Updates';
}

function showUpdates(data) {
if (!data.updates || data.updates.length === 0) return;

const card = document.getElementById('updates-card');
const list = document.getElementById('update-list');
const count = document.getElementById('update-count');

card.style.display = 'block';
count.textContent = data.updates.length + ' available';

list.innerHTML = data.updates.map(u => {
const date = u.releaseDate ? new Date(u.releaseDate).toLocaleDateString() : '';
return '<li class="update-item"><h3><span>v' + u.version + '</span>' +
'<button class="btn-sm btn-success" onclick="installUpdate(\\'' + u.version + '\\')">Install</button></h3>' +
(u.releaseNotes ? '<div class="notes">' + escapeHtml(u.releaseNotes) + '</div>' : '') +
'<div class="meta">Released: ' + date + (u.size ? ' | Size: ' + formatBytes(u.size) : '') + '</div></li>';
}).join('');
}

function escapeHtml(text) {
const div = document.createElement('div');
div.textContent = text;
return div.innerHTML;
}

function formatBytes(bytes) {
if (bytes < 1024) return bytes + ' B';
if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function installUpdate(version) {
if (!confirm('Install update v' + version + '? A backup will be created first.')) return;

const msg = document.getElementById('update-message');
msg.innerHTML = '<div class="message info">Creating backup...</div>';

// Create backup first
await fetch('/api/updates/backup', { method: 'POST' });

msg.innerHTML = '<div class="message info">Installing update... This may take a moment.</div>';

// Record the update (actual installation would use git pull or package download)
await fetch('/api/updates/record', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ version, installedBy: 'ui' })
});

msg.innerHTML = '<div class="message success">Update recorded. Run the update script to complete installation:<br><code>npm run zo:update</code></div>';
loadStatus();
}

async function createBackup() {
const msg = document.getElementById('update-message');
const res = await fetch('/api/updates/backup', { method: 'POST' });
const data = await res.json();
if (res.ok) {
msg.innerHTML = '<div class="message success">Backup created for v' + data.version + '</div>';
loadStatus();
} else {
msg.innerHTML = '<div class="message error">Failed to create backup</div>';
}
}

async function updateAutoCheck() {
const enabled = document.getElementById('auto-check-toggle').checked;
await fetch('/api/updates/settings', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ autoCheckEnabled: enabled })
});
}

async function rollback(version) {
if (!confirm('Rollback to v' + version + '? Current changes may be lost.')) return;
const msg = document.getElementById('update-message');
msg.innerHTML = '<div class="message info">Rollback instructions:<br><code>git checkout v' + version + '</code><br>or restore from backup</div>';
}

loadStatus();
</script>
</body>
</html>`;
  }

  private async handleAuthLogin(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const clientIp = this.getClientIp(req);
    if (!this.isClientAllowed(clientIp)) {
      this.sendJson(res, 403, { error: "IP_DENIED", message: "Access denied" });
      return;
    }

    if (this.isLockedOut(this.authFailures, clientIp)) {
      this.sendJson(res, 429, {
        error: "AUTH_LOCKED",
        message: "Too many failures",
      });
      return;
    }

    const body = (await this.readBody(req)) as {
      username?: string;
      password?: string;
    };
    const user = String(body?.username ?? "").trim();
    const pass = String(body?.password ?? "");

    if (user !== this.uiAuthUser || pass !== this.uiAuthPass) {
      this.recordFailure(this.authFailures, clientIp, this.authLockoutMs);
      this.sendJson(res, 401, {
        error: "INVALID_CREDENTIALS",
        message: "Invalid credentials",
      });
      return;
    }

    this.clearFailure(this.authFailures, clientIp);
    const token = this.createAuthSession(req, clientIp);
    const secure = this.requireUiAuth ? "; Secure" : "";
    // Set cookie
    res.setHeader(
      "set-cookie",
      `qore_ui_auth=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(this.uiSessionTtlMs / 1000)}${secure}`,
    );
    this.sendJson(res, 200, { ok: true });
  }

  private createAuthSession(
    req: http.IncomingMessage,
    clientIp: string,
  ): string {
    const raw = generateSessionToken();
    const sig = crypto
      .createHmac("sha256", this.uiSessionSecret)
      .update(raw)
      .digest("hex");
    const token = `${raw}.${sig}`;
    const now = Date.now();
    const userAgent = String(req.headers["user-agent"] ?? "unknown");
    const deviceId = this.deriveDeviceId(userAgent, clientIp);

    this.authSessions.set(token, {
      tokenId: this.sessionTokenId(raw),
      createdAt: now,
      expiresAt: now + this.uiSessionTtlMs,
      clientIp,
      userAgent,
      deviceId,
      lastSeenAt: now,
    });
    return token;
  }

  private async handleMfaVerify(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const clientIp = this.getClientIp(req);
    if (!this.isClientAllowed(clientIp)) {
      this.sendJson(res, 403, {
        error: "IP_DENIED",
        message: `Client IP not allowed: ${clientIp}`,
      });
      return;
    }
    if (!this.requireUiMfa) {
      this.sendJson(res, 200, { ok: true, mfa: "disabled" });
      return;
    }
    if (!this.isAuthorized(req.headers.authorization)) {
      this.sendBasicAuthChallenge(res);
      return;
    }
    if (!this.uiTotpSecret) {
      this.sendJson(res, 503, {
        error: "MFA_MISCONFIGURED",
        message: "QORE_UI_TOTP_SECRET is not set.",
      });
      return;
    }

    if (this.isLockedOut(this.mfaFailures, clientIp)) {
      this.sendJson(res, 429, {
        error: "MFA_LOCKED",
        message: "Too many MFA failures. Try again later.",
      });
      return;
    }

    const body = (await this.readBody(req)) as { code?: string };
    const code = String(body?.code ?? "").trim();
    if (
      !verifyTotpCode(this.uiTotpSecret, code, {
        digits: 6,
        periodSeconds: 30,
        window: 1,
      })
    ) {
      this.recordFailure(this.mfaFailures, clientIp, this.mfaLockoutMs);
      this.sendJson(res, 401, {
        error: "INVALID_MFA_CODE",
        message: "Invalid MFA code.",
      });
      return;
    }
    this.clearFailure(this.mfaFailures, clientIp);

    const token = this.createMfaSession(req, clientIp);
    const secure = this.requireUiAuth ? "; Secure" : "";
    res.setHeader(
      "set-cookie",
      `qore_ui_mfa=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(this.uiSessionTtlMs / 1000)}${secure}`,
    );
    this.sendJson(res, 200, { ok: true });
  }

  private createMfaSession(
    req: http.IncomingMessage,
    clientIp: string,
  ): string {
    const raw = generateSessionToken();
    const sig = crypto
      .createHmac("sha256", this.uiSessionSecret)
      .update(raw)
      .digest("hex");
    const token = `${raw}.${sig}`;
    const now = Date.now();
    const userAgent = String(req.headers["user-agent"] ?? "unknown");
    const deviceHeader = req.headers["x-qore-device-id"];
    const deviceIdRaw = Array.isArray(deviceHeader)
      ? deviceHeader[0]
      : deviceHeader;
    const deviceId =
      (deviceIdRaw ? String(deviceIdRaw).trim() : "") ||
      this.deriveDeviceId(userAgent, clientIp);
    this.mfaSessions.set(token, {
      tokenId: this.sessionTokenId(raw),
      createdAt: now,
      expiresAt: now + this.uiSessionTtlMs,
      clientIp,
      userAgent,
      deviceId,
      lastSeenAt: now,
    });
    return token;
  }

  private isMfaAuthorized(cookieHeader: string | undefined): boolean {
    if (!this.requireUiMfa) return true;
    this.pruneExpiredSessions();
    const token = parseCookies(cookieHeader).qore_ui_mfa;
    if (!token) return false;
    const session = this.mfaSessions.get(token);
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      this.mfaSessions.delete(token);
      return false;
    }
    session.lastSeenAt = Date.now();
    return true;
  }

  private getClientIp(req: http.IncomingMessage): string {
    if (this.trustProxyHeaders) {
      const xff = req.headers["x-forwarded-for"];
      const firstXff = Array.isArray(xff) ? xff[0] : xff;
      if (firstXff) {
        const first = String(firstXff).split(",")[0]?.trim();
        if (first) return first;
      }
      const xRealIp = req.headers["x-real-ip"];
      if (xRealIp) {
        const ip = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
        if (ip) return String(ip).trim();
      }
    }
    return req.socket.remoteAddress ?? "unknown";
  }

  private isClientAllowed(clientIp: string): boolean {
    if (this.allowedIps.length === 0) return true;
    return this.allowedIps.includes(clientIp);
  }

  private isLockedOut(
    store: Map<string, { count: number; lockUntil: number }>,
    key: string,
  ): boolean {
    const record = store.get(key);
    if (!record) return false;
    if (record.lockUntil > Date.now()) return true;
    if (record.lockUntil > 0 && record.lockUntil <= Date.now()) {
      store.delete(key);
    }
    return false;
  }

  private recordFailure(
    store: Map<string, { count: number; lockUntil: number }>,
    key: string,
    lockoutMs: number,
  ): void {
    const current = store.get(key) ?? { count: 0, lockUntil: 0 };
    const nextCount = current.count + 1;
    const threshold =
      store === this.authFailures ? this.authMaxFailures : this.mfaMaxFailures;
    const lockUntil =
      nextCount >= threshold ? Date.now() + Math.max(lockoutMs, 1000) : 0;
    store.set(key, { count: nextCount, lockUntil });
  }

  private clearFailure(
    store: Map<string, { count: number; lockUntil: number }>,
    key: string,
  ): void {
    store.delete(key);
  }

  private pruneExpiredSessions(): void {
    const now = Date.now();
    for (const [token, session] of this.mfaSessions.entries()) {
      if (session.expiresAt <= now) {
        this.mfaSessions.delete(token);
      }
    }

    for (const [token, session] of this.authSessions.entries()) {
      if (session.expiresAt <= now) {
        this.authSessions.delete(token);
      }
    }
  }

  private sessionTokenId(rawToken: string): string {
    return crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex")
      .slice(0, 24);
  }

  private deriveDeviceId(userAgent: string, clientIp: string): string {
    return crypto
      .createHash("sha256")
      .update(`${userAgent}|${clientIp}`)
      .digest("hex")
      .slice(0, 16);
  }

  private listSessions(): Array<{
    tokenId: string;
    createdAt: string;
    expiresAt: string;
    lastSeenAt: string;
    clientIp: string;
    userAgent: string;
    deviceId: string;
  }> {
    this.pruneExpiredSessions();
    return [...this.mfaSessions.values()]
      .map((session) => ({
        tokenId: session.tokenId,
        createdAt: new Date(session.createdAt).toISOString(),
        expiresAt: new Date(session.expiresAt).toISOString(),
        lastSeenAt: new Date(session.lastSeenAt).toISOString(),
        clientIp: session.clientIp,
        userAgent: session.userAgent,
        deviceId: session.deviceId,
      }))
      .sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
  }

  private normalizeTotpSecret(input: unknown): string | null {
    const value = String(input ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (!value) return null;
    if (!/^[A-Z2-7]+$/.test(value)) return null;
    return value;
  }

  private buildOtpAuthUrl(
    secret: string,
    account: string,
    issuer: string,
  ): string {
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  }

  private sendBasicAuthChallenge(res: http.ServerResponse): void {
    res.statusCode = 401;
    this.applySecurityHeaders(res);
    res.setHeader("www-authenticate", 'Basic realm="FailSafe-Qore UI"');
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Authentication required.");
  }

  private applySecurityHeaders(res: http.ServerResponse): void {
    res.setHeader("x-content-type-options", "nosniff");
    if (this.allowFrameEmbedding) {
      res.removeHeader("x-frame-options");
    } else {
      res.setHeader("x-frame-options", "DENY");
    }
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("cache-control", "no-store");
    res.setHeader(
      "permissions-policy",
      "geolocation=(), microphone=(), camera=()",
    );
    res.setHeader(
      "content-security-policy",
      `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors ${this.frameAncestors};`,
    );
  }

  private enforceAuth(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
  ): boolean {
    const clientIp = this.getClientIp(req);
    if (!this.isClientAllowed(clientIp)) {
      this.sendJson(res, 403, {
        error: "IP_DENIED",
        message: `Client IP not allowed: ${clientIp}`,
      });
      return false;
    }

    if (pathname.startsWith("/api/admin/")) {
      if (this.hasValidAdminToken(req)) {
        return true;
      }
      if (this.requireAdminToken) {
        this.sendJson(res, 401, {
          error: "ADMIN_TOKEN_REQUIRED",
          message: "Valid x-qore-admin-token is required.",
        });
        return false;
      }
    }

    if (!this.requireUiAuth) {
      return true;
    }

    if (!this.uiAuthUser || !this.uiAuthPass) {
      this.sendJson(res, 503, {
        error: "UI_AUTH_MISCONFIGURED",
        message:
          "UI auth is required but QORE_UI_BASIC_AUTH_USER/QORE_UI_BASIC_AUTH_PASS are not set.",
      });
      return false;
    }

    if (this.isLockedOut(this.authFailures, clientIp)) {
      this.sendJson(res, 429, {
        error: "AUTH_LOCKED",
        message: "Too many authentication failures. Try again later.",
      });
      return false;
    }

    if (
      !this.isAuthorized(req.headers.authorization) &&
      !this.isCookieAuthorized(req.headers.cookie)
    ) {
      if (req.headers.authorization) {
        this.recordFailure(this.authFailures, clientIp, this.authLockoutMs);
      }

      if (pathname.startsWith("/api/")) {
        this.sendJson(res, 401, {
          error: "UNAUTHORIZED",
          message: "Authentication required.",
        });
        return false;
      }

      // If it looks like a browser request, redirect to login
      if (req.headers.accept?.includes("text/html")) {
        res.statusCode = 302;
        res.setHeader(
          "location",
          `/login?next=${encodeURIComponent(pathname)}`,
        );
        res.end();
        return false;
      }

      this.sendBasicAuthChallenge(res);
      return false;
    }
    this.clearFailure(this.authFailures, clientIp);

    if (!this.requireUiMfa) {
      return true;
    }

    if (!this.uiTotpSecret) {
      this.sendJson(res, 503, {
        error: "MFA_MISCONFIGURED",
        message: "MFA is required but QORE_UI_TOTP_SECRET is not set.",
      });
      return false;
    }

    if (pathname === "/mfa" || pathname === "/mfa/verify") {
      return true;
    }

    if (this.isMfaAuthorized(req.headers.cookie)) {
      return true;
    }

    if (pathname.startsWith("/api/")) {
      this.sendJson(res, 401, {
        error: "MFA_REQUIRED",
        message: "Complete MFA at /mfa first.",
      });
      return false;
    }

    res.statusCode = 302;
    res.setHeader("location", "/mfa");
    res.end();
    return false;
  }

  private hasValidAdminToken(req: http.IncomingMessage): boolean {
    if (!this.uiAdminToken) return false;
    const header = req.headers["x-qore-admin-token"];
    const supplied = Array.isArray(header) ? header[0] : header;
    if (!supplied) return false;
    const expected = Buffer.from(this.uiAdminToken);
    const actual = Buffer.from(String(supplied));
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  }

  private isAuthorized(authorization: string | undefined): boolean {
    if (!this.requireUiAuth) {
      return true;
    }
    if (!authorization || !authorization.startsWith("Basic ")) {
      return false;
    }
    const encoded = authorization.slice("Basic ".length);
    let decoded = "";
    try {
      decoded = Buffer.from(encoded, "base64").toString("utf-8");
    } catch {
      return false;
    }
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    const user = decoded.slice(0, separator);
    const pass = decoded.slice(separator + 1);
    return user === this.uiAuthUser && pass === this.uiAuthPass;
  }

  private isCookieAuthorized(cookieHeader: string | undefined): boolean {
    if (!this.requireUiAuth) return true;
    this.pruneExpiredSessions();
    const token = parseCookies(cookieHeader).qore_ui_auth;
    if (!token) return false;
    const session = this.authSessions.get(token);
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      this.authSessions.delete(token);
      return false;
    }
    session.lastSeenAt = Date.now();
    return true;
  }
}
