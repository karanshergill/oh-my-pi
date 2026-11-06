---
name: caido-access
description: Shared headless Caido connection, authentication, API compatibility, readiness, and diagnostic guidance. Read before using Caido action skills or investigating access failures.
---

# Caido

- Use `@caido/sdk-client` for headless Caido access.
- Reuse the configured instance and existing PAT/token authentication.
- Access Caido through its SDK/API or SDK-backed CLI, never its GUI.
- NEVER initiate browser-based login.
- Establish the instance and project from the engagement context.
- NEVER change instances or projects as an implicit side effect.
- Missing or ambiguous context → identify what is unresolved.
- Connection/authentication failure → report the observed failure or
  missing prerequisite; do not fall back to another instance.
- Keep connection and authentication logic shared across action skills.

## Execution prerequisites

- The VPS fork declares `@caido/sdk-client` in `.omp/tools/package.json`.
- Use the shared `.omp/tools/caido/client.ts` connection in OMP's JS Eval:

  ```ts
  import { connectCaido } from "/home/me/oh-my-pi/.omp/tools/caido/client.ts";

  const client = await connectCaido();
  ```

- This client reads the checkout's `caido.pat` at connection time and
  authenticates to VPS loopback `http://127.0.0.1:8080`. Keep the PAT
  private and Git-excluded; NEVER copy it into a prompt or result.
- Missing SDK installation, PAT file, or instance listener → report the
  specific prerequisite instead of switching instances or login methods.
- Keep connection setup and authentication shared; NEVER create a
  separate login implementation for each action skill.

## Authentication

- Configure the SDK's PAT or token authentication mode before `connect`.
  Missing authentication or cache-only configuration can fall back to
  browser-based device approval when no cached token is available.
- PAT mode uses the PAT to approve authentication; the resulting instance
  access token is a different credential. NEVER use a PAT as a substitute
  Bearer access token.
- Token mode accepts an access-token string or an
  `{ accessToken, refreshToken? }` pair.
- The SDK loads its configured cache before supplied credentials.
  A stale or wrong-instance cache can therefore shadow a supplied token.
- Keep cached credentials associated with the intended instance and
  account; diagnose cache selection without dumping its contents.
- Reuse the SDK's supported refresh lifecycle and public `auth.cache`
  integration. NEVER inspect private client fields for credentials.
- NEVER print PATs, access tokens, refresh tokens, authorization headers,
  or credential-bearing URLs.

## SDK and GraphQL

- SHOULD use high-level SDK methods covering the complete operation.
- Otherwise, use `client.graphql.query`, `.mutation`, or `.subscribe`
  with typed GraphQL documents and variables.
- MUST reuse the same authenticated client for both interfaces.
- MUST check operation/input support against the target Caido version.
- Distinguish the installed SDK version, its bundled transport/schema
  revision, and the running instance version.
- A transport directory named `latest` does not prove that it covers
  every operation supported by the running instance.
- Check operation names, input unions, scalar representations, required
  arguments, result fragments, and error fields against the target schema.
- A frontend-generated GraphQL schema can describe server operations;
  frontend convenience methods are not external-client methods.
- NEVER infer external-client methods from frontend/plugin SDK examples.
- Direct GraphQL `Blob` fields contain Base64-encoded bytes.
- SDK helpers may already convert `Blob` values; NEVER double-encode them.
- MUST inspect operation-level errors before reporting success.
- Transport errors, GraphQL errors, and operation payload failures are
  separate layers.
- Payloads may expose `error`, `userError`, `errors`, a success flag,
  or nullable results. Check the actual operation contract; NEVER invent
  a universal error field or treat HTTP 200 as operation success.

## Connection diagnostics

| Check | Interface | Evidence |
|---|---|---|
| Reachability and readiness | `client.health()` | `/health` returns `name`, `version`, and `ready` |
| Wait for readiness | `client.ready(options)` | Completes or raises a readiness failure |
| Establish SDK authentication | `client.connect(options)` | Runs readiness checking, then authentication |
| Resolve SDK version handle | `client.version.get()` | Returns a cached, seeded, or health-derived version |
| Identify authenticated caller | `client.user.viewer()` | Returns caller kind and ID |
| Identify selected project | Tested script in `skill://caido-workspace` | JSON project or `null` |
| Inspect server runtime | GraphQL `runtime` | Select needed version, platform, cloud, or log metadata |

- Start with the configured endpoint; NEVER probe a different local
  instance merely because the intended one fails.
- A successful `/health` response does not prove authentication,
  project selection, or permission for the requested operation.
- The inspected `ready()` implementation catches health-request errors
  and eventually reports `InstanceNotReadyError`. Call `health()` directly
  when the underlying transport, HTTP, or response-shape error is needed.
- In that implementation, readiness `interval` controls the wait between
  attempts, `retries` bounds attempts, and `timeout` is passed to each
  health request. NEVER report it as an enforced total deadline.
- A seeded or cached version handle is not a fresh server observation.
  Use the health response when diagnosing an upgrade or version mismatch;
  NEVER forge a version to force an incompatible SDK branch.
- Distinguish DNS/socket/TLS failure, unexpected HTTP response,
  `ready: false`, authentication failure, permission/plan restrictions,
  and unsupported GraphQL fields.
- Inspect the actual viewer kind and ID; NEVER assume every authenticated
  caller is a cloud user or has the same permissions.
- Authentication `Invalid Scope` is not a target-scope preset error.
  Official troubleshooting also documents team AI-policy restrictions;
  NEVER modify engagement scope or model configuration as a workaround.
- Credential resets, data deletion, TLS-policy changes, upgrades, and
  server restarts are remediation, not implicit diagnostic probes.
- Report the failing stage, sanitized endpoint, operation, observed
  status/error, and missing prerequisite.

## Backend logs

- Use backend APIs or the instance host's files, not GUI developer tools.
- Backend files live under the configured Caido data directory's `logs`
  subdirectory. A remote instance's path is not an agent-local path.
- `runtime.logs` is a URI; inspect its scheme and location rather than
  assuming it is a readable local path or an archive download URL.
- The verified REST endpoint `/exports/logs` returns a log archive.
  Use `skill://caido-exports` for authenticated, byte-preserving retrieval;
  `client.rest.get()` is not a binary downloader.
- Live capture uses GraphQL `createdLogLines(duration)`, which returns
  `lines` containing `level`, `message`, `target`, and `timestamp`.
- The published `Duration` scalar is numeric but does not document its
  unit. Resolve the target version's duration contract before capture;
  NEVER guess seconds versus milliseconds.
- Bound the capture to the diagnostic window and close the subscription
  when finished.
- Preserve timestamps and levels; collect only relevant excerpts.
  Logs can contain credentials and captured traffic.
- Query only needed runtime fields; NEVER export private CA material
  as a connectivity check.
- Caido CLI debug logging uses `--debug`. Enabling it may require a
  restart; treat that as a separate operational change, not a prerequisite
  to reading existing logs.
- Report headless visibility limits for frontend-only failures rather
  than opening the GUI.

## Return

- Report observed instance/version, SDK/schema versions when known,
  caller identity, and project context without credentials.
- Separate connection, authentication, permission, API compatibility,
  and action-result conclusions.
- Include relevant errors, task/resource IDs, and diagnostic artifact
  locations; mark unresolved outcomes explicitly.
- Reading a skill or matching an API schema is not evidence that an
  operation ran successfully.

## References

- Client lifecycle: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/client.ts
- Authentication types: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/auth/types.ts
- Authentication cache precedence: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/auth/index.ts
- Version handle: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/version.ts
- Authentication troubleshooting: https://docs.caido.io/app/troubleshooting/authentication
- Backend logs: https://docs.caido.io/app/guides/logs_viewing
- Debug logging: https://docs.caido.io/app/troubleshooting/debugging
- GraphQL schema: https://github.com/caido/sdk-js/blob/main/packages/sdk-frontend/src/types/__generated__/graphql-sdk.d.ts
- REST contracts: https://github.com/caido/sdk-js/blob/main/packages/sdk-client/src/rest/__generated__/types.gen.ts
