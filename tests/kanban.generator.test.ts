/**
 * Kanban Generator Tests
 */

import { describe, it, expect } from "vitest";
import {
  generateTasksFromPhase,
  orderClustersByConnections,
  assignTasksToSprints,
} from "../zo/kanban/generator.js";
import type { PathPhase } from "../zo/path/types.js";
import type { Cluster } from "../zo/project-tab/types.js";

function createMockPhase(overrides: Partial<PathPhase> = {}): PathPhase {
  return {
    id: "phase-1",
    name: "Test Phase",
    description: "Test description",
    clusterIds: ["c1", "c2"],
    dependencies: [],
    dependents: [],
    startDate: null,
    endDate: null,
    durationDays: null,
    sprints: [],
    milestones: [],
    riskCount: 0,
    ...overrides,
  };
}

function createMockCluster(id: string, connections: number = 0): Cluster {
  return {
    id,
    projectId: "proj-1",
    name: `Cluster ${id}`,
    theme: `Theme for ${id}`,
    thoughtIds: [],
    connections: Array(connections).fill(null).map((_, i) => ({
      targetClusterId: `target-${i}`,
      relationship: "related" as const,
      strength: 0.5,
    })),
  };
}

describe("generateTasksFromPhase", () => {
  it("generates tasks for each cluster", () => {
    const phase = createMockPhase({ clusterIds: ["c1", "c2"] });
    const clusters = [createMockCluster("c1"), createMockCluster("c2")];
    const tasks = generateTasksFromPhase(phase, clusters, "proj-1");
    expect(tasks).toHaveLength(2);
  });

  it("sets correct projectId and phaseId", () => {
    const phase = createMockPhase({ id: "phase-x", clusterIds: ["c1"] });
    const clusters = [createMockCluster("c1")];
    const tasks = generateTasksFromPhase(phase, clusters, "my-project");
    expect(tasks[0].projectId).toBe("my-project");
    expect(tasks[0].phaseId).toBe("phase-x");
  });

  it("sets clusterId from cluster", () => {
    const phase = createMockPhase({ clusterIds: ["cluster-abc"] });
    const clusters = [createMockCluster("cluster-abc")];
    const tasks = generateTasksFromPhase(phase, clusters, "proj-1");
    expect(tasks[0].clusterId).toBe("cluster-abc");
  });

  it("skips missing clusters", () => {
    const phase = createMockPhase({ clusterIds: ["c1", "missing", "c2"] });
    const clusters = [createMockCluster("c1"), createMockCluster("c2")];
    const tasks = generateTasksFromPhase(phase, clusters, "proj-1");
    expect(tasks).toHaveLength(2);
  });

  it("uses default assignee", () => {
    const phase = createMockPhase({ clusterIds: ["c1"] });
    const clusters = [createMockCluster("c1")];
    const tasks = generateTasksFromPhase(phase, clusters, "proj-1");
    expect(tasks[0].assignee).toBe("agent");
  });

  it("allows custom assignee", () => {
    const phase = createMockPhase({ clusterIds: ["c1"] });
    const clusters = [createMockCluster("c1")];
    const tasks = generateTasksFromPhase(phase, clusters, "proj-1", {
      defaultAssignee: "human",
    });
    expect(tasks[0].assignee).toBe("human");
  });
});

describe("orderClustersByConnections", () => {
  it("orders by connection count descending", () => {
    const clusters = [
      createMockCluster("c1", 1),
      createMockCluster("c2", 3),
      createMockCluster("c3", 2),
    ];
    const ordered = orderClustersByConnections(["c1", "c2", "c3"], clusters);
    expect(ordered).toEqual(["c2", "c3", "c1"]);
  });

  it("handles missing clusters", () => {
    const clusters = [createMockCluster("c1", 2)];
    const ordered = orderClustersByConnections(["c1", "missing"], clusters);
    expect(ordered).toContain("c1");
    expect(ordered).toContain("missing");
  });

  it("handles empty input", () => {
    const ordered = orderClustersByConnections([], []);
    expect(ordered).toEqual([]);
  });
});

describe("assignTasksToSprints", () => {
  const mockSprints = [
    { id: "s1", name: "Sprint 1", goal: "", startDate: "", endDate: "", status: "planned" as const, taskCount: 0 },
    { id: "s2", name: "Sprint 2", goal: "", startDate: "", endDate: "", status: "planned" as const, taskCount: 0 },
  ];

  it("distributes tasks across sprints", () => {
    const assignments = assignTasksToSprints(6, mockSprints, 3);
    expect(assignments.get("s1")).toHaveLength(3);
    expect(assignments.get("s2")).toHaveLength(3);
  });

  it("handles fewer tasks than capacity", () => {
    const assignments = assignTasksToSprints(2, mockSprints, 5);
    expect(assignments.get("s1")).toHaveLength(2);
    expect(assignments.has("s2")).toBe(false);
  });

  it("returns empty map for no sprints", () => {
    const assignments = assignTasksToSprints(5, [], 5);
    expect(assignments.size).toBe(0);
  });

  it("returns empty map for no tasks", () => {
    const assignments = assignTasksToSprints(0, mockSprints, 5);
    expect(assignments.size).toBe(0);
  });
});
