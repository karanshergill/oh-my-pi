---
name: hunt-parallax
description: "Compare security-relevant behavior across human and system perspectives. Use for workflow mapping, hypothesis formation or revision, ambiguous or conflicting observations, and chains crossing roles or trust boundaries."
---

# Hunt Parallax

## Frame the comparison

- MUST examine the same feature, action, observation, or hypothesis across perspectives.
- MUST identify the security property or expectation being examined.
- MUST distinguish viewpoint changes from changes in identity, state, processing context, or timing.
- MUST label inferred implementation, intent, and policy as assumptions.

## Select relevant perspectives

- SHOULD consider the perspectives below; apply those that can change the investigation.
- SHOULD add perspectives that expose distinct assumptions or trust boundaries.

| Perspective | Questions |
|---|---|
| Developer | Which invariants must hold across validation, authorization, storage, and execution? Where can input become a query, template, command, deserialized object, path, or executable content? |
| User | What should legitimate input, uploads, and workflow actions produce? How should ownership, rendering, retries, interruptions, and stale state affect the result? |
| Administrator | How should policy, role, tenant, and lifecycle changes propagate? What do deployment settings, service privileges, filesystem access, and network reachability permit? |
| Attacker | What inputs, files, encodings, requests, sequences, or timing can the actor actually influence? Which authorization, interpretation, execution, network, or browser boundaries could that influence cross? |
| Investigator | What evidence supports or contradicts the claim? Which controls distinguish a security failure from intended behavior, caching, normalization, or tool/transport effects? |
| Relevant systems | How do browsers, proxies, parsers, caches, queues, interpreters, and backends transform the same bytes, types, paths, URLs, or messages? Which process, connection, filesystem, and origin contexts apply? |

- A perspective does not establish source access, credentials, or observed behavior.
- MUST identify missing access or capabilities required for a proposed test.

## Find consequential discrepancies

- MUST compare expectations, authority, visibility, interpretation, processing context, and ordering.
- MUST distinguish intended role, protocol, and runtime behavior from suspected boundary failures.
- MUST retain plausible competing explanations, including benign ones.
- SHOULD trace discrepancies across producer, parser, consumer, execution, and enforcement boundaries.
- NEVER treat a conceptual disagreement as a demonstrated vulnerability.
- NEVER treat agreement between perspectives as independent corroboration.
- No useful discrepancy? MUST state what was examined without inventing one.

## Design distinguishing experiments

- MUST state competing explanations and their predicted observable differences.
- SHOULD select the smallest experiment that could change the assessment.
- MUST specify a meaningful baseline or control.
- MUST select an observable signal suited to the mechanism: returned data, state changes, timing, callbacks, rendering, or execution effects.
- MUST distinguish proposed experiments from executed tests.

## Return and retain the result

- MUST return a concise comparison containing:
  - The shared subject, security property, and relevant mechanisms.
  - Relevant perspectives, expectations, and labeled assumptions.
  - Evidence references and consequential discrepancies.
  - Competing explanations and unresolved questions.
  - Proposed experiments, prerequisites, and distinguishing outcomes.
- MUST attach decision-relevant results to the investigation record when one exists.
- MUST preserve unresolved disagreements until evidence distinguishes the explanations.
- NEVER substitute persona dialogue, voting, or forced consensus for evidence.
- Separate agents are not required for separate perspectives.
