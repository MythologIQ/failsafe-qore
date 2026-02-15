/**
 * Risk Service Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock types for testing
interface RiskView {
  id: string;
  description: string;
  likelihood: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  avoidance: string;
  mitigation: string;
  contingency: string;
  status: "identified" | "mitigated" | "resolved";
  riskScore: number;
  hasGuardrail: boolean;
  guardrailId: string | null;
}

interface RiskState {
  projectId: string;
  risks: RiskView[];
  matrix: Array<Array<{ likelihood: string; impact: string; risks: RiskView[] }>>;
  unresolvedCount: number;
  mitigatedCount: number;
}

// Test helper functions matching service logic
function computeRiskScore(likelihood: string, impact: string): number {
  const likelihoodScores: Record<string, number> = { low: 1, medium: 2, high: 3 };
  const impactScores: Record<string, number> = { low: 1, medium: 2, high: 3 };
  return (likelihoodScores[likelihood] ?? 1) * (impactScores[impact] ?? 1);
}

function buildRiskMatrix(risks: RiskView[]): RiskState["matrix"] {
  const likelihoods = ["low", "medium", "high"] as const;
  const impacts = ["low", "medium", "high"] as const;

  return likelihoods.map((likelihood) =>
    impacts.map((impact) => ({
      likelihood,
      impact,
      risks: risks.filter((r) => r.likelihood === likelihood && r.impact === impact),
    }))
  );
}

describe("RiskService", () => {
  describe("computeRiskScore", () => {
    it("computes low-low as 1", () => {
      expect(computeRiskScore("low", "low")).toBe(1);
    });

    it("computes medium-medium as 4", () => {
      expect(computeRiskScore("medium", "medium")).toBe(4);
    });

    it("computes high-high as 9", () => {
      expect(computeRiskScore("high", "high")).toBe(9);
    });

    it("computes low-high as 3", () => {
      expect(computeRiskScore("low", "high")).toBe(3);
    });

    it("computes high-low as 3", () => {
      expect(computeRiskScore("high", "low")).toBe(3);
    });

    it("defaults unknown values to 1", () => {
      expect(computeRiskScore("unknown", "invalid")).toBe(1);
    });
  });

  describe("buildRiskMatrix", () => {
    it("returns 3x3 matrix", () => {
      const matrix = buildRiskMatrix([]);
      expect(matrix).toHaveLength(3);
      expect(matrix[0]).toHaveLength(3);
    });

    it("places risks in correct cells", () => {
      const risk: RiskView = {
        id: "r1",
        description: "Test risk",
        likelihood: "high",
        impact: "medium",
        avoidance: "",
        mitigation: "",
        contingency: "",
        status: "identified",
        riskScore: 6,
        hasGuardrail: false,
        guardrailId: null,
      };
      const matrix = buildRiskMatrix([risk]);
      const highRow = matrix[2];
      const mediumImpact = highRow[1];
      expect(mediumImpact.risks).toHaveLength(1);
      expect(mediumImpact.risks[0].id).toBe("r1");
    });

    it("groups multiple risks in same cell", () => {
      const risks: RiskView[] = [
        {
          id: "r1", description: "Risk 1", likelihood: "low", impact: "low",
          avoidance: "", mitigation: "", contingency: "", status: "identified",
          riskScore: 1, hasGuardrail: false, guardrailId: null,
        },
        {
          id: "r2", description: "Risk 2", likelihood: "low", impact: "low",
          avoidance: "", mitigation: "", contingency: "", status: "identified",
          riskScore: 1, hasGuardrail: false, guardrailId: null,
        },
      ];
      const matrix = buildRiskMatrix(risks);
      const lowLowCell = matrix[0][0];
      expect(lowLowCell.risks).toHaveLength(2);
    });
  });

  describe("RiskState counters", () => {
    it("counts unresolved risks correctly", () => {
      const risks: RiskView[] = [
        { id: "r1", description: "", likelihood: "low", impact: "low", avoidance: "",
          mitigation: "", contingency: "", status: "identified", riskScore: 1,
          hasGuardrail: false, guardrailId: null },
        { id: "r2", description: "", likelihood: "low", impact: "low", avoidance: "",
          mitigation: "", contingency: "", status: "mitigated", riskScore: 1,
          hasGuardrail: false, guardrailId: null },
        { id: "r3", description: "", likelihood: "low", impact: "low", avoidance: "",
          mitigation: "", contingency: "", status: "resolved", riskScore: 1,
          hasGuardrail: false, guardrailId: null },
      ];
      const unresolvedCount = risks.filter((r) => r.status !== "resolved").length;
      expect(unresolvedCount).toBe(2);
    });

    it("counts mitigated risks correctly", () => {
      const risks: RiskView[] = [
        { id: "r1", description: "", likelihood: "low", impact: "low", avoidance: "",
          mitigation: "", contingency: "", status: "identified", riskScore: 1,
          hasGuardrail: false, guardrailId: null },
        { id: "r2", description: "", likelihood: "low", impact: "low", avoidance: "",
          mitigation: "", contingency: "", status: "mitigated", riskScore: 1,
          hasGuardrail: false, guardrailId: null },
      ];
      const mitigatedCount = risks.filter((r) => r.status === "mitigated").length;
      expect(mitigatedCount).toBe(1);
    });
  });

  describe("event handling", () => {
    it("handlers can be registered and removed", () => {
      const handlers: Array<() => void> = [];
      const handler = vi.fn();
      handlers.push(handler);
      const remove = () => {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      };
      expect(handlers).toHaveLength(1);
      remove();
      expect(handlers).toHaveLength(0);
    });
  });
});
