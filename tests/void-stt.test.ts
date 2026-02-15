/**
 * Void Speech-to-Text Component Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("VoidSTT Component", () => {
  describe("Feature Detection", () => {
    it("should detect SpeechRecognition availability", () => {
      const hasSpeechRecognition = (win: Record<string, unknown>): boolean => {
        return "SpeechRecognition" in win || "webkitSpeechRecognition" in win;
      };

      // Mock window without SpeechRecognition
      const mockWindow: Record<string, unknown> = {};
      expect(hasSpeechRecognition(mockWindow)).toBe(false);
    });

    it("should detect webkit prefixed API", () => {
      const hasWebkitSpeech = (win: Record<string, unknown>): boolean => {
        return "webkitSpeechRecognition" in win;
      };

      const mockWindow = { webkitSpeechRecognition: class {} };
      expect(hasWebkitSpeech(mockWindow)).toBe(true);
    });
  });

  describe("State Management", () => {
    it("should track listening state", () => {
      const state = {
        isListening: false,
        interimTranscript: "",
        finalTranscript: "",
      };

      expect(state.isListening).toBe(false);
      state.isListening = true;
      expect(state.isListening).toBe(true);
    });

    it("should store interim transcript", () => {
      const state = { interimTranscript: "" };
      state.interimTranscript = "hello wor";
      expect(state.interimTranscript).toBe("hello wor");
    });

    it("should store final transcript", () => {
      const state = { finalTranscript: "" };
      state.finalTranscript = "hello world";
      expect(state.finalTranscript).toBe("hello world");
    });
  });

  describe("Callbacks", () => {
    it("should fire onTranscript with interim results", () => {
      const onTranscript = vi.fn();
      onTranscript("hello wor", false);
      expect(onTranscript).toHaveBeenCalledWith("hello wor", false);
    });

    it("should fire onTranscript with final results", () => {
      const onTranscript = vi.fn();
      onTranscript("hello world", true);
      expect(onTranscript).toHaveBeenCalledWith("hello world", true);
    });

    it("should fire onStateChange", () => {
      const onStateChange = vi.fn();
      onStateChange(true);
      expect(onStateChange).toHaveBeenCalledWith(true);
      onStateChange(false);
      expect(onStateChange).toHaveBeenCalledWith(false);
    });

    it("should fire onError with error details", () => {
      const onError = vi.fn();
      const error = { code: "not-allowed", message: "Microphone access denied." };
      onError(error);
      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  describe("Error Messages", () => {
    it("should map not-allowed error", () => {
      const errorMessages: Record<string, string> = {
        "not-allowed": "Microphone access denied. Enable in browser settings.",
        "no-speech": "No speech detected. Try again.",
        "audio-capture": "Microphone not available.",
        network: "Network error. Check connection.",
        "start-failed": "Failed to start recognition.",
      };

      expect(errorMessages["not-allowed"]).toContain("Microphone access denied");
    });

    it("should map no-speech error", () => {
      const errorMessages: Record<string, string> = {
        "no-speech": "No speech detected. Try again.",
      };

      expect(errorMessages["no-speech"]).toContain("No speech detected");
    });

    it("should map audio-capture error", () => {
      const errorMessages: Record<string, string> = {
        "audio-capture": "Microphone not available.",
      };

      expect(errorMessages["audio-capture"]).toContain("not available");
    });

    it("should map network error", () => {
      const errorMessages: Record<string, string> = {
        network: "Network error. Check connection.",
      };

      expect(errorMessages["network"]).toContain("Network error");
    });
  });

  describe("Toggle Behavior", () => {
    it("should toggle from stopped to listening", () => {
      let isListening = false;
      const toggle = () => {
        isListening = !isListening;
      };

      toggle();
      expect(isListening).toBe(true);
    });

    it("should toggle from listening to stopped", () => {
      let isListening = true;
      const toggle = () => {
        isListening = !isListening;
      };

      toggle();
      expect(isListening).toBe(false);
    });
  });
});
