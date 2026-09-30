// Preloaded into upstream's unmodified packages/cli/script/build.ts. Wraps
// Bun.build so every compile also runs our adapters, and fails the build if any
// adapter did not find its upstream source.
import { adapterPlugin, requireAllApplied } from "./adapter-plugin"

const build = Bun.build
Bun.build = (async (options: Bun.BuildConfig) => {
  const applied = new Set<string>()
  const result = await build({ ...options, plugins: [adapterPlugin(applied), ...(options.plugins ?? [])] })
  if (result.success) requireAllApplied(applied)
  return result
}) as typeof Bun.build
