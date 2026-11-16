# Adaptation notes: dsh-superagent on DeepSeek Harness 0.2.2-rc.3

This checkout is the upstream `dsh-superagent` source adapted to run on DeepSeek Harness `0.2.2-rc.3`.
It is not a new product: it is the same bundle with five source changes, ten added tests, and the delivery
declarations pinned to the target host.

## Target host

- Host: `eta-dsh` at `dsh 0.2.2-rc.3` (commit `39163dd30f`).
- The `@deepseek-ai/*@0.2.2-rc.3` tarballs **are published to npm, but lag the tagged host** — for example the
  npm `@deepseek-ai/dsh-host-webserver` rc.3 types lack the `auth` route field this adaptation needs. Build this
  checkout inside a dsh workspace so `@deepseek-ai/*` resolves to the workspace **source** (see the note in
  `README.md`): add the checkout to `pnpm-workspace.yaml`, set top-level `linkWorkspacePackages: true`, then run
  `pnpm update --filter dsh-superagent` so the lockfile re-resolves to the workspace packages.
- `cordis@4.1.0` and `schemastery@3.19.0` are the vendored versions of that host.

## Source changes (5)

| File | Change | Why |
|---|---|---|
| `src/app/session-history.ts` (new) | Pages the whole durable Session log through `SessionController.events`, pinned cursor, exclusive `beforeSeq`, and fails instead of returning a truncated/reordered log | `SessionController.inspect` was removed in 0.2.2 |
| `src/app/resources.ts` | `transcript()` reads through `sessionHistory()` and forwards the request signal | Same removal; cancellation must still work |
| `src/app/http.ts` | `webServer.port` is `number \| undefined`; an unbound port answers **500 and logs**, a bound foreign origin still answers **403**. The `/orchestrator` routes are registered with `auth: 'anonymous'` | The getter became optional in 0.2.2. From rc.3, `WebRoute`/`WebResourceRoute`/`WebUpgradeRoute` carry an `auth?: WebAuthenticationRule` that defaults to `'required'` and denies with **503** when no `authorize` responder is installed; the routes already enforce loopback + same-origin themselves, so `'anonymous'` preserves the rc.1 behavior exactly |
| `src/client/deployment.tsx` | Read-only is `status === 'ready' && !writable`; no `mode` field | `ConfigFormSnapshot.mode` was removed in 0.2.2 |
| `src/deployment.ts` | `stateDir` accepts POSIX `/x`, Windows `C:\x` / `C:/x`, UNC `\\host\share` | The old `/^\//` check made the plugin unactivatable on Windows (a cross-platform defect, not an adaptation loss) |

Six checks are enforced by session-history.ts and covered by tests: a later page must report the pinned cursor; a page must be consecutive by seq (a [0, 2] page loses seq 1); pages must meet at ewest === previousOldest - 1; the opening page must reach the cursor; the oldest event must be seq 0 (no missing prefix); a malformed wire record raises instead of being dropped; no event may report a seq past its page cursor, a cursor below -1 is invalid, an empty log is legal only at cursor = -1, and an already-aborted signal is rejected before any page is requested.

## Test changes (10 added cases)

- `tests/session-history.spec.ts` — 8 cases: single non-empty page, multi-page backwards assembly with pinned
  `throughSeq` and exclusive `beforeSeq`, gap between pages, cursor drift, non-ascending page, repeated `seq`,
  malformed record, empty page with `hasMore`.
- `tests/deployment.spec.ts` — 1 case for the four `stateDir` path forms plus rejected relative values.
- `tests/bundle-patch.spec.ts` — migrated for rc.3: `entryListSchema` is no longer exported by the include plugin;
  the patch is now read with the new `parseEntryYaml` export.

Migrated in place (same assertions, new API): `tests/fixtures/host.ts` (`events` empty page), `tests/tools.spec.ts`
(`events` page shape), `tests/fixtures/panel-server.ts` (no `mode`), `tests/panel-deployment.spec.tsx` (two read-only
segments), `tests/role-models.spec.ts` (real projection + `AgentModel` + one-argument `installModelSelection`),
`tests/runtime.spec.ts` (`SessionId` brand).

## Equivalence evidence

Both sides were run on the same machine, node and pnpm, with the same CLI arguments:

- Native: `dsh-v0.2.1-rc.3` host + this source at `8c32a9d` zero changes → 1197 cases, 1155 passed, 42 failed.
- Adapted to rc.1: 1206 cases = 1197 baseline + 9 added; 1163 passed, 43 failed; per-case comparison of the 1197
  baseline: **identical, 0 differing, 0 un-attributed**.
- Adapted to rc.3: **1213 cases, 1168 passed, 45 failed**. Every failure is the same Windows environmental family
  (POSIX `spawn`/`tmux` assumptions, `EPERM` on unprivileged `symlink`, per-operator git configuration, Unix-only
  file modes). None touches an adaptation or rc.3 API surface: the panel, session-history, tools, and HTTP specs
  all pass. The one failure not purely environmental was the `!!js` bundle-patch parse above, fixed for rc.3.

The rc.1 failures were environmental on Windows too (POSIX `spawn`/`tmux`/`symlink` assumptions, plus one
pre-existing documentation link test). Ceilings of this evidence, stated plainly: the native host cannot even
start on Windows (the old `stateDir` check rejects `C:/`), so UI and persistence equivalence are **conditional** —
adapted real machine, native at the test layer only. It is not a two-machine comparison.

- Transcript reading requires a complete log: contiguous from seq 0 to the pinned cursor. An incomplete log is rejected explicitly (prefix missing: session history starts at seq N) instead of returning shifted indexes. Forked and inherited Sessions have not been verified end-to-end in superagent.

## What this adaptation did not do

- `history_read` (recovering text hidden by the compaction tool-result pruner) does not exist in either host
  version: it is a product gap, not an adaptation regression.
- Per-page read cost of `sessionHistory` was not measured.
- UI and persistence equivalence still need a POSIX environment for a true two-machine run.
