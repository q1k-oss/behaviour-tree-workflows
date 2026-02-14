# behaviour-tree Documentation

Documentation for the @q1k-oss/behaviour-tree-workflows library.

## Contents

| Document | Description |
|----------|-------------|
| [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) | Overall architecture, data flow patterns, DataStore interface |
| [NODE_REFERENCE.md](./NODE_REFERENCE.md) | Quick reference for all node types |
| [yaml-specification.md](./yaml-specification.md) | YAML workflow format specification |
| [custom-nodes-architecture.md](./custom-nodes-architecture.md) | Guide for creating custom nodes |
| [observability.md](./observability.md) | ExecutionTracker, error capture, timeline |

## Quick Start

```typescript
import {
  Registry,
  registerStandardNodes,
  loadTreeFromYaml,
  BehaviorTree,
} from '@q1k-oss/behaviour-tree-workflows';

// Setup registry
const registry = new Registry();
registerStandardNodes(registry);

// Load and execute workflow
const tree = loadTreeFromYaml(yamlContent, registry);
const bt = new BehaviorTree(tree);
const result = await bt.execute();
```

## Node Categories

| Category | Count | Examples |
|----------|-------|----------|
| Composites | 10 | Sequence, Selector, Parallel, ForEach, While, Conditional |
| Decorators | 10 | Timeout, Delay, Repeat, Invert, ForceSuccess, Precondition |
| Actions | 9+ | PrintAction, CodeExecution, LogMessage, HttpRequest |

## Key Concepts

- **NodeStatus**: `SUCCESS | FAILURE | RUNNING | IDLE`
- **ScopedBlackboard**: Hierarchical key-value store
- **TickEngine**: Executes tree with exponential backoff
- **ExecutionTracker**: Aggregates events for observability

## Related

- [q1k-controlplane](https://github.com/q1k-oss/q1k-controlplane) - Application using behaviour-tree
- [Temporal.io](https://temporal.io) - Durable execution runtime
