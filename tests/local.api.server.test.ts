import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { PolicyEngine } from "../policy/engine/PolicyEngine";
import { EvaluationRouter } from "../risk/engine/EvaluationRouter";
import { LedgerManager } from "../ledger/engine/LedgerManager";
import { QoreRuntimeService } from "../runtime/service/QoreRuntimeService";
import { LocalApiServer } from "../runtime/service/LocalApiServer";
import { defaultQoreConfig } from "@mythologiq/qore-contracts/runtime/QoreConfig";
import { InMemorySecretStore } from "../runtime/support/InMemoryStores";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("LocalApiServer", () => {
  it("serves health, policy version, and evaluate endpoints", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-api-"));
    tempDirs.push(dir);

    const ledger = new LedgerManager({
      ledgerPath: path.join(dir, "soa_ledger.db"),
      secretStore: new InMemorySecretStore(),
    });
    const runtime = new QoreRuntimeService(
      new PolicyEngine(),
      EvaluationRouter.fromConfig(defaultQoreConfig),
      ledger,
      defaultQoreConfig,
    );
    await runtime.initialize(path.join(process.cwd(), "policy", "definitions"));

    const apiKey = "test-api-key";
    const api = new LocalApiServer(runtime, { apiKey, maxBodyBytes: 1024 });
    try {
      await api.start();
      const addr = api.getAddress();
      const base = `http://${addr.host}:${addr.port}`;

      const health = await fetch(`${base}/health`, {
        headers: { "x-qore-api-key": apiKey },
      });
      expect(health.status).toBe(200);
      const healthJson = (await health.json()) as { status: string };
      expect(healthJson.status).toBe("ok");

      const unauthorizedHealth = await fetch(`${base}/health`);
      expect(unauthorizedHealth.status).toBe(401);
      const unauthorizedHealthPayload = (await unauthorizedHealth.json()) as {
        error: { code: string };
      };
      expect(unauthorizedHealthPayload.error.code).toBe("UNAUTHORIZED");

      const version = await fetch(`${base}/policy/version`, {
        headers: { "x-qore-api-key": apiKey },
      });
      expect(version.status).toBe(200);
      const versionJson = (await version.json()) as { policyVersion: string };
      expect(versionJson.policyVersion.length).toBeGreaterThan(5);

      const decision = await fetch(`${base}/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify({
          requestId: "api-req-1",
          actorId: "did:myth:api",
          action: "write",
          targetPath: "src/auth/service.ts",
          content: "password flow",
        }),
      });
      expect(decision.status).toBe(200);
      const decisionJson = (await decision.json()) as {
        decision: string;
        decisionId: string;
        auditEventId: string;
      };
      expect(["ALLOW", "ESCALATE", "DENY"]).toContain(decisionJson.decision);
      expect(decisionJson.decisionId).toMatch(/^dec_/);
      expect(decisionJson.auditEventId).toMatch(/^ledger:/);

      const invalid = await fetch(`${base}/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify({
          requestId: "bad-1",
          actorId: "did:myth:api",
          action: "write",
        }),
      });
      expect(invalid.status).toBe(422);
      const invalidJson = (await invalid.json()) as {
        error: { code: string; traceId: string };
      };
      expect(invalidJson.error.code).toBe("VALIDATION_ERROR");
      expect(invalidJson.error.traceId).toMatch(/^trace_/);

      const notFound = await fetch(`${base}/nope`);
      expect(notFound.status).toBe(404);
      const notFoundJson = (await notFound.json()) as { error: { code: string } };
      expect(notFoundJson.error.code).toBe("NOT_FOUND");

      const badJson = await fetch(`${base}/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-qore-api-key": apiKey },
        body: "{",
      });
      expect(badJson.status).toBe(400);
      const badJsonPayload = (await badJson.json()) as { error: { code: string } };
      expect(badJsonPayload.error.code).toBe("BAD_JSON");

      const unauthorized = await fetch(`${base}/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: "auth-1",
          actorId: "did:myth:api",
          action: "read",
          targetPath: "docs/README.md",
        }),
      });
      expect(unauthorized.status).toBe(401);
      const unauthorizedPayload = (await unauthorized.json()) as { error: { code: string } };
      expect(unauthorizedPayload.error.code).toBe("UNAUTHORIZED");

      const tooLarge = await fetch(`${base}/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-qore-api-key": apiKey },
        body: JSON.stringify({
          requestId: "size-1",
          actorId: "did:myth:api",
          action: "read",
          targetPath: "docs/README.md",
          content: "x".repeat(5000),
        }),
      });
      expect(tooLarge.status).toBe(413);
      const tooLargePayload = (await tooLarge.json()) as { error: { code: string } };
      expect(tooLargePayload.error.code).toBe("PAYLOAD_TOO_LARGE");
    } finally {
      await api.stop();
      ledger.close();
    }
  });

  it("allows public /health when explicitly enabled", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qore-api-public-health-"));
    tempDirs.push(dir);

    const ledger = new LedgerManager({
      ledgerPath: path.join(dir, "soa_ledger.db"),
      secretStore: new InMemorySecretStore(),
    });
    const runtime = new QoreRuntimeService(
      new PolicyEngine(),
      EvaluationRouter.fromConfig(defaultQoreConfig),
      ledger,
      defaultQoreConfig,
    );
    await runtime.initialize(path.join(process.cwd(), "policy", "definitions"));

    const apiKey = "test-api-key";
    const api = new LocalApiServer(runtime, { apiKey, publicHealth: true, maxBodyBytes: 1024 });
    try {
      await api.start();
      const addr = api.getAddress();
      const base = `http://${addr.host}:${addr.port}`;

      const health = await fetch(`${base}/health`);
      expect(health.status).toBe(200);
      const healthJson = (await health.json()) as { status: string };
      expect(healthJson.status).toBe("ok");

      const protectedEvaluate = await fetch(`${base}/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: "public-health-auth",
          actorId: "did:myth:api",
          action: "read",
          targetPath: "docs/README.md",
        }),
      });
      expect(protectedEvaluate.status).toBe(401);
    } finally {
      await api.stop();
      ledger.close();
    }
  });
});

