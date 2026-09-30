// Preloaded into `bun test` so upstream modules imported by these tests are
// adapted exactly as they are in the compiled binary.
import { adapterPlugin } from "../scripts/adapter-plugin"

Bun.plugin(adapterPlugin(new Set()))
