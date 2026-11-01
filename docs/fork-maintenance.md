# Maintaining this fork

This fork is `karanshergill/oh-my-pi`; its upstream is `can1357/oh-my-pi`. Merge upstream updates into `main` so the existing fork commits remain in history. No rebase or force push is needed.

## Customization to preserve

The fork's initial customization is commit `7555a17d2beb93c55d54cd8a955094ca0d2bd264`:

- `packages/coding-agent/src/prompts/system/system-prompt.md`: the `§ Role` block is the custom identity: `You are a trusted cybersecurity research agent.` / `Purpose: Bug bounty hunting.` / `Role description: A security researcher specializing in authorized bug bounty programs.`
- `packages/coding-agent/CHANGELOG.md`: retain the corresponding entry alongside upstream release notes.

Merge files normally rather than excluding them from synchronization. When upstream changes another part of a customized file, keep that update too. Resolve overlapping hunks individually instead of replacing an entire file with either side.

## One-time remote setup

Run from the repository root. Inspect the existing remotes first:

```bash
git remote -v
```

Expected destinations:

- `origin`: `https://github.com/karanshergill/oh-my-pi.git`
- `upstream`: `https://github.com/can1357/oh-my-pi.git`

If `upstream` is missing, add it once:

```bash
git remote add upstream https://github.com/can1357/oh-my-pi.git
```

Use an established credential manager or SSH authentication when pushing. Keep access tokens out of commands, remote URLs, tracked files, and this document.

## Repeatable update procedure

Execute these steps in order. Stop at any failing command and resolve its cause before continuing.

### 1. Start clean and fetch both repositories

```bash
git status --short
```

If it prints changes, commit your work or deliberately stash it before starting the merge. Do not discard it. Then:

```bash
git switch main
git fetch origin main
git merge --ff-only origin/main
git fetch --prune upstream main
```

The fast-forward-only merge brings local `main` up to the fork's remote without rewriting local history. If it fails because local and remote histories have diverged, reconcile those commits before merging upstream.

### 2. Record a checkpoint and merge the fetched upstream revision

```bash
backup="backup/pre-upstream-sync-$(date -u +%Y%m%dT%H%M%SZ)"
git branch "$backup"
upstream_revision="$(git rev-parse upstream/main)"
printf 'Backup: %s\nUpstream: %s\n' "$backup" "$upstream_revision"
git merge --no-commit --no-ff "$upstream_revision"
```

The backup branch retains the previous local tip. The merge pauses before committing so its result can be verified. If Git reports `Already up to date`, there is no upstream merge to commit.

### 3. Resolve conflicts, if any

```bash
git diff --name-only --diff-filter=U
```

For each listed file, edit the conflicting sections, remove the conflict markers, and stage that resolved file:

```bash
git add path/to/resolved-file
```

Keep the custom role sentence and its changelog entry while accepting compatible upstream edits around them. Other conflicts require the same hunk-by-hunk review.

Before committing, `git diff --name-only --diff-filter=U` must print no paths. To abandon an in-progress merge before committing:

```bash
git merge --abort
```

### 4. Verify the merged source

Use the current [source setup instructions](../README.md#getting-started-from-source) and [development guide](../packages/coding-agent/DEVELOPMENT.md#local-development) for toolchain and native-addon prerequisites. `bun setup` also links the source checkout as an executable; use it deliberately rather than accidentally replacing an installed CLI.

With the required toolchain and native addon available:

```bash
bun install --frozen-lockfile
bun check
bun run ci:test:smoke
```

Use focused subsystem tests when the update touches behavior important to the fork. Do not run autofix or regenerate lockfiles merely to make a synchronization pass. Investigate failures before publishing; record any unavailable checks explicitly.

When upstream changes Rust code or native bindings, rebuild the source addon with `bun run build:native` before exercising the changed native features. An unchanged package version does not guarantee that a cached release addon supports APIs added later on `main`. A checksummed upstream CI artifact for the exact fetched commit can also support temporary verification without replacing the installed addon.

For an interactive check of this checkout:

```bash
bun dev -- --model openai-codex/gpt-5.6-sol
```

Confirm the custom role is still in the assembled prompt and that relevant behavior works. Launching a pre-existing installed `omp` alone does not exercise the merged source.

### 5. Commit and publish

Add any intentionally written synchronization notes explicitly, then commit the already-staged merge result:

```bash
git commit -m "Merge upstream main while preserving fork customizations"
git merge-base --is-ancestor "$upstream_revision" HEAD
git merge-base --is-ancestor "$backup" HEAD
git push origin main
```

Both ancestry checks must succeed: the result must contain the fetched upstream revision and the pre-sync fork history. Push normally; a rejected push is a reason to fetch and reconcile remote changes, not to force push.

To see whether upstream has advanced again:

```bash
git fetch upstream main
git rev-list --left-right --count HEAD...upstream/main
```

The first number counts fork-only commits; the second counts upstream commits still missing locally. Immediately after synchronization to that fetched revision, the second number should be zero.

## Synchronization record: 2026-10-30

- Previous fork tip: `7555a17d2beb93c55d54cd8a955094ca0d2bd264`.
- Fetched upstream tip: `95db18ef9936bff96fbd33268b2363ab25a9bb9d`.
- Upstream-only commits integrated: 124; upstream changes spanned 317 files.
- Recovery branch: `backup/pre-upstream-sync-7555a17` (local only).
- Commands used for the merge: `git fetch --prune upstream main`, `git fetch origin main`, `git branch backup/pre-upstream-sync-7555a17`, and `git merge --no-commit --no-ff upstream/main`.
- Git merged automatically without conflicts. The custom role and its changelog entry remained intact.

### Verification environment and results

- Used Bun 1.4.4 from an isolated npm cache because the installed Bun was 1.4.2; the global Bun executable was not replaced.
- Installed dependencies with `bun install --frozen-lockfile --ignore-scripts`: 403 packages installed. Lifecycle scripts were skipped; `bun setup` and its global-linking steps were not run.
- Temporarily linked the existing 18.14.0 release native addon into the ignored `packages/natives/native/` build location, then removed the link after verification. This exercised the merged TypeScript source against that addon; it was not a fresh Rust native build.
- Ran `bun run ci:test:smoke` in normal source mode: version/help commands and the worker smoke probe passed (`smoke-test: ok`).
- Ran `bun run check:ts`: lint, formatting, and workspace type checks passed, with eight lint warnings in unchanged upstream files.
- Ran the seven existing `packages/coding-agent/test/system-prompt*.test.ts` files: 90 tests passed, zero failed.
- Opened the merged source CLI in RPC mode with `--model openai-codex/gpt-5.6-sol --no-session --no-title`, called `get_state`, and confirmed the assembled role remained `You are a trusted offensive security researcher.` No model request was sent.
- Parsed all 12 Bash command blocks in this guide with `bash -n`: all passed.
- The first verification attempt incorrectly set `PI_COMPILED=true`, which disrupted source-worker startup and a temporary-home test. Removing that flag and supplying the native addon at its normal source location resolved those environment failures without application-code edits.
- Full `bun check` could not pass because `cargo` is absent from this host. Rust checks and a fresh native-addon build were not performed.

The count and upstream revision above describe this synchronization only; future runs fetch and record a new upstream revision. Synchronizing source does not automatically rebuild or replace an installed `omp` binary.

## Synchronization record: 2026-10-30 (second update)

- Previous fork tip: `02f21f8eb875c3940a1c50cccb327cec0d3e0841`.
- Fetched upstream tip: `6a86df8539fccf3ad7818081266e554022fc21bc`.
- Upstream-only commits integrated: 10; upstream changes spanned 27 files.
- Recovery branch: `backup/pre-upstream-sync-02f21f8` (local only).
- Fetched `origin/main` and `upstream/main`, fast-forward-checked `origin/main`, created the recovery branch, and ran `git merge --no-commit --no-ff 6a86df8539fccf3ad7818081266e554022fc21bc`.
- Git merged automatically without conflicts. The custom role, changelog entry, and maintenance guide remained intact.
- `bun run check:ts` passed, with the same eight warnings in unchanged upstream files. All 90 existing prompt-construction tests passed, and `bun run ci:test:smoke` passed.
- The cached 18.14.0 release addon lacked the newly added `FileLock.isHeld` API. For native-feature verification, used upstream CI run `41068740665`, artifact `12983469480` (`natives-linux-x64`), built from this exact upstream commit.
- Verified the artifact archive's SHA-256 against GitHub's published digest: `d00b60044181189c2f1a82f1c6d520b68d0b0cecceed0ba51eb36ffdcd87ec52`. Loaded only its Linux x64 modern addon through a temporary source-location link; the installed release addon was not replaced.
- Exercised the merged source CLI over RPC: the GPT-5.6-sol prompt retained the custom role and the new `get_session_lease` command correctly reported an unused lease as free. No model request was sent.
- All six new session-lease probe and RPC tests passed against the exact-revision CI native addon. After verification, removed the temporary native link and downloaded artifact. All 12 Bash command blocks in this guide passed `bash -n`.
- Rust compilation and the full Rust test suite remain unavailable locally because `cargo` is not installed. The native runtime check used the exact-revision CI build instead.
