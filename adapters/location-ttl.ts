// Raises OpenCode's Location inactivity eviction default from 60 minutes to 24
// hours, so long silent tool calls (e.g. waiting on `codex exec`) are not
// interrupted after an hour. OPENCODE_LOCATION_TTL overrides it at runtime with
// an Effect duration such as "90 minutes" or "7 days".
//
// The upstream file is rewritten in memory while it is loaded; nothing on disk
// changes. The transform fails if upstream no longer contains the exact code it
// targets, so an upstream refactor stops the build instead of silently dropping
// the fix.
import type { Adapter } from "./adapter"

const original = 'options.timeToLive ?? "60 minutes"'
const adapted = 'options.timeToLive ?? (process.env.OPENCODE_LOCATION_TTL || "24 hours")'

export const locationTtl: Adapter = {
  name: "location-ttl",
  filter: /packages[/\\]core[/\\]src[/\\]location-activity\.ts$/,
  transform(source) {
    const count = source.split(original).length - 1
    if (count !== 1) throw new Error(`location-ttl: expected 1 occurrence of ${original}, found ${count}`)
    return source.replace(original, adapted)
  },
}
