import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

const installerPath = path.resolve(process.cwd(), "deploy", "zo", "install-zo-full.sh");

describe("Zo installer handoff security", () => {
  it("does not log raw QORE secret export lines", () => {
    const script = fs.readFileSync(installerPath, "utf8");
    expect(script.includes('log "export QORE_API_KEY=')).toBe(false);
    expect(script.includes('log "export QORE_UI_BASIC_AUTH_PASS=')).toBe(false);
    expect(script.includes('log "export QORE_UI_TOTP_SECRET=')).toBe(false);
    expect(script.includes('log "export QORE_UI_ADMIN_TOKEN=')).toBe(false);
  });

  it("creates a secured handoff env file and references it in instructions", () => {
    const script = fs.readFileSync(installerPath, "utf8");
    expect(script.includes("write_zo_handoff_env_file()")).toBe(true);
    expect(script.includes("HANDOFF_ENV_FILE")).toBe(true);
    expect(script.includes('chmod 600 "${HANDOFF_ENV_FILE}"')).toBe(true);
    expect(script.includes('source "${HANDOFF_ENV_FILE}"')).toBe(true);
    expect(script.includes("set-from-installer-generated-secret")).toBe(false);
  });
});
