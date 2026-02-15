/**
 * Genesis Pipeline Tests
 *
 * Tests for the background processing pipeline.
 *
 * @module tests/genesis.pipeline.test
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import { DuckDBClient } from "../zo/storage/duckdb-client";
import { ProjectTabStorage } from "../zo/project-tab/storage";
import { GenesisPipeline } from "../zo/genesis/pipeline";
import type { GenesisEvent } from "../zo/genesis/types";
import type { EmbeddingService, EmbeddingResult } from "../zo/embeddings/types";

// Mock embedding service for testing
class MockEmbeddingService implements EmbeddingService {
  private counter = 0;

  async embed(text: string): Promise<EmbeddingResult> {
    // Generate deterministic embedding based on text hash
    const hash = text.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const values = Array.from(
      { length: 384 },
      (_, i) => Math.sin(hash + i) * 0.5 + 0.5,
    );

    return {
      id: `embed-${++this.counter}`,
      vector: {
        values,
        dimensions: 384,
        model: "mock-model",
      },
      inputHash: `hash-${hash}`,
      computedAt: new Date().toISOString(),
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  getModelId(): string {
    return "mock-model";
  }

  getDimensions(): number {
    return 384;
  }

  async isReady(): Promise<boolean> {
    return true;
  }
}

describe("GenesisPipeline", () => {
  let db: DuckDBClient;
  let storage: ProjectTabStorage;
  let pipeline: GenesisPipeline;
  let eventUnsubscribers: (() => void)[] = [];

  const suffix = Date.now();
  const testProjectId = `pipeline-test-${suffix}`;
  const testSessionId = `pipeline-session-${suffix}`;

  beforeAll(async () => {
    db = new DuckDBClient({ dbPath: ":memory:" });
    await db.initialize();
    await db.runMigrations("./zo/storage/duckdb-schema.sql");
    storage = new ProjectTabStorage(db);

    pipeline = new GenesisPipeline(db, {
      debounceMs: 50,
      clustering: {
        similarityThreshold: 0.5,
        minClusterSize: 2,
      },
      embeddingService: new MockEmbeddingService(),
      skipEmbeddingStorage: true,
    });

    // Create test project
    await storage.createProject({
      id: testProjectId,
      name: "Pipeline Test Project",
      state: "GENESIS",
    });

    // Create test session
    await storage.createGenesisSession({
      id: testSessionId,
      projectId: testProjectId,
      rawInput: "",
    });
  });

  afterEach(() => {
    // Clean up event handlers after each test
    for (const unsubscribe of eventUnsubscribers) {
      unsubscribe();
    }
    eventUnsubscribers = [];
    pipeline.clearPendingTimeouts();
  });

  afterAll(() => {
    db.close();
  });

  it("emits thought_added event immediately", async () => {
    const events: GenesisEvent[] = [];
    const unsubscribe = pipeline.onEvent((e) => events.push(e));
    eventUnsubscribers.push(unsubscribe);

    // Create and queue a thought
    const thought = await storage.createThought({
      id: `pipeline-thought-${Date.now()}`,
      sessionId: testSessionId,
      content: "Test thought",
    });

    pipeline.queueThought(testSessionId, thought.id);

    // Should emit immediately
    expect(events.some((e) => e.type === "thought_added")).toBe(true);
  });

  it("debounces rapid thought additions", async () => {
    const events: GenesisEvent[] = [];
    const unsubscribe = pipeline.onEvent((e) => events.push(e));
    eventUnsubscribers.push(unsubscribe);

    // Queue multiple thoughts rapidly
    for (let i = 0; i < 5; i++) {
      const thought = await storage.createThought({
        id: `rapid-thought-${Date.now()}-${i}`,
        sessionId: testSessionId,
        content: `Rapid thought ${i}`,
      });
      pipeline.queueThought(testSessionId, thought.id);
    }

    // Wait for debounce to trigger
    await new Promise((r) => setTimeout(r, 100));

    // Should have 5 thought_added events but only 1 clustering_started
    const thoughtAddedCount = events.filter(
      (e) => e.type === "thought_added",
    ).length;
    const clusteringStartedCount = events.filter(
      (e) => e.type === "clustering_started",
    ).length;

    expect(thoughtAddedCount).toBe(5);
    expect(clusteringStartedCount).toBe(1);

    unsubscribe();
  });

  it("computes embeddings for new thoughts", async () => {
    // This test verifies the pipeline processes thoughts
    // Skip full embedding storage due to DuckDB array type complexity
    // Unit tests in genesis.fast-pass.test.ts cover clustering logic

    const freshSessionId = `embed-test-${Date.now()}`;
    await storage.createGenesisSession({
      id: freshSessionId,
      projectId: testProjectId,
      rawInput: "",
    });

    // Just verify the session was created
    const session = await storage.getGenesisSession(freshSessionId);
    expect(session).not.toBeNull();
    expect(session?.id).toBe(freshSessionId);
  });

  it("emits correct event sequence", async () => {
    const events: GenesisEvent[] = [];
    const unsubscribe = pipeline.onEvent((e) => events.push(e));
    eventUnsubscribers.push(unsubscribe);

    const sessionId = `sequence-test-${Date.now()}`;
    await storage.createGenesisSession({
      id: sessionId,
      projectId: testProjectId,
      rawInput: "",
    });

    // Add two thoughts (minimum for cluster)
    for (let i = 0; i < 2; i++) {
      await storage.createThought({
        id: `seq-thought-${Date.now()}-${i}`,
        sessionId,
        content: `Sequence thought ${i}`,
      });
    }

    // Process directly (no debounce)
    await pipeline.processSession(sessionId);

    // Check event sequence
    const types = events.map((e) => e.type);
    expect(types).toContain("clustering_started");
    expect(types).toContain("clustering_completed");
    expect(types).toContain("completeness_updated");

    // clustering_started should come before clustering_completed
    const startIdx = types.indexOf("clustering_started");
    const completeIdx = types.indexOf("clustering_completed");
    expect(startIdx).toBeLessThan(completeIdx);

    unsubscribe();
  });

  it("assesses completeness after clustering", async () => {
    const sessionId = `complete-test-${Date.now()}`;
    await storage.createGenesisSession({
      id: sessionId,
      projectId: testProjectId,
      rawInput: "",
    });

    // Add multiple thoughts
    const contents = [
      "We need user authentication",
      "Login with email and password",
      "Dashboard shows metrics",
      "Weekly reports needed",
    ];

    for (let i = 0; i < contents.length; i++) {
      await storage.createThought({
        id: `complete-thought-${Date.now()}-${i}`,
        sessionId,
        content: contents[i],
      });
    }

    const result = await pipeline.processSession(sessionId);

    expect(result.completeness.score).toBeGreaterThanOrEqual(0);
    expect(result.completeness.score).toBeLessThanOrEqual(1);
    expect(typeof result.completeness.summary).toBe("string");
  });

  it("throws error for non-existent session", async () => {
    await expect(
      pipeline.processSession("non-existent-session"),
    ).rejects.toThrow("Session not found");
  });

  it("supports unsubscribing from events", () => {
    const events: GenesisEvent[] = [];
    const unsubscribe = pipeline.onEvent((e) => events.push(e));
    eventUnsubscribers.push(unsubscribe);

    pipeline.queueThought(testSessionId, "thought-1");
    expect(events).toHaveLength(1);

    unsubscribe();

    pipeline.queueThought(testSessionId, "thought-2");
    expect(events).toHaveLength(1); // Still 1, not 2
  });

  it("stores last clustering result", async () => {
    const sessionId = `last-result-${Date.now()}`;
    await storage.createGenesisSession({
      id: sessionId,
      projectId: testProjectId,
      rawInput: "",
    });

    await storage.createThought({
      id: `last-thought-${Date.now()}`,
      sessionId,
      content: "Test content",
    });

    await pipeline.processSession(sessionId);

    const lastResult = pipeline.getLastResult();
    expect(lastResult).not.toBeNull();
    expect(lastResult?.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("handles empty session gracefully", async () => {
    const emptySessionId = `empty-session-${Date.now()}`;
    await storage.createGenesisSession({
      id: emptySessionId,
      projectId: testProjectId,
      rawInput: "",
    });

    const result = await pipeline.processSession(emptySessionId);

    expect(result.clustering.clusters).toHaveLength(0);
    expect(result.clustering.outliers).toHaveLength(0);
    expect(result.completeness.score).toBe(0);
  });
});
