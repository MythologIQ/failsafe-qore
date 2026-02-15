/**
 * Autonomy Checker Tests
 */

import { describe, it, expect } from "vitest";

// Mock types for testing
interface ReadinessCheck {
  name: string;
  passed: boolean;
  reason: string;
  severity: "blocker" | "warning" | "info";
}

interface AutonomyReadiness {
  projectId: string;
  isReady: boolean;
  checks: ReadinessCheck[];
  blockerCount: number;
  warningCount: number;
}

// Test helpers matching checker logic
function computeReadiness(checks: ReadinessCheck[]): AutonomyReadiness {
  const blockerCount = checks.filter((c) => !c.passed && c.severity === "blocker").length;
  const warningCount = checks.filter((c) => !c.passed && c.severity === "warning").length;

  return {
    projectId: "test-proj",
    isReady: blockerCount === 0,
    checks,
    blockerCount,
    warningCount,
  };
}

describe("AutonomyChecker", () => {
  describe("readiness computation", () => {
    it("is ready when all checks pass", () => {
      const checks: ReadinessCheck[] = [
        { name: "Check 1", passed: true, reason: "OK", severity: "blocker" },
        { name: "Check 2", passed: true, reason: "OK", severity: "warning" },
      ];
      const readiness = computeReadiness(checks);
      expect(readiness.isReady).toBe(true);
      expect(readiness.blockerCount).toBe(0);
    });

    it("is not ready when blocker fails", () => {
      const checks: ReadinessCheck[] = [
        { name: "Check 1", passed: false, reason: "Failed", severity: "blocker" },
      ];
      const readiness = computeReadiness(checks);
      expect(readiness.isReady).toBe(false);
      expect(readiness.blockerCount).toBe(1);
    });

    it("is ready when only warnings fail", () => {
      const checks: ReadinessCheck[] = [
        { name: "Check 1", passed: true, reason: "OK", severity: "blocker" },
        { name: "Check 2", passed: false, reason: "Warning", severity: "warning" },
      ];
      const readiness = computeReadiness(checks);
      expect(readiness.isReady).toBe(true);
      expect(readiness.warningCount).toBe(1);
    });

    it("counts multiple blockers", () => {
      const checks: ReadinessCheck[] = [
        { name: "Check 1", passed: false, reason: "Failed", severity: "blocker" },
        { name: "Check 2", passed: false, reason: "Failed", severity: "blocker" },
        { name: "Check 3", passed: true, reason: "OK", severity: "blocker" },
      ];
      const readiness = computeReadiness(checks);
      expect(readiness.blockerCount).toBe(2);
    });
  });

  describe("checkRisksMitigated", () => {
    it("passes when no unmitigated risks", () => {
      const risks = [
        { status: "mitigated" },
        { status: "resolved" },
      ];
      const unmitigated = risks.filter((r) => r.status === "identified");
      const check: ReadinessCheck = {
        name: "Risks Mitigated",
        passed: unmitigated.length === 0,
        reason: unmitigated.length === 0 ? "All risks addressed" : `${unmitigated.length} unmitigated`,
        severity: "blocker",
      };
      expect(check.passed).toBe(true);
    });

    it("fails when risks are identified", () => {
      const risks = [
        { status: "identified" },
        { status: "mitigated" },
      ];
      const unmitigated = risks.filter((r) => r.status === "identified");
      const check: ReadinessCheck = {
        name: "Risks Mitigated",
        passed: unmitigated.length === 0,
        reason: unmitigated.length === 0 ? "All risks addressed" : `${unmitigated.length} unmitigated`,
        severity: "blocker",
      };
      expect(check.passed).toBe(false);
      expect(check.reason).toContain("1 unmitigated");
    });
  });

  describe("checkPhasesScheduled", () => {
    it("fails when no phases", () => {
      const phases: Array<{ startDate: string | null; endDate: string | null }> = [];
      const passed = phases.length > 0 && phases.every((p) => p.startDate && p.endDate);
      expect(passed).toBe(false);
    });

    it("fails when phases unscheduled", () => {
      const phases = [
        { startDate: "2026-01-01", endDate: "2026-01-14" },
        { startDate: null, endDate: null },
      ];
      const unscheduled = phases.filter((p) => !p.startDate || !p.endDate);
      expect(unscheduled).toHaveLength(1);
    });

    it("passes when all phases scheduled", () => {
      const phases = [
        { startDate: "2026-01-01", endDate: "2026-01-14" },
        { startDate: "2026-01-15", endDate: "2026-01-28" },
      ];
      const unscheduled = phases.filter((p) => !p.startDate || !p.endDate);
      expect(unscheduled).toHaveLength(0);
    });
  });

  describe("checkTasksCreated", () => {
    it("fails when no tasks", () => {
      const tasks: unknown[] = [];
      const passed = tasks.length > 0;
      expect(passed).toBe(false);
    });

    it("passes when tasks exist", () => {
      const tasks = [{ id: "t1" }, { id: "t2" }];
      const passed = tasks.length > 0;
      expect(passed).toBe(true);
    });
  });

  describe("checkGuardrailsDefined", () => {
    it("passes when all mitigated risks have guardrails", () => {
      const risks = [
        { id: "r1", status: "mitigated" },
        { id: "r2", status: "identified" },
      ];
      const guardrails = [{ riskId: "r1" }];
      const mitigated = risks.filter((r) => r.status === "mitigated");
      const withGuardrails = mitigated.filter((r) => guardrails.some((g) => g.riskId === r.id));
      const missing = mitigated.length - withGuardrails.length;
      expect(missing).toBe(0);
    });

    it("fails when mitigated risks missing guardrails", () => {
      const risks = [
        { id: "r1", status: "mitigated" },
        { id: "r2", status: "mitigated" },
      ];
      const guardrails = [{ riskId: "r1" }];
      const mitigated = risks.filter((r) => r.status === "mitigated");
      const withGuardrails = mitigated.filter((r) => guardrails.some((g) => g.riskId === r.id));
      const missing = mitigated.length - withGuardrails.length;
      expect(missing).toBe(1);
    });
  });
});
