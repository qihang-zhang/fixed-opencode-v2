// Wraps the adapters as a Bun plugin, shared by the build (build-preload.ts) and
// the tests (tests/preload.ts) so both load upstream exactly the same way.
import type { BunPlugin } from "bun"
import { adapters } from "../adapters/opencode/index"

// Records the name of every adapter that ran, so callers can require all of them.
export function adapterPlugin(applied: Set<string>): BunPlugin {
  return {
    name: "fixed-opencode-adapters",
    setup(build) {
      for (const adapter of adapters) {
        build.onLoad({ filter: adapter.filter }, async (args) => {
          const contents = adapter.transform(await Bun.file(args.path).text())
          applied.add(adapter.name)
          return { contents, loader: "ts" }
        })
      }
    },
  }
}

export function requireAllApplied(applied: Set<string>) {
  const missing = adapters.filter((adapter) => !applied.has(adapter.name)).map((adapter) => adapter.name)
  if (missing.length > 0) throw new Error(`adapters matched no upstream source: ${missing.join(", ")}`)
}
