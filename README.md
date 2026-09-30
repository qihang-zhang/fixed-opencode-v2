# fixed-opencode-v2

Official OpenCode V2 releases, rebuilt with small build-time adapters.

The `./opencode` submodule is pinned to an official release tag in
`upstream.json` and is **never modified**: no patches, no local commits, no
dirty files (`mise run verify` and the build both enforce this). Fixes live in
`adapters/` and are applied in memory while upstream's own build script
compiles the binary.

## Adapters

| Adapter | Change |
|---|---|
| `location-ttl` | Location inactivity eviction default 60 minutes → **24 hours**, so long silent tool calls (e.g. waiting on `codex exec`) are no longer interrupted after an hour. Override at runtime with `OPENCODE_LOCATION_TTL`, e.g. `90 minutes` or `7 days`. |

## Layout

| Folder | Contains |
|---|---|
| `adapters/` | Only the changes to OpenCode: `index.ts` (the `Adapter` type and the list of adapters) and one pure source transform per adapter. No Bun, build or test code. |
| `scripts/` | Everything that builds, syncs and verifies: `adapter-plugin.ts` (adapters as a Bun plugin), `build-preload.ts` (injects it into upstream's build), `build.py`, `upstream.py`, `verify.py`. |
| `tests/` | Every test we add: `preload.ts` (loads the same plugin into `bun test`) and `*.test.ts`. |

How it works:

- `scripts/build-preload.ts` is preloaded into upstream's unmodified
  `packages/cli/script/build.ts`. It wraps `Bun.build` and adds one plugin that
  rewrites the matched upstream source in memory.
- Each adapter targets exact upstream code and **fails the build** if that code
  is missing or ambiguous, so an upstream refactor stops the release instead of
  silently dropping the fix. The build also fails if an adapter matched nothing.
- `tests/preload.ts` applies the same plugin in `bun test`, so `tests/` exercise
  real upstream code exactly as it is compiled.
- `scripts/build.py` checks the binary contains the adapted code, that the
  submodule is still pristine, and that the binary starts.

To add an adapter: create `adapters/<name>.ts` exporting an `Adapter`, register
it in `adapters/index.ts`, add a test in `tests/` that fails without it, and
bump `patch_revision` in `upstream.json` to publish.

## Releases

Tagged `v<upstream>-fixed.<patch_revision>`, e.g. `v2.0.20-fixed.1`, with
`linux-x64` and `darwin-arm64` (Apple silicon) CLI binaries plus `SHA256SUMS`.
Binaries report the upstream version (e.g. `2.0.20`) so official clients stay
compatible.

- **Disable auto-update** (`OPENCODE_DISABLE_AUTOUPDATE=1`), otherwise the next
  official upgrade replaces the adapted binary.
- macOS binaries are ad-hoc signed, not notarized.
- Releases are artifacts only; nothing is deployed to any server.

## Automation

```mermaid
flowchart LR
  A[hourly: npm @opencode/cli latest] -->|newer| B[pin submodule to its git tag]
  B --> C[mise run ci]
  C --> D[build linux-x64 + darwin-arm64]
  D --> E[fast-forward main]
  E --> F[GitHub Release]
```

- `upstream-sync.yml` follows official releases only, never the moving `v2`
  branch. A new version is staged on the `upstream-sync` branch; main moves and
  a release is published only after tests pass and all targets build. If an
  adapter no longer matches upstream, the run fails and publishes nothing.
- `release.yml` also runs when `upstream.json` or `adapters/` change on main,
  and skips if the release tag exists. **Bump `patch_revision` to publish
  adapter changes.**
- `ci.yml` runs setup and checks on pushes and pull requests.

## Local development

Install [mise](https://mise.jdx.dev/), then:

```sh
mise trust
mise install
mise run setup                        # submodule and locked dependencies
mise run ci                           # same checks as GitHub Actions
mise run test:adapters                # our adapter tests only
mise run build opencode-linux-x64     # dist/opencode-linux-x64.tar.gz
mise run upstream:sync                # pin a newer official release, if any
mise run release:notes
```

`mise run ci` runs upstream lint/type checks, upstream's own lifecycle tests
(unadapted), and our adapter tests. Tests use upstream's isolated environment
(in-memory database, temporary HOME), not a live OpenCode service. Workflows are
thin shells over these tasks, so failures reproduce locally, except runner
permissions, secrets and the release upload.
