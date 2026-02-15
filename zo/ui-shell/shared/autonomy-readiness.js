(function() {
  "use strict";

  function AutonomyReadiness() {
    this.container = null;
    this.state = null;
    this.onStartExecution = null;
  }

  AutonomyReadiness.prototype.mount = function(container) {
    this.container = container;
    this.render();
  };

  AutonomyReadiness.prototype.setState = function(state) {
    this.state = state;
    this.render();
  };

  AutonomyReadiness.prototype.render = function() {
    if (!this.container || !this.state) return;

    var html = '<div class="autonomy-readiness">';
    html += this.renderHeader();
    html += this.renderChecks();
    html += this.renderAction();
    html += '</div>';

    this.container.innerHTML = html;
    this.attachHandlers();
  };

  AutonomyReadiness.prototype.renderHeader = function() {
    var statusClass = this.state.isReady ? "ready" : "blocked";
    var statusText = this.state.isReady ? "Ready for Autonomy" : "Not Ready";

    return '<div class="readiness-header">' +
      '<h3>Autonomy Readiness</h3>' +
      '<span class="readiness-status status-' + statusClass + '">' + statusText + '</span>' +
    '</div>';
  };

  AutonomyReadiness.prototype.renderChecks = function() {
    var html = '<div class="readiness-checks">';
    for (var i = 0; i < this.state.checks.length; i++) {
      var check = this.state.checks[i];
      var iconClass = check.passed ? "passed" : check.severity === "warning" ? "warning" : "failed";
      var icon = check.passed ? "\u2713" : check.severity === "warning" ? "!" : "\u2717";

      html += '<div class="check-item">';
      html += '<span class="check-icon icon-' + iconClass + '">' + icon + '</span>';
      html += '<span class="check-name">' + escapeHtml(check.name) + '</span>';
      html += '<span class="check-reason">' + escapeHtml(check.reason) + '</span>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  };

  AutonomyReadiness.prototype.renderAction = function() {
    if (!this.state.isReady) {
      return '<button class="start-btn" disabled>Resolve Blockers to Enable</button>';
    }
    return '<button class="start-btn" data-action="start">Start Autonomous Execution</button>';
  };

  AutonomyReadiness.prototype.attachHandlers = function() {
    var self = this;
    var btn = this.container.querySelector("[data-action='start']");
    if (btn && self.onStartExecution) {
      btn.addEventListener("click", function() {
        self.onStartExecution();
      });
    }
  };

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  window.AutonomyReadiness = AutonomyReadiness;
})();
