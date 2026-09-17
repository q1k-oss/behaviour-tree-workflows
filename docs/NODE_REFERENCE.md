# BTree Node Reference

Every node `registerStandardNodes(registry)` provides — 53 in total, across 10 composites,
11 decorators, 30 actions and 2 conditions.

Nodes marked **act** need a matching Temporal activity on the tick context
(`args.activities`); without one they fail with a message naming the activity. Nodes marked
**test** exist for examples and the test suite, not for production trees.

| Group | Nodes |
|-------|-------|
| [Composites](#composites-control-flow) | `Sequence` · `Selector` · `Conditional` · `ForEach` · `While` · `Parallel` · `SubTree` · `Recovery` · `MemorySequence` · `ReactiveSequence` |
| [Decorators](#decorators) | `Timeout` · `Delay` · `Repeat` · `Invert` · `ForceSuccess` · `ForceFailure` · `Precondition` · `RunOnce` · `KeepRunningUntilFailure` · `SoftAssert` · `StreamingSink` |
| [Actions — Core](#actions--core) | `CodeExecution` **act** · `LogMessage` · `IntegrationAction` **act** · `PrintAction` **test** · `WaitAction` **test** · `CounterAction` **test** |
| [Actions — AI and agents](#actions--ai-and-agents) | `LLMChat` **act** · `LLMToolCall` **act** · `ToolExecutor` **act** · `ToolRouter` · `ClaudeAgent` **act** · `BrowserAgent` **act** |
| [Actions — I/O](#actions--io) | `HttpRequest` **act** · `ParseFile` **act** · `GenerateFile` **act** · `PythonScript` **act** |
| [Actions — Data](#actions--data) | `SetVariable` · `MathOp` · `ArrayFilter` · `Aggregate` · `DataTransform` · `ThresholdCheck` · `RegexExtract` |
| [Actions — Coordination](#actions--coordination) | `HumanTask` **act** · `WaitForSignal` **act** · `GitHubAction` **act** |
| [Actions — Test helpers](#actions--test-helpers) | `MockAction` · `SuccessNode` · `FailureNode` · `RunningNode` |
| [Conditions](#conditions) | `CheckCondition` · `AlwaysCondition` |

See also: [YAML specification](./yaml-specification.md) ·
[custom nodes](./custom-nodes-architecture.md) · [observability](./observability.md)

---

## Composites (Control Flow)

### Sequence
Execute children in order. **All must succeed** for sequence to succeed.

```yaml
type: Sequence
id: my-sequence
children:
  - type: PrintAction
    props: { message: "Step 1" }
  - type: PrintAction
    props: { message: "Step 2" }
```

| Behavior | Result |
|----------|--------|
| All children SUCCESS | SUCCESS |
| Any child FAILURE | FAILURE (stops immediately) |
| Child RUNNING | RUNNING (resumes from that child) |
| No children | SUCCESS |

---

### Selector (aka Fallback)
Execute children in order. **First success wins**.

```yaml
type: Selector
id: try-options
children:
  - type: TryPrimary
  - type: TrySecondary
  - type: TryFallback
```

| Behavior | Result |
|----------|--------|
| Any child SUCCESS | SUCCESS (stops immediately) |
| All children FAILURE | FAILURE |
| No children | FAILURE |

---

### Conditional
If-then-else logic. First child is condition, second is "then", third (optional) is "else".

```yaml
type: Conditional
id: if-ready
children:
  # Child 1: Condition
  - type: CheckCondition
    props:
      key: "status"
      operator: "=="
      value: "ready"
  # Child 2: Then branch
  - type: PrintAction
    props: { message: "Ready!" }
  # Child 3: Else branch (optional)
  - type: PrintAction
    props: { message: "Not ready" }
```

**Requirements:** 2-3 children exactly.

---

### ForEach
Iterate over an array from blackboard.

```yaml
type: ForEach
id: process-items
props:
  collectionKey: "items"      # Blackboard key with array
  itemKey: "item"             # Current item stored here
  indexKey: "idx"             # Current index (optional)
children:
  - type: LogMessage
    props:
      message: "Processing ${item} at ${idx}"
```

| Behavior | Result |
|----------|--------|
| All iterations SUCCESS | SUCCESS |
| Any iteration FAILURE | FAILURE (stops) |
| Empty collection | SUCCESS |
| Missing collection | FAILURE |

---

### While
Loop while condition succeeds.

```yaml
type: While
id: retry-loop
children:
  # Child 1: Condition
  - type: CheckCondition
    props:
      key: "retries"
      operator: "<"
      value: 3
  # Child 2: Body
  - type: Sequence
    children:
      - type: TryAction
      - type: CounterAction
        props: { counterKey: "retries" }
```

**Requirements:** Exactly 2 children (condition, body).

---

### Parallel
Execute all children simultaneously.

```yaml
type: Parallel
id: parallel-tasks
props:
  policy: "all"  # "all" | "one" - success policy
children:
  - type: TaskA
  - type: TaskB
  - type: TaskC
```

| Policy | SUCCESS when |
|--------|--------------|
| `all` | All children succeed |
| `one` | Any child succeeds |

---

### SubTree
Execute a registered behavior tree by ID.

```yaml
type: SubTree
id: run-template
props:
  treeId: "GoogleSheets.insert-row"
```

Creates a scoped blackboard for isolation.

---

### Recovery
Execute recovery action if main action fails.

```yaml
type: Recovery
id: with-recovery
children:
  # Child 1: Main action
  - type: MainTask
  # Child 2: Recovery action
  - type: HandleFailure
```

---

### MemorySequence
Like `Sequence`, but remembers which children already succeeded and skips them when the
sequence is re-entered. Use it when the early steps are expensive and should not re-run
after a later step fails and is retried.

```yaml
type: MemorySequence
id: resumable-import
children:
  - type: ParseFile
    id: parse
    props: { file: "${input.path}", outputKey: rows }
  - type: HttpRequest
    id: push
    props: { url: "https://api.example.com/import", method: POST, body: "${bb.rows}", outputKey: pushed }
```

No props beyond `id` and `name`. Call `reset()` to clear the memory.

---

### ReactiveSequence
Like `Sequence`, but restarts from the first child on **every** tick rather than resuming
where it left off. Use it when an earlier child is a condition that can stop being true
while a later child is still running.

```yaml
type: ReactiveSequence
id: guarded-work
children:
  - type: CheckCondition      # re-checked every tick
    props: { key: connected, operator: eq, value: true }
  - type: MonitorProcess
```

No props beyond `id` and `name`.

---

## Decorators

### Timeout
Fail if child takes too long.

```yaml
type: Timeout
id: limited-task
props:
  ms: 5000  # 5 seconds
children:
  - type: LongRunningTask
```

---

### Delay
Wait before executing child.

```yaml
type: Delay
id: delayed-action
props:
  ms: 1000  # Wait 1 second
children:
  - type: MyAction
```

---

### Repeat
Execute child multiple times.

```yaml
type: Repeat
id: retry-3-times
props:
  times: 3
  stopOnFailure: true  # Stop early on failure
children:
  - type: MyAction
```

---

### Invert
Invert child's result (SUCCESS ↔ FAILURE).

```yaml
type: Invert
id: not-condition
children:
  - type: CheckCondition
    props:
      key: "isBlocked"
      operator: "=="
      value: true
```

---

### ForceSuccess / ForceFailure
Always return specified status regardless of child.

```yaml
type: ForceSuccess
id: ignore-failure
children:
  - type: OptionalAction
```

---

### Precondition
Check condition before running child.

```yaml
type: Precondition
id: guarded-action
props:
  condition: "isEnabled"  # Blackboard key (truthy check)
children:
  - type: MyAction
```

---

### RunOnce
Execute child only once (memoized).

```yaml
type: RunOnce
id: init-once
children:
  - type: InitializeSystem
```

---

### KeepRunningUntilFailure
The opposite of a retry: keeps ticking the child **while it succeeds**, and returns SUCCESS
once the child finally fails. Useful for pagination and drain loops.

```yaml
type: KeepRunningUntilFailure
id: drain-pages
children:
  - type: FetchNextPage   # fails when there is no next page
```

No props beyond `id` and `name`.

---

### SoftAssert
Converts a child FAILURE into SUCCESS so the branch continues. Failures are logged rather
than propagated — for checks you want recorded but not fatal.

```yaml
type: SoftAssert
id: optional-check
children:
  - type: CheckCondition
    props: { key: warehouseSynced, operator: eq, value: true }
```

No props beyond `id` and `name`.

---

### StreamingSink
Binds a streaming channel id into the blackboard for the LLM calls beneath it, so
`LLMToolCall` can stream tokens to a WebSocket or SSE channel. The previous value is saved
and restored, so nesting is safe — an inner sink overrides, then hands the outer one back.

```yaml
type: StreamingSink
id: stream-to-user
props:
  channelKey: sessionChannelId   # or a literal channelId
children:
  - type: LLMToolCall
    id: turn
    props:
      provider: anthropic
      model: claude-sonnet-5
      messagesKey: messages
      outputKey: response
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `channelId` | string | one of the two | Literal channel id |
| `channelKey` | string | one of the two | Blackboard key holding the channel id |

---

## Actions — Core

### CodeExecution
Execute JavaScript or Python code in a secure sandboxed environment via Microsandbox.

```yaml
type: CodeExecution
id: calculate-total
props:
  language: javascript  # or 'python'
  timeout: 30000  # Optional, default 30000ms
  code: |
    const items = getBB('items') || [];
    const taxRate = 0.1;
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const total = subtotal * (1 + taxRate);
    setBB('total', total);
    setBB('itemCount', items.length);
```

**Python Example:**
```yaml
type: CodeExecution
id: analyze-data
props:
  language: python
  packages:  # Optional: Python packages to install
    - pandas
  code: |
    users = getBB('users')
    setBB('userCount', len(users))
    setBB('domains', list(set(u['email'].split('@')[1] for u in users)))
```

**Available Functions:**
- `getBB(key)` - Read value from blackboard
- `setBB(key, value)` - Write value to blackboard
- `getInput(key)` - Read workflow input (read-only)
- `console.log(...)` / `print(...)` - Debug logging

**Note:** CodeExecution runs in an isolated microVM (Microsandbox) with no network
access and no cloud credentials. Requires the `executeCode` activity to be configured.

---

### LogMessage
Log message with blackboard value substitution.

```yaml
type: LogMessage
id: log-status
props:
  message: "User ${userId} has ${itemCount} items"
  level: "info"  # info | warn | error | debug
```

---

### PrintAction
Simple print to console.

```yaml
type: PrintAction
id: print-hello
props:
  message: "Hello World"
  outputKey: "lastMessage"  # Optional: store in blackboard
```

---

### WaitAction
Return RUNNING for specified duration, then SUCCESS.

```yaml
type: WaitAction
id: wait-1s
props:
  waitMs: 1000
```

---

### CounterAction
Increment a blackboard counter.

```yaml
type: CounterAction
id: inc-retry
props:
  counterKey: "retries"  # Default: "counter"
  increment: 1           # Default: 1
```

---

### IntegrationAction
Execute Active Pieces integration action.

```yaml
type: IntegrationAction
id: insert-row
props:
  provider: "google"
  action: "insert_row"
  inputs:
    spreadsheetId: "${bb.sheetId}"
    sheetId: 0
    values:
      values:
        - "Value 1"
        - "Value 2"
```

Result stored in `{nodeId}.result` on blackboard.

---

## Actions — AI and agents

These leaves need matching Temporal activity implementations on the tick context
(`args.activities`). Without them the node fails with a message naming the missing activity.

### LLMChat
One LLM completion. Messages in, text or JSON out, written to `outputKey`.

```yaml
type: LLMChat
id: classify
props:
  provider: anthropic          # anthropic | openai | google | ollama
  model: claude-sonnet-5
  systemPrompt: "Classify the intent in one word."
  messages:
    - role: user
      content: "${bb.userMessage}"
  temperature: 0
  responseFormat: json         # text (default) | json
  outputKey: intent
```

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `provider` | enum | yes | — | `anthropic`, `openai`, `google`, `ollama` |
| `model` | string | yes | — | Provider model id |
| `messages` | array | yes | — | `{ role, content }`, at least one |
| `systemPrompt` | string | no | — | System instruction |
| `temperature` | number | no | — | 0–2 |
| `maxTokens` | int | no | — | Response cap |
| `responseFormat` | enum | no | `text` | `text` or `json` |
| `jsonSchema` | object | no | — | Schema enforced when `responseFormat: json` |
| `timeout` | int | no | `60000` | Milliseconds |
| `baseUrl` | string | no | — | Override the provider endpoint |
| `outputKey` | string | yes | — | Blackboard key for the result |

---

### LLMToolCall
One turn of an agent loop: sends the running message history plus a tool list, and writes
the model's reply — including any tool calls it wants made — to `outputKey`. Pair it with
`ToolExecutor` inside a loop.

```yaml
type: LLMToolCall
id: agent-turn
props:
  provider: anthropic
  model: claude-sonnet-5
  systemPrompt: "You are a support agent."
  messagesKey: messages        # blackboard key holding the history
  userMessageKey: userMessage  # optional, appended before the call
  toolsKey: activeTools        # tools chosen at runtime, e.g. by ToolRouter
  outputKey: response
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `provider` / `model` | string | yes | As for `LLMChat` |
| `messagesKey` | string | yes | Blackboard key holding the message history |
| `userMessageKey` | string | no | Key of a message to append before calling |
| `toolsKey` | string | no | Key holding tool definitions (see `ToolRouter`) |
| `tools` | array | no | Static tool definitions, used when `toolsKey` is absent |
| `systemPrompt` | string | no | System instruction |
| `temperature` / `maxTokens` | number | no | Sampling controls |
| `outputKey` | string | yes | Blackboard key for the model's reply |

---

### ToolExecutor
Runs the tool calls contained in an `LLMToolCall` response and appends the results to the
message history, so the next turn sees them.

```yaml
type: ToolExecutor
id: run-tools
props:
  responseKey: response        # what LLMToolCall wrote
  messagesKey: messages        # history to append results to
  outputKey: toolResults       # optional
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `responseKey` | string | yes | Key holding the LLM response with tool calls |
| `messagesKey` | string | yes | Key of the history to append results to |
| `outputKey` | string | no | Key for the raw tool results |

---

### ToolRouter
Chooses which tools to expose to the model for this turn, by matching an intent or by
explicit rules, and writes the selection to `outputKey` — which is the key `LLMToolCall`
reads via `toolsKey`. Keeps the token cost of a large tool catalogue down.

```yaml
type: ToolRouter
id: pick-tools
props:
  intentKey: intent            # blackboard key holding the classified intent
  toolSets:
    research:
      - name: web_search
        description: Search the web
        parameters: { type: object, properties: {} }
    action:
      - name: create_order
        description: Place an order
        parameters: { type: object, properties: {} }
  defaultTools: [web_search]
  outputKey: activeTools
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `intentKey` | string | yes | Blackboard key holding the intent to match |
| `toolSets` | object | yes | Named sets of tool definitions |
| `defaultTools` | string[] | no | Tool names used when nothing matches |
| `rules` | array | no | Explicit intent → tool-set rules |
| `outputKey` | string | yes | Key the selected tools are written to |

---

### ClaudeAgent
Runs a full Claude Agent SDK session — multi-turn, with its own tools and optional MCP
servers and subagents — as a single leaf.

```yaml
type: ClaudeAgent
id: fix-the-build
props:
  prompt: "Find why CI is failing on ${bb.branch} and fix it."
  model: claude-sonnet-5
  allowedTools: [Read, Edit, Bash]
  permissionMode: acceptEdits   # default | acceptEdits | bypassPermissions
  maxTurns: 50
  maxBudgetUsd: 5
  cwd: /workspace/repo
  outputKey: agentResult
```

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `prompt` | string | yes | — | The task for the agent |
| `model` | string | no | — | Model id |
| `systemPrompt` | string | no | — | System instruction |
| `allowedTools` | string[] | no | — | Tool allowlist |
| `permissionMode` | enum | no | `default` | `default`, `acceptEdits`, `bypassPermissions` |
| `maxTurns` | int | no | `50` | Turn budget |
| `maxBudgetUsd` | number | no | — | Spend cap |
| `cwd` | string | no | — | Working directory |
| `mcpServers` | object | no | — | MCP servers to attach |
| `agents` | object | no | — | Named subagent definitions |
| `outputKey` | string | yes | — | Blackboard key for the result |

---

### BrowserAgent
Gives a goal to a browser-driving agent and writes what it found to `outputKey`.

```yaml
type: BrowserAgent
id: check-listing
props:
  goal: "Find the current price and stock status for SKU ${bb.sku}."
  startUrl: "https://example.com/search"
  maxSteps: 20
  timeout: 60000
  persistContext: true
  contextKey: browserSession
  outputKey: listing
```

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `goal` | string | yes | — | What the agent should accomplish |
| `startUrl` | string | no | — | Where to begin |
| `maxSteps` | int | no | `20` | Step budget |
| `timeout` | int | no | `60000` | Milliseconds |
| `persistContext` | boolean | no | `false` | Keep the browser session for later nodes |
| `contextKey` | string | no | — | Blackboard key for the persisted session |
| `llmProvider` / `llmModel` | string | no | — | Override the driving model |
| `outputKey` | string | yes | — | Blackboard key for the result |

---

## Actions — I/O

### HttpRequest
Make an HTTP request and store the response.

```yaml
type: HttpRequest
id: fetch-orders
props:
  url: "https://api.example.com/orders?since=${input.since}"
  method: GET                  # GET | POST | PUT | DELETE | PATCH
  headers:
    Authorization: "Bearer ${bb.token}"
  responseType: json           # json (default) | text | binary
  timeout: 15000
  retry: { maxAttempts: 3, backoffMs: 500 }
  outputKey: orders
```

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `url` | string | yes | — | Supports `${input.x}` and `${bb.x}` |
| `method` | enum | no | `GET` | HTTP verb |
| `headers` | object | no | — | Variables resolved in values |
| `body` | any | no | — | Request body |
| `responseType` | enum | no | `json` | `json`, `text`, `binary` |
| `timeout` | int | no | — | Milliseconds |
| `retry` | object | no | — | `{ maxAttempts, backoffMs }` |
| `outputKey` | string | yes | — | Blackboard key for the response |

---

### ParseFile
Read a CSV or Excel file into rows on the blackboard.

```yaml
type: ParseFile
id: read-catalogue
props:
  file: "${input.uploadPath}"
  format: auto                 # csv | xlsx | xls | auto (default)
  sheetName: "Products"
  columnMapping:
    "Product Name": name
    "Unit Price": price
  outputKey: rows
```

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `file` | string | yes | — | Path; supports variable resolution |
| `format` | enum | no | `auto` | `csv`, `xlsx`, `xls`, `auto` |
| `sheetName` | string | no | first sheet | Excel sheet to read |
| `columnMapping` | object | no | — | `"Original Header": normalizedKey` |
| `options` | object | no | — | Parser options |
| `outputKey` | string | yes | — | Blackboard key for the parsed rows |

---

### GenerateFile
Write blackboard data out as a CSV, XLSX or JSON file, and store the file metadata.

```yaml
type: GenerateFile
id: write-report
props:
  format: xlsx                 # csv | xlsx | json
  dataKey: rows
  columns:
    - { header: "SKU", key: sku, width: 18 }
    - { header: "Price", key: price }
  filename: "report-${input.runId}.xlsx"
  storage: persistent          # temp | persistent
  outputKey: reportFile        # receives { path, url, size }
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `format` | enum | yes | `csv`, `xlsx`, `json` |
| `dataKey` | string | yes | Blackboard key holding the rows |
| `columns` | array | no | `{ header, key, width? }` definitions |
| `filename` | string | yes | Supports variable resolution |
| `storage` | enum | yes | `temp` or `persistent` |
| `outputKey` | string | yes | Key for the file metadata |

---

### PythonScript
Run Python in a separate worker process. Unlike `CodeExecution` (which sandboxes both
languages via Microsandbox), this is the cross-language activity path.

```yaml
type: PythonScript
id: forecast
props:
  code: |
    rows = getBB('rows')
    setBB('mean', sum(r['price'] for r in rows) / len(rows))
  packages: [pandas]
  timeout: 60000
  allowedEnvVars: [MODEL_URL]
```

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `code` | string | yes | — | Python source |
| `packages` | string[] | no | `[]` | Packages to make available |
| `timeout` | int | no | `60000` | Milliseconds |
| `allowedEnvVars` | string[] | no | `[]` | Environment variables to pass through |

---

## Actions — Data

These run inline and need no activities.

### SetVariable
Write a value to the blackboard.

```yaml
type: SetVariable
id: seed
props:
  key: attempts
  value: 0
```

---

### MathOp
Evaluate an arithmetic expression over blackboard values.

```yaml
type: MathOp
id: total
props:
  expression: "${bb.subtotal} * (1 + ${bb.taxRate})"
  outputKey: total
  round: round                 # none | round | floor | ceil
  precision: 2
```

---

### ArrayFilter
Filter an array on the blackboard.

```yaml
type: ArrayFilter
id: in-stock
props:
  input: products
  outputKey: available
  logic: and                   # and (default) | or
  conditions:
    - { field: stock, operator: gt, value: 0 }
    - { field: status, operator: in, value: [active, backorder] }
```

Operators: `eq`, `ne`, `gt`, `lt`, `gte`, `lte`, `in`, `nin`, `exists`, `regex`,
`between` (use `range: [lo, hi]`), `contains`.

---

### Aggregate
Count, sum or average an array, optionally grouped.

```yaml
type: Aggregate
id: by-category
props:
  input: orders
  outputKey: summary
  groupBy: category
  operations:
    - { type: count, as: orders }
    - { type: sum, field: total, as: revenue }
    - { type: avg, field: total, as: averageOrder }
```

Operation types: `count`, `sum`, `avg`, `min`, `max`. All but `count` need a `field`.

---

### DataTransform
Reshape values into a new object on the blackboard.

```yaml
type: DataTransform
id: to-payload
props:
  outputKey: payload
  wrapInArray: false
  mappings:
    - { target: sku, value: "${bb.product.id}" }
    - { target: price, value: "${bb.product.amount}", coerce: number }
```

`coerce` accepts `string`, `number` or `boolean`.

---

### ThresholdCheck
Classify a value against ordered thresholds, and optionally fail on certain labels.

```yaml
type: ThresholdCheck
id: stock-level
props:
  value: "${bb.stock}"
  outputKey: stockLabel
  failOn: [critical]
  thresholds:
    - { operator: lte, value: 0, label: critical }
    - { operator: lt, value: 10, label: low }
    - { operator: gte, value: 10, label: healthy }
```

Operators: `lte`, `lt`, `gte`, `gt`, `eq`, `ne`, `between` (use `range: [lo, hi]`).

---

### RegexExtract
Pull matches out of a string on the blackboard.

```yaml
type: RegexExtract
id: find-skus
props:
  input: emailBody
  pattern: "SKU-[0-9]{6}"
  flags: g                     # default "g"
  matchIndex: 0                # omit to store all matches as an array
  outputKey: skus
```

---

## Actions — Coordination

### HumanTask
Pauses the workflow until a person responds. The `a2ui` block describes the form to render;
in Temporal the wait itself is handled in the workflow layer, so a run can sit here for as
long as the timeout allows.

```yaml
type: HumanTask
id: approve-discount
props:
  title: "Approve a ${bb.discountPct}% discount"
  description: "Order ${bb.orderId} is above the auto-approve limit."
  assigneeRole: pricing-manager
  timeoutMs: 86400000          # 24h default
  onTimeout: expire            # expire (default) | approve | reject
  a2ui:
    components:
      - { type: text, text: "Customer: ${bb.customerName}" }
      - { type: button, label: Approve, value: approve }
      - { type: button, label: Reject, value: reject }
  outputKey: decision
```

---

### WaitForSignal
Pauses until an external Temporal signal arrives — a webhook, an inbound user message, or
another workflow. Same pattern as `HumanTask`, without the form.

```yaml
type: WaitForSignal
id: await-reply
props:
  signalName: userMessage
  signalKey: pendingMessage    # optional key to read the payload from
  timeoutMs: 86400000          # 24h default
  outputKey: reply
```

---

### GitHubAction
Perform one GitHub operation.

```yaml
type: GitHubAction
id: open-pr
props:
  operation: createPullRequest
  repo: acme/widgets
  params:
    head: "${bb.branch}"
    base: main
    title: "Automated fix"
  outputKey: pr
```

Operations: `createBranch`, `createPullRequest`, `getPullRequest`, `mergePullRequest`,
`closePullRequest`, `createReview`, `listIssues`, `addLabels`, `createComment`,
`createRelease`.

---

## Actions — Test helpers

Registered by `registerStandardNodes()` so examples and tests run out of the box. They are
not meant for production trees. `PrintAction`, `WaitAction` and `CounterAction` belong to
this group too and are documented under **Actions — Core** above.

### MockAction
Return a fixed status, optionally after several ticks.

```yaml
type: MockAction
id: pretend-slow
props:
  returnStatus: SUCCESS
  ticksBeforeComplete: 3
```

---

### SuccessNode / FailureNode / RunningNode
Always return SUCCESS, FAILURE or RUNNING respectively. No props.

```yaml
type: Selector
id: fallback-demo
children:
  - type: FailureNode
  - type: SuccessNode
```

---

## Conditions

### CheckCondition
Compare blackboard value against expected.

```yaml
type: CheckCondition
id: is-ready
props:
  key: "status"
  operator: "=="  # ==, !=, >, <, >=, <=
  value: "ready"
```

| Condition | Result |
|-----------|--------|
| Comparison true | SUCCESS |
| Comparison false | FAILURE |

---

### AlwaysCondition
Always return configured status.

```yaml
type: AlwaysCondition
id: always-true
props:
  returnStatus: 1  # 1=SUCCESS, 0=FAILURE
```

---

## Blackboard Variable Resolution

Many nodes support `${bb.key}` syntax for dynamic values:

```yaml
type: LogMessage
props:
  message: "Processing ${bb.currentItem} for user ${bb.userId}"
```

For CodeExecution node, use getter/setter functions:

```yaml
type: CodeExecution
props:
  language: javascript
  code: |
    const user = getBB('userId');
    setBB('greeting', 'Hello, ' + user + '!');
```

---

## Common Patterns

### Retry with Counter

```yaml
type: While
id: retry-loop
children:
  - type: CheckCondition
    props: { key: "retries", operator: "<", value: 3 }
  - type: Sequence
    children:
      - type: Selector
        children:
          - type: MyAction
          - type: ForceSuccess
            children:
              - type: LogMessage
                props: { message: "Attempt ${retries} failed" }
      - type: CounterAction
        props: { counterKey: "retries" }
```

### Conditional Execution

```yaml
type: Conditional
children:
  - type: CheckCondition
    props: { key: "feature.enabled", operator: "==", value: true }
  - type: FeatureWorkflow
  - type: LogMessage
    props: { message: "Feature disabled, skipping" }
```

### Process Array Items

```yaml
type: ForEach
props:
  collectionKey: "orders"
  itemKey: "order"
children:
  - type: Sequence
    children:
      - type: LogMessage
        props: { message: "Processing order ${order.id}" }
      - type: IntegrationAction
        props:
          provider: google
          action: insert_row
          inputs:
            spreadsheetId: "${bb.sheetId}"
            values:
              values: ["${bb.order.id}", "${bb.order.customer}"]
```
