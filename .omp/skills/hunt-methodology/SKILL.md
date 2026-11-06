---
name: hunt-methodology
description: "Shared bug bounty workflow for application mapping, research selection, hypothesis-driven testing, exploit chaining, impact validation, and finding development. Use when planning or advancing investigations, not isolated Caido administration."
---

# Hunt Methodology

## Working method

- MUST separate observations, hypotheses, and demonstrated impact.
- SHOULD work black-box-first; use available source to reduce uncertainty.
- SHOULD interleave mapping, research, experimentation, and validation.
- NEVER treat a coverage catalog as an investigation ceiling.

## Continuation and stopping

- For engagement-start/continue requests, MUST continue investigating within
  established authorization and the requested objective, not stop after setup.
- MUST respect setup-only, status-only, report-only, and other explicitly
  bounded requests.
- NEVER treat initialization, baseline collection, a saved checkpoint, or
  completion of a todo phase as completion of an ongoing engagement request.
- One blocked path? MUST pursue independent eligible work.
- MUST yield only for an explicit user pause, the requested endpoint, or a
  genuine blocker with no independent eligible work remaining. State the
  missing prerequisite; NEVER request permission merely to enter the next phase.

## Engagement context

- Before initializing a new engagement, MUST ask the user for its slug
  unless they already supplied one explicitly. Use that slug as the
  engagement name; the record ID and storage directory remain UUID-based.
  NEVER infer a slug from a hostname or Caido project name.

- Resuming an engagement or taking over prior work? MUST read `skill://hunt-resume` unless already in context.
- MUST establish the current objective and available test identities.
- MUST establish current program authorization, guidelines, and reporting requirements before target testing.
- MUST establish authorized research scope and report-eligible impact scope
  separately, preserving each source and its stated meaning. Neither
  scope implies the other.
- MAY use authorized but non-reportable assets for reconnaissance and
  cross-domain tests. Report eligibility does not reduce separately
  granted research authorization; potential usefulness does not grant
  authorization.
- If sources appear to conflict, MUST preserve both and resolve which
  governs research or reporting before acting on uncertain authorization.
- MUST reuse established engagement context and prior evidence.
- MUST use `skill://caido-scope` when scope needs resolution.
- Before active acquisition, MUST verify the selected tool's effective scope against established engagement scope; NEVER assume synchronization with Caido.
- Missing context? MUST inspect available material before asking.

## Compare perspectives

- MUST read `skill://hunt-parallax` before applying it, unless already in context.
- MUST apply it when mapping security-relevant workflows or forming hypotheses.
- MUST reapply it when revising hypotheses, interpreting ambiguous or conflicting observations, or assessing cross-boundary chains.

## Map application behavior

- MUST construct or refresh the working target model before the first investigation wave.
- SHOULD inspect representative legitimate workflows before mutating them.
- MUST identify ownership, privilege boundaries, and state transitions.
- MUST trace relevant attacker-influenced data through its transformations to security-sensitive consumers.
- MUST examine relevant parsing, storage, evaluation, rendering, filesystem, network, protocol, cache, and integration boundaries.
- MUST label inferred architecture and technology as assumptions.
- MUST revise the model when evidence changes relationships, prerequisites, or material unknowns.
- SHOULD examine relevant historical and peripheral surfaces; archived existence does not establish current reachability or authorization.

## Form and prioritize hypotheses

- MUST state attacker control, suspected boundary failure, and expected effect.
- MUST describe the input-to-effect path, distinguishing observed links from inferred processing or execution steps.
- MUST identify observations that support or contradict the hypothesis.
- MUST identify decisive technical propositions, prerequisites, and the strongest competing explanations.
- SHOULD prioritize reachable hypotheses by engagement objectives, observed behavior, potential impact, and uncertainty reduction.
- SHOULD follow unexpected behavior beyond the initial hypothesis.

## Coordinate investigative approaches

- MUST keep approach families substantively distinct, not payload or endpoint variants.
- SHOULD delegate genuinely independent investigations using available runtime capabilities.
- MUST share engagement constraints and evidence without prescribing one interpretation.
- SHOULD let early approaches develop independently before cross-pollinating their conclusions.
- MUST synthesize evidence, preserve unresolved disagreements, and redirect effort toward substantive gaps.

## Use research selectively

- SHOULD research relevant features and unexplained behavior, not only vulnerability names.
- MUST verify research-derived assumptions against original technical material.
- MUST distinguish published results from this engagement's observations.
- MUST check decisive version, configuration, identity, and platform prerequisites.
- MUST distinguish original nominations, later additions, and AI-collected leads.
- NEVER equate archive inclusion or ranking with target applicability.

| Source | Purpose |
|---|---|
| [OWASP WSTG](https://owasp.org/www-project-web-security-testing-guide/) | Baseline testing coverage and terminology |
| [OWASP API Security](https://owasp.org/projects/api-security-project) | API-specific risks and trust boundaries |
| [PortSwigger Research](https://portswigger.net/research/articles) | Research techniques, detection methods, and validation pitfalls |
| [WebHackList](https://github.com/irsdl/webhacklist) | Historical and current research discovery; follow original sources and retain collection provenance |

## Select execution skills

- MUST read the relevant action or analysis skill before its operations, unless already in context.
- SHOULD load relevant investigation-specific skills when available.

Common execution entry points:

| Need | Existing skill |
|---|---|
| Inspect captured requests and responses | `skill://caido-requests` |
| Develop controlled reproductions and request sequences | `skill://caido-replay` |
| Run structured input variation | `skill://caido-automate` |
| Inspect and exercise WebSocket behavior | `skill://caido-websockets` |
| Inspect or manage native Caido findings | `skill://caido-findings` |
| Discover web assets, source maps, chunks, and static-analysis leads | `skill://jxscout-access` |
| Analyze shipped JavaScript, browser/runtime behavior, or packaged/native artifacts | `skill://rea-access` |
| Browse interactive flows and inspect browser-only behavior | `skill://hunt-browser` |

- MUST match execution capabilities to the hypothesis; JxScout and REA are independent entry points, not mandatory sequential stages.
- Browser, timing, protocol, concurrency, and out-of-band effects require corresponding capabilities.
- Missing capability? MUST record the gap and pursue independent work.

## Design controlled experiments

- MUST establish a valid baseline from captures or observation.
- SHOULD use the smallest test that distinguishes competing explanations.
- MUST identify which unresolved proposition the experiment tests and how its outcomes would change the assessment or next action.
- MUST record relevant identity, state, protocol, runtime, cache, connection, and timing conditions.
- MUST include meaningful comparisons or negative controls.
- MUST inspect delayed or second-order effects when the hypothesis requires them.
- MUST distinguish tool or transport failure from target behavior.

## Resolve contradictions

- MUST compare conflicting claims and evidence under their recorded identity, state, timing, configuration, and execution context.
- MUST choose discriminating tests, not resolve disagreement by agent count or confidence.
- MUST preserve unresolved conflicts and evidence-backed resolutions through `hunt-record`.

## Validate impact and chains

- MUST establish a security-property violation, not just an anomaly.
- MUST identify the affected principals, data, operation, or execution context.
- NEVER infer RCE from expression evaluation, file writing, or an outbound callback alone.
- SHOULD examine how useful primitives combine across reachable boundaries.
- MUST record prerequisites and evidence for each claimed chain link.
- MUST label untested escalation as conditional, not demonstrated.

## Independently confirm findings

- MUST assign a verifier that did not originate or substantially develop the finding.
- MUST provide underlying evidence and the claim without requiring the originating interpretation or exploit path.
- MUST independently reproduce the load-bearing mechanism and claimed impact before presenting the finding as confirmed.
- MUST record verification experiments, conditions, evidence, and disagreements through `hunt-record`.
- Missing, failed, or inconclusive reproduction? MUST retain an explicit readiness gap, not manufacture confirmation.

## Maintain investigation evidence

- MUST read `skill://hunt-record` before creating or updating investigation records, unless already in context.
- MUST maintain a concise record for each active investigation.
- MUST persist target-model, approach-family, contradiction, and verification state through `hunt-record`, not separate Markdown ledgers.

| Field | Required content |
|---|---|
| Hypothesis | Attacker control, input-to-effect path, suspected failure, and expected effect |
| Approach | Family membership and the distinguishing mechanism or assumption |
| Propositions | Decisive claims, prerequisite evidence/status, and competing explanations |
| Context | Target, identity, role or tenant, relevant state, processing or execution context, and prerequisites |
| Experiment | Baseline, comparison or control, test, and relevant conditions |
| Observation | Expected behavior versus the actual result |
| Evidence | Captured exchanges, artifacts, and state-change references |
| Research | Source links, relevant dates or versions, and provenance, when used |
| Assessment | Outcome, demonstrated impact, and remaining assumptions |
| Next action | The next useful experiment, investigation, or prerequisite |

- MUST distinguish investigation outcomes using the meanings below.
- These are investigation labels, not Caido API fields.

| Outcome | Meaning |
|---|---|
| Untested | The proposed test has not run |
| Blocked | A specific prerequisite or capability is missing |
| Inconclusive | Observations cannot distinguish the competing explanations |
| Not reproduced | The hypothesis was not supported under the recorded conditions |
| Not applicable | A required precondition is demonstrably absent |
| Validated | Evidence establishes the stated security-property violation |

- NEVER count blocked or inconclusive work as negative coverage.
- NEVER generalize limited negative results into proof of absence or label an entire target clean or exhausted.
- SHOULD revisit conclusions when relevant conditions or evidence change.

## Develop findings and continue

- MUST reduce a validated issue to a minimal, complete reproduction.
- MUST preserve prerequisites, essential controls, and verified impact.
- MUST read `skill://hunt-report` before composing, revising, synchronizing, or exporting hunt reports, unless already in context.
- MUST develop promising partial results through discriminating tests rather than inflate them into findings.
- Repeated outcomes without new evidence? MUST record the blocking condition and pivot to a materially different mechanism or assumption.
- MUST choose and execute the next authorized action from unresolved evidence
  and coverage within the requested objective; listing it is not execution.
- MUST preserve evidence references and blockers in engagement records for handoff.
- MUST apply the continuation/stopping rules before yielding.
- NEVER report unexecuted tests or conditional impact as validated.
