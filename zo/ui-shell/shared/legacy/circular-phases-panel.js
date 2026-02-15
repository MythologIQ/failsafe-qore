/**
 * CircularPhasesPanel - SVG-based circular deployment phases gauge
 * Renders a radial progress display with center debug indicator and 5 phase arcs
 */
export class CircularPhasesPanel {
  constructor(elements) {
    this.el = elements;
    this.lastState = null;

    // Phase configuration - 4 outer phases (Debug is center indicator)
    this.phases = [
      { id: 'plan', label: 'Plan', color: 'var(--primary)' },
      { id: 'audit', label: 'Audit', color: '#a78bfa' },
      { id: 'implement', label: 'Implement', color: 'var(--accent)' },
      { id: 'substantiate', label: 'Substantiate', color: 'var(--good)' }
    ];

    // Arc geometry constants - 4 phases
    this.cx = 150;           // Standard center
    this.cy = 150;           // Standard center
    this.trackRadius = 85;   // Keep this size
    this.trackWidth = 32;    // Arc stroke width (thickened)
    this.gapDegrees = 12;    // Gap between arcs
    this.totalGap = this.gapDegrees * 4;  // 4 gaps for 4 phases
    this.totalArc = 360 - this.totalGap;  // 312 degrees total
    this.arcPerPhase = this.totalArc / 4; // 78 degrees each
    this.startAngle = -90;   // Start at 12 o'clock
  }

  /**
   * Main render entry point
   * @param {Object} state - Application state with hub.activePlan
   */
  render(state) {
    if (!this.el.circularPhasesSvg) return;

    const plan = state?.hub?.activePlan || { phases: [], blockers: [], currentPhaseId: 'plan' };
    const currentPhaseId = plan.currentPhaseId || 'plan';
    const isDebugging = currentPhaseId === 'debug';
    const blockers = plan.blockers || [];
    const hasUnresolvedBlockers = blockers.some(b => !b.resolvedAt);

    this.renderCenterIndicator(isDebugging, hasUnresolvedBlockers);
    this.renderPhaseArcs(plan.phases || [], currentPhaseId);
    this.renderPhaseLabels(currentPhaseId);

    this.lastState = state;
  }

  /**
   * Render center debug indicator circle
   * States: Clear/dark when not debugging, RED when in debug phase
   */
  renderCenterIndicator(isDebugging, hasBlockers) {
    const indicator = this.el.debugIndicatorCenter;
    if (!indicator) return;

    let stateClass = 'debug-idle';  // Default: clear/dark
    let label = 'DEBUG';

    if (isDebugging) {
      stateClass = hasBlockers ? 'debug-active has-blockers' : 'debug-active';
      label = 'DEBUG';
    }

    indicator.innerHTML = `
      <circle class="debug-indicator-glow-ring" cx="${this.cx}" cy="${this.cy}" r="52" filter="url(#glow-cyan)" />
      <circle class="debug-indicator-bg" cx="${this.cx}" cy="${this.cy}" r="50" />
      <circle class="debug-indicator-inner ${stateClass}" cx="${this.cx}" cy="${this.cy}" r="44" />
      <circle class="debug-indicator-ring" cx="${this.cx}" cy="${this.cy}" r="47" />
      <text class="debug-indicator-text ${stateClass}" x="${this.cx}" y="${this.cy + 5}">${label}</text>
    `;
  }

  /**
   * Render the 4 phase arc segments with progress fills
   */
  renderPhaseArcs(phases, currentPhaseId) {
    const arcsGroup = this.el.phaseArcsGroup;
    if (!arcsGroup) return;

    let html = '';
    let currentAngle = this.startAngle;

    this.phases.forEach((phaseConfig, idx) => {
      const phaseData = phases.find(p => p.id === phaseConfig.id) || {};
      const progress = phaseData.progress || 0;
      const isActive = phaseConfig.id === currentPhaseId;
      const isComplete = phaseData.status === 'complete';

      const startAngle = currentAngle;
      const endAngle = startAngle + this.arcPerPhase;

      // Track (background arc)
      const trackPath = this.describeArc(this.cx, this.cy, this.trackRadius, startAngle, endAngle);

      // Fill (progress arc)
      const fillAngle = startAngle + (this.arcPerPhase * (progress / 100));
      const fillPath = this.describeArc(this.cx, this.cy, this.trackRadius, startAngle, fillAngle);

      const activeClass = isActive ? 'phase-arc-active' : '';
      const completeClass = isComplete ? 'phase-arc-complete' : '';

      html += `
        <path class="phase-arc-track" d="${trackPath}" />
        <path class="phase-arc-fill phase-${phaseConfig.id} ${activeClass} ${completeClass}"
              d="${fillPath}"
              style="--phase-color: ${phaseConfig.color}" />
      `;

      currentAngle = endAngle + this.gapDegrees;
    });

    arcsGroup.innerHTML = html;
  }

  /**
   * Render phase labels positioned around the arcs
   */
  renderPhaseLabels(currentPhaseId) {
    const labelsGroup = this.el.phaseLabelsGroup;
    if (!labelsGroup) return;

    let html = '';
    let currentAngle = this.startAngle;
    const labelRadius = this.trackRadius + 55; // 140px - push labels outside the arcs

    this.phases.forEach((phaseConfig) => {
      const midAngle = currentAngle + this.arcPerPhase / 2;
      const pos = this.polarToCartesian(this.cx, this.cy, labelRadius, midAngle);
      const isActive = phaseConfig.id === currentPhaseId;
      const activeClass = isActive ? 'phase-label-active' : '';

      // Calculate text anchor based on position
      let anchor = 'middle';
      if (pos.x < this.cx - 20) anchor = 'end';
      else if (pos.x > this.cx + 20) anchor = 'start';

      html += `
        <text class="phase-label ${activeClass}"
              x="${pos.x}" y="${pos.y}"
              text-anchor="${anchor}"
              dy="0.35em">${phaseConfig.label}</text>
      `;

      currentAngle += this.arcPerPhase + this.gapDegrees;
    });

    labelsGroup.innerHTML = html;
  }

  /**
   * Generate SVG arc path
   * @param {number} cx - Center X
   * @param {number} cy - Center Y
   * @param {number} radius - Arc radius
   * @param {number} startAngle - Start angle in degrees
   * @param {number} endAngle - End angle in degrees
   * @returns {string} SVG path d attribute
   */
  describeArc(cx, cy, radius, startAngle, endAngle) {
    const start = this.polarToCartesian(cx, cy, radius, endAngle);
    const end = this.polarToCartesian(cx, cy, radius, startAngle);
    const arcSweep = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      'M', start.x, start.y,
      'A', radius, radius, 0, arcSweep, 0, end.x, end.y
    ].join(' ');
  }

  /**
   * Convert polar coordinates to Cartesian
   * @param {number} cx - Center X
   * @param {number} cy - Center Y
   * @param {number} radius - Distance from center
   * @param {number} angleDeg - Angle in degrees
   * @returns {{x: number, y: number}} Cartesian coordinates
   */
  polarToCartesian(cx, cy, radius, angleDeg) {
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(angleRad),
      y: cy + radius * Math.sin(angleRad)
    };
  }

  /**
   * Get phase index by ID
   */
  getPhaseIndex(phaseId) {
    return this.phases.findIndex(p => p.id === phaseId);
  }

  /**
   * Utility: Escape HTML entities
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
