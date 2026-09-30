// Every change we make to OpenCode. Each adapter rewrites one upstream source
// file; how adapters are wired into builds and tests lives in scripts/ and tests/.
import { locationTtl } from "./location-ttl"

export type Adapter = {
  readonly name: string
  // Matches the upstream source file path this adapter rewrites.
  readonly filter: RegExp
  // Returns the adapted source; throws if upstream no longer matches.
  readonly transform: (source: string) => string
}

export const adapters: readonly Adapter[] = [locationTtl]
