// Adds ToolStream.finishStrict — finalizes a pending tool call only when its
// accumulated input is strictly valid JSON. If parsing fails the tool is left
// in state so the caller can decide at the terminal event whether to execute or
// drop it. Used by the anthropic-refusal adapter at content_block_stop so
// parallel tool dispatch is preserved for well-formed calls while truncated
// ones wait for message_stop.
import type { Adapter } from "./index"

// Anchor to the last line of tool-stream.ts so the new export is inserted
// in the right place and the build fails if upstream restructures the file.
const original = `export * as ToolStream from "./tool-stream.js"`

const adapted = `/**
 * Finalize one pending tool call only when its accumulated input is strictly
 * valid JSON. If parsing fails, leave the tool in state and return undefined
 * events — the caller decides what to do at the terminal event.
 */
export const finishStrict = <K extends StreamKey>(route: string, tools: State<K>, key: K) =>
  Effect.gen(function* () {
    const tool = tools[key]
    if (!tool) return { tools, events: undefined as ReadonlyArray<LLMEvent> | undefined }
    const parsed = yield* parseToolInput(route, tool.name, tool.input).pipe(Effect.option)
    if (Option.isNone(parsed)) return { tools, events: undefined }
    const call = LLMEvent.toolCall({
      id: tool.id,
      name: tool.name,
      namespace: tool.namespace,
      input: parsed.value,
      providerExecuted: tool.providerExecuted ? true : undefined,
      providerMetadata: tool.providerMetadata,
    })
    return { tools: withoutTool(tools, key), events: finishEvents(tool, call) }
  })

export * as ToolStream from "./tool-stream.js"`

export const toolStreamStrict: Adapter = {
  name: "tool-stream-strict",
  filter: /protocols[/\\]utils[/\\]tool-stream\.ts$/,
  transform(source) {
    const count = source.split(original).length - 1
    if (count !== 1) throw new Error(`tool-stream-strict: expected 1 occurrence of the ToolStream re-export, found ${count}`)
    return source.replace(original, adapted)
  },
}
