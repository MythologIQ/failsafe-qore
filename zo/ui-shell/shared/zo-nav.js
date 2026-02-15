/**
 * Zo Navigation Sidebar Component
 * Provides persistent navigation to all project views.
 * @module zo/ui-shell/shared/zo-nav
 */
(function() {
  "use strict";

  var NAV_ITEMS = [
    { route: "void", label: "Brainstorm", icon: "\u270F", desc: "Capture and explore ideas" },
    { route: "constellation", label: "Mind Map", icon: "\u2606", desc: "Visualize idea connections" },
    { route: "path", label: "Roadmap", icon: "\u2192", desc: "Gantt sheet and phases" },
    { route: "risk", label: "Risk Register", icon: "\u26A0", desc: "Track project risks" },
    { route: "autonomy", label: "All Projects", icon: "\u2630", desc: "Manage workspaces" }
  ];

  var state = {
    currentRoute: "void",
    projectId: null,
    projectName: "Current Project",
    projects: [],
    routeStates: {},
    recommendedNext: null,
    collapsed: false
  };

  function ZoNav() {
    this.container = null;
    this.onNavigate = null;
  }

  ZoNav.prototype.mount = function(container) {
    this.container = container;
    this.render();
    this.attachHandlers();
    this.checkResponsive();
    this.showSubpanel(state.currentRoute);
    window.addEventListener("resize", this.checkResponsive.bind(this));

    // Listen for navigation from other components
    var self = this;
    document.addEventListener("click", function(e) {
      var navBtn = e.target.closest("[data-navigate]");
      if (navBtn) {
        var route = navBtn.getAttribute("data-navigate");
        self.navigateTo(route);
      }
    });
  };

  ZoNav.prototype.setRoute = function(route) {
    state.currentRoute = route;
    this.render();
    this.showSubpanel(route);
  };

  ZoNav.prototype.setProjectId = function(projectId, projectName) {
    state.projectId = projectId;
    state.projectName = projectName || "Project";
    this.render();
    this.fetchNavState();
  };

  ZoNav.prototype.setProjects = function(projects) {
    state.projects = projects || [];
    this.render();
  };

  ZoNav.prototype.updateRouteStates = function(routeStates, recommendedNext) {
    state.routeStates = routeStates || {};
    state.recommendedNext = recommendedNext;
    this.render();
  };

  ZoNav.prototype.fetchNavState = function() {
    var self = this;
    if (!state.projectId) return;
    fetch("/api/project/" + state.projectId + "/nav-state")
      .then(function(res) { return res.json(); })
      .then(function(data) {
        self.updateRouteStates(data.routes, data.recommendedNext);
      })
      .catch(function() {});
  };

  ZoNav.prototype.showSubpanel = function(route) {
    // Hide all subpanels
    var subpanels = document.querySelectorAll(".projects-subpanel");
    subpanels.forEach(function(panel) {
      panel.classList.remove("active");
    });

    // Show the target subpanel
    var target = document.getElementById("subpanel-" + route);
    if (target) {
      target.classList.add("active");
    }
  };

  ZoNav.prototype.render = function() {
    if (!this.container) return;
    var html = '<nav class="zo-nav' + (state.collapsed ? ' zo-nav--collapsed' : '') + '">';

    // Project selector at top
    html += '<div class="zo-nav__project-selector">';
    html += '<button class="zo-nav__project-btn" type="button">';
    html += '<span class="zo-nav__project-icon">\u25A0</span>';
    if (!state.collapsed) {
      html += '<span class="zo-nav__project-name">' + this.escapeHtml(state.projectName) + '</span>';
      html += '<span class="zo-nav__project-chevron">\u25BC</span>';
    }
    html += '</button>';
    html += '</div>';

    // Navigation list
    html += '<ul class="zo-nav__list">';

    for (var i = 0; i < NAV_ITEMS.length; i++) {
      var item = NAV_ITEMS[i];
      var isActive = state.currentRoute === item.route;
      var routeState = state.routeStates[item.route] || {};
      var hasData = routeState.hasData;
      var isRecommended = state.recommendedNext === item.route;
      var classes = "zo-nav__item";
      if (isActive) classes += " zo-nav__item--active";
      if (hasData) classes += " zo-nav__item--has-data";
      if (isRecommended) classes += " zo-nav__item--recommended";

      html += '<li class="' + classes + '" data-route="' + item.route + '" tabindex="0">';
      html += '<span class="zo-nav__icon">' + item.icon + '</span>';
      html += '<span class="zo-nav__label">' + item.label + '</span>';
      if (hasData && routeState.count !== undefined) {
        html += '<span class="zo-nav__badge">' + routeState.count + '</span>';
      }
      if (isRecommended) {
        html += '<span class="zo-nav__pulse"></span>';
      }
      html += '<span class="zo-nav__tooltip">' + item.desc + '</span>';
      html += '</li>';
    }

    html += '</ul></nav>';
    this.container.innerHTML = html;
    this.attachHandlers();
  };

  ZoNav.prototype.escapeHtml = function(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  };

  ZoNav.prototype.attachHandlers = function() {
    var self = this;
    var items = this.container.querySelectorAll(".zo-nav__item");
    items.forEach(function(item) {
      item.addEventListener("click", function() {
        var route = item.getAttribute("data-route");
        self.navigateTo(route);
      });
      item.addEventListener("keydown", function(e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          var route = item.getAttribute("data-route");
          self.navigateTo(route);
        }
      });
    });

    // Project selector click
    var projectBtn = this.container.querySelector(".zo-nav__project-btn");
    if (projectBtn) {
      projectBtn.addEventListener("click", function() {
        // Navigate to All Projects view
        self.navigateTo("autonomy");
      });
    }
  };

  ZoNav.prototype.navigateTo = function(route) {
    state.currentRoute = route;
    this.render();
    this.showSubpanel(route);
    if (typeof this.onNavigate === "function") {
      this.onNavigate(route);
    }
    window.dispatchEvent(new CustomEvent("zo-navigate", { detail: { route: route } }));
  };

  ZoNav.prototype.checkResponsive = function() {
    var wasCollapsed = state.collapsed;
    state.collapsed = window.innerWidth < 768;
    if (wasCollapsed !== state.collapsed) {
      this.render();
    }
  };

  window.ZoNav = new ZoNav();
})();
