# ai: Anthropic refusal fires a truncated shell command instead of stopping

### Description

When Anthropic ends a stream with `stop_reason: "refusal"`, OpenCode still
executes whatever partial tool input the model had started writing. In the
session that triggered this, the model was mid-way through a `shell` tool call
when the refusal arrived. OpenCode ran the broken command anyway, which failed
with a bash syntax error, and then showed "Provider blocked the response".

The user never got a clear refusal message. What they saw instead was a failed
shell invocation:

```
/bin/bash: -c: line 1: unexpected EOF while looking for matching `"'
Exited with code 2
```

The underlying cause is that the Anthropic protocol parser in
`packages/ai/src/protocols/anthropic-messages.ts` finalizes pending tool calls
unconditionally on `content_block_stop` and `message_stop` — with no check for
whether the stream ended in a refusal. The shared `toolCall` helper in
`utils/tool-stream.ts` then falls back to partial-JSON repair for local calls,
so even incomplete argument JSON gets turned into an executable tool call.

The analogous fix was already applied to the OpenAI Chat path in #46029 and
#46040, but the Anthropic path was not covered.

### Expected behavior

When a response ends with `refusal`, pending local tool calls should be settled
without dispatching. A refusal is not a successful completion — the model did
not confirm the call.

### OpenCode version

**2.0.21** — confirmed both on the host where the original error occurred and
by checking that `v2` HEAD (`48f3c2e9`) is byte-identical in the affected files.

Model: `anthropic/claude-fable-5-1`, variant `max`.

### Steps to reproduce

The parser behavior is deterministic. Feed these SSE frames into
`AnthropicMessages.protocol.stream.step` using the existing test fixture in
`packages/ai/test/provider/anthropic-messages.test.ts`:

```ts
const frames = [
  { type: "message_start", message: { usage: { input_tokens: 5 } } },
  {
    type: "content_block_start",
    index: 0,
    content_block: { type: "tool_use", id: "call_1", name: "shell", input: {} },
  },
  {
    type: "content_block_delta",
    index: 0,
    delta: { type: "input_json_delta", partial_json: '{"command":"cat file.txt; grep -n "something' },
  },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "refusal" }, usage: { output_tokens: 1 } },
  { type: "message_stop" },
]
```

The argument JSON is incomplete (unclosed string), but the parser emits a
fully executable `tool-call` event:

```json
{ "type": "tool-call", "id": "call_1", "name": "shell", "input": { "command": "cat file.txt; grep -n \"something" } }
```

`finish` follows with `{ normalized: "content-filter", raw: "refusal" }` — too
late, the call already went out.

This reproduces two ways:

| Scenario | What happens |
|---|---|
| With `content_block_stop` before the refusal | `tool-call` fires at `content_block_stop`, before the parser even knows it's a refusal |
| Without `content_block_stop` (Anthropic may omit it) | `tool-call` fires at `message_stop`, even though `message_delta` already carried `stop_reason: "refusal"` |
| Normal `stop_reason: "tool_use"` with complete JSON | Works correctly |

### Where to look

- [`onContentBlockStop`](https://github.com/anomalyco/opencode/blob/v2.0.21/packages/ai/src/protocols/anthropic-messages.ts#L1371-L1404) — calls `ToolStream.finish` with no refusal check
- [`onMessageStop`](https://github.com/anomalyco/opencode/blob/v2.0.21/packages/ai/src/protocols/anthropic-messages.ts#L1438-L1463) — calls `ToolStream.finishAll` with no refusal check
- [`toolCall`](https://github.com/anomalyco/opencode/blob/v2.0.21/packages/ai/src/protocols/utils/tool-stream.ts#L72-L96) — partial-JSON fallback for local calls silently repairs incomplete input

#46029 and #46040 already solved this for the OpenAI Chat path by checking
`finishReason?.normalized === "content-filter"` before finalizing pending calls.
The same guard is needed here, but the Anthropic path needs it in both
`onContentBlockStop` and `onMessageStop` since either can fire before the refusal
is in the state. #41932 (closed) noted similar concerns broadly; #38747 covers
the related but separate case of interrupted streams.

### Operating System

Linux 6.8.0, x86_64. Original environment was the OpenCode TUI via SSH.
