# Documentation Status Map

This file tracks high-impact documentation claims with explicit status labels.
Last reviewed: 2026-02-12.

| Claim | Status | Source |
|---|---|---|
| Qore runtime core is extracted and builds independently | implemented | `README.md:21`, `package.json:1`, `tsconfig.json:1` |
| Core runtime manager exists in repository code | implemented | `runtime/api/QoreLogicManager.ts:18` |
| Ledger integrity verification exists | implemented | `ledger/engine/LedgerManager.ts:157` |
| Policy engine supports loading and validation | implemented | `policy/engine/PolicyEngine.ts:56` |
| Evaluation router performs risk/novelty triage | implemented | `risk/engine/EvaluationRouter.ts:142` |
| Decision request/response contracts are defined | implemented | `../qore-contracts/src/schemas/DecisionTypes.ts:1` |
| Local runtime evaluation service exists | implemented | `runtime/service/QoreRuntimeService.ts:23` |
| Local API server exposes health/policy/evaluate endpoints | implemented | `runtime/service/LocalApiServer.ts:10` |
| API error contract and traceable error envelopes are implemented | implemented | `../qore-contracts/src/schemas/ApiTypes.ts:1` |
| Structured decision and audit event IDs are returned from evaluation | implemented | `runtime/service/QoreRuntimeService.ts:89` |
| Local API enforces API key auth by default for non-health routes | implemented | `runtime/service/LocalApiServer.ts:20` |
| Local API enforces request size limit and `PAYLOAD_TOO_LARGE` responses | implemented | `runtime/service/LocalApiServer.ts:37` |
| Runtime rejects mismatched request replay by actor/request ID | implemented | `runtime/service/QoreRuntimeService.ts:77` |
| Zo-native architecture target is the primary direction | implemented | `docs/plan_qore_zo_architecture.md:1` |
| Zo MCP proxy implementation in this repository | implemented | `zo/mcp-proxy/server.ts:1` |
| Zo HTTP proxy implementation in this repository | implemented | `zo/http-proxy/server.ts:1` |
| Zo direct adapters enforce model-required and model-allowlist policy before forwarding | implemented | `zo/http-proxy/server.ts:317`, `zo/mcp-proxy/server.ts:566` |
| Prompt transparency events are emitted and ledgered for build and dispatch stages | implemented | `zo/prompt-transparency.ts:1`, `zo/http-proxy/server.ts:342`, `zo/mcp-proxy/server.ts:591` |
| Zo model recommendation supports manual, suggest, and auto modes | implemented | `zo/model-selection.ts:1`, `zo/http-proxy/server.ts:373`, `zo/mcp-proxy/server.ts:639` |
| Model recommendation emits token-efficiency and projected cost-savings metrics | implemented | `zo/model-selection.ts:13`, `zo/http-proxy/server.ts:466`, `runtime/api/index.ts:4` |
| UI-facing prompt transparency view contract exists for intent output rendering | implemented | `runtime/api/PromptTransparencyView.ts:1` |
| Zo bootstrap script supports pull-install-build-service setup | implemented | `deploy/zo/bootstrap-zo.sh:1`, `deploy/zo/env.example:1` |
| Zo one-page handoff install guide is available for direct operator use | implemented | `deploy/zo/TAKE_THIS_AND_GO.md:1` |
| Zo single-step launcher script is available for take-this-and-go setup | implemented | `deploy/zo/take-this-and-go.sh:1` |
| Controlled release artifact builder generates versioned bundle and SHA256 checksums | implemented | `scripts/create-release-artifacts.mjs:1` |
| Tag-driven GitHub release workflow publishes bundle and verification files | implemented | `.github/workflows/release-artifacts.yml:1` |
| Model suggestion performance regression test suite exists | implemented | `tests/zo.model.selection.performance.test.ts:1` |
| Zo MCP proxy integration test baseline exists | implemented | `tests/zo.mcp.proxy.integration.test.ts:59` |
| Zo SSH fallback controls in this repository | implemented | `docs/phase3_zo_fallback_setup.md:1` |
| Zo fallback command wrapper setup exists | implemented | `zo/fallback/failsafe-run.ts:4` |
| Proxy enforces signed actor proof for identity integrity | implemented | `zo/mcp-proxy/server.ts:170` |
| Actor proof includes nonce and replay protection at ingress | implemented | `zo/security/actor-proof.ts:1`, `zo/mcp-proxy/server.ts:266`, `zo/http-proxy/server.ts:156` |
| Proxy supports actor key IDs for key rotation readiness | implemented | `zo/security/actor-keyring.ts:1` |
| Actor key rotation tooling is implemented for rollover workflows | implemented | `zo/security/actor-key-rotation.ts:1`, `scripts/rotate-actor-keys.mjs:1` |
| Proxy ingress rate limiting is implemented | implemented | `zo/mcp-proxy/rate-limit.ts:1` |
| Proxy supports SQLite shared rate limiting mode | implemented | `zo/mcp-proxy/rate-limit.ts:43` |
| Proxy metrics endpoint and counters are implemented | implemented | `zo/mcp-proxy/metrics.ts:1` |
| Proxy supports external HTTP metrics sink publishing | implemented | `zo/mcp-proxy/metrics-sink.ts:1`, `zo/mcp-proxy/server.ts:467` |
| Proxy optional TLS/mTLS mode is implemented | implemented | `zo/mcp-proxy/server.ts:282` |
| Proxy supports mTLS actor identity binding to certificate CN/URI SAN | implemented | `zo/security/mtls-actor-binding.ts:1`, `zo/mcp-proxy/server.ts:307` |
| Replay protection supports shared SQLite strategy for cross-instance enforcement | implemented | `zo/security/replay-store.ts:1`, `zo/mcp-proxy/server.ts:457`, `zo/http-proxy/server.ts:267` |
| Replay protection memory strategy enforces bounded entry capacity | implemented | `zo/security/replay-store.ts:12` |
| Proxy replay protection defaults to SQLite-backed strategy | implemented | `zo/mcp-proxy/server.ts:493`, `zo/http-proxy/server.ts:273` |
| Phase 4 hardening plan is defined | implemented | `docs/phase4_zo_production_hardening_plan.md:1` |
| Phase 4 adversarial review reached pass state | implemented | `docs/adversarial_review_phase4_iterations.md:1` |
| Phase 4 implementation is substantiated with validation evidence | implemented | `docs/phase4_substantiation.md:1` |
| Phase 5 plan is defined | implemented | `docs/phase5_zo_http_api_release_plan.md:1` |
| Phase 5 adversarial review iteration log exists | implemented | `docs/adversarial_review_phase5_iterations.md:1` |
| Phase 5 substantiation evidence is documented | implemented | `docs/phase5_substantiation.md:1` |
| Phase 6 cross-surface conformance plan is defined | implemented | `docs/phase6_cross_surface_conformance_plan.md:1` |
| Phase 7 operational resilience plan is defined | implemented | `docs/phase7_operational_resilience_plan.md:1` |
| Phase 8 release substantiation plan is defined | implemented | `docs/phase8_release_substantiation_plan.md:1` |
| Phase 9 handoff and closeout artifact exists | implemented | `docs/phase9_handoff_and_governance_closeout.md:1` |
| Zo assumption evidence registry is implemented | implemented | `docs/ZO_ASSUMPTION_EVIDENCE.json:1` |
| Zo public skills reference policy is documented for Zo-native workflows | implemented | `docs/ZO_PUBLIC_SKILLS_REFERENCE.md:1` |
| Zo assumption freshness validation script is implemented | implemented | `scripts/check-zo-assumptions.mjs:1` |
| Assumption checker rejects future-dated evidence entries | implemented | `scripts/check-zo-assumptions.mjs:45`, `tests/zo.assumptions.check.test.ts:1` |
| Release gate automation script is implemented | implemented | `scripts/release-gate.mjs:1` |
| Release readiness CI workflow is implemented | implemented | `.github/workflows/release-readiness.yml:1` |
| Phase 6-9 adversarial review reached pass state | implemented | `docs/adversarial_review_phase6_phase9.md:1` |
| MCP unknown tools fail closed in action classification | implemented | `../qore-contracts/src/schemas/ActionClassification.ts:1`, `tests/zo.mcp.translator.test.ts:37` |
| Zo HTTP ambiguous prompts fail closed in action classification | implemented | `../qore-contracts/src/schemas/ActionClassification.ts:42`, `tests/zo.http.translator.test.ts:1` |
| Distributed nonce replay rejection is tested across proxy instances | implemented | `tests/zo.http.proxy.replay.distributed.test.ts:1` |
| CI runs typecheck and tests on Node 20 | implemented | `.github/workflows/ci.yml:1` |
| Zo assumption-control gates are documented and required | implemented | `docs/ZO_ASSUMPTIONS_AND_GATES.md:1` |
