# fixed-opencode-v2
Minimal, reproducible fixes for OpenCode V2. Official source is pinned as the
`./opencode` submodule at **v2.0.20**, recorded in `upstream.json`.
This initialization does not yet change OpenCode behavior or deploy a server.

## Local setup and CI

Install [mise](https://mise.jdx.dev/), then run from this repository:

```sh
mise trust
mise install
mise run setup
mise run ci
```

mise pins Bun (matching upstream), Python, and uv. uv manages the wrapper's
Python environment and lockfile; Bun manages OpenCode's existing workspace.
GitHub Actions uses the same `setup` and `ci` tasks, not separate check scripts.

For focused local debugging:

```sh
mise run verify
mise run check
mise run test:location
```

The lifecycle tests use upstream's isolated test runner, not your live OpenCode
service. CI currently covers upstream lint/type checks and focused lifecycle
tests, not the entire upstream test suite or binary/desktop release builds.
mise reproduces tool versions and commands, not GitHub runner permissions,
secrets, service containers, or release infrastructure.

## Upstream updates and patches

Do not follow a moving branch automatically. Update the submodule commit and
`upstream.json` together, then rerun CI. Keep the official submodule clean;
future fixes can be maintained as explicit patches in this wrapper repository.
Unpublished commits inside a submodule cannot be reproduced by CI.
