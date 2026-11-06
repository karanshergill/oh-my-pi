---
name: caido-filters
description: Inspect, create, update, rename, and delete Caido filter presets. Manage HTTPQL and StreamQL expressions, aliases, and supported project/global visibility.
---

# Caido Filters

MUST read `skill://caido-access` unless its guidance is already available in context.

## Responsibility

- Manage saved filter definitions without sending target traffic.
- Filters select traffic; they do not define engagement authorization.
- Use `caido-scope` for scope presets.
- Saving a filter does not automatically apply it to searches or views.

## SDK operations

| Operation | SDK |
|---|---|
| List presets | `client.filter.list()` |
| Read a preset | `client.filter.get(id)` |
| Create a preset | `client.filter.create(options)` |
| Update or rename | `client.filter.update(id, options)` |
| Delete a preset | `client.filter.delete(id)` |

## Identify and inspect

- Resolve the intended preset by ID, name, or alias.
- Return its ID, name, alias, expression, and query kind.
- Distinguish a missing preset from a valid expression matching no traffic.
- Names and aliases must be unique across filter presets.
- Aliases use lowercase letters, digits, hyphens, and underscores.
- Use IDs for mutations; names and aliases are query-facing references.

## Query kinds

- HTTPQL filters HTTP request/response traffic.
- StreamQL filters WebSocket messages.
- Preserve the existing kind unless a conversion was requested.
- Do not pass StreamQL expressions to HTTP request searches.
- Use parentheses when combining conditions to preserve intended grouping.
- Saved HTTPQL preset expressions cannot contain `preset:` references.

## Create or update

- Specify the intended name, alias, expression, kind, and supported visibility.
- Read the latest preset before editing.
- Preserve every field unrelated to the requested change.
- A display-name change must not silently regenerate the alias.
- An alias change affects queries referencing the previous alias.
- Do not rewrite expression logic merely to rename a preset.
- Preserve comments and grouping when they are unrelated to the change.
- Do not overwrite a different preset to resolve a name or alias collision.

### Preserve kind and visibility

- SDK create/update defaults omitted `kind` to HTTPQL and omitted
  `global` to false; do not rely on those defaults when updating.
- Global visibility is supported from Caido 0.57.
- The current SDK's returned preset model omits `global`.
- On supported instances, retrieve `filterPreset.global` through the
  GraphQL API when needed to preserve existing visibility.
- Missing visibility in SDK output does not mean project-local.
- Carry the existing visibility forward unless changing it was requested.
- Do not guess visibility when the required state cannot be obtained.

## Use a saved preset

- Reference its quoted alias or name through `preset:"value"` in a
  compatible search expression.
- Escape the referenced value according to the query language.
- Do not substitute the preset ID where a name or alias is required.
- Keep the search's project and scope selection explicit.
- Global filter visibility does not combine traffic from different projects.
- Use `skill://caido-requests` for HTTPQL searches against captured traffic.

## Check matching behavior

- Preview HTTPQL against captured HTTP exchanges.
- Evaluate StreamQL against captured WebSocket messages using a
  supported StreamQL interface, not an HTTPQL request search.
- Check representative traffic that should match and should not match.
- Keep project, scope, and other search conditions consistent when
  comparing the old and proposed expression.
- Distinguish syntax errors from a valid query returning zero matches.
- Report sampled results as samples, not complete result counts.
- Saving successfully proves persistence, not correct matching behavior.
- If matching was not evaluated, state that it remains unverified.

## Delete

- Delete only the identified preset.
- Report the removed name and alias because referencing searches may break.
- Deleting a filter is not a request to delete captured traffic.

## Verify and return

- Creation/update → retrieve the preset and compare the intended fields.
- Check that unrelated expression, kind, alias, and visibility were preserved.
- Deletion → confirm the identified preset is absent.
- Report preset ID, name, alias, kind, visibility when available,
  and the actual expression or metadata changes.
- Separate persistence verification from matching-behavior verification.

## References

- Filter presets: https://docs.caido.io/app/guides/filters_defining
- HTTPQL: https://docs.caido.io/app/reference/httpql
- StreamQL: https://docs.caido.io/app/reference/streamql
- Filter SDK: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/sdks/filter.ts
- Filter types: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/types/filter.ts
