# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

@wayfarer-ai/btree-workflows is a behavior tree library for TypeScript, designed for AI-native workflows. It provides 22+ production-ready nodes, YAML workflow definitions, and native Temporal integration for durable execution.

## Commands

```bash
# Development
npm run dev              # Watch mode build (tsup)
npm run build            # Production build (CJS + ESM + types)
npm run typecheck        # TypeScript type checking
npm run clean            # Remove dist/

# Testing (534+ tests, 89%+ coverage)
npm test                 # Run all tests with coverage (CI=true)
npm run test:watch       # Watch mode
npm run test:ui          # Vitest UI

# Scripting (requires Java for ANTLR)
npm run scripting:generate  # Regenerate Script node parser
```

## Architecture

### Core Concepts
- **NodeStatus**: `SUCCESS | FAILURE | RUNNING | IDLE` - every tick returns a status
- **ScopedBlackboard**: Hierarchical key-value store with scope inheritance
- **TickEngine**: Executes tree via tick loop with auto exponential backoff
- **Registry**: Factory for creating nodes from YAML/JSON definitions

### Node Types
| Category | Count | Examples |
|----------|-------|----------|
| Composites | 10 | Sequence, Selector, Parallel, ForEach, While, Conditional, Recovery |
| Decorators | 10 | Timeout, Delay, Repeat, Invert, ForceSuccess, RunOnce, Precondition |
| Actions | 9 | PrintAction, Script, LogMessage, WaitAction, CheckCondition |

### Directory Structure
```
src/
├── base-node.ts          # BaseNode abstract class
├── behavior-tree.ts      # BehaviorTree wrapper with toWorkflow()
├── blackboard.ts         # ScopedBlackboard implementation
├── tick-engine.ts        # TickEngine with snapshot support
├── registry.ts           # Node registry + YAML loading
├── events.ts             # NodeEventEmitter for lifecycle events
├── composites/           # Composite nodes (Sequence, Parallel, etc.)
├── decorators/           # Decorator nodes (Timeout, Repeat, etc.)
├── scripting/            # Script node + ANTLR parser
│   ├── ScriptLang.g4     # ANTLR grammar
│   └── generated/        # Generated parser (committed)
├── schemas/              # Zod schemas for node props
├── yaml/                 # YAML loading + validation
└── utils/                # Shared utilities
```

### YAML Workflows
```typescript
import { Registry, registerStandardNodes, loadTreeFromYaml } from '@wayfarer-ai/btree';

const registry = new Registry();
registerStandardNodes(registry);  // Registers all 32 built-in nodes

const tree = loadTreeFromYaml(`
type: Sequence
id: my-workflow
children:
  - type: PrintAction
    id: hello
    props:
      message: "Hello from YAML!"
`, registry);

await tree.execute();
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

### Script Node DSL
The Script node uses ANTLR4 for parsing. Supports:
- Variable assignments: `x = 10`
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Comparisons: `==`, `!=`, `>`, `<`, `>=`, `<=`
- Logical: `&&`, `||`, `!`
- Property access: `user.profile.name`
- Built-in functions: `param("key")`, `env("VAR")`

To modify grammar, edit `src/scripting/ScriptLang.g4` and run `npm run scripting:generate` (requires Java).

### Error Handling
Nodes that fail should set `this._lastError` with descriptive context:
```typescript
catch (error) {
  this._lastError = `Verification failed: expected "${expected}": ${error.message}`;
  return NodeStatus.FAILURE;
}
```

### Execution Snapshots
```typescript
const engine = new TickEngine(tree, { captureSnapshots: true });
await engine.tick(blackboard);

const snapshots = engine.getSnapshots();  // Only captured when state changes
engine.clearSnapshots();  // Always clear to prevent memory growth
```

## Testing Guidelines
- Use `describe/it` structure
- Test all status transitions (SUCCESS, FAILURE, RUNNING)
- Test edge cases (empty children, null values)
- Use helper nodes from `src/test-nodes.ts`
- Tests run with `CI=true` to prevent watch mode in CI
