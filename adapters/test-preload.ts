// Preloaded into `bun test` so upstream modules imported by tests/ are adapted
// exactly as they are in the compiled binary.
import { adapterPlugin } from "./adapter"

Bun.plugin(adapterPlugin(new Set()))
