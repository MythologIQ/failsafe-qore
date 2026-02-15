/**
 * Empty State Renderer Component
 * Displays helpful empty states when prerequisite data is missing.
 * @module zo/ui-shell/shared/empty-state
 */
(function() {
  "use strict";

  var dismissedStates = {};

  function EmptyStateRenderer() {
    this.container = null;
    this.currentConfig = null;
  }

  EmptyStateRenderer.prototype.mount = function(container) {
    this.container = container;
  };

  EmptyStateRenderer.prototype.render = function(config) {
    if (!this.container || !config) return;
    if (dismissedStates[config.route]) {
      this.container.innerHTML = "";
      return;
    }

    this.currentConfig = config;
    var html = '<div class="empty-state">';
    html += '<div class="empty-state__icon">' + config.icon + '</div>';
    html += '<h2 class="empty-state__title">' + config.title + '</h2>';
    html += '<p class="empty-state__desc">' + config.description + '</p>';
    html += '<button class="empty-state__action" data-route="' + config.actionRoute + '">';
    html += config.actionLabel;
    html += '</button>';
    if (config.tip) {
      html += '<p class="empty-state__tip">' + config.tip + '</p>';
    }
    html += '<button class="empty-state__dismiss">Dismiss</button>';
    html += '</div>';

    this.container.innerHTML = html;
    this.attachHandlers();
  };

  EmptyStateRenderer.prototype.attachHandlers = function() {
    var self = this;
    var actionBtn = this.container.querySelector(".empty-state__action");
    var dismissBtn = this.container.querySelector(".empty-state__dismiss");

    if (actionBtn) {
      actionBtn.addEventListener("click", function() {
        var route = actionBtn.getAttribute("data-route");
        window.dispatchEvent(new CustomEvent("zo-navigate", { detail: { route: route } }));
      });
    }

    if (dismissBtn) {
      dismissBtn.addEventListener("click", function() {
        if (self.currentConfig) {
          dismissedStates[self.currentConfig.route] = true;
        }
        self.container.innerHTML = "";
      });
    }
  };

  EmptyStateRenderer.prototype.clear = function() {
    if (this.container) {
      this.container.innerHTML = "";
    }
  };

  EmptyStateRenderer.prototype.resetDismissals = function() {
    dismissedStates = {};
  };

  window.EmptyStateRenderer = new EmptyStateRenderer();
})();
