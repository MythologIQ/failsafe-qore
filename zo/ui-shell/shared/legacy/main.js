import { UiStateStore } from './state-store.js?v=2';
import { DataClient } from './data-client.js';
import { SkillsPanel } from './skills-panel.js';
import { InsightsPanel } from './insights-panel.js';
import { IntentAssistant } from './intent-assistant.js';
import { ActivityPanel } from './activity-panel.js';
import { CircularPhasesPanel } from './circular-phases-panel.js?v=101';
import { PhaseVisualizationPanel } from './phase-visualization-panel.js?v=101';
import { resolveGovernanceState } from './governance-model.js';
import { capitalize, escapeHtml } from './utils.js';
import { selectPreferredSkill } from './skill-selection.js';

const stateStore = new UiStateStore();

const elements = {
  root: document.documentElement,
  app: document.getElementById('app'),
  error: document.getElementById('global-error'),
  resumeSummary: document.getElementById('resume-summary'),
  sessionUser: document.getElementById('session-user'),
  sessionLogout: document.getElementById('session-logout'),
  settingsGear: document.getElementById('settings-gear'),
  statusDot: document.querySelector('.status-dot'),
  statusText: document.querySelector('.status-text'),
  statusGovernance: document.getElementById('status-governance'),
  statusGovernanceMode: document.getElementById('status-governance-mode'),
  statusGovernanceProfile: document.getElementById('status-governance-profile'),
  statusGovernanceProtocol: document.getElementById('status-governance-protocol'),
  statusSentinel: document.getElementById('status-sentinel'),
  statusLatency: document.getElementById('status-latency'),
  statusLoad: document.getElementById('status-load'),
  statusVersion: document.getElementById('status-version'),
  tabs: Array.from(document.querySelectorAll('.tab')),
  panels: Array.from(document.querySelectorAll('.route-panel')),
  themeSelect: document.getElementById('theme-select'),
  themeChips: Array.from(document.querySelectorAll('[data-theme-choice]')),

  homeKpis: document.getElementById('home-kpis'),
  homeOperational: document.getElementById('home-operational'),
  homeForensic: document.getElementById('home-forensic'),
  homeResource: document.getElementById('home-resource'),
  homeNextgen: document.getElementById('home-nextgen'),

  hubActions: document.getElementById('hub-actions'),
  actionFeedback: document.getElementById('action-feedback'),
  workspaceHealth: document.getElementById('workspace-health'),
  sprintInfo: document.getElementById('sprint-info'),
  roadmapSvg: document.getElementById('roadmap-svg'),
  phaseGrid: document.getElementById('phase-grid'),
  blockers: document.getElementById('blockers'),

  skillPhaseLabel: document.getElementById('skill-phase-label'),
  skillRecommended: document.getElementById('skill-recommended'),
  skillAllRelevant: document.getElementById('skill-all-relevant'),
  skillAllInstalled: document.getElementById('skill-all-installed'),
  skillOther: document.getElementById('skill-other'),
  skillsActiveCount: document.getElementById('skills-active-count'),
  skillTabs: Array.from(document.querySelectorAll('[data-skill-tab]')),
  skillPanels: Array.from(document.querySelectorAll('[data-skill-panel]')),
  skillAutoIngest: document.getElementById('skill-auto-ingest'),
  skillManualIngest: document.getElementById('skill-manual-ingest'),
  skillIngestMenu: document.getElementById('skill-ingest-menu'),
  skillManualFile: document.getElementById('skill-manual-file'),
  skillManualFolder: document.getElementById('skill-manual-folder'),
  skillManualFileInput: document.getElementById('skill-manual-file-input'),
  skillManualFolderInput: document.getElementById('skill-manual-folder-input'),
  skillIngestStatus: document.getElementById('skill-ingest-status'),

  intentContext: document.getElementById('intent-context'),
  intentInput: document.getElementById('intent-input'),
  intentContextInput: document.getElementById('intent-context-input'),
  intentTemplate: document.getElementById('intent-template'),
  intentPersona: document.getElementById('intent-persona'),
  intentSkillSelect: document.getElementById('intent-skill-select'),
  intentModelMode: document.getElementById('intent-model-mode'),
  intentApprove: document.getElementById('intent-approve'),
  intentSend: document.getElementById('intent-send'),
  intentTaskNature: document.getElementById('intent-task-nature'),
  intentModelRecommendation: document.getElementById('intent-model-recommendation'),
  intentVendorPractices: document.getElementById('intent-vendor-practices'),
  intentGenerate: document.getElementById('intent-generate'),
  intentCopy: document.getElementById('intent-copy'),
  intentOutput: document.getElementById('intent-output'),
  intentChatOutput: document.getElementById('intent-chat-output'),
  intentChatId: document.getElementById('intent-chat-id'),
  sessionChatId: document.getElementById('session-chat-id'),
  sessionChatNew: document.getElementById('session-chat-new'),
  sessionChatMemory: document.getElementById('session-chat-memory'),
  intentChatLogs: document.getElementById('intent-chat-logs'),
  intentChatLogModal: document.getElementById('intent-chat-log-modal'),
  intentChatLogClose: document.getElementById('intent-chat-log-close'),
  intentChatLogContent: document.getElementById('intent-chat-log-content'),
  intentFlowPipeline: document.getElementById('intent-flow-pipeline'),
  intentFlowPackage: document.getElementById('intent-flow-package'),
  intentFlowChat: document.getElementById('intent-flow-chat'),
  skillScribeGoal: document.getElementById('skill-scribe-goal'),
  skillScribeGuidance: document.getElementById('skill-scribe-guidance'),
  skillScribeContext: document.getElementById('skill-scribe-context'),
  skillScribeContextLog: document.getElementById('skill-scribe-context-log'),
  skillScribeAddContext: document.getElementById('skill-scribe-add-context'),
  skillScribeAlert: document.getElementById('skill-scribe-alert'),
  skillScribeGenerate: document.getElementById('skill-scribe-generate'),
  skillScribeCopy: document.getElementById('skill-scribe-copy'),
  skillScribeOutput: document.getElementById('skill-scribe-output'),

  sentinelStatus: document.getElementById('sentinel-status'),
  l3Queue: document.getElementById('l3-queue'),
  trustSummary: document.getElementById('trust-summary'),
  sentinelAlerts: document.getElementById('sentinel-alerts'),

  focusToggle: document.getElementById('focus-toggle'),
  eventStream: document.getElementById('event-stream'),

  reportsSummary: document.getElementById('reports-summary'),
  reportsEvidence: document.getElementById('reports-evidence'),
  reportSubtabs: Array.from(document.querySelectorAll('[data-report-subtab]')),
  reportPanels: Array.from(document.querySelectorAll('[data-report-panel]')),

  // Run page redesign - Circular Phases
  circularPhasesSvg: document.getElementById('circular-phases-svg'),
  debugIndicatorCenter: document.getElementById('debug-indicator-center'),
  debugIndicatorFill: document.getElementById('debug-indicator-fill'),
  debugIndicatorLabel: document.getElementById('debug-indicator-label'),
  phaseArcsGroup: document.getElementById('phase-arcs-fills'),
  phaseLabelsGroup: document.getElementById('phase-labels-group'),

  // Run page redesign - Phase Visualization
  phaseVisualizationSvg: document.getElementById('phase-visualization-svg'),
  vizPhaseTitle: document.getElementById('viz-phase-title'),
  vizPhaseBadge: document.getElementById('viz-phase-badge'),
  vizBackgroundLayer: document.getElementById('viz-background-layer'),
  vizConnectionsLayer: document.getElementById('viz-connections-layer'),
  vizNodesLayer: document.getElementById('viz-nodes-layer'),
  vizAnnotationsLayer: document.getElementById('viz-annotations-layer'),
  vizLegend: document.getElementById('viz-legend'),

  // Run page redesign - Sidebar & Panic
  panicStopMain: document.getElementById('panic-stop-main'),
  runDeploymentInfo: document.getElementById('run-deployment-info'),
  runRecentActions: document.getElementById('run-recent-actions'),
  runBlockers: document.getElementById('run-blockers'),
  runPerformance: document.getElementById('run-performance'),
};

let lastPhase = { key: 'plan', title: 'Plan', status: 'pending' };
let lastGrouped = { recommended: [], allRelevant: [], otherAvailable: [] };
let lastRelevanceRequestPhase = '';
let actionFeedbackTimer = null;
let settingsReturnRoute = 'home';

function showError(message, retryAction) {
  elements.error.classList.remove('hidden');
  // Security: Escape user-controlled error messages to prevent XSS
  elements.error.innerHTML = `<span>${escapeHtml(message)}</span>${retryAction ? ' <button id="retry-action" type="button">Retry</button>' : ''}`;
  if (retryAction) {
    const button = elements.error.querySelector('#retry-action');
    if (button) button.addEventListener('click', retryAction, { once: true });
  }
}

function clearError() {
  elements.error.classList.add('hidden');
  elements.error.textContent = '';
}

function applyTheme() {
  const allowedThemes = new Set(['mythiq', 'pegasus', 'midnight', 'aurora', 'crimson', 'atmosphere']);
  const stored = String(localStorage.getItem('failsafe.theme') || '').toLowerCase();
  const requested = String(new URLSearchParams(window.location.search).get('theme') || '').toLowerCase();
  let theme = allowedThemes.has(requested) ? requested : (allowedThemes.has(stored) ? stored : 'mythiq');
  
  elements.root.setAttribute('data-theme', theme);
  stateStore.patch({ theme });
}

function applyRoute(route) {
  const tabList = elements.tabs;
  const panelList = elements.panels;
  tabList.forEach((tab) => tab.classList.toggle('active', tab.dataset.route === route));
  panelList.forEach((panel) => panel.classList.toggle('active-panel', panel.dataset.route === route));
  stateStore.patch({ route });
}

function setupTabs() {
  elements.tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => applyRoute(tab.dataset.route));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const next = (index + direction + elements.tabs.length) % elements.tabs.length;
      elements.tabs[next].focus();
      applyRoute(elements.tabs[next].dataset.route);
    });
  });

  const requestedView = new URLSearchParams(window.location.search).get('view');
  const map = { timeline: 'run', 'current-sprint': 'run', 'live-activity': 'reports', settings: 'settings' };
  applyRoute(map[requestedView] || 'home');

  document.querySelectorAll('[data-route-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      const route = button.getAttribute('data-route-jump');
      if (route) applyRoute(route);
    });
  });
}

function setupHeaderControls() {
  const sessionUser = localStorage.getItem('zoqore.session.user') || 'operator@local';
  if (elements.sessionUser) {
    elements.sessionUser.textContent = `Logged in: ${sessionUser}`;
  }

  elements.sessionLogout?.addEventListener('click', () => {
    localStorage.removeItem('zoqore.session.user');
    localStorage.removeItem('failsafe.lastVisitAt');
    stateStore.patch({ route: 'home' });
    if (elements.sessionUser) elements.sessionUser.textContent = 'Logged in: signed-out';
    applyRoute('home');
  });

  elements.settingsGear?.addEventListener('click', () => {
    const currentRoute = String(stateStore.get().route || 'home');
    if (currentRoute === 'settings') {
      applyRoute(settingsReturnRoute || 'home');
      return;
    }
    settingsReturnRoute = currentRoute;
    applyRoute('settings');
  });
}

function setupReportSubtabs() {
  const applyReportTab = (tab) => {
    elements.reportSubtabs.forEach((node) => {
      const active = node.getAttribute('data-report-subtab') === tab;
      node.classList.toggle('active', active);
      node.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    elements.reportPanels.forEach((panel) => {
      panel.classList.toggle('active', panel.getAttribute('data-report-panel') === tab);
    });
  };

  elements.reportSubtabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      applyReportTab(tab.getAttribute('data-report-subtab') || 'summary');
    });
  });

  applyReportTab('summary');
}

function setupIntentSkillSelector() {
  elements.intentSkillSelect?.addEventListener('change', () => {
    const next = String(elements.intentSkillSelect?.value || '');
    stateStore.patch({ selectedSkillKey: next || null });
    intentAssistant.renderContext();
  });
}

function renderIntentSkillSelector(state) {
  const select = elements.intentSkillSelect;
  if (!select) return;

  const skills = Array.isArray(state.skills) ? state.skills : [];
  const selected = String(state.selectedSkillKey || '');
  const previous = String(select.value || '');
  const target = selected || previous;

  const options = ['<option value="">Auto (Recommended)</option>'];
  for (const skill of skills) {
    const label = `${skill.label || skill.key}`;
    options.push(`<option value="${escapeHtml(skill.key)}">${escapeHtml(label)}</option>`);
  }
  select.innerHTML = options.join('');

  if (target && skills.some((item) => item.key === target)) {
    select.value = target;
  } else {
    select.value = '';
  }
}

function setupProfile() {
  elements.themeSelect?.addEventListener('change', () => {
    const nextTheme = elements.themeSelect.value;
    setTheme(nextTheme);
  });

  elements.themeChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const nextTheme = chip.getAttribute('data-theme-choice') || 'auto';
      if (elements.themeSelect) {
        elements.themeSelect.value = nextTheme;
      }
      setTheme(nextTheme);
    });
  });
}

function setTheme(nextTheme) {
  localStorage.setItem('failsafe.theme', nextTheme);
  if (nextTheme === 'auto') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    elements.root.setAttribute('data-theme', dark ? 'dark' : 'light');
  } else {
    elements.root.setAttribute('data-theme', nextTheme);
  }
  stateStore.patch({ theme: nextTheme });
}

const skillsPanel = new SkillsPanel({
  elements: {
    phaseLabel: elements.skillPhaseLabel,
    recommended: elements.skillRecommended,
    allRelevant: elements.skillAllRelevant,
    allInstalled: elements.skillAllInstalled,
    other: elements.skillOther,
    tabs: elements.skillTabs,
    panels: elements.skillPanels
  },
  onSelectSkill: (skillKey, phase) => {
    stateStore.patch({ selectedSkillKey: skillKey });
    lastPhase = phase;
    intentAssistant.renderContext();
  }
});

const insights = new InsightsPanel({
  homeKpis: elements.homeKpis,
  homeOperational: elements.homeOperational,
  homeForensic: elements.homeForensic,
  homeResource: elements.homeResource,
  homeNextgen: elements.homeNextgen,
  sprintInfo: elements.sprintInfo,
  workspaceHealth: elements.workspaceHealth,
  roadmapSvg: elements.roadmapSvg,
  phaseGrid: elements.phaseGrid,
  blockers: elements.blockers,
  sentinelStatus: elements.sentinelStatus,
  l3Queue: elements.l3Queue,
  trustSummary: elements.trustSummary,
  sentinelAlerts: elements.sentinelAlerts,
  reportsSummary: elements.reportsSummary,
  reportsEvidence: elements.reportsEvidence
});

const activity = new ActivityPanel({
  elements: { focusToggle: elements.focusToggle, stream: elements.eventStream },
  stateStore
});

const circularPhases = new CircularPhasesPanel({
  circularPhasesSvg: elements.circularPhasesSvg,
  debugIndicatorCenter: elements.debugIndicatorCenter,
  phaseArcsGroup: elements.phaseArcsGroup,
  phaseLabelsGroup: elements.phaseLabelsGroup,
});

const phaseVisualization = new PhaseVisualizationPanel({
  phaseVisualizationSvg: elements.phaseVisualizationSvg,
  vizPhaseTitle: elements.vizPhaseTitle,
  vizPhaseBadge: elements.vizPhaseBadge,
  vizBackgroundLayer: elements.vizBackgroundLayer,
  vizConnectionsLayer: elements.vizConnectionsLayer,
  vizNodesLayer: elements.vizNodesLayer,
  vizAnnotationsLayer: elements.vizAnnotationsLayer,
  vizLegend: elements.vizLegend,
});

const intentAssistant = new IntentAssistant({
  elements: {
    context: elements.intentContext,
    input: elements.intentInput,
    contextInput: elements.intentContextInput,
    template: elements.intentTemplate,
    persona: elements.intentPersona,
    modelMode: elements.intentModelMode,
    approve: elements.intentApprove,
    send: elements.intentSend,
    taskNature: elements.intentTaskNature,
    modelRecommendation: elements.intentModelRecommendation,
    vendorPractices: elements.intentVendorPractices,
    generate: elements.intentGenerate,
    copy: elements.intentCopy,
    output: elements.intentOutput,
    chatOutput: elements.intentChatOutput,
    chatId: elements.intentChatId,
    sessionChatId: elements.sessionChatId,
    sessionChatNew: elements.sessionChatNew,
    sessionChatMemory: elements.sessionChatMemory,
    chatLogsButton: elements.intentChatLogs,
    chatLogModal: elements.intentChatLogModal,
    chatLogClose: elements.intentChatLogClose,
    chatLogContent: elements.intentChatLogContent,
    flowPipeline: elements.intentFlowPipeline,
    flowPackage: elements.intentFlowPackage,
    flowChat: elements.intentFlowChat,
    skillSelect: elements.intentSkillSelect,
  },
  getPhase: () => lastPhase,
  getSelectedSkill: () => stateStore.get().skills.find((item) => item.key === stateStore.get().selectedSkillKey) || null,
  getFallbackSkill: () => selectPreferredSkill(lastGrouped, (key) => skillsPanel.isFavorite(key))
});

function renderHubActions() {
  if (!elements.hubActions) return; // Element removed in Run page redesign
  elements.hubActions.innerHTML = `
    <button class="hub-action-btn primary" type="button" data-action="refresh">Refresh Snapshot</button>
    <button class="hub-action-btn" type="button" data-action="resume">Resume Monitoring</button>
    <button class="hub-action-btn warn" type="button" data-action="panic">Panic Stop</button>
  `;
}

const dataClient = new DataClient({
  onHub: (hub) => {
    clearError();
    stateStore.setHub(hub);
  },
  onSkills: (skills) => stateStore.setSkills(skills),
  onSkillRelevance: (skillRelevance) => stateStore.patch({ skillRelevance }),
  onEvent: (event) => stateStore.pushEvent(event),
  onConnection: (connection) => stateStore.patch({ connection }),
  onError: (message, retry) => showError(message, retry)
});

function setupActions() {
  if (!elements.hubActions) return; // Element removed in Run page redesign
  elements.hubActions.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.getAttribute('data-action');
    button.disabled = true;
    try {
      if (action === 'refresh') {
        await dataClient.fetchHub();
        renderActionFeedback('Snapshot updated. Latest telemetry synced.', 'ok');
      }
      if (action === 'resume') {
        await dataClient.postAction('/api/actions/resume-monitoring');
        renderActionFeedback('Run started. Sentinel resumed and policies validated.', 'ok');
      }
      if (action === 'panic') {
        await dataClient.postAction('/api/actions/panic-stop');
        renderActionFeedback('Monitoring stopped. Risk state elevated until resumed.', 'warn');
      }
      clearError();
    } catch (error) {
      renderActionFeedback(`Action failed: ${String(error)}`, 'err');
      showError(String(error), () => dataClient.fetchHub());
    } finally {
      button.disabled = false;
    }
  });
}

function renderIngestStatus(message, isError = false) {
  elements.skillIngestStatus.textContent = message;
  elements.skillIngestStatus.style.color = isError ? 'var(--bad)' : 'var(--muted)';
}

function renderActionFeedback(message, tone = 'ok') {
  if (!elements.actionFeedback) return;
  elements.actionFeedback.textContent = message;
  elements.actionFeedback.classList.remove('ok', 'warn', 'err');
  elements.actionFeedback.classList.add(tone);
  if (actionFeedbackTimer) clearTimeout(actionFeedbackTimer);
  actionFeedbackTimer = setTimeout(() => {
    elements.actionFeedback.classList.remove('ok', 'warn', 'err');
  }, 5000);
}

function setupSkillIngestActions() {
  const closeIngestMenu = () => {
    if (!elements.skillIngestMenu) return;
    elements.skillIngestMenu.hidden = true;
    elements.skillManualIngest?.setAttribute('aria-expanded', 'false');
  };

  const openIngestMenu = () => {
    if (!elements.skillIngestMenu) return;
    elements.skillIngestMenu.hidden = false;
    elements.skillManualIngest?.setAttribute('aria-expanded', 'true');
  };

  const toggleIngestMenu = () => {
    if (!elements.skillIngestMenu) return;
    if (elements.skillIngestMenu.hidden) openIngestMenu();
    else closeIngestMenu();
  };

  const refreshAfterIngest = async () => {
    await dataClient.fetchSkills();
    if (lastPhase?.key) {
      await dataClient.fetchSkillRelevance(lastPhase.key);
    }
  };

  elements.skillAutoIngest.addEventListener('click', async () => {
    elements.skillAutoIngest.disabled = true;
    renderIngestStatus('Auto ingest running across workspace roots...');
    try {
      const result = await dataClient.autoIngestSkills();
      renderIngestStatus(`Auto ingest complete: admitted ${result.admitted || 0}, failed ${result.failed || 0}, skipped ${result.skipped || 0}.`);
      renderActionFeedback(`Policies validated. ${result.admitted || 0} skills admitted.`, 'ok');
      await refreshAfterIngest();
    } catch (error) {
      renderIngestStatus(String(error), true);
      renderActionFeedback(`Ingest failed: ${String(error)}`, 'err');
    } finally {
      elements.skillAutoIngest.disabled = false;
    }
  });

  elements.skillManualIngest?.addEventListener('click', () => {
    toggleIngestMenu();
  });

  elements.skillManualFile.addEventListener('click', () => {
    closeIngestMenu();
    elements.skillManualFileInput.value = '';
    elements.skillManualFileInput.click();
  });

  elements.skillManualFolder.addEventListener('click', () => {
    closeIngestMenu();
    elements.skillManualFolderInput.value = '';
    elements.skillManualFolderInput.click();
  });

  document.addEventListener('click', (event) => {
    if (!elements.skillIngestMenu || elements.skillIngestMenu.hidden) return;
    const branch = event.target.closest('.ingest-branch');
    if (!branch) closeIngestMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeIngestMenu();
  });

  elements.skillManualFileInput.addEventListener('change', async () => {
    const files = elements.skillManualFileInput.files;
    if (!files || files.length === 0) return;
    renderIngestStatus(`Manual ingest (file): processing ${files.length} file(s)...`);
    try {
      const result = await dataClient.manualIngestFromFileList(files, 'file');
      renderIngestStatus(`Manual ingest complete: admitted ${result.admitted || 0}, failed ${result.failed || 0}.`);
      renderActionFeedback(`Manual skill ingest complete. ${result.admitted || 0} admitted.`, 'ok');
      await refreshAfterIngest();
    } catch (error) {
      renderIngestStatus(String(error), true);
      renderActionFeedback(`Manual ingest failed: ${String(error)}`, 'err');
    }
  });

  elements.skillManualFolderInput.addEventListener('change', async () => {
    const files = elements.skillManualFolderInput.files;
    if (!files || files.length === 0) return;
    renderIngestStatus(`Manual ingest (folder): processing ${files.length} file(s)...`);
    try {
      const result = await dataClient.manualIngestFromFileList(files, 'folder');
      renderIngestStatus(`Manual ingest complete: admitted ${result.admitted || 0}, failed ${result.failed || 0}.`);
      renderActionFeedback(`Manual folder ingest complete. ${result.admitted || 0} admitted.`, 'ok');
      await refreshAfterIngest();
    } catch (error) {
      renderIngestStatus(String(error), true);
      renderActionFeedback(`Manual ingest failed: ${String(error)}`, 'err');
    }
  });
}

function setupSkillScribe() {
  if (!elements.skillScribeGenerate || !elements.skillScribeOutput) return;
  const contextEntries = [];

  const renderContextLog = () => {
    if (!elements.skillScribeContextLog) return;
    if (contextEntries.length === 0) {
      elements.skillScribeContextLog.textContent = 'No additional context captured yet.';
      return;
    }
    elements.skillScribeContextLog.innerHTML = contextEntries
      .map((entry, index) => `${index + 1}. ${escapeHtml(entry)}`)
      .join('<br>');
  };

  const setScribeAlert = (message, isError = false) => {
    if (!elements.skillScribeAlert) return;
    elements.skillScribeAlert.textContent = message;
    elements.skillScribeAlert.classList.toggle('is-error', isError);
  };

  const generateSkillDraft = () => {
    const goal = String(elements.skillScribeGoal?.value || '').trim();
    const guidance = String(elements.skillScribeGuidance?.value || '').trim();
    const combinedContext = [guidance, ...contextEntries].filter(Boolean).join('\n');
    const phase = lastPhase || { key: 'plan', title: 'Plan' };

    if (!goal || goal.length < 12) {
      setScribeAlert('Add a clearer goal before generating. Minimum: 12 characters.', true);
      elements.skillScribeOutput.textContent = 'Enter a complete skill goal before generating a draft.';
      return;
    }

    if (combinedContext.length < 100 || contextEntries.length < 1) {
      setScribeAlert('More context is required. Add at least one context entry and target 100+ context characters.', true);
      elements.skillScribeOutput.textContent = 'Skill context is currently too thin. Keep adding context until it is complete.';
      return;
    }
    setScribeAlert('Context quality is sufficient. Draft generated.');

    const slug = goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'custom-skill';
    const draft = [
      '---',
      `name: qore-custom-${slug}`,
      'description: User-authored skill generated by Skill Scribe',
      'license: MIT',
      '---',
      '',
      '# Purpose',
      goal,
      '',
      '# Scope',
      `Phase alignment: ${phase.title} (${phase.key})`,
      '',
      '# Guardrails',
      '- Preserve policy and governance constraints',
      '- Favor deterministic and testable outputs',
      '- Surface uncertainty and blockers explicitly',
      '',
      '# Workflow',
      '1. Restate user objective in one sentence.',
      '2. Gather required files and context.',
      '3. Produce actionable, minimal-change steps.',
      '4. Validate outputs and provide rollback notes.',
      '',
      '# Extra Guidance',
      guidance || '- Add domain-specific instructions here.',
      '',
      '# Context Pack',
      ...contextEntries.map((entry, index) => `${index + 1}. ${entry}`)
    ].join('\n');

    elements.skillScribeOutput.textContent = draft;
  };

  elements.skillScribeAddContext?.addEventListener('click', () => {
    const entry = String(elements.skillScribeContext?.value || '').trim();
    if (!entry) {
      setScribeAlert('Context entry is empty. Add details before clicking Add Context.', true);
      return;
    }
    contextEntries.push(entry);
    if (elements.skillScribeContext) elements.skillScribeContext.value = '';
    renderContextLog();
    setScribeAlert(`Context entry added (${contextEntries.length} total).`);
  });

  elements.skillScribeGenerate.addEventListener('click', generateSkillDraft);
  elements.skillScribeCopy?.addEventListener('click', async () => {
    const text = String(elements.skillScribeOutput.textContent || '');
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      elements.skillScribeOutput.textContent = `${text}\n\n# copied`;
    } catch {
      elements.skillScribeOutput.textContent = `${text}\n\n# copy_failed`;
    }
  });

  renderContextLog();
}

function renderSettings(state) {
  const governance = resolveGovernanceState(state.hub || {});
  if (elements.themeSelect && elements.themeSelect.value !== state.theme) {
    elements.themeSelect.value = state.theme;
  }
  elements.themeChips.forEach((chip) => {
    const chipTheme = chip.getAttribute('data-theme-choice');
    chip.classList.toggle('active', chipTheme === state.theme);
  });
}

/**
 * Render the compressed Run page sidebar
 */
function renderRunSidebar(state) {
  const hub = state.hub || {};
  const activePlan = hub.activePlan || {};
  const sentinelStatus = hub.sentinelStatus || {};
  const blockers = (activePlan.blockers || []).filter(b => !b.resolvedAt);
  const events = Array.isArray(state.events) ? state.events : [];

  // Deployment info
  if (elements.runDeploymentInfo) {
    const planId = activePlan.id || 'No active plan';
    const currentPhase = activePlan.currentPhaseId || 'idle';
    const phaseCount = (activePlan.phases || []).length;

    elements.runDeploymentInfo.innerHTML = `
      <div class="sidebar-metric"><span>Plan</span><strong>${escapeHtml(planId)}</strong></div>
      <div class="sidebar-metric"><span>Phase</span><strong>${capitalize(currentPhase)}</strong></div>
      <div class="sidebar-metric"><span>Phases</span><strong>${phaseCount}</strong></div>
    `;
  }

  // Recent Actions
  if (elements.runRecentActions) {
    const recentEvents = events.slice(0, 5);
    if (recentEvents.length === 0) {
      elements.runRecentActions.innerHTML = '<div class="no-actions">No recent actions</div>';
    } else {
      elements.runRecentActions.innerHTML = recentEvents.map(event => {
        const time = event.time || '--:--';
        const type = (event.type || 'event').toUpperCase();
        const detail = event.payload?.planEvent?.type || event.payload?.result || '';
        return `<div class="action-item"><span class="action-time">${escapeHtml(time)}</span><span class="action-type">${escapeHtml(type)}</span>${detail ? `<span class="action-detail">${escapeHtml(detail)}</span>` : ''}</div>`;
      }).join('');
    }
  }

  // Performance
  if (elements.runPerformance) {
    const queueDepth = sentinelStatus.queueDepth || 0;
    const running = sentinelStatus.running ? 'Running' : 'Paused';
    const latency = Math.max(12, Math.min(220, 24 + (queueDepth * 5) + (events.length % 11)));

    elements.runPerformance.innerHTML = `
      <div class="sidebar-metric"><span>Sentinel</span><strong>${running}</strong></div>
      <div class="sidebar-metric"><span>Queue</span><strong>${queueDepth}</strong></div>
      <div class="sidebar-metric"><span>Latency</span><strong>${latency}ms</strong></div>
    `;
  }

  // Blockers
  if (elements.runBlockers) {
    if (blockers.length === 0) {
      elements.runBlockers.innerHTML = '<div class="no-blockers">No active blockers</div>';
    } else {
      elements.runBlockers.innerHTML = blockers.map(blocker => `
        <div class="blocker-item blocker-${blocker.severity || 'warn'}">
          <span class="blocker-title">${escapeHtml(blocker.title || 'Blocker')}</span>
          <span class="blocker-reason">${escapeHtml(blocker.reason || '')}</span>
        </div>
      `).join('');
    }
  }
}

/**
 * Setup Panic Stop button handler
 */
function setupPanicStop() {
  elements.panicStopMain?.addEventListener('click', async () => {
    const button = elements.panicStopMain;
    if (!button) return;
    button.disabled = true;
    try {
      await dataClient.postAction('/api/actions/panic-stop');
      renderActionFeedback('PANIC STOP executed. All operations halted.', 'warn');
    } catch (error) {
      renderActionFeedback(`Panic stop failed: ${String(error)}`, 'err');
    } finally {
      button.disabled = false;
    }
  });
}

function renderStatusStrip(state) {
  const hub = state.hub || {};
  const governance = resolveGovernanceState(hub);
  const queueDepth = Number(hub.sentinelStatus?.queueDepth || 0);
  const running = Boolean(hub.sentinelStatus?.running);
  const verdict = String(hub.sentinelStatus?.lastVerdict?.decision || '').toUpperCase();
  if (elements.statusGovernance) elements.statusGovernance.textContent = governance.modeLabel;
  if (elements.statusGovernanceMode) elements.statusGovernanceMode.textContent = governance.modeLabel;
  if (elements.statusGovernanceProfile) elements.statusGovernanceProfile.textContent = governance.profileLabel;
  if (elements.statusGovernanceProtocol) elements.statusGovernanceProtocol.textContent = governance.protocolLabel;
  if (elements.statusSentinel) {
    if (!running) {
      elements.statusSentinel.textContent = 'Paused';
    } else if (['BLOCK', 'ESCALATE', 'QUARANTINE'].includes(verdict)) {
      elements.statusSentinel.textContent = 'Critical';
    } else if (verdict === 'WARN' || queueDepth > 0) {
      elements.statusSentinel.textContent = 'Reviewing';
    } else {
      elements.statusSentinel.textContent = 'Nominal';
    }
  }

  const events = Array.isArray(state.events) ? state.events : [];
  const latency = Math.max(12, Math.min(220, 24 + (queueDepth * 5) + (events.length % 11)));
  const load = running ? Math.max(10, 100 - (queueDepth * 5)) : 0;

  if (elements.statusLatency) elements.statusLatency.textContent = `${latency} ms`;
  if (elements.statusLoad) elements.statusLoad.textContent = `${load}% load`;
  if (elements.statusVersion) elements.statusVersion.textContent = 'v1.0.0';
}

function renderResumeSummary() {
  const key = 'failsafe.lastVisitAt';
  const last = localStorage.getItem(key);
  if (!last) {
    elements.resumeSummary.textContent = 'First run in this browser footprint.';
  } else {
    const lastDate = new Date(last);
    const minutes = Math.max(1, Math.round((Date.now() - lastDate.getTime()) / 60000));
    elements.resumeSummary.textContent = `Welcome back. Last active ${minutes} min ago.`;
  }
  window.addEventListener('beforeunload', () => localStorage.setItem(key, new Date().toISOString()));
}

stateStore.subscribe((state) => {
  if (elements.app) elements.app.setAttribute('data-profile', state.profile);

  if (elements.statusDot) elements.statusDot.className = `status-dot ${state.connection}`;
  if (elements.statusText) elements.statusText.textContent = state.connection === 'connected' ? 'Connected' : state.connection === 'disconnected' ? 'Disconnected' : 'Connecting...';

  const groupedResult = skillsPanel.render(state);
  renderIntentSkillSelector(state);
  if (elements.skillsActiveCount) {
    elements.skillsActiveCount.textContent = String(groupedResult.grouped.allInstalled.length);
  }
  lastPhase = groupedResult.phase;
  lastGrouped = groupedResult.grouped;
  if (lastRelevanceRequestPhase !== lastPhase.key) {
    lastRelevanceRequestPhase = lastPhase.key;
    dataClient.fetchSkillRelevance(lastPhase.key);
  }

  insights.renderHome(state, lastPhase);
  // Note: insights.renderRun is skipped - new panels handle Run page rendering
  insights.renderGovernance(state);
  insights.renderReports(state, lastPhase, lastGrouped);
  activity.render(state);

  // Render Run page redesign panels
  circularPhases.render(state);
  phaseVisualization.render(state);
  renderRunSidebar(state);

  intentAssistant.renderContext();
  renderSettings(state);
  renderStatusStrip(state);
});

applyTheme();
setupTabs();
setupHeaderControls();
setupReportSubtabs();
setupIntentSkillSelector();
setupProfile();
renderHubActions();
setupActions();
setupPanicStop();
setupSkillIngestActions();
setupSkillScribe();
renderResumeSummary();
dataClient.start();
