(function() {
  "use strict";

  function RiskRegister() {
    this.container = null;
    this.state = null;
    this.onAddRisk = null;
    this.onDeriveGuardrail = null;
  }

  RiskRegister.prototype.mount = function(container) {
    this.container = container;
    this.render();
  };

  RiskRegister.prototype.setState = function(state) {
    this.state = state;
    this.render();
  };

  RiskRegister.prototype.render = function() {
    if (!this.container || !this.state) return;

    var html = '<div class="risk-register">';
    html += this.renderHeader();
    html += this.renderMatrix();
    html += this.renderRiskList();
    html += '</div>';

    this.container.innerHTML = html;
    this.attachHandlers();
  };

  RiskRegister.prototype.renderHeader = function() {
    var s = this.state;
    return '<div class="risk-register-header">' +
      '<div>' +
        '<h3>Risk Register</h3>' +
        '<div class="risk-summary">' + s.risks.length + ' risks \u2022 ' +
          s.unresolvedCount + ' unresolved \u2022 ' +
          s.mitigatedCount + ' mitigated</div>' +
      '</div>' +
      '<button class="btn btn-primary" data-action="add">Add Risk</button>' +
    '</div>';
  };

  RiskRegister.prototype.renderMatrix = function() {
    var html = '<div class="risk-matrix">';
    html += '<div class="risk-matrix-label"></div>';
    html += '<div class="risk-matrix-label">Low</div>';
    html += '<div class="risk-matrix-label">Medium</div>';
    html += '<div class="risk-matrix-label">High</div>';

    var likelihoods = ["high", "medium", "low"];
    for (var i = 0; i < likelihoods.length; i++) {
      html += '<div class="risk-matrix-label">' + capitalize(likelihoods[i]) + '</div>';
      for (var j = 0; j < 3; j++) {
        var cell = this.state.matrix[2 - i][j];
        var severity = getSeverity(likelihoods[i], j);
        html += '<div class="risk-matrix-cell severity-' + severity + '">';
        for (var k = 0; k < cell.risks.length; k++) {
          html += '<span class="risk-chip" data-risk-id="' + cell.risks[k].id + '">';
          html += (k + 1) + '</span>';
        }
        html += '</div>';
      }
    }
    html += '</div>';
    return html;
  };

  RiskRegister.prototype.renderRiskList = function() {
    var html = '<div class="risk-list">';
    for (var i = 0; i < this.state.risks.length; i++) {
      html += this.renderRiskCard(this.state.risks[i]);
    }
    html += '</div>';
    return html;
  };

  RiskRegister.prototype.renderRiskCard = function(risk) {
    var scoreClass = risk.riskScore <= 2 ? "low" : risk.riskScore <= 6 ? "medium" : "high";

    var html = '<div class="risk-card" data-risk-id="' + risk.id + '">';
    html += '<div class="risk-card-header">';
    html += '<span class="risk-score score-' + scoreClass + '">Score: ' + risk.riskScore + '</span>';
    html += '<span class="risk-status-badge">' + risk.status + '</span>';
    html += '</div>';
    html += '<p class="risk-description">' + escapeHtml(risk.description) + '</p>';

    if (risk.hasGuardrail) {
      html += '<div class="guardrail-indicator">\u2713 Guardrail derived</div>';
    } else if (risk.status === "mitigated") {
      html += '<div class="risk-actions">';
      html += '<button class="btn btn-sm" data-action="derive" data-risk-id="' + risk.id + '">';
      html += 'Derive Guardrail</button>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  };

  RiskRegister.prototype.attachHandlers = function() {
    var self = this;
    var buttons = this.container.querySelectorAll("[data-action]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function(e) {
        var action = e.target.getAttribute("data-action");
        var riskId = e.target.getAttribute("data-risk-id");
        if (action === "add" && self.onAddRisk) self.onAddRisk();
        if (action === "derive" && self.onDeriveGuardrail) self.onDeriveGuardrail(riskId);
      });
    }
  };

  function getSeverity(likelihood, impactIdx) {
    var l = likelihood === "high" ? 3 : likelihood === "medium" ? 2 : 1;
    var i = impactIdx + 1;
    var score = l * i;
    return score <= 2 ? "low" : score <= 6 ? "medium" : "high";
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  window.RiskRegister = RiskRegister;
})();
