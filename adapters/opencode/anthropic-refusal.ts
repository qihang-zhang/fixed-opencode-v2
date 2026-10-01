// Guards the Anthropic Messages protocol against executing truncated local tool
// calls when the stream ends with stop_reason "refusal" or "max_tokens".
//
// Anthropic streams content_block_stop before message_delta, so the finish
// reason is unknown at the time each tool block closes. The existing finish()
// helper falls back to partial-JSON repair for local calls, which lets a
// half-written shell command execute even when the model was cut off.
//
// Fix (mirrors #46029 and #46040 for OpenAI Chat):
// 1. onContentBlockStop uses ToolStream.finishStrict — emits tool-call only
//    when the accumulated JSON is complete; incomplete calls stay in state.
// 2. onMessageStop checks pendingFinish before flushing remaining tools:
//    content-filter or length → emit tool-input-error and drop; otherwise →
//    finishAll as before, preserving partial-JSON repair for the normal path.
import type { Adapter } from "./index"

// --- patch 1: onContentBlockStop ----------------------------------------
// Replace ToolStream.finish with ToolStream.finishStrict so incomplete JSON
// is not repaired into an executable call at content_block_stop time.

const finishOrig = `  const result = yield* ToolStream.finish(ADAPTER, state.tools, event.index)
  const events: LLMEvent[] = []
  const resultEvents = result.events ?? []`

const finishAdapted = `  const result = yield* ToolStream.finishStrict(ADAPTER, state.tools, event.index)
  const events: LLMEvent[] = []
  const resultEvents = result.events ?? []`

// --- patch 2: onMessageStop body ----------------------------------------
// Replace the unconditional finishAll block with a refusal/length guard.

const stopOrig = `  const result = yield* ToolStream.finishAll(ADAPTER, state.tools)
  const events: LLMEvent[] = []
  const lifecycle = result.events.length ? Lifecycle.stepStart(state.lifecycle, events) : state.lifecycle
  events.push(...result.events)`

const stopAdapted = `  const isIncomplete =
    state.pendingFinish?.reason.normalized === "content-filter" ||
    state.pendingFinish?.reason.normalized === "length"
  const events: LLMEvent[] = []
  let tools = state.tools
  if (isIncomplete) {
    for (const tool of Object.values(state.tools)) {
      if (tool) events.push(LLMEvent.toolInputError({ id: tool.id, name: tool.name, namespace: tool.namespace, raw: tool.input }))
    }
    tools = ToolStream.empty<number>()
  } else {
    const result = yield* ToolStream.finishAll(ADAPTER, state.tools)
    events.push(...result.events)
    tools = result.tools
  }
  const lifecycle = events.length ? Lifecycle.stepStart(state.lifecycle, events) : state.lifecycle`

// --- patch 3: onMessageStop return --------------------------------------
// result.tools no longer exists in the refusal path; use the local `tools`.

const returnOrig = `  return [{ ...state, lifecycle: finished, tools: result.tools }, events] satisfies StepResult
})`

const returnAdapted = `  return [{ ...state, lifecycle: finished, tools }, events] satisfies StepResult
})`

export const anthropicRefusal = {
  name: "anthropic-refusal",
  filter: /protocols[/\\]anthropic-messages\.ts$/,
  transform(source: string): string {
    const checks: [string, string, string][] = [
      [finishOrig, finishAdapted, "onContentBlockStop ToolStream.finish call"],
      [stopOrig, stopAdapted, "onMessageStop finishAll block"],
      [returnOrig, returnAdapted, "onMessageStop result.tools return"],
    ]
    for (const [orig, adapted, label] of checks) {
      const count = source.split(orig).length - 1
      if (count !== 1) throw new Error(`anthropic-refusal: expected 1 occurrence of ${label}, found ${count}`)
      source = source.replace(orig, adapted)
    }
    return source
  },
}
