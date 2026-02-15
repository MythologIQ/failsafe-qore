/**
 * Void Speech-to-Text Component
 * Voice input using Web Speech API for Void capture.
 * @module zo/ui-shell/shared/void-stt
 */
(function() {
  "use strict";

  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  var state = {
    recognition: null,
    isListening: false,
    interimTranscript: "",
    finalTranscript: ""
  };

  var callbacks = {
    onTranscript: null,
    onError: null,
    onStateChange: null
  };

  function VoidSTT() {}

  VoidSTT.prototype.isSupported = function() {
    return Boolean(SpeechRecognition);
  };

  VoidSTT.prototype.init = function() {
    if (!this.isSupported()) return false;

    state.recognition = new SpeechRecognition();
    state.recognition.continuous = true;
    state.recognition.interimResults = true;
    state.recognition.lang = "en-US";

    var self = this;
    state.recognition.onresult = function(event) {
      self.handleResult(event);
    };
    state.recognition.onerror = function(event) {
      self.handleError(event);
    };
    state.recognition.onend = function() {
      if (state.isListening) {
        state.isListening = false;
        self.notifyStateChange();
      }
    };

    return true;
  };

  VoidSTT.prototype.start = function() {
    if (!state.recognition || state.isListening) return;
    try {
      state.recognition.start();
      state.isListening = true;
      state.interimTranscript = "";
      state.finalTranscript = "";
      this.notifyStateChange();
    } catch (e) {
      this.handleError({ error: "start-failed", message: e.message });
    }
  };

  VoidSTT.prototype.stop = function() {
    if (!state.recognition || !state.isListening) return;
    state.recognition.stop();
    state.isListening = false;
    this.notifyStateChange();
  };

  VoidSTT.prototype.toggle = function() {
    if (state.isListening) {
      this.stop();
    } else {
      this.start();
    }
  };

  VoidSTT.prototype.handleResult = function(event) {
    var interim = "";
    var final = "";

    for (var i = event.resultIndex; i < event.results.length; i++) {
      var transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += transcript;
      } else {
        interim += transcript;
      }
    }

    state.interimTranscript = interim;
    if (final) {
      state.finalTranscript = final;
      if (typeof callbacks.onTranscript === "function") {
        callbacks.onTranscript(final, true);
      }
    } else if (interim && typeof callbacks.onTranscript === "function") {
      callbacks.onTranscript(interim, false);
    }
  };

  VoidSTT.prototype.handleError = function(event) {
    var errorMessages = {
      "not-allowed": "Microphone access denied. Enable in browser settings.",
      "no-speech": "No speech detected. Try again.",
      "audio-capture": "Microphone not available.",
      "network": "Network error. Check connection.",
      "start-failed": "Failed to start recognition."
    };
    var message = errorMessages[event.error] || "Speech recognition error.";
    if (typeof callbacks.onError === "function") {
      callbacks.onError({ code: event.error, message: message });
    }
    state.isListening = false;
    this.notifyStateChange();
  };

  VoidSTT.prototype.notifyStateChange = function() {
    if (typeof callbacks.onStateChange === "function") {
      callbacks.onStateChange(state.isListening);
    }
  };

  VoidSTT.prototype.getState = function() {
    return {
      isListening: state.isListening,
      interimTranscript: state.interimTranscript,
      finalTranscript: state.finalTranscript
    };
  };

  Object.defineProperty(VoidSTT.prototype, "onTranscript", {
    set: function(fn) { callbacks.onTranscript = fn; }
  });

  Object.defineProperty(VoidSTT.prototype, "onError", {
    set: function(fn) { callbacks.onError = fn; }
  });

  Object.defineProperty(VoidSTT.prototype, "onStateChange", {
    set: function(fn) { callbacks.onStateChange = fn; }
  });

  window.VoidSTT = new VoidSTT();
})();
