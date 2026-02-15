import * as path from "path";
import { LedgerManager } from "../../ledger/engine/LedgerManager";
import { PolicyEngine } from "../../policy/engine/PolicyEngine";
import { EvaluationRouter } from "../../risk/engine/EvaluationRouter";
import { defaultQoreConfig } from "@mythologiq/qore-contracts/runtime/QoreConfig";
import { InMemorySecretStore } from "../support/InMemoryStores";
import { getSecretStore } from "../support/SecureSecretStore";
import { QoreRuntimeService } from "./QoreRuntimeService";
import { LocalApiServer } from "./LocalApiServer";

async function main(): Promise<void> {
  const workspace = process.cwd();
  const policyDir = path.join(workspace, "policy", "definitions");
  const ledgerPath =
    process.env.QORE_LEDGER_PATH ??
    path.join(workspace, ".failsafe", "ledger", "soa_ledger.db");
  const apiHost = process.env.QORE_API_HOST ?? "127.0.0.1";
  const apiPort = Number(process.env.QORE_API_PORT ?? "7777");

  // Use SecureSecretStore for secrets (prioritizes env vars, then secure config files)
  const secretStore = getSecretStore(workspace);
  const apiKey =
    secretStore.getSecret("QORE_API_KEY") || process.env.QORE_API_KEY;

  const publicHealth =
    String(process.env.QORE_API_PUBLIC_HEALTH ?? "false").toLowerCase() ===
    "true";

  const ledger = new LedgerManager({
    ledgerPath,
    secretStore: new InMemorySecretStore(),
  });
  const runtime = new QoreRuntimeService(
    new PolicyEngine({ policyDir }),
    EvaluationRouter.fromConfig(defaultQoreConfig),
    ledger,
    defaultQoreConfig,
  );
  await runtime.initialize(policyDir);

  const api = new LocalApiServer(runtime, {
    host: apiHost,
    port: apiPort,
    apiKey,
    requireAuth: true,
    publicHealth,
    maxBodyBytes: 64 * 1024,
  });
  await api.start();
  const addr = api.getAddress();
  console.log(`qore runtime api listening on ${addr.host}:${addr.port}`);
}

void main().catch((error) => {
  console.error("failed to start qore runtime service", error);
  process.exit(1);
});
