<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/logo-dark.svg">
    <img src=".github/logo.svg" alt="behaviour-tree-workflows" width="88">
  </picture>
</p>

<h1 align="center">@q1k-oss/behaviour-tree-workflows</h1>

<p align="center"><strong>Durable, resumable decisions</strong></p>

<p align="center">
  Declarative behaviour trees in YAML.<br>
  A scoped blackboard, a validating loader, and Temporal underneath for durability.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@q1k-oss/behaviour-tree-workflows"><img src="https://img.shields.io/npm/v/@q1k-oss/behaviour-tree-workflows.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@q1k-oss/behaviour-tree-workflows"><img src="https://img.shields.io/npm/dm/@q1k-oss/behaviour-tree-workflows.svg" alt="npm downloads"></a>
  <a href="https://github.com/q1k-oss/behaviour-tree-workflows/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="./docs/README.md"><strong>Docs</strong></a> ·
  <a href="./docs/yaml-specification.md"><strong>YAML spec</strong></a> ·
  <a href="https://www.npmjs.com/package/@q1k-oss/behaviour-tree-workflows"><strong>npm</strong></a> ·
  <a href="https://github.com/q1k-oss/behaviour-tree-workflows"><strong>GitHub</strong></a> ·
  <a href="https://q1k.ai/oss"><strong>q1k-oss</strong></a>
</p>

---

## Overview

A state machine tells you where you are. A behaviour tree tells you what to try next, and
what to fall back to when that fails — which is closer to what an agent actually needs.
Trees are built from a small grammar: composites that sequence or select among children,
decorators that wrap a single child with a timeout or a retry, and leaves that do work.

This library gives you that grammar in TypeScript, with three things bolted on that most
behaviour tree libraries leave to you:

- **YAML as the authoring format.** Trees are data, not code, which means an LLM can write
  one and a four-stage validator can reject it before anything runs.
- **A scoped blackboard.** State is hierarchical and inherited, so a subtree can read its
  parent's values and write its own without leaking them back up.
- **Temporal for execution.** `tree.toWorkflow()` turns any tree into a Temporal workflow,
  so a run survives process crashes, resumes by deterministic replay, and can sit waiting
  for a human or an external signal for as long as it takes.

The leaves lean AI-native: LLM chat, agent-loop turns, tool routing and execution, browser
agents, sandboxed code execution, file parsing and generation, HTTP, GitHub operations and
human-in-the-loop tasks. I/O leaves delegate to Temporal activities you supply, which is
what keeps the tree itself deterministic.

**Core principles**

- Every node inherits `BaseNode` and implements `tick(context)`.
- Every tick returns `SUCCESS`, `FAILURE`, `RUNNING` or `IDLE`.
- `ScopedBlackboard` holds state, hierarchically, with inheritance.
- `Registry` builds nodes from definitions, so trees can be constructed at runtime.
- Production runs go through Temporal; standalone ticking is for tests and development.

## Highlights

- **53 built-in node types** — registered by one call to `registerStandardNodes()`.
- **YAML workflows** — declarative trees with a four-stage validation pipeline and Zod
  schemas behind it.
- **Temporal-native** — `tree.toWorkflow()` gives durable, resumable, replayable execution.
- **Scoped blackboard** — hierarchical state with inheritance and deep cloning.
- **AI-native leaves** — LLM chat, tool calling and routing, agent loops, browser agents,
  sandboxed code execution, human tasks.
- **Observable** — a node lifecycle event emitter, an execution tracker and pluggable
  observability sinks.
- **Typed and tested** — TypeScript throughout, ESM and CJS builds, 971 tests across
  65 files.

## Install

```bash
npm install @q1k-oss/behaviour-tree-workflows
```

Temporal (`@temporalio/workflow`, `@temporalio/activity`) ships as a dependency. The AI
SDK providers used by `./ai-sdk` are optional peers — install only the ones you use.

## Quick start

### YAML workflows (recommended)

```typescript
import {
  BehaviorTree,
  Registry,
  registerStandardNodes,
  loadTreeFromYaml,
  ScopedBlackboard,
} from '@q1k-oss/behaviour-tree-workflows';

const registry = new Registry();
registerStandardNodes(registry);

const root = loadTreeFromYaml(`
type: Sequence
id: my-workflow
children:
  - type: PrintAction
    id: hello
    props:
      message: "Hello from YAML!"
`, registry);

const tree = new BehaviorTree(root);

const status = await root.tick({
  blackboard: new ScopedBlackboard(),
  treeRegistry: registry,
  timestamp: Date.now(),
});
```

### Programmatic API

```typescript
import {
  BehaviorTree,
  Sequence,
  PrintAction,
  Registry,
  ScopedBlackboard,
} from '@q1k-oss/behaviour-tree-workflows';

const root = new Sequence({ id: 'main' });
root.addChildren([
  new PrintAction({ id: 'hello', message: 'Hello' }),
  new PrintAction({ id: 'world', message: 'World!' }),
]);

const tree = new BehaviorTree(root);

await root.tick({
  blackboard: new ScopedBlackboard(),
  treeRegistry: new Registry(),
  timestamp: Date.now(),
});
```

## Usage

### Authoring a tree in YAML

Every node is `type`, `id`, optional `name`, optional `props` and optional `children`:

```yaml
type: Sequence
id: user-onboarding
name: User Onboarding Flow

children:
  - type: PrintAction
    id: welcome
    props:
      message: "Welcome to our platform!"

  - type: Timeout
    id: profile-timeout
    props:
      timeoutMs: 30000
    children:
      - type: Sequence
        id: profile-setup
        children:
          - type: PrintAction
            id: request-info
            props:
              message: "Please complete your profile..."

          - type: Delay
            id: wait
            props:
              delayMs: 1000
            children:
              - type: PrintAction
                id: processing
                props:
                  message: "Processing..."
```

Load it from a string or a file:

```typescript
import { loadTreeFromYaml, loadTreeFromFile } from '@q1k-oss/behaviour-tree-workflows';

const root = loadTreeFromYaml(yamlString, registry);
const root = await loadTreeFromFile('./workflows/onboarding.yaml', registry);
```

Custom nodes join the same registry and become available to YAML immediately:

```typescript
registry.register('MyCustomAction', MyCustomAction, { category: 'action' });
```

### Validation

YAML passes four stages before anything executes:

1. **YAML syntax** — well-formed YAML: indentation, structure.
2. **Tree structure** — required fields (`type`, `id`) and correct data types.
3. **Node configuration** — node-specific props, checked against Zod schemas.
4. **Semantic rules** — ID uniqueness, child counts, circular references.

```typescript
import { validateYaml } from '@q1k-oss/behaviour-tree-workflows';

const result = validateYaml(yamlString, registry);

if (!result.valid) {
  result.errors.forEach(error => console.error(error.format()));
  // root.children[2].props.timeoutMs: Number must be greater than 0
  //   Suggestion: Use a positive timeout value in milliseconds
}
```

This is what makes LLM-authored workflows practical: generate, validate, report the errors
back, regenerate — all without executing a single side effect.

See the [YAML specification](./docs/yaml-specification.md) for the complete reference.

### The blackboard

State is scoped. A child scope inherits from its parent and writes locally:

```typescript
import { ScopedBlackboard } from '@q1k-oss/behaviour-tree-workflows';

const blackboard = new ScopedBlackboard('root');
blackboard.set('userId', 123);

const stepScope = blackboard.createScope('step1');
stepScope.get('userId');         // 123 — inherited
stepScope.set('token', 'abc');   // local to step1

blackboard.get('token');         // undefined — the parent never sees it
```

YAML props resolve variables against it: `${key}` and `${bb.key}` read the blackboard,
`${input.key}` reads the immutable workflow input, `${param.key}` reads test data.

### Running on Temporal

`tree.toWorkflow()` returns a function with Temporal's workflow signature. Register it with
a worker and you get durability for free:

```typescript
import {
  BehaviorTree,
  Registry,
  registerStandardNodes,
  loadTreeFromYaml,
  type WorkflowArgs,
  type WorkflowResult,
} from '@q1k-oss/behaviour-tree-workflows';

export interface YamlWorkflowArgs extends WorkflowArgs {
  yamlContent: string;
}

export async function yamlWorkflow(args: YamlWorkflowArgs): Promise<WorkflowResult> {
  const registry = new Registry();
  registerStandardNodes(registry);

  const root = loadTreeFromYaml(args.yamlContent, registry);
  const tree = new BehaviorTree(root);
  return tree.toWorkflow()(args);
}
```

Starting a run — note that the YAML is read client-side, outside the workflow sandbox:

```typescript
import { readFileSync } from 'fs';

const yamlContent = readFileSync('./workflows/order-processing.yaml', 'utf-8');

const result = await client.workflow.execute('yamlWorkflow', {
  taskQueue: 'behaviour-tree-workflows',
  workflowId: `order-${Date.now()}`,
  args: [{ input: {}, treeRegistry: new Registry(), yamlContent }],
});
```

What Temporal buys you:

- **Automatic resumability** — event sourcing and deterministic replay resume from the exact
  point of failure. There is no manual resume API because none is needed.
- **Durable state** — a run survives process crashes and restarts.
- **Long-running workflows** — days, weeks or months, including time spent waiting on a
  `HumanTask` or a `WaitForSignal`.
- **Built-in retries** — use Temporal's
  [RetryPolicy](https://docs.temporal.io/develop/typescript/failure-detection#retry-policy)
  for activities rather than a retry decorator.
- **Observability** — full execution history in the Temporal UI.

Worked examples live in [`examples/temporal/`](./examples/temporal/) and
[`examples/yaml-workflows/`](./examples/yaml-workflows/).

### Observability

Subscribe to node lifecycle events:

```typescript
import { NodeEventEmitter } from '@q1k-oss/behaviour-tree-workflows';

const eventEmitter = new NodeEventEmitter();

eventEmitter.on('TICK_START', e => console.log(`${e.nodeId} starting`));
eventEmitter.on('TICK_END', e => console.log(`${e.nodeId} → ${e.status}`));
eventEmitter.on('ERROR', e => console.error(`${e.nodeId} errored`, e.error));

await root.tick({ blackboard, treeRegistry: registry, timestamp: Date.now(), eventEmitter });
```

Events: `TICK_START`, `TICK_END`, `ERROR`, `HALT`, `RESET`, `STATUS_CHANGE`.

`ExecutionTracker` consumes those events and keeps the derived view — per-node state, a
timeline, structured errors and the path taken — which is what you query from a running
Temporal workflow to drive a progress UI. `createObservabilitySinkHandler` forwards the
same stream to your own persistence layer. See [observability](./docs/observability.md).

## API reference

### Node catalogue

`registerStandardNodes(registry)` registers 53 node types in one call.

**Composites (10)** — control flow over children:

| Node | Purpose |
| --- | --- |
| `Sequence` | Run children in order until one fails |
| `Selector` | Try children until one succeeds |
| `Parallel` | Run children concurrently |
| `SubTree` | Reference a reusable tree |
| `MemorySequence` | Skip children that already succeeded |
| `ReactiveSequence` | Restart from the first child every tick |
| `Conditional` | If-then-else |
| `ForEach` | Iterate a collection |
| `While` | Loop until a condition is false |
| `Recovery` | Try / catch / finally |

**Decorators (11)** — wrap a single child:

| Node | Purpose |
| --- | --- |
| `Invert` | Flip `SUCCESS` and `FAILURE` |
| `Timeout` | Fail if the child exceeds a time limit |
| `Delay` | Wait before ticking the child |
| `Repeat` | Tick the child N times |
| `RunOnce` | Tick the child at most once |
| `ForceSuccess` / `ForceFailure` | Override the child's result |
| `KeepRunningUntilFailure` | Loop while the child succeeds |
| `Precondition` | Gate the child on a condition |
| `SoftAssert` | Check without failing the branch |
| `StreamingSink` | Bind a streaming channel for child LLM calls |

**Actions (30)** — the leaves that do work:

| Group | Nodes |
| --- | --- |
| **AI** | `LLMChat`, `LLMToolCall`, `ToolExecutor`, `ToolRouter`, `ClaudeAgent`, `BrowserAgent` |
| **I/O** | `HttpRequest`, `ParseFile`, `GenerateFile`, `PythonScript`, `CodeExecution` |
| **Data** | `SetVariable`, `MathOp`, `ArrayFilter`, `Aggregate`, `DataTransform`, `ThresholdCheck`, `RegexExtract`, `LogMessage` |
| **Coordination** | `HumanTask`, `WaitForSignal`, `GitHubAction`, `IntegrationAction` |
| **Test helpers** | `PrintAction`, `MockAction`, `SuccessNode`, `FailureNode`, `RunningNode`, `CounterAction`, `WaitAction` |

**Conditions (2)** — `CheckCondition`, `AlwaysCondition`.

Nodes in the **Test helpers** row exist for examples and tests; the other 44 are meant for
production trees. I/O leaves expect Temporal activity implementations on the tick context —
supply them through `args.activities`.

For scripting inside a tree, use `CodeExecution` (sandboxed) rather than inline expressions.
The older `Script` node and its DSL have been removed.

### Exports

| Import | Contents |
| --- | --- |
| `@q1k-oss/behaviour-tree-workflows` | Everything below |
| `@q1k-oss/behaviour-tree-workflows/ai-sdk` | AI SDK provider adapters for the LLM nodes |

| Symbol | What it is |
| --- | --- |
| `BehaviorTree` | Tree wrapper: path indexing, cloning, `toWorkflow()` |
| `Registry` / `registerStandardNodes` | Node registry and the built-in set |
| `ScopedBlackboard` | Hierarchical, inheriting state |
| `loadTreeFromYaml` / `loadTreeFromFile` | YAML loaders |
| `validateYaml` | The four-stage validator |
| `NodeEventEmitter` | Node lifecycle events |
| `ExecutionTracker` | Derived execution state, timeline and errors |
| `createObservabilitySinkHandler` | Forward events to your own sink |
| `MemoryDataStore` / `DataStore` | Data store abstraction |
| `BaseNode`, `ActionNode`, `ConditionNode`, `DecoratorNode`, `CompositeNode` | Base classes for custom nodes |
| `NodeStatus` | `SUCCESS` / `FAILURE` / `RUNNING` / `IDLE` |
| `ConfigurationError` | Thrown for invalid node configuration |

### Tick context

`tick()` takes a `TemporalContext`:

| Field | Required | Description |
| --- | --- | --- |
| `blackboard` | Yes | `IScopedBlackboard` holding run state |
| `treeRegistry` | Yes | Registry used to resolve `SubTree` references |
| `timestamp` | Yes | Tick timestamp |
| `activities` | No | Temporal activity implementations for I/O leaves |
| `input` | No | Immutable workflow input, read via `${input.key}` |
| `testData` | No | Test parameters, read via `${param.key}` |
| `tokenProvider` | No | OAuth tokens or API keys for `IntegrationAction` |
| `signal` | No | `AbortSignal` for cancellation |
| `sessionId` | No | Correlation id for observability |

## Development

```bash
npm install

npm run build       # production build
npm run dev         # watch mode
npm run typecheck   # type checking
npm test            # run the test suite
npm run test:watch  # watch mode
npm run test:ui     # vitest UI
```

Layout:

```
src/
├── base-node.ts        # BaseNode and the Action/Condition/Decorator/Composite bases
├── behavior-tree.ts    # BehaviorTree — path indexing, clone, toWorkflow()
├── blackboard.ts       # ScopedBlackboard
├── registry.ts         # Node registry
├── registry-utils.ts   # registerStandardNodes()
├── types.ts            # Core types, NodeStatus, activity interfaces
├── composites/         # Sequence, Selector, Parallel, …
├── decorators/         # Timeout, Delay, Repeat, …
├── actions/            # LLM, HTTP, file, code-execution, human-task leaves
├── utilities/          # SetVariable, MathOp, RegexExtract, variable resolver
├── test-nodes.ts       # Example/test leaves and the two condition nodes
├── integrations/       # Active Pieces integration action
├── yaml/               # Loader and the four-stage validator
├── schemas/            # Zod schemas per node
├── observability/      # ExecutionTracker, event sinks
├── data-store/         # DataStore abstraction
├── templates/          # Template loading
└── ai-sdk/             # Provider adapters (separate entrypoint)
```

Tests sit beside the modules they cover as `*.test.ts` and run under
[vitest](https://vitest.dev/) — 971 of them across 65 files. Longer-form docs live in
[`docs/`](./docs/).

## Contributing

Contributions are welcome.

1. Fork the repository and clone your fork.
2. Create a branch: `git checkout -b feat/my-node`.
3. `npm install`, then `npm test` to confirm the suite is green.
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/) and open a
   pull request.

### Adding a node

Create the module under `src/composites/`, `src/decorators/`, `src/actions/` or
`src/utilities/`, and extend the matching base class:

```typescript
import { CompositeNode, NodeStatus } from '@q1k-oss/behaviour-tree-workflows';
import type { TemporalContext } from '@q1k-oss/behaviour-tree-workflows';

export class MyNode extends CompositeNode {
  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    return await this._children[0].tick(context);
  }

  protected onHalt(): void { /* cleanup */ }
  protected onReset(): void { /* reset internal state */ }
}
```

Then: add a Zod schema in `src/schemas/`, register it in `src/registry-utils.ts`, export it
from `src/index.ts`, document it in [`docs/NODE_REFERENCE.md`](./docs/NODE_REFERENCE.md),
and write tests covering every status transition, empty and null edge cases, and `halt` and
`reset` behaviour.

### Error messages

When the default failure message is not descriptive enough, set `_lastError` before
returning `FAILURE`:

```typescript
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  this._lastError = `Verification failed: expected "${expected}" within ${timeout}ms: ${message}`;
  this.log(this._lastError);
  return NodeStatus.FAILURE;
}
```

Worth doing for verification and assertion nodes, and anywhere a user needs expected versus
actual to debug. Not needed for plain action nodes, where the underlying error is usually
descriptive, or for control-flow nodes, where the child is what failed.

## Related projects

This library is part of the q1k-oss family — see
[q1k.ai/oss](https://q1k.ai/oss).

| Package | What it does |
| --- | --- |
| [`@q1k-oss/mint-format`](https://github.com/q1k-oss/mint-format) | Token-efficient data format for LLM prompts |
| [`@q1k-oss/context-engine`](https://github.com/q1k-oss/context-engine) | Turns conversations and files into a versioned knowledge graph |
| [`@q1k-oss/behaviour-tree-workflows`](https://github.com/q1k-oss/behaviour-tree-workflows) | Declarative behaviour trees in YAML, durable via Temporal |
| [`@q1k-oss/kiban`](https://github.com/q1k-oss/kiban) | React components on Radix primitives and Tailwind |

Inspired by [BehaviorTree.CPP](https://github.com/BehaviorTree/BehaviorTree.CPP), adapted
for TypeScript.

## License

[MIT](LICENSE)
