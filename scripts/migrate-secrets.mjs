#!/usr/bin/env node
/**
 * Migrate secrets from legacy location to new secure location
 * 
 * This script migrates secrets from:
 * - .failsafe/zo-native-ai.env (in repo directory)
 * - .failsafe/zo-installer.env (in repo directory)
 * 
 * To:
 * - ~/.config/failsafe-qore/secrets.env (user config directory, outside git)
 * 
 * Usage:
 *   node scripts/migrate-secrets.mjs [--workspace <path>] [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_WORKSPACE = path.join(__dirname, '..');

function log(message) {
  console.log(`[migrate-secrets] ${message}`);
}

function error(message) {
  console.error(`[migrate-secrets] ERROR: ${message}`);
}

function maskSecret(value, keep = 4) {
  const len = value?.length || 0;
  if (len <= keep) {
    return value;
  }
  const tail = value.slice(-keep);
  return `[redacted:${tail}]`;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const secrets = {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE format
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      secrets[key] = value;
    }
  }

  return secrets;
}

function writeSecrets(secrets, filePath, dryRun = false) {
  if (dryRun) {
    log(`[DRY RUN] Would write secrets to: ${filePath}`);
    return;
  }

  const lines = [];
  
  // Add header comment
  lines.push('# FailSafe-Qore Secrets');
  lines.push(`# Migrated: ${new Date().toISOString()}`);
  lines.push('# WARNING: This file contains sensitive information');
  lines.push('# DO NOT commit to version control');
  lines.push('');

  // Write each secret
  for (const [key, value] of Object.entries(secrets)) {
    if (value !== undefined) {
      lines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'), { mode: 0o600 });
  log(`Secrets written to: ${filePath}`);
}

function main() {
  const args = process.argv.slice(2);
  let workspace = DEFAULT_WORKSPACE;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && args[i + 1]) {
      workspace = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Migrate secrets from legacy location to new secure location

Usage:
  node scripts/migrate-secrets.mjs [options]

Options:
  --workspace <path>   Repository workspace path (default: parent directory)
  --dry-run            Show what would be done without making changes
  --help, -h           Show this help

This script migrates secrets from:
  - .failsafe/zo-native-ai.env (in repo directory)
  - .failsafe/zo-installer.env (in repo directory)

To:
  - ~/.config/failsafe-qore/secrets.env (user config directory, outside git)
`);
      process.exit(0);
    }
  }

  log('Starting secret migration...');

  // Legacy paths
  const legacyPaths = [
    path.join(workspace, '.failsafe', 'zo-native-ai.env'),
    path.join(workspace, '.failsafe', 'zo-installer.env'),
  ];

  // New secure path
  const userConfigDir = path.join(os.homedir(), '.config', 'failsafe-qore');
  const newSecretsPath = path.join(userConfigDir, 'secrets.env');

  // Load secrets from legacy locations
  const allSecrets = {};
  let foundLegacySecrets = false;

  for (const legacyPath of legacyPaths) {
    if (fs.existsSync(legacyPath)) {
      log(`Found legacy secrets file: ${legacyPath}`);
      const secrets = loadEnvFile(legacyPath);
      Object.assign(allSecrets, secrets);
      foundLegacySecrets = true;
      
      // Show what secrets were found (masked)
      const secretKeys = Object.keys(secrets).filter(k => k.startsWith('QORE_'));
      if (secretKeys.length > 0) {
        log(`  Secrets found: ${secretKeys.join(', ')}`);
      }
    }
  }

  if (!foundLegacySecrets) {
    log('No legacy secrets found. Nothing to migrate.');
    log(`Checking if secrets already exist at: ${newSecretsPath}`);
    
    if (fs.existsSync(newSecretsPath)) {
      log('Secrets already exist at new location. Migration not needed.');
    } else {
      log('No secrets found at legacy or new locations.');
    }
    
    process.exit(0);
  }

  // Check if new secrets file already exists
  if (fs.existsSync(newSecretsPath)) {
    const existingSecrets = loadEnvFile(newSecretsPath);
    const existingKeys = Object.keys(existingSecrets);
    const newKeys = Object.keys(allSecrets);
    
    log(`New secrets file already exists with ${existingKeys.length} keys`);
    log(`Legacy secrets file has ${newKeys.length} keys`);
    
    // Check for conflicts
    const conflicts = [];
    for (const key of newKeys) {
      if (existingKeys.includes(key) && existingSecrets[key] !== allSecrets[key]) {
        conflicts.push(key);
      }
    }
    
    if (conflicts.length > 0) {
      error(`Conflicting secrets detected: ${conflicts.join(', ')}`);
      error('Please resolve conflicts manually before migrating.');
      process.exit(1);
    }
    
    log('No conflicts detected. Merging secrets...');
    Object.assign(existingSecrets, allSecrets);
    writeSecrets(existingSecrets, newSecretsPath, dryRun);
  } else {
    // Create new secrets file
    log(`Creating new secrets file at: ${newSecretsPath}`);
    writeSecrets(allSecrets, newSecretsPath, dryRun);
  }

  // Remove legacy files if not dry run
  if (!dryRun) {
    log('Removing legacy secrets files...');
    for (const legacyPath of legacyPaths) {
      if (fs.existsSync(legacyPath)) {
        try {
          fs.unlinkSync(legacyPath);
          log(`Removed: ${legacyPath}`);
        } catch (err) {
          error(`Failed to remove ${legacyPath}: ${err.message}`);
        }
      }
    }
  } else {
    log('[DRY RUN] Would remove legacy secrets files:');
    for (const legacyPath of legacyPaths) {
      if (fs.existsSync(legacyPath)) {
        log(`  ${legacyPath}`);
      }
    }
  }

  log('Migration complete!');
  log('');
  log('Next steps:');
  log('1. Verify secrets are working correctly');
  log('2. Run tests: npm test');
  log('3. Commit the changes to git');
  log('4. Update your Zo installation: bash deploy/zo/update-from-repo.sh');
}

main();
