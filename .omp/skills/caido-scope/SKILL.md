---
name: caido-scope
description: Inspect, create, update, rename, and delete Caido scope presets, including included and excluded host/IP patterns.
---

# Scope

MUST read `skill://caido-access` unless its guidance is already available in context.

## Identify the preset

- Scope presets belong to a project.
- Resolve by ID or an unambiguous name within the established project.
- Multiple matches → return the matching names and IDs.
- Listing presets does not identify the GUI's currently selected preset.
- No modification requested → inspect.

## Operations

| Operation | SDK call |
|---|---|
| List | `client.scope.list()` |
| Read | `client.scope.get(id)` |
| Create | `client.scope.create({ name, allowlist, denylist })` |
| Update or rename | `client.scope.update(id, { name, allowlist, denylist })` |
| Delete | `client.scope.delete(id)` |

## Change rules

- Read the latest preset before updating.
- Updates submit complete field values, not append/remove patches.
- Build the update from the latest preset and requested changes.
- Preserve unrelated rules and fields.
- Add patterns without duplicating existing entries.
- Remove exact entries, not substring matches.
- Move a pattern by removing it from one list and adding it to the other.
- Rename without changing either list.
- Replace an entire list only when replacement was requested.
- Delete only the identified preset.
- An observed hostname is not an instruction to add it to scope.

## Interpret scope

- An engagement-owner declaration of `*.example.com` authorizes
  `example.com` and all its subdomains, including every path and test
  type on those hosts, unless that engagement explicitly excludes them.
- Preserve the original declaration in the engagement record. When
  configuring Caido, use separate `example.com` and `*.example.com`
  allowlist entries; Caido's wildcard pattern alone does not add the apex.

- Caido is authoritative only for a preset's effective host/IP filtering;
  exported lists are snapshots. Neither establishes research authorization
  or report eligibility.
- Scope patterns match request Host values or destination IP addresses.
- Preserve wildcard syntax: `*` matches multiple characters;
  `?` matches one character.
- Paths are unsupported in scope presets; path filtering uses filter presets.
- Preserve empty lists; distinguish them from a missing preset.
- Host/IP scope does not represent the complete program policy.

## Verify the result

- Create/update → retrieve the preset and check the requested changes
  and preservation of unrelated fields.
- Delete → verify the identified preset is absent.
- Uncertain write outcome → inspect current state before retrying.
- Report preset name/ID and current rules or the verified before/after delta.
- Failed readback → state that the mutation remains unverified.

## References

- Scope semantics: https://docs.caido.io/app/guides/scopes_defining
- Scope SDK: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/sdks/scope.ts
