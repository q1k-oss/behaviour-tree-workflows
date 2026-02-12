# @q1k-oss/btree-workflows

Core behavior tree implementation for TypeScript, designed for AI-native workflows.

## Features

- ✅ **22 Production-Ready Nodes**: 11 composites + 10 decorators + 1 scripting node for comprehensive control flow
- ✅ **YAML Workflows**: Declarative workflow definitions with 4-stage validation pipeline and Zod schemas
- ✅ **Temporal Workflows**: Native integration with Temporal for durable, resumable workflow execution
- ✅ **Hierarchical Blackboard**: Scoped data storage with inheritance and deep cloning
- ✅ **Event System**: Observable node lifecycle events for real-time monitoring
- ✅ **Smart Execution Snapshots**: Capture-on-change with diffs & execution traces for efficient debugging
- ✅ **Type-Safe**: Strongly typed TypeScript with **534 tests passing** (89%+ coverage)

## Installation

```bash
npm install @q1k-oss/btree
```

## Quick Start

### Programmatic API

```typescript
import {
  Sequence,
  PrintAction,
  ScopedBlackboard,
  TickEngine
} from '@q1k-oss/btree';

// Create a behavior tree
const sequence = new Sequence({ id: 'main' });
sequence.addChildren([
  new PrintAction({ id: 'hello', message: 'Hello' }),
  new PrintAction({ id: 'world', message: 'World!' })
]);

// Execute it
const blackboard = new ScopedBlackboard();
const engine = new TickEngine(sequence);
await engine.tick(blackboard);
```

### YAML Workflows (Recommended)

```typescript
import { Registry, registerStandardNodes, loadTreeFromYaml } from '@q1k-oss/btree';

// Setup registry with all built-in nodes
const registry = new Registry();
registerStandardNodes(registry);  // Registers all 32 built-in nodes!

// Add your custom nodes
registry.register('MyCustomAction', MyCustomAction, { category: 'action' });

// Load from YAML
const tree = loadTreeFromYaml(`
type: Sequence
id: my-workflow
children:
  - type: PrintAction
    id: hello
    props:
      message: "Hello from YAML!"
  - type: MyCustomAction
    id: custom
`, registry);

// Execute
await tree.execute();
```

## YAML Workflows

Define behavior trees declaratively using YAML with comprehensive validation:

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

### Loading YAML Workflows

```typescript
import {
  Registry,
  registerStandardNodes,
  loadTreeFromYaml,
  loadTreeFromFile
} from '@q1k-oss/btree';

// Setup registry with all 32 built-in nodes
const registry = new Registry();
registerStandardNodes(registry);  // One line instead of 32!

// Optionally register your custom nodes
registry.register('MyCustomAction', MyCustomAction, { category: 'action' });

// Load from string
const yamlString = `
type: Sequence
id: my-workflow
children:
  - type: PrintAction
    id: hello
    props:
      message: "Hello from YAML!"
`;

const tree = loadTreeFromYaml(yamlString, registry);

// Load from file
const tree = await loadTreeFromFile('./workflows/onboarding.yaml', registry);

// Execute like any other tree
const result = await tree.execute();
```

**Built-in nodes** (automatically registered by `registerStandardNodes()`):
- **10 Composites**: Sequence, Selector, Parallel, ForEach, While, Conditional, ReactiveSequence, MemorySequence, Recovery, SubTree
- **10 Decorators**: Timeout, Delay, Repeat, Invert, ForceSuccess, ForceFailure, RunOnce, KeepRunningUntilFailure, Precondition, SoftAssert
- **9 Actions/Conditions**: PrintAction, MockAction, CounterAction, CheckCondition, AlwaysCondition, WaitAction, Script, LogMessage, RegexExtract
- **3 Test Nodes**: SuccessNode, FailureNode, RunningNode

### 4-Stage Validation Pipeline

YAML workflows undergo comprehensive validation before execution:

1. **YAML Syntax** - Validates well-formed YAML (indentation, structure)
2. **Tree Structure** - Ensures required fields (`type`, `id`) and correct data types
3. **Node Configuration** - Validates node-specific properties using Zod schemas
4. **Semantic Rules** - Checks ID uniqueness, child counts, circular references

```typescript
import { validateYaml } from '@q1k-oss/btree';

// Validate without executing
const result = validateYaml(yamlString, registry);

if (!result.valid) {
  result.errors.forEach(error => {
    console.error(error.format());
    // Example output:
    // "root.children[2].props.timeoutMs: Number must be greater than 0
    //  Suggestion: Use a positive timeout value in milliseconds"
  });
}
```

**Benefits:**
- **Declarative**: Define workflows in YAML instead of TypeScript
- **Validated**: Comprehensive validation with helpful error messages
- **Type-Safe**: Runtime validation using Zod schemas
- **AI-Friendly**: Easy for LLMs to generate and modify workflows

See [YAML Specification](./docs/yaml-specification.md) for complete reference with examples for all 22 node types.

## Node Types

### Core Composites (11)
| Node | Purpose | Use Case |
|------|---------|----------|
| `Sequence` | Execute in order | Happy path flows |
| `Selector` | Try until success | Fallback strategies |
| `Parallel` | Execute concurrently | Parallel operations |
| `SubTree` | Reference reusable workflow | DRY workflows |
| `MemorySequence` | Skip completed | Expensive retries |
| `ReactiveSequence` | Always restart | Reactive monitoring |
| `Conditional` | If-then-else | Branching logic |
| `ForEach` | Iterate collection | Data-driven tests |
| `While` | Loop until false | Polling & waiting |
| `Recovery` | Try-catch-finally | Error handling |

### Advanced Decorators (6)
| Node | Purpose | Use Case |
|------|---------|----------|
| `Invert` | Flip result | Negate conditions |
| `Timeout` | Time limit | Prevent hangs |
| `Delay` | Add delay | Rate limiting |
| `Repeat` | Execute N times | Loops |
| `RunOnce` | Execute once | Expensive init |
| `ForceSuccess/Failure` | Override result | Graceful degradation |
| `KeepRunningUntilFailure` | Loop while success | Pagination |
| `Precondition` | Check prerequisites | Validation |
| `SoftAssert` | Non-critical checks | Continue on failure |

> **Note**: For retry functionality in Temporal workflows, use [Temporal's native RetryPolicy](https://docs.temporal.io/develop/typescript/failure-detection#retry-policy) instead of a decorator.

### Scripting Node (1)
| Node | Purpose | Use Case |
|------|---------|----------|
| `Script` | Execute scripts | Blackboard manipulation, calculations, validations |

The **Script** node enables blackboard manipulation through a simple scripting DSL:

**Supported Operations:**
- ✅ Variable assignments (`x = 10`)
- ✅ Arithmetic (`+`, `-`, `*`, `/`, `%`)
- ✅ Comparisons (`==`, `!=`, `>`, `<`, `>=`, `<=`)
- ✅ Logical operators (`&&`, `||`, `!`)
- ✅ String concatenation
- ✅ Property access (`user.profile.name`)

**Example: Store and Verify Pattern**
```typescript
// Store values
const storeScript = new Script({
  id: 'store-data',
  textContent: `
    pageTitle = "Shopping Cart"
    elementCount = 5
    total = price * quantity
  `
});

// Verify stored values
const verifyScript = new Script({
  id: 'verify-data',
  textContent: `
    titleMatches = pageTitle == "Shopping Cart"
    hasItems = elementCount > 0
    isValid = titleMatches && hasItems
  `
});
```

**More Examples:**
```typescript
// Calculate order total with discount
new Script({
  id: 'calculate',
  textContent: `
    subtotal = price * quantity
    discount = subtotal * 0.1
    total = subtotal - discount
  `
});

// Validate form data
new Script({
  id: 'validate',
  textContent: `
    hasUsername = username != null
    isAdult = age >= 18
    isValid = hasUsername && isAdult
  `
});

// Format display strings
new Script({
  id: 'format',
  textContent: `
    fullName = firstName + " " + lastName
    greeting = "Hello, " + fullName + "!"
  `
});
```

## Key Concepts

### Node Status
```typescript
enum NodeStatus {
  SUCCESS,   // Completed successfully
  FAILURE,   // Failed
  RUNNING,   // Still executing (async)
  IDLE       // Not started
}
```

### Blackboard (Scoped State)
```typescript
const blackboard = new ScopedBlackboard('root');
blackboard.set('userId', 123);

// Create child scope with inheritance
const stepScope = blackboard.createScope('step1');
stepScope.get('userId');  // Returns 123 (inherited)
stepScope.set('token', 'abc');  // Local to step1

// Parent doesn't see child values
blackboard.get('token');  // undefined
```

### Step Nodes (Scoped Blackboard)
```typescript
const loginStep = new Step({
  id: 'login',
  name: 'Login',
  nlDescription: 'Login with valid credentials',
  generated: false
});

// Variables set in loginStep are isolated from other steps
loginStep.addChild(new SetVariable({ key: 'sessionToken', value: 'xyz' }));
```

### Async Execution
```typescript
const engine = new TickEngine(tree);

// Single tick
await engine.tick(blackboard);

// Tick until non-RUNNING (for async operations)
await engine.tickWhileRunning(blackboard, maxTicks);
```

### Tick Loop Optimization

By default, the TickEngine uses auto exponential backoff for optimal performance:

```typescript
// Default: Auto mode (exponential backoff)
const engine = new TickEngine(tree);
// Tick delays: 0→0→0→0→0→1→2→4→8→16ms (capped)
```

The delay strategy automatically resets when:
- **Node completes**: Status changes from RUNNING → SUCCESS/FAILURE
- **New operation starts**: Status changes from SUCCESS/FAILURE → RUNNING

This ensures each operation gets optimal performance regardless of previous operation timing.

For debugging or specific requirements, use fixed delays:

```typescript
// Fixed delay mode
const engine = new TickEngine(tree, { tickDelayMs: 10 });

// Immediate mode (legacy behavior)
const engine = new TickEngine(tree, { tickDelayMs: 0 });
```

**Benefits of Auto Mode:**
- Fast operations (< 200ms): Complete quickly with minimal overhead
- Slow operations (> 1s): Reduce CPU usage by ~80%
- Polling scenarios: Automatically adapt to operation timing

## Loading External Data with Script Node

The **Script node** provides built-in functions to load test data and environment variables into the blackboard. This enables clean separation: Script handles external data, atoms consume from blackboard.

### Built-in Functions

#### `param(key)` - Load Test Data
Access test parameters from CSV files, data tables, or test runs:

```typescript
import { Script } from '@q1k-oss/btree';

// Setup test data
const context = {
  blackboard: new ScopedBlackboard(),
  timestamp: Date.now(),
  testData: new Map([
    ['username', 'john.doe'],
    ['password', 'secret123'],
    ['age', 25]
  ])
};

// Load test data into blackboard
const script = new Script({
  id: 'load-data',
  textContent: `
    username = param("username")
    password = param("password")
    age = param("age")
  `
});

await script.tick(context);

// Now atoms can access from blackboard
console.log(context.blackboard.get('username')); // 'john.doe'
console.log(context.blackboard.get('age'));      // 25
```

#### `env(key)` - Load Environment Variables
Access environment configuration at runtime:

```typescript
process.env.BASE_URL = 'https://staging.example.com';
process.env.API_KEY = 'test-key-123';

const script = new Script({
  id: 'load-env',
  textContent: `
    baseUrl = env("BASE_URL")
    apiKey = env("API_KEY")
  `
});

await script.tick(context);

console.log(context.blackboard.get('baseUrl')); // 'https://staging.example.com'
console.log(context.blackboard.get('apiKey'));  // 'test-key-123'
```

### Computed Values

Scripts can build derived values from test data and environment:

```typescript
const script = new Script({
  id: 'build-url',
  textContent: `
    // Load external data
    baseUrl = env("BASE_URL")
    userId = param("userId")
    postId = param("postId")

    // Build computed URL
    apiUrl = baseUrl + "/users/" + userId + "/posts/" + postId

    // Conditional logic
    timeout = userId > 1000 ? 30000 : 5000
  `
});

await script.tick(context);

// Atoms read computed values from blackboard
console.log(context.blackboard.get('apiUrl'));
// Result: 'https://staging.example.com/users/123/posts/456'
```

### Benefits

**✅ Separation of Concerns**
- Script: External data access (`param()`, `env()`)
- Atoms: Browser automation (click, fill, navigate)
- Blackboard: Data exchange layer

**✅ Explicit Data Flow**
- Easy to debug: inspect blackboard after Script execution
- No hidden resolution in atoms

**✅ Powerful Transformations**
- Build URLs from multiple sources
- Perform calculations with test data
- Apply conditional logic
- String concatenation and formatting

**✅ Extensible**
- Easy to add more built-in functions: `localStorage()`, `fetch()`
- Future: async functions for API calls

## Advanced Features

### 🌊 Temporal Workflows

Behavior trees can run as **Temporal workflows** for durable, fault-tolerant execution with native resumability.

#### YAML Workflows in Temporal (Recommended)

Define workflows in YAML and execute them in Temporal:

```typescript
// yaml-workflow-loader.ts
import {
  BehaviorTree,
  Registry,
  registerStandardNodes,
  loadTreeFromYaml,
  type WorkflowArgs,
  type WorkflowResult,
} from '@q1k-oss/btree';

export interface YamlWorkflowArgs extends WorkflowArgs {
  yamlContent: string;
}

export async function yamlWorkflow(args: YamlWorkflowArgs): Promise<WorkflowResult> {
  // Setup registry with all built-in nodes
  const registry = new Registry();
  registerStandardNodes(registry);

  // Register custom nodes here
  // registry.register('MyCustomNode', MyCustomNode, { category: 'action' });

  // Parse YAML and execute
  const root = loadTreeFromYaml(args.yamlContent, registry);
  const tree = new BehaviorTree(root);
  return tree.toWorkflow()(args);
}
```

**Client usage:**

```typescript
import { readFileSync } from 'fs';

// Load YAML file (client-side, not in workflow sandbox)
const yamlContent = readFileSync('./workflows/order-processing.yaml', 'utf-8');

// Execute as Temporal workflow
const result = await client.workflow.execute('yamlWorkflow', {
  taskQueue: 'btree-workflows',
  workflowId: `order-${Date.now()}`,
  args: [{
    input: {},
    treeRegistry: new Registry(),
    yamlContent  // Pass YAML content to workflow
  }]
});
```

**Example YAML workflow:**

```yaml
type: Sequence
id: order-processing
name: Order Processing Workflow

children:
  - type: Timeout
    id: validation-timeout
    props:
      timeoutMs: 5000
    children:
      - type: Parallel
        id: validation-checks
        props:
          strategy: "strict"
        children:
          - type: PrintAction
            id: validate-inventory
            props:
              message: "✓ Validating inventory..."
          - type: PrintAction
            id: validate-payment
            props:
              message: "✓ Validating payment..."
```

#### Programmatic Workflows

```typescript
import { BehaviorTree, Sequence, PrintAction } from '@q1k-oss/btree';
import type { WorkflowArgs, WorkflowResult } from '@q1k-oss/btree';

export async function myWorkflow(args: WorkflowArgs): Promise<WorkflowResult> {
  const root = new Sequence({ id: 'root' });
  root.addChild(new PrintAction({ id: 'step1', message: 'Hello' }));
  root.addChild(new PrintAction({ id: 'step2', message: 'World' }));

  const tree = new BehaviorTree(root);
  return tree.toWorkflow()(args);
}
```

**Temporal Benefits:**
- **Automatic Resumability**: Workflows resume automatically after failures through event sourcing and deterministic replay
- **Durable Execution**: Workflow state persists across process crashes and restarts
- **Long-Running Workflows**: Run for days, weeks, or months without state loss
- **Built-in Retries**: Use Temporal's RetryPolicy for activities (no custom retry decorators needed)
- **Observability**: Full execution history and timeline in Temporal UI

**No Manual Resume Needed**: Unlike standalone execution, Temporal handles all resumability automatically. If a workflow crashes or times out, Temporal replays the event history and resumes from the exact point of failure.

See [`examples/temporal/`](./examples/temporal/) and [`examples/yaml-workflows/`](./examples/yaml-workflows/) for complete examples.

### 📡 Event System

Subscribe to node lifecycle events for real-time monitoring and observability:

```typescript
import { NodeEventEmitter } from '@q1k-oss/btree';

const eventEmitter = new NodeEventEmitter();

// Subscribe to events
eventEmitter.on('TICK_START', (event) => {
  console.log(`Node ${event.nodeId} starting...`);
});

eventEmitter.on('TICK_END', (event) => {
  console.log(`Node ${event.nodeId} completed with ${event.status}`);
});

eventEmitter.on('ERROR', (event) => {
  console.error(`Node ${event.nodeId} errored:`, event.error);
});

// Create engine with event emitter
const engine = new TickEngine(tree, { eventEmitter });
await engine.tick(blackboard);
```

**Available Events:**
- `TICK_START` - Node begins execution
- `TICK_END` - Node completes (SUCCESS/FAILURE/RUNNING)
- `ERROR` - Node throws an error
- `HALT` - Node is halted/cancelled
- `RESET` - Node is reset
- `STATUS_CHANGE` - Node status changes

**Use Cases:**
- Real-time test execution monitoring
- Performance profiling
- Custom logging and analytics
- Integration with external monitoring tools

See [`examples/event-monitoring.ts`](./examples/event-monitoring.ts) for complete examples.

### 📸 Smart Execution Snapshots

**⚡ Efficient**: Snapshots captured ONLY when blackboard state changes (not every tick!)

```typescript
const engine = new TickEngine(tree, {
  captureSnapshots: true  // Auto-creates event emitter if needed
});

await engine.tick(blackboard);

// Get captured snapshots (only when state changed)
const snapshots = engine.getSnapshots();

snapshots.forEach(snap => {
  console.log(`Tick #${snap.tickNumber}:`);

  // See exactly what changed
  console.log('Added:', snap.blackboardDiff.added);
  console.log('Modified:', snap.blackboardDiff.modified);
  console.log('Deleted:', snap.blackboardDiff.deleted);

  // See which nodes executed
  snap.executionTrace.forEach(node => {
    console.log(`  ${node.nodeName}: ${node.status} (${node.duration}ms)`);
  });

  // Access full state
  console.log('Total state:', snap.blackboard.toJSON());
});

// Always clear when done
engine.clearSnapshots();
```

**📊 Rich Snapshot Data:**
```typescript
interface ExecutionSnapshot {
  timestamp: number;              // When captured
  tickNumber: number;             // Which tick
  blackboard: IScopedBlackboard;  // Deep clone of full state
  blackboardDiff: {               // What changed
    added: Record<string, any>;
    modified: Record<string, { from: any; to: any }>;
    deleted: string[];
  };
  executionTrace: Array<{         // Which nodes ran
    nodeId: string;
    nodeName: string;
    nodeType: string;
    status: NodeStatus;
    startTime: number;
    duration: number;
  }>;
  rootNodeId: string;
  rootStatus: NodeStatus;
}
```

**🎯 Key Benefits:**
- **Efficient**: Only capture when state changes (not on every tick)
- **Precise Diffs**: See exactly what was added/modified/deleted
- **Execution Context**: Know which nodes executed in each snapshot
- **Time-Travel**: Jump to any point and inspect full state
- **AI-Ready**: Perfect for feeding to LLMs for root cause analysis
- **Zero Overhead When Disabled**: No performance impact when `captureSnapshots: false`

**💡 Use Cases:**
```typescript
// 1. Find when a value was set
const snapshot = snapshots.find(s =>
  s.blackboardDiff.added.hasOwnProperty('username')
);

// 2. Track value evolution
snapshots.forEach(s => {
  if (s.blackboard.has('counter')) {
    console.log(`Tick #${s.tickNumber}: counter = ${s.blackboard.get('counter')}`);
  }
});

// 3. Identify which action caused the bug
const bugSnapshot = snapshots[snapshots.length - 1];
console.log('Last executed nodes:', bugSnapshot.executionTrace);

// 4. Compare expected vs actual
if (testFailed) {
  const finalSnapshot = snapshots[snapshots.length - 1];
  console.log('Expected total:', expectedTotal);
  console.log('Actual total:', finalSnapshot.blackboard.get('total'));
  console.log('Diff:', finalSnapshot.blackboardDiff);
}
```

**⚠️ Important:**
- Snapshots accumulate across ticks - clear regularly for long sessions
- Each snapshot is a deep clone - memory grows with blackboard size
- Disable in production, enable only for debugging/test analysis

See [`examples/snapshot-debugging.ts`](./examples/snapshot-debugging.ts) for complete debugging workflow.

## Development

### Running Tests
```bash
npm test                # Run all tests with coverage
npm run test:watch      # Watch mode
npm run test:ui         # UI mode
```

Current status: **534 tests passing** across 36 test files with **89%+ coverage**

### Building
```bash
npm run build           # Production build
npm run dev             # Watch mode
npm run typecheck       # Type checking
```

### Modifying the Script Grammar

The Script node uses ANTLR4 to parse scripts. Generated parser files are committed to avoid Java dependency for users.

**To modify the grammar (`src/scripting/ScriptLang.g4`):**

1. **Install Java** (required for ANTLR)
   ```bash
   # macOS
   brew install openjdk

   # Ubuntu
   apt install default-jre
   ```

2. **Regenerate parser**
   ```bash
   npm run scripting:generate
   ```

3. **Commit generated files**
   ```bash
   git add src/scripting/generated/
   ```

**Note**: Regular users don't need Java - only developers modifying the grammar.

### Project Structure
```
src/
├── base-node.ts              # BaseNode abstract class
├── types.ts                  # Core types & enums
├── blackboard.ts             # ScopedBlackboard
├── tick-engine.ts            # TickEngine
├── registry.ts               # Node registry
├── composites/               # Composite nodes
│   ├── sequence.ts
│   ├── selector.ts
│   ├── parallel.ts
│   ├── step.ts              # ✨ NEW
│   ├── memory-sequence.ts   # ✨ NEW
│   ├── reactive-sequence.ts # ✨ NEW
│   ├── conditional.ts       # ✨ NEW
│   ├── for-each.ts          # ✨ NEW
│   ├── while.ts             # ✨ NEW
│   └── recovery.ts          # ✨ NEW
├── decorators/               # Decorator nodes
│   ├── invert.ts
│   ├── timeout.ts
│   ├── delay.ts
│   ├── force-result.ts      # ✨ NEW
│   ├── repeat.ts            # ✨ NEW
│   ├── keep-running.ts      # ✨ NEW
│   ├── run-once.ts          # ✨ NEW
│   ├── precondition.ts      # ✨ NEW
│   └── soft-assert.ts       # ✨ NEW
└── test-nodes.ts             # Helper nodes for testing
```

## Contributing

### Adding New Nodes

1. **Create node file** in `src/composites/` or `src/decorators/`
2. **Extend base class**:
   ```typescript
   import { CompositeNode } from '@q1k-oss/btree';
   import { TemporalContext, NodeStatus } from '@q1k-oss/btree';

   export class MyNode extends CompositeNode {
     protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
       // Implementation using async/await
       const status = await this.child.tick(context);
       return status;
     }

     protected onHalt(): void { /* cleanup */ }
     protected onReset(): void { /* reset state */ }
   }
   ```

3. **Write tests** in `*.test.ts`:
   - Basic success/failure cases
   - RUNNING state handling
   - Edge cases
   - Reset/halt behavior
   - Blackboard integration

4. **Export** in `src/index.ts` and update indexes

5. **Document** in examples/README.md

### Testing Guidelines

- Use `describe/it` structure with clear test names
- Test all status transitions (SUCCESS, FAILURE, RUNNING)
- Test edge cases (empty children, null values)
- Test state cleanup (halt, reset)
- Use helper nodes from `src/test-nodes.ts`
- Aim for >90% coverage

### Code Style

- Follow existing patterns in the codebase
- Use async/await for async operations
- Implement lifecycle methods (onHalt, onReset)
- Add logging with `this.log()`
- Document complex logic with comments
- Keep nodes focused (single responsibility)

### Error Handling with `_lastError`

Nodes that fail should provide meaningful error context via the `_lastError` property when the default error isn't descriptive enough:

```typescript
catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  this._lastError = `Verification failed: expected "${expected}" within ${timeout}ms: ${errorMessage}`;
  this.log(this._lastError);
  return NodeStatus.FAILURE;
}
```

**When to use:**
- Verification/assertion nodes (ExpectText, ExpectVisible, etc.)
- Nodes where users need to understand expected vs actual
- Any node where debugging requires clearer context

**When NOT needed:**
- Action nodes (Click, Fill) - underlying errors are usually descriptive
- Control flow nodes - children fail, not the composite itself

The `_lastError` is automatically surfaced via `tickWhileRunning()` result and the execution feedback system. See `.cursor/rules/node-error-handling.mdc` for detailed guidelines.

## Architecture Overview

**Core Principles:**
- **Nodes**: All nodes inherit from `BaseNode` and implement `tick(context)`
- **Status**: Every tick returns `SUCCESS | FAILURE | RUNNING | IDLE`
- **State**: `ScopedBlackboard` provides hierarchical data with inheritance
- **Execution**: Workflows execute via Temporal for production use, or standalone for testing/development
- **Async**: Async/await powered operations with proper RUNNING status propagation (parents observe RUNNING across ticks)
- **Temporal Integration**: Native workflow conversion via `tree.toWorkflow()` for durable execution

**Design Patterns:**
- **Composite Pattern**: Nodes contain child nodes
- **Visitor Pattern**: TickEngine visits tree during execution
- **Strategy Pattern**: Different node types implement different behaviors
- **Factory Pattern**: Registry creates nodes from definitions
- **Observer Pattern**: TickEngine callbacks (onTick, onError)

**Integration:**
- Registry pattern enables dynamic tree creation from JSON
- Scoped blackboard enables step isolation for test authoring

## License

MIT

## Credits

Inspired by [BehaviorTree.CPP](https://github.com/BehaviorTree/BehaviorTree.CPP) with adaptations for TypeScript.
