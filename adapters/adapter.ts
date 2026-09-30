import type { BunPlugin } from "bun"
import { locationTtl } from "./location-ttl"

export type Adapter = {
  readonly name: string
  readonly filter: RegExp
  readonly transform: (source: string) => string
}

export const adapters: readonly Adapter[] = [locationTtl]

// A Bun plugin that applies every adapter to the upstream sources it matches,
// recording which adapters ran so callers can require all of them to apply.
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
