---
name: caido-rewrite
description: Manage Caido Match & Replace rules for HTTP and WebSocket traffic. Inspect, create, update, organize, enable, order, test, import, and export automatic traffic transformations.
---

# Caido Rewrite

MUST read `skill://caido-access` unless its guidance is already available in context.

## Responsibility

- Manage automatic Match & Replace rules and their collections.
- This skill does not manage DNS rewrites.
- Use `skill://caido-intercept` for individual queued-message actions.
- Match & Replace is named Tamper in GraphQL.
- NEVER infer a `client.matchReplace` or `client.tamper` SDK namespace.

## GraphQL operations

| Operation | GraphQL |
|---|---|
| List collections and their rules | `tamperRuleCollections` |
| Read a collection | `tamperRuleCollection(id)` |
| Read a rule | `tamperRule(id)` |
| Create a collection | `createTamperRuleCollection(input)` |
| Rename a collection | `renameTamperRuleCollection(id, name)` |
| Delete a collection | `deleteTamperRuleCollection(id)` |
| Create a rule | `createTamperRule(input)` |
| Update a rule | `updateTamperRule(id, input)` |
| Rename a rule | `renameTamperRule(id, name)` |
| Move a rule | `moveTamperRule(id, collectionId)` |
| Delete a rule | `deleteTamperRule(id)` |
| Enable or disable | `toggleTamperRule(id, enabled)` |
| Change execution order | `rankTamperRule(id, input)` |
| Test a transformation | `testTamperRule(input)` |
| Export rules or collections | `exportTamper(input)` |
| Import a rule export | `importData(input: { tamper: { file } })` |

## Identify and inspect

- Resolve rules and collections by ID or an unambiguous name.
- Read the latest rule before changing it.
- Inspect its collection, condition, section, sources, and activation.
- Activation is represented by nullable `enable`, containing `rank`.
- NEVER read a nonexistent `rule.enabled` Boolean.
- Collection membership and active execution order are separate.
- NEVER assume switching projects disables previously active rules.

## Define matching and transformation

- Specify the traffic sources, condition, section, and intended modification.
- The Intercept source means proxied traffic, not only queued messages.
- The documented Automate source applies to requests, not response fields.
- Verify supported source/section combinations for the target version.
- Enum membership alone does not establish a supported combination.
- Conditions use structured `QueryInput` values, not bare strings.
- Preserve the existing query kind when editing unrelated fields.
- Verify the condition language supported by the selected section.
- Rewrite inputs have no `scopeId`.
- NEVER assume an Intercept or GUI scope selection constrains rewrite rules.
- Use captured raw content, not prettified JSON or a reconstructed preview.

Supported section families in the inspected schema:

- Request: whole message, first line, method, path, query, headers, body, SNI.
- Response: whole message, first line, status code, headers, body.
- WebSocket: upstream or downstream message content.

Use the section-specific input shape:

- Raw sections support full, regex, or string matching.
- Headers support named addition, removal, and value updates.
- Query parameters support named addition, removal, and value updates.
- Method, status-code, and SNI operations use their own replacer shapes.
- NEVER reuse an operation shape merely because another section accepts it.

## Replacements and regular expressions

- Term replacements supply literal replacement text.
- Workflow replacements reference a workflow by ID.
- Resolve the referenced workflow and inspect its definition before use.
- Binding a workflow to a rule does not create or edit that workflow.
- Caido uses Rust-flavor regular expressions.
- Pattern look-around and backreferences are not supported.
- Replacement capture references such as `$1` and `$2` are supported.
- Use `$$` when a literal dollar would otherwise form a capture reference.
- NEVER substitute JavaScript-regex behavior for Caido's matcher semantics.

## Create or update

- Creation requires `collectionId`, `name`, `section`, and `sources`;
  `condition` is optional.
- Updates require `name`, `section`, and `sources`;
  preserve the existing condition unless changing it was requested.
- Preserve unrelated matching, transformation, and source settings.
- Prefer the dedicated rename or move operation for those changes.
- Creation/update and activation are separate operations.
- Read the resulting activation state instead of assuming a default.
- Preserve existing activation and ordering during unrelated edits.
- Surface invalid query or regex errors without replacing the intended rule
  with a broader match.

## Enable and order

- Set the intended activation state with `toggleTamperRule`.
- Position active rules using `rankTamperRule` with `beforeId` or `afterId`.
- NEVER manufacture rank values.
- Active rules execute in the order shown by their activation ranks.
- Check interactions when an earlier rule changes a later rule's input.
- Moving a rule between collections is not a request to change execution order.

## Test

- `testTamperRule` accepts `{ raw, section }`.
- `raw` is a GraphQL `Blob`; follow the shared encoding guidance.
- It tests a section transformation, not a saved rule by ID.
- It does not evaluate the rule's condition, sources, or active-rule chain.
- Compare the returned bytes with the intended transformation.
- Include representative matching and nonmatching content.
- Workflow-backed transformations execute workflow logic; NEVER assume
  every transformation test is side-effect-free.
- Verify actual source selection, conditions, and ordering separately
  against relevant captured traffic.
- Separate transformation-test results from live-traffic verification.

## Import and export

- Export either identified rules or identified collections:
  `target: { rules: ids }` or `target: { collections: ids }`.
- Retrieve the returned export through its download URI.
- Import through the `tamper` branch of `importData`.
- The import file is an `Upload`, not a Base64 `Blob` string.
- Inspect import errors and the reported import summary.
- Re-list collections and rules to identify the actual imported records.
- Verify activation, ordering, and workflow references after import.
- NEVER assume imports merge names, preserve IDs, or carry dependencies.

## Delete

- Delete only the identified rule or collection.
- Inspect a collection's contents before deleting it.
- NEVER assume its contained rules survive collection deletion.
- Verify affected records and active-rule state afterward.

## Verify and return

- Creation/update → retrieve the rule and compare the intended fields.
- Enable/disable → inspect the resulting `enable` value.
- Reorder → verify the effective active-rule order.
- Move → verify collection membership and preservation of unrelated state.
- Delete → confirm the intended records are absent.
- Report rule and collection IDs, conditions, sources, sections,
  activation, ordering, and actual changes.
- Distinguish saved configuration, transformation testing, and observed
  live-traffic effects.

## References

- Match & Replace: https://docs.caido.io/app/reference/match_replace
- Sources: https://docs.caido.io/app/guides/match_replace_sources
- Capturing groups: https://docs.caido.io/app/guides/match_replace_capturing
- Rule testing: https://docs.caido.io/app/guides/match_replace_testing
- GraphQL schema: https://github.com/caido/sdk-js/blob/main/packages/sdk-frontend/src/types/__generated__/graphql-sdk.d.ts
