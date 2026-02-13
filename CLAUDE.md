# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

@wayfarer-ai/btree-workflows is a behavior tree library for TypeScript, designed for AI-native workflows. It provides 39 production-ready nodes, YAML workflow definitions, native Temporal integration for durable execution, and built-in observability.

## Commands

```bash
# Development
npm run dev              # Watch mode build (tsup)
npm run build            # Production build (CJS + ESM + types)
npm run typecheck        # TypeScript type checking
npm run clean            # Remove dist/

# Testing (650+ tests, 89%+ coverage)
npm test                 # Run all tests with coverage (CI=true)
npm run test:watch       # Watch mode
npm run test:ui          # Vitest UI
```

## Architecture

### Core Concepts
- **NodeStatus**: `SUCCESS | FAILURE | RUNNING | IDLE` - every tick returns a status
- **ScopedBlackboard**: Hierarchical key-value store with scope inheritance
- **BehaviorTree**: Wrapper with path-based indexing and `toWorkflow()` for Temporal
- **Registry**: Factory for creating nodes from YAML/JSON definitions
- **ExecutionTracker**: Aggregates events into queryable state (progress, errors, timeline)

### Node Types
| Category | Count | Examples |
|----------|-------|----------|
| Composites | 10 | Sequence, Selector, Parallel, ForEach, While, Conditional, Recovery |
| Decorators | 10 | Timeout, Delay, Repeat, Invert, ForceSuccess, RunOnce, Precondition |
| Actions | 7 | CodeExecution, HttpRequest, ParseFile, GenerateFile, PythonScript, LLMChat, BrowserAgent |
| Test/Example | 9 | PrintAction, MockAction, SuccessNode, FailureNode, WaitAction |
| Utilities | 2 | LogMessage, RegexExtract |
| Integrations | 1 | IntegrationAction (Active Pieces) |

### Directory Structure
```
src/
├── base-node.ts          # BaseNode abstract class
├── behavior-tree.ts      # BehaviorTree wrapper with toWorkflow()
├── blackboard.ts         # ScopedBlackboard implementation
├── registry.ts           # Node registry + YAML loading
├── events.ts             # NodeEventEmitter for lifecycle events
├── test-nodes.ts         # Test/example nodes (PrintAction, MockAction, etc.)
├── composites/           # Composite nodes (Sequence, Parallel, etc.)
├── decorators/           # Decorator nodes (Timeout, Repeat, etc.)
├── actions/              # Activity-based action nodes
│   ├── code-execution.ts # CodeExecution (JS/Python via Microsandbox)
│   ├── http-request.ts   # HttpRequest (REST API calls)
│   ├── parse-file.ts     # ParseFile (CSV/JSON parsing)
│   ├── generate-file.ts  # GenerateFile (CSV/JSON export)
│   ├── python-script.ts  # PythonScript (Python execution)
│   ├── llm-chat.ts       # LLMChat (multi-provider LLM chat)
│   └── browser-agent.ts  # BrowserAgent (Browserbase + Stagehand)
├── utilities/            # Utility nodes
│   ├── log-message.ts    # LogMessage node
│   ├── regex-extract.ts  # RegexExtract node
│   └── variable-resolver.ts  # Variable resolution utilities
├── debug/                # Debug nodes
│   ├── breakpoint.ts     # Breakpoint node
│   └── resume-point.ts   # ResumePoint node
├── integrations/         # External integrations
│   └── integration-action.ts  # Active Pieces integration
├── templates/            # Template loading utilities
├── data-store/           # DataStore for large payloads
├── observability/        # Execution tracking and error capture
│   ├── types.ts          # ExecutionProgress, StructuredError, TimelineEntry
│   ├── execution-tracker.ts  # State aggregation from events
│   └── sinks.ts          # Temporal workflow sink types
├── schemas/              # Zod schemas for node props
├── yaml/                 # YAML loading + validation
└── utils/                # Shared utilities (error-handler, signal-check)
```

### YAML Workflows
```typescript
import { Registry, registerStandardNodes, loadTreeFromYaml } from '@wayfarer-ai/btree';

const registry = new Registry();
registerStandardNodes(registry);  // Registers all 39 built-in nodes

const tree = loadTreeFromYaml(`
type: Sequence
id: my-workflow
children:
  - type: PrintAction
    id: hello
    props:
      message: "Hello from YAML!"
`, registry);

// Convert to Temporal workflow and execute
const workflow = tree.toWorkflow();
const result = await workflow({ input: {} });
```

### Temporal Integration
```typescript
import { BehaviorTree, Sequence, PrintAction } from '@wayfarer-ai/btree';

export async function myWorkflow(args: WorkflowArgs): Promise<WorkflowResult> {
  const root = new Sequence({ id: 'root' });
  root.addChild(new PrintAction({ id: 'step1', message: 'Hello' }));

  const tree = new BehaviorTree(root);
  return tree.toWorkflow()(args);  // Returns Temporal-compatible workflow
}
```

## Key Patterns

### Adding New Nodes
1. Create file in `src/composites/` or `src/decorators/`
2. Extend `CompositeNode` or `DecoratorNode`
3. Implement `executeTick(context)` returning `Promise<NodeStatus>`
4. Add Zod schema in `src/schemas/` for YAML validation
5. Register in `registerStandardNodes()` or custom registry
6. Write tests covering SUCCESS/FAILURE/RUNNING states

### CodeExecution Node
The CodeExecution node runs JavaScript or Python in a secure sandbox (Microsandbox).

**JavaScript Example:**
```yaml
type: CodeExecution
props:
  language: javascript
  code: |
    const users = getBB('apiUsers');
    const processed = users.map(u => ({ id: u.id, name: u.name }));
    setBB('processedUsers', processed);
```

**Python Example:**
```yaml
type: CodeExecution
props:
  language: python
  packages: [pandas]
  code: |
    users = getBB('users')
    setBB('count', len(users))
```

Available functions: `getBB(key)`, `setBB(key, value)`, `getInput(key)`, `console.log`/`print`.

### Error Handling
Nodes that fail should set `this._lastError` with descriptive context:
```typescript
catch (error) {
  this._lastError = `Verification failed: expected "${expected}": ${error.message}`;
  return NodeStatus.FAILURE;
}
```

### Observability
The library includes an observability module for tracking execution:

```typescript
import { ExecutionTracker, NodeEventEmitter } from '@wayfarer-ai/btree';

const tracker = new ExecutionTracker(totalNodes);
const eventEmitter = new NodeEventEmitter();

// Subscribe to all events
eventEmitter.onAll((event) => tracker.onNodeEvent(event));

// Query state
tracker.getProgress();    // { totalNodes, completedNodes, failedNodes, status }
tracker.getErrors();      // Structured errors with blackboard snapshots
tracker.getTimeline();    // Chronological execution trace
```

All node types automatically emit ERROR events with:
- Error message and stack trace
- Blackboard snapshot at time of error
- Heuristic-based fix suggestions

## Testing Guidelines
- Use `describe/it` structure
- Test all status transitions (SUCCESS, FAILURE, RUNNING)
- Test edge cases (empty children, null values)
- Use helper nodes from `src/test-nodes.ts`
- Tests run with `CI=true` to prevent watch mode in CI
