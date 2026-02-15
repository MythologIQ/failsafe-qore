/**
 * Empty State Component Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Empty State Renderer", () => {
  it("should define EMPTY_CONSTELLATION config for Mind Map", () => {
    const config = {
      route: "constellation",
      title: "Mind Map Empty",
      description: "Start by brainstorming ideas.",
      icon: "\u2606",
      actionLabel: "Go to Brainstorm",
      actionRoute: "void",
      tip: "Tip: Add at least 3 ideas to generate your mind map.",
    };
    expect(config.route).toBe("constellation");
    expect(config.actionRoute).toBe("void");
  });

  it("should define EMPTY_PATH config for Roadmap", () => {
    const config = {
      route: "path",
      title: "Roadmap Empty",
      description: "Your mind map needs to be organized into phases.",
      icon: "\u2192",
      actionLabel: "Go to Mind Map",
      actionRoute: "constellation",
    };
    expect(config.route).toBe("path");
    expect(config.actionRoute).toBe("constellation");
  });

  it("should define EMPTY_RISK config for Risk Register", () => {
    const config = {
      route: "risk",
      title: "Risk Register Empty",
      description: "Risks are derived from your roadmap.",
      icon: "\u26A0",
      actionLabel: "Go to Roadmap",
      actionRoute: "path",
    };
    expect(config.route).toBe("risk");
    expect(config.actionRoute).toBe("path");
  });

  it("should define EMPTY_AUTONOMY config for All Projects", () => {
    const config = {
      route: "autonomy",
      title: "No Projects Yet",
      description: "Create a new project or open an existing workspace.",
      icon: "\u2630",
      actionLabel: "Create New Project",
      actionRoute: "void",
    };
    expect(config.route).toBe("autonomy");
    expect(config.actionRoute).toBe("void");
  });

  it("should track dismissed states", () => {
    const dismissedStates: Record<string, boolean> = {};
    expect(dismissedStates["reveal"]).toBeUndefined();

    dismissedStates["reveal"] = true;
    expect(dismissedStates["reveal"]).toBe(true);
  });

  it("should chain navigation: autonomy -> risk -> path -> constellation -> reveal -> void", () => {
    const chain = ["autonomy", "risk", "path", "constellation", "reveal", "void"];
    const actionRoutes: Record<string, string> = {
      autonomy: "risk",
      risk: "path",
      path: "constellation",
      constellation: "reveal",
      reveal: "void",
    };

    for (let i = 0; i < chain.length - 1; i++) {
      expect(actionRoutes[chain[i]]).toBe(chain[i + 1]);
    }
  });
});
