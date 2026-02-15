/**
 * Risk Derivation Tests
 */

import { describe, it, expect } from "vitest";
import { deriveGuardrail, canDeriveGuardrail } from "../zo/risk/derivation.js";
import type { Risk, RiskLikelihood, RiskImpact, RiskStatus } from "../zo/project-tab/types.js";

function createMockRisk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: "risk-1",
    projectId: "proj-1",
    description: "Test risk",
    likelihood: "medium" as RiskLikelihood,
    impact: "medium" as RiskImpact,
    avoidance: "Avoid by testing",
    mitigation: "Mitigate via code review",
    contingency: "Fallback plan",
    status: "identified" as RiskStatus,
    ...overrides,
  };
}

describe("deriveGuardrail", () => {
  it("returns null for non-matching mitigation", () => {
    const risk = createMockRisk({ mitigation: "do something vague" });
    const result = deriveGuardrail(risk, "proj-1");
    expect(result).toBeNull();
  });

  it("derives human_approval for human review", () => {
    const risk = createMockRisk({ mitigation: "Require human review before deploy" });
    const result = deriveGuardrail(risk, "proj-1");
    expect(result).not.toBeNull();
    expect(result?.gateType).toBe("human_approval");
  });

  it("derives staged_execution for staged deployment", () => {
    const risk = createMockRisk({ mitigation: "Use staged deployment pipeline" });
    const result = deriveGuardrail(risk, "proj-1");
    expect(result).not.toBeNull();
    expect(result?.gateType).toBe("staged_execution");
    expect(result?.policyPattern).toBe("deploy:*");
  });

  it("derives validation for verify keywords", () => {
    const risk = createMockRisk({ mitigation: "Validate input before processing" });
    const result = deriveGuardrail(risk, "proj-1");
    expect(result).not.toBeNull();
    expect(result?.gateType).toBe("validation");
  });

  it("derives block for prevent keywords", () => {
    const risk = createMockRisk({ mitigation: "Block unauthorized access" });
    const result = deriveGuardrail(risk, "proj-1");
    expect(result).not.toBeNull();
    expect(result?.gateType).toBe("block");
  });

  it("derives auth pattern for authentication risks", () => {
    const risk = createMockRisk({
      description: "Auth credential exposure",
      mitigation: "Require authentication review",
    });
    const result = deriveGuardrail(risk, "proj-1");
    expect(result).not.toBeNull();
    expect(result?.policyPattern).toBe("file.write:**/auth/**");
  });

  it("checks avoidance text as well", () => {
    const risk = createMockRisk({
      mitigation: "some action",
      avoidance: "Require human approval first",
    });
    const result = deriveGuardrail(risk, "proj-1");
    expect(result).not.toBeNull();
    expect(result?.gateType).toBe("human_approval");
  });
});

describe("canDeriveGuardrail", () => {
  it("returns true for matching patterns", () => {
    const risk = createMockRisk({ mitigation: "Manual check required" });
    expect(canDeriveGuardrail(risk)).toBe(true);
  });

  it("returns false for non-matching patterns", () => {
    const risk = createMockRisk({ mitigation: "Just do the thing" });
    expect(canDeriveGuardrail(risk)).toBe(false);
  });
});
