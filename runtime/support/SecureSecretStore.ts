import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Secure secret store that reads secrets from locations outside the git repository.
 * This prevents secrets from being accidentally committed to version control.
 *
 * Priority order for secret resolution:
 * 1. Environment variables (highest priority)
 * 2. User config directory: ~/.config/failsafe-qore/secrets.env
 * 3. System config directory: /etc/failsafe-qore/secrets.env (Linux only)
 * 4. Legacy fallback: .failsafe/zo-native-ai.env (deprecated, for migration)
 */

export interface SecretConfig {
  QORE_API_KEY?: string;
  QORE_UI_BASIC_AUTH_USER?: string;
  QORE_UI_BASIC_AUTH_PASS?: string;
  QORE_UI_TOTP_SECRET?: string;
  QORE_UI_ADMIN_TOKEN?: string;
  QORE_PROXY_API_KEY?: string;
  QORE_ACTOR_KEYS?: string;
  [key: string]: string | undefined;
}

export class SecureSecretStore {
  private readonly userConfigDir: string;
  private readonly systemConfigDir: string;
  private readonly legacyConfigPath: string;
  private readonly workspace: string;

  constructor(workspace: string = process.cwd()) {
    this.workspace = workspace;

    // User-specific config directory (outside git repository)
    this.userConfigDir = path.join(os.homedir(), ".config", "failsafe-qore");

    // System-wide config directory (Linux only, requires root)
    this.systemConfigDir =
      process.platform === "linux" ? "/etc/failsafe-qore" : "";

    // Legacy config path (for migration)
    this.legacyConfigPath = path.join(
      workspace,
      ".failsafe",
      "zo-native-ai.env",
    );
  }

  /**
   * Get all secrets from all sources, with priority order
   */
  getAllSecrets(): SecretConfig {
    const secrets: SecretConfig = {};

    // 1. Environment variables (highest priority)
    this.loadFromEnvironment(secrets);

    // 2. User config directory
    this.loadFromFile(path.join(this.userConfigDir, "secrets.env"), secrets);

    // 3. System config directory (Linux only)
    if (this.systemConfigDir) {
      this.loadFromFile(
        path.join(this.systemConfigDir, "secrets.env"),
        secrets,
      );
    }

    // 4. Legacy fallback (for migration, lowest priority)
    this.loadFromFile(this.legacyConfigPath, secrets);

    return secrets;
  }

  /**
   * Get a specific secret by key
   */
  getSecret(key: string): string | undefined {
    const secrets = this.getAllSecrets();
    return secrets[key];
  }

  /**
   * Get a required secret, throws if not found
   */
  getRequiredSecret(key: string): string {
    const value = this.getSecret(key);
    if (!value) {
      throw new Error(`Required secret not found: ${key}`);
    }
    return value;
  }

  /**
   * Load secrets from environment variables
   */
  private loadFromEnvironment(secrets: SecretConfig): void {
    const envKeys = [
      "QORE_API_KEY",
      "QORE_UI_BASIC_AUTH_USER",
      "QORE_UI_BASIC_AUTH_PASS",
      "QORE_UI_TOTP_SECRET",
      "QORE_UI_ADMIN_TOKEN",
      "QORE_PROXY_API_KEY",
      "QORE_ACTOR_KEYS",
    ];

    for (const key of envKeys) {
      const value = process.env[key];
      if (value) {
        secrets[key] = value;
      }
    }
  }

  /**
   * Load secrets from a .env file
   */
  private loadFromFile(filePath: string, secrets: SecretConfig): void {
    try {
      if (!fs.existsSync(filePath)) {
        return;
      }

      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }

        // Parse KEY=VALUE format
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const [, key, value] = match;
          // Only set if not already set (lower priority sources don't override higher ones)
          if (secrets[key] === undefined) {
            secrets[key] = value;
          }
        }
      }
    } catch (error) {
      // Silently ignore file read errors (file may not exist or be inaccessible)
      // This is intentional - we want to fail gracefully
    }
  }

  /**
   * Write secrets to user config directory
   */
  writeSecrets(secrets: SecretConfig): void {
    try {
      // Ensure directory exists
      if (!fs.existsSync(this.userConfigDir)) {
        fs.mkdirSync(this.userConfigDir, { recursive: true, mode: 0o700 });
      }

      const filePath = path.join(this.userConfigDir, "secrets.env");
      const lines: string[] = [];

      // Add header comment
      lines.push("# FailSafe-Qore Secrets");
      lines.push("# Generated: " + new Date().toISOString());
      lines.push("# WARNING: This file contains sensitive information");
      lines.push("# DO NOT commit to version control");
      lines.push("");

      // Write each secret
      for (const [key, value] of Object.entries(secrets)) {
        if (value !== undefined) {
          lines.push(`${key}=${value}`);
        }
      }

      fs.writeFileSync(filePath, lines.join("\n"), { mode: 0o600 });
    } catch (error) {
      throw new Error(
        `Failed to write secrets: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if legacy config exists
   */
  hasLegacyConfig(): boolean {
    return fs.existsSync(this.legacyConfigPath);
  }

  /**
   * Migrate secrets from legacy location to new secure location
   */
  migrateFromLegacy(): boolean {
    if (!this.hasLegacyConfig()) {
      return false;
    }

    try {
      const legacySecrets: SecretConfig = {};
      this.loadFromFile(this.legacyConfigPath, legacySecrets);

      // Write to new location
      this.writeSecrets(legacySecrets);

      // Remove legacy file
      fs.unlinkSync(this.legacyConfigPath);

      return true;
    } catch (error) {
      console.error("Failed to migrate secrets from legacy location:", error);
      return false;
    }
  }

  /**
   * Get the user config directory path
   */
  getUserConfigDir(): string {
    return this.userConfigDir;
  }

  /**
   * Get the legacy config path
   */
  getLegacyConfigPath(): string {
    return this.legacyConfigPath;
  }
}

/**
 * Global singleton instance
 */
let globalSecretStore: SecureSecretStore | null = null;

export function getSecretStore(workspace?: string): SecureSecretStore {
  if (!globalSecretStore) {
    globalSecretStore = new SecureSecretStore(workspace);
  }
  return globalSecretStore;
}

export function getAllSecrets(workspace?: string): SecretConfig {
  return getSecretStore(workspace).getAllSecrets();
}

export function getSecret(key: string, workspace?: string): string | undefined {
  return getSecretStore(workspace).getSecret(key);
}

export function getRequiredSecret(key: string, workspace?: string): string {
  return getSecretStore(workspace).getRequiredSecret(key);
}
