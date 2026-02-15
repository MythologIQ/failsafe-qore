# PHASE 10: Open Navigation, Empty States & Speech-to-Text

**Status**: DRAFT
**Created**: 2026-02-14
**Phase**: 10 of Project Implementation
**Dependency**: Phase 9 (Risk & Autonomy) - SEALED

---

## Overview

Phase 10 addresses UX architecture concerns by:
1. **Open Navigation** - Persistent sidebar enabling free navigation to any view
2. **Empty States** - Graceful handling when prerequisite data is missing
3. **Speech-to-Text** - Voice input for Void capture using Web Speech API

### UX Philosophy

While users get the best results following the prescribed flow (Void → Reveal → Constellation → Path → Risk → Autonomy), they should be able to navigate freely and access any screen at any time. When prerequisite data is missing, views display helpful empty states with guidance.

---

## Task 10.1: Navigation Sidebar Component

### Objective

Create a persistent navigation sidebar (`zo-nav`) that enables direct access to all project views without forcing linear progression through the Projects tab.

### Navigation Items

| Route | Label | Icon | Description |
|-------|-------|------|-------------|
| `/void` | Void | ○ (circle) | Creative capture interface |
| `/reveal` | Reveal | ◇ (diamond) | Thought organization |
| `/constellation` | Constellation | ☆ (star) | Cluster visualization |
| `/path` | Path | → (arrow) | Phase planning |
| `/risk` | Risk | ⚠ (warning) | Risk register |
| `/autonomy` | Autonomy | ▶ (play) | Execution readiness |

### Implementation

**File**: `zo/ui-shell/shared/zo-nav.js` (~120 lines)

```typescript
// Component signature
interface ZoNavState {
  currentRoute: string;
  projectId: string | null;
  routeStates: Map<string, RouteState>;
}

interface RouteState {
  hasData: boolean;
  dataCount?: number;
}

// Key methods
ZoNav.prototype.mount(container: HTMLElement): void
ZoNav.prototype.setRoute(route: string): void
ZoNav.prototype.updateRouteStates(states: Map<string, RouteState>): void
ZoNav.prototype.render(): void
```

**File**: `zo/ui-shell/shared/zo-nav.css` (~80 lines)

- Vertical sidebar, fixed position left
- Responsive: collapses to icon-only on mobile
- Active state highlighting
- Badge indicators for data availability
- Hover tooltips for guidance

### Route State Indicators

Each nav item shows visual feedback:
- **Filled** - View has data, fully accessible
- **Dimmed** - View has no data, accessible but shows empty state
- **Pulsing dot** - Recommended next step in workflow

### API Contract

```typescript
// GET /api/project/:projectId/nav-state
// Returns route availability for navigation indicators
interface NavStateResponse {
  projectId: string;
  routes: {
    void: { hasData: boolean; thoughtCount: number };
    reveal: { hasData: boolean; clusterCount: number };
    constellation: { hasData: boolean; confirmedCount: number };
    path: { hasData: boolean; phaseCount: number };
    risk: { hasData: boolean; riskCount: number };
    autonomy: { hasData: boolean; isReady: boolean };
  };
  recommendedNext: string | null;
}
```

### Acceptance Criteria

1. Navigation sidebar renders on all project views
2. All 6 routes are clickable regardless of data state
3. Route indicators update when data changes
4. Active route is visually highlighted
5. Mobile-responsive (icon-only mode < 768px)
6. Keyboard navigable (Tab + Enter)

---

## Task 10.2: Empty State Components

### Objective

Each project view displays a helpful empty state when prerequisite data is missing, explaining what's needed and providing a call-to-action.

### Empty State Structure

```typescript
interface EmptyState {
  title: string;
  description: string;
  icon: string;
  actionLabel: string;
  actionRoute: string;
  tip?: string;
}
```

### View-Specific Empty States

#### Void (Entry Point - No Empty State Needed)
The Void is always accessible as the starting point. No empty state required.

#### Reveal Empty State

**File**: `zo/ui-shell/shared/empty-reveal.js` (~40 lines)

```javascript
var REVEAL_EMPTY = {
  title: "No Thoughts to Organize",
  description: "Start by capturing your ideas in the Void. Once you have some thoughts, they'll appear here for organization.",
  icon: "○",
  actionLabel: "Go to Void",
  actionRoute: "/void",
  tip: "Tip: Enter at least 3 thoughts before revealing structure."
};
```

#### Constellation Empty State

**File**: `zo/ui-shell/shared/empty-constellation.js` (~40 lines)

```javascript
var CONSTELLATION_EMPTY = {
  title: "No Clusters Formed",
  description: "Organize your thoughts into clusters in Reveal. Confirmed clusters will appear here as your constellation.",
  icon: "◇",
  actionLabel: "Go to Reveal",
  actionRoute: "/reveal",
  tip: "Tip: Drag thoughts into groups to form clusters."
};
```

#### Path Empty State

**File**: `zo/ui-shell/shared/empty-path.js` (~40 lines)

```javascript
var PATH_EMPTY = {
  title: "No Phases Defined",
  description: "Your constellation needs to be organized into phases. Build your execution path from confirmed clusters.",
  icon: "☆",
  actionLabel: "Go to Constellation",
  actionRoute: "/constellation",
  tip: "Tip: Clusters become the building blocks of your phases."
};
```

#### Risk Empty State

**File**: `zo/ui-shell/shared/empty-risk.js` (~40 lines)

```javascript
var RISK_EMPTY = {
  title: "No Risks Identified",
  description: "Risks are derived from your execution path. Define phases first, then risks will be generated based on dependencies and complexity.",
  icon: "→",
  actionLabel: "Go to Path",
  actionRoute: "/path",
  tip: "Tip: Higher phase complexity generates more risk considerations."
};
```

#### Autonomy Empty State

**File**: `zo/ui-shell/shared/empty-autonomy.js` (~40 lines)

```javascript
var AUTONOMY_EMPTY = {
  title: "Not Ready for Autonomy",
  description: "Autonomous execution requires completed risk assessment and guardrail definitions. Review your risks first.",
  icon: "⚠",
  actionLabel: "Go to Risk",
  actionRoute: "/risk",
  tip: "Tip: All high-impact risks need guardrails before autonomy."
};
```

### Shared Empty State Renderer

**File**: `zo/ui-shell/shared/empty-state.js` (~60 lines)

```typescript
// Shared rendering function
function EmptyStateRenderer() {
  this.container = null;
}

EmptyStateRenderer.prototype.mount = function(container: HTMLElement): void
EmptyStateRenderer.prototype.render = function(config: EmptyState): void
EmptyStateRenderer.prototype.attachHandlers = function(): void
```

**File**: `zo/ui-shell/shared/empty-state.css` (~50 lines)

- Centered layout with vertical stacking
- Large icon display
- Clear typography hierarchy
- Primary action button styling
- Subtle tip styling

### Acceptance Criteria

1. Each view (Reveal, Constellation, Path, Risk, Autonomy) shows empty state when no data
2. Empty states include title, description, icon, and action button
3. Action buttons navigate to prerequisite view
4. Tips provide helpful guidance
5. Empty states are dismissible (remembered per session)

---

## Task 10.3: Speech-to-Text Integration

### Objective

Add voice input capability to the Void capture interface using the Web Speech API (browser-native, no dependencies).

### Technical Approach

- **API**: `webkitSpeechRecognition` / `SpeechRecognition`
- **Language**: English (en-US) default, configurable
- **Mode**: Continuous recognition with interim results
- **Fallback**: Text-only input when STT unavailable

### Implementation

**File**: `zo/ui-shell/shared/void-stt.js` (~100 lines)

```typescript
// Component signature
interface VoidSTT {
  recognition: SpeechRecognition | null;
  isListening: boolean;
  interimTranscript: string;
  finalTranscript: string;
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (error: SpeechRecognitionError) => void;
  onStateChange: (isListening: boolean) => void;
}

// Key methods
VoidSTT.prototype.init(): boolean  // Returns false if unsupported
VoidSTT.prototype.start(): void
VoidSTT.prototype.stop(): void
VoidSTT.prototype.toggle(): void
VoidSTT.prototype.isSupported(): boolean
```

**File**: `zo/ui-shell/shared/void-stt.css` (~40 lines)

- Microphone button styling (idle, listening, error states)
- Pulsing animation when listening
- Interim transcript preview styling
- Unsupported state styling

### UI Integration

Modify `void.js` to integrate STT:

```javascript
// In void.js init()
if (window.VoidSTT && VoidSTT.isSupported()) {
  VoidSTT.onTranscript = function(text, isFinal) {
    if (isFinal) {
      textarea.value += (textarea.value ? ' ' : '') + text;
      submitThought();
    } else {
      // Show interim transcript as preview
      showInterimPreview(text);
    }
  };
}
```

### Feature Detection

```javascript
function isSTTSupported() {
  return 'webkitSpeechRecognition' in window ||
         'SpeechRecognition' in window;
}
```

### Void HTML Updates

Add microphone button to void input area:

```html
<div class="void-input-area">
  <span class="void-thought-count">0 thoughts</span>
  <button class="void-mic-btn" type="button" aria-label="Voice input" disabled>
    <span class="void-mic-icon">🎤</span>
  </button>
  <textarea class="void-textarea" ...></textarea>
  <div class="void-interim-preview"></div>
  <div class="void-prompt">...</div>
</div>
```

### Error Handling

| Error | User Message |
|-------|--------------|
| `not-allowed` | "Microphone access denied. Enable in browser settings." |
| `no-speech` | "No speech detected. Try again." |
| `audio-capture` | "Microphone not available." |
| `network` | "Network error. Check connection." |

### Acceptance Criteria

1. Microphone button appears in Void input area
2. Button shows disabled state when STT unsupported
3. Clicking button starts/stops voice recognition
4. Interim results display as preview below input
5. Final transcript appends to textarea and auto-submits
6. Visual feedback during listening (pulsing animation)
7. Error states display user-friendly messages
8. Works in Chrome, Edge, Safari (WebKit-based browsers)
9. Graceful degradation in Firefox (button hidden)

---

## Task 10.4: Server Route Updates

### Objective

Add server routes for navigation state and ensure all project views are directly accessible via URL.

### New Routes

```typescript
// GET /api/project/:projectId/nav-state
// Returns navigation state for sidebar indicators
server.route("GET", "/api/project/:projectId/nav-state", async (req, res) => {
  const projectId = req.params.projectId;
  // Query data availability for each view
  return {
    projectId,
    routes: {
      void: await getVoidState(projectId),
      reveal: await getRevealState(projectId),
      constellation: await getConstellationState(projectId),
      path: await getPathState(projectId),
      risk: await getRiskState(projectId),
      autonomy: await getAutonomyState(projectId),
    },
    recommendedNext: computeRecommendedNext(projectId),
  };
});
```

### View Route Handlers

Each view route serves the same HTML shell but with different initial state:

```typescript
// Direct view routes
app.get("/void", serveProjectShell);
app.get("/reveal", serveProjectShell);
app.get("/constellation", serveProjectShell);
app.get("/path", serveProjectShell);
app.get("/risk", serveProjectShell);
app.get("/autonomy", serveProjectShell);
```

### Acceptance Criteria

1. `/api/project/:projectId/nav-state` returns correct availability
2. All 6 view routes serve project shell HTML
3. URL navigation preserves project context
4. Browser back/forward works correctly

---

## Task 10.5: Integration & Testing

### Objective

Integrate all Phase 10 components and verify end-to-end functionality.

### Test Files

**File**: `tests/zo-nav.test.ts` (~60 lines)

- `renders all navigation items`
- `highlights active route`
- `updates indicators on state change`
- `handles click navigation`

**File**: `tests/empty-state.test.ts` (~50 lines)

- `renders empty state with all fields`
- `action button triggers navigation`
- `remembers dismissal per session`

**File**: `tests/void-stt.test.ts` (~80 lines)

- `detects browser support correctly`
- `initializes recognition when supported`
- `fires onTranscript with interim results`
- `fires onTranscript with final results`
- `handles error states`
- `toggles listening state`

### Integration Points

| Component | Integrates With |
|-----------|-----------------|
| `zo-nav.js` | `legacy-index.html`, all view containers |
| `empty-*.js` | Each respective view container |
| `void-stt.js` | `void.js` |
| Server routes | `server.ts` |

### Acceptance Criteria

1. All new tests pass
2. Existing 428 tests remain passing
3. TypeScript compiles without errors
4. No console.log statements in production code
5. All files ≤250 lines (Section 4 Razor)

---

## File Manifest

### New Files (12)

| File | Lines | Purpose |
|------|-------|---------|
| `zo/ui-shell/shared/zo-nav.js` | ~120 | Navigation sidebar component |
| `zo/ui-shell/shared/zo-nav.css` | ~80 | Navigation sidebar styles |
| `zo/ui-shell/shared/empty-state.js` | ~60 | Shared empty state renderer |
| `zo/ui-shell/shared/empty-state.css` | ~50 | Empty state styles |
| `zo/ui-shell/shared/empty-reveal.js` | ~40 | Reveal empty state config |
| `zo/ui-shell/shared/empty-constellation.js` | ~40 | Constellation empty state config |
| `zo/ui-shell/shared/empty-path.js` | ~40 | Path empty state config |
| `zo/ui-shell/shared/empty-risk.js` | ~40 | Risk empty state config |
| `zo/ui-shell/shared/empty-autonomy.js` | ~40 | Autonomy empty state config |
| `zo/ui-shell/shared/void-stt.js` | ~100 | Speech-to-Text component |
| `zo/ui-shell/shared/void-stt.css` | ~40 | STT button styles |
| `tests/zo-nav.test.ts` | ~60 | Navigation tests |
| `tests/empty-state.test.ts` | ~50 | Empty state tests |
| `tests/void-stt.test.ts` | ~80 | STT tests |

### Modified Files (3)

| File | Changes |
|------|---------|
| `zo/ui-shell/shared/legacy-index.html` | Add zo-nav container, view route handlers |
| `zo/ui-shell/shared/void.js` | Integrate STT, add mic button handler |
| `zo/ui-shell/server.ts` | Add nav-state API, view routes |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Web Speech API browser inconsistency | Medium | Low | Feature detection with graceful fallback |
| Navigation state sync issues | Low | Medium | Centralized state with event-based updates |
| Empty state timing on slow networks | Low | Low | Skeleton loading states |

---

## Dependencies

- Phase 9 (Risk & Autonomy) - SEALED ✓
- Existing UI shell infrastructure
- Web Speech API (browser-provided)

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-14 | Initial plan creation |
