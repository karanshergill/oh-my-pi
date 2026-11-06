---
name: caido-proxy
description: Configure Caido listeners, HTTP and SOCKS upstream proxies, DNS rewrites and resolvers, passthrough, network-stack settings, and CA certificates through headless interfaces.
---

# Caido proxy

MUST read `skill://caido-access` unless its guidance is already available in context.

## Control boundaries

- Use this skill for network routing, listener configuration, and
  certificate management.
- Use `skill://caido-intercept` for queued-message interception and
  forwarding or dropping individual messages.
- Use `skill://caido-rewrite` for Match & Replace transformations.
- Use `skill://caido-scope` for engagement scope presets.
- Network and certificate changes can affect traffic beyond one
  request or Replay session. Do not treat them as per-request settings.

## Listeners and traffic splitting

- Read `globalConfig.address` for the exposed listener configuration.
- For the supported port mutation, `setGlobalConfigPort` takes an
  integer `input`, not an `{ address, port }` object.
- Do not invent an equivalent GraphQL bind-address or multi-listener
  mutation. Use the target version's supported startup configuration
  where the API does not cover the change.
- Supported CLI controls include:
  - `--listen <address:port>`
  - `--ui-listen <address:port>`
  - Repeated `--proxy-listen <address:port>`
  - `--invisible`
  - `--ui-domain <domain>`
  - `--config <file>`
- The documented configuration file separates its `version` from
  `config`. Networking fields include `config.networking.invisible`,
  `config.networking.listeners`, and `config.networking.ca`.
- Listener entries use `address` and `usage`, where usage is `ui`,
  `proxy`, or `both`. A dedicated `ui` listener serves API access;
  using it does not require operating the GUI.
- Distinguish the management/API endpoint from target-proxy listeners.
  Separate listeners can avoid shared-port traffic-splitting problems,
  especially with containers, tunnels, and changed external ports.
- Invisible proxying needs compatible address/port mapping. Do not
  assume arbitrary SSH or container port remapping preserves splitting.
- The domain allowlist controls Caido API/interface access. It does
  not define which bounty targets are in scope.
- Preserve unrelated startup settings, including authentication and
  guest access. Do not copy example configuration defaults wholesale.
- Plan endpoint changes with the actual service and forwarding setup.
  A saved port setting does not prove that host exposure, container
  mapping, or API connectivity changed successfully.
- Binding beyond loopback changes network exposure. Apply the requested
  binding, not an automatic all-interface workaround.

## HTTP and SOCKS upstream proxies

Use GraphQL:

- Queries: `upstreamProxiesHttp`, `upstreamProxiesSocks`.
- HTTP mutations: `createUpstreamProxyHttp`, `updateUpstreamProxyHttp`,
  `deleteUpstreamProxyHttp`, `toggleUpstreamProxyHttp`,
  `rankUpstreamProxyHttp`, `testUpstreamProxyHttp`.
- SOCKS mutations: `createUpstreamProxySocks`, `updateUpstreamProxySocks`,
  `deleteUpstreamProxySocks`, `toggleUpstreamProxySocks`,
  `rankUpstreamProxySocks`, `testUpstreamProxySocks`.

- There is no verified high-level SDK namespace for these operations.
- Creation and update inputs contain `connection`, `allowlist`,
  `denylist`, `enabled`, and optional `auth`.
- SOCKS inputs additionally require `includeDns`.
- Direct GraphQL connection fields are `host`, `port`, `isTLS`, and
  optional `SNI`; preserve their exact casing.
- Supported authentication input is `auth: { basic: { username, password } }`.
- Updates require the full declared configuration, not an arbitrary
  partial patch. Preserve unrelated routing and authentication fields.
  Do not replace an unknown password with a display placeholder.
- Toggle operations take `id` and `enabled`. Rank operations take
  `id` and `input` with supported `beforeId` or `afterId` references.
  Do not treat returned rank strings as numeric positions.
- Upstream host lists are not a `scopeId` reference. Do not assume a
  GUI-selected scope preset is inherited or remains dynamically linked.
- Avoid routing an upstream back into the same Caido listener.
- Caido documents SOCKS-before-HTTP routing when both are enabled.
  Its cloud-server calls do not flow through these additional proxies.
- `includeDns` selects DNS resolution through the SOCKS proxy.
  Distinguish this from configuring a local DNS rewrite or resolver.
- Test mutations take connection/authentication configuration, not
  merely an existing proxy ID; the SOCKS test also takes `includeDns`.
- A test can make network connections. Its success does not prove
  that host filters or ordering select that proxy for a particular
  captured request.

## DNS resolvers and rewrites

Verified SDK methods:

- `client.dnsUpstream.list()`
- `client.dnsUpstream.create({ name, ip })`
- `client.dnsRewrite.create({ allowlist, denylist, resolution })`

For the remaining operations, use GraphQL:

- Queries: `dnsUpstreams`, `dnsRewrites`.
- Resolver mutations: `updateDnsUpstream`, `deleteDnsUpstream`.
- Rewrite mutations: `updateDnsRewrite`, `deleteDnsRewrite`,
  `toggleDnsRewrite`, `rankDnsRewrite`.

- Resolver updates take `id` and `input: { name, ip }`.
- Rewrite updates take `id` and an input containing `allowlist`,
  `denylist`, and `resolution`.
- SDK resolution uses exactly one supported form:
  - `{ kind: "ip", ip }`
  - `{ kind: "upstream", upstreamId }`
- Direct GraphQL resolution instead uses `{ ip: { ip } }` or
  `{ upstream: { id } }`. Do not interchange SDK and wire shapes.
- Creating a named DNS resolver does not establish that a rewrite
  references it. Verify the actual resolver ID in the rule.
- DNS rewrite host lists support glob syntax. Caido uses the first
  matching rewrite, so preserve or deliberately change rule order.
- Toggle rewrites with `id` and `enabled`; rank them with `id` and
  `input` containing the intended `beforeId` or `afterId`.
- Rewrite creation does not accept an `enabled` input. Do not assume
  creation is inert or that create-then-disable is atomic.
- DNS resolution is distinct from rewriting HTTP headers or TLS SNI.
  Do not replace those values with an IP merely to apply a DNS rule.
- Inspect affected references before deleting a resolver or rule,
  then verify the resulting routing configuration.

## Passthrough and network stack

- Read `passthroughOptions` and use `setPassthroughOptions` when the
  target version supports them.
- Its input contains `captureList`, `passthroughList`, and `outOfScope`.
  Preserve the other values when changing one part of the policy.
- Do not assume omitting the optional mutation input is a harmless
  partial update.
- The schema alone does not establish list matching, precedence, or
  which scope context controls `outOfScope`. Verify those semantics
  for the target version rather than inventing a `scopeId` argument.
- Passthrough configuration and pausing the interception queue are
  different controls. Verify actual capture and forwarding behavior.
- Read `instanceSettings.network.stack` through GraphQL.
- The verified network-setting input is
  `setInstanceSettings(input: { network: { stack } })`, with `V1`
  or `V2` as the supported enum values.
- The inspected high-level instance-settings wrapper does not implement
  the network branch. Do not call an invented `setNetwork` method.
- Change the stack when required by the requested operation, not as an
  incidental optimization. Use `skill://caido-replay` for protocol and
  pipeline requirements, and verify the actual traffic behavior.

## CA certificates

Verified SDK methods:

- `client.instance.certificate.export(password?)` returns PKCS#12 bytes
  as a `Uint8Array`.
- `client.instance.certificate.import({ file, password })` imports a
  PKCS#12 file; the password is optional.
- `client.instance.certificate.generate()` returns a success boolean.

- Use `/ca.crt` when the public CA certificate is sufficient. Do not
  export the private-key bundle merely to retrieve a public certificate.
- Treat exported PKCS#12 material as sensitive. Preserve its bytes;
  the SDK has already decoded the wire representation.
- Direct GraphQL operations are `runtime.certificate.p12`,
  `importCertificate`, and `regenerateCertificate`.
- Import uses an `Upload` value in the `certificate.p12` input branch,
  not a local path string or the public `.crt` download.
- Check the target version's import requirements. Caido's guide does
  not promise compatibility with CA certificates exported by other
  tools merely because they use a PKCS#12 container.
- Importing or regenerating a CA can invalidate existing client trust.
  Account for that impact before declaring HTTPS interception healthy.
- A false generation result is not success. Inspect the resulting
  public certificate and relevant TLS behavior when verification is
  part of the task.
- Do not install certificates into unrelated trust stores or disable
  TLS verification as an implicit workaround.

## Verification and reporting

- Read back changed listener, proxy, DNS, passthrough, or network state.
- Distinguish saved configuration, proxy test results, API reachability,
  target forwarding, plaintext capture, and certificate trust.
- When traffic verification is requested, use the intended request
  through `skill://caido-requests` or `skill://caido-replay`; do not
  infer the route from configuration alone.
- Report changed IDs and settings, ordering and matching effects,
  endpoint or trust impacts, actual verification, and unresolved
  connectivity or compatibility failures.
