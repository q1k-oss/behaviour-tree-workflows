# behaviour-tree Documentation

Documentation for the `@q1k-oss/behaviour-tree-workflows` library. Start with the
[README](../README.md) for the overview and quick start.

## Reference

| Document | Description |
|----------|-------------|
| [NODE_REFERENCE.md](./NODE_REFERENCE.md) | Props and examples for all 53 built-in nodes |
| [yaml-specification.md](./yaml-specification.md) | YAML workflow syntax and the validation pipeline |
| [observability.md](./observability.md) | ExecutionTracker, event sinks, error capture, timeline |

## Design notes

These record plans and the reasoning behind them. Parts were implemented, parts were not —
treat the reference above as the source of truth.

| Document | Description |
|----------|-------------|
| [ARCHITECTURE_SUMMARY.md](./ARCHITECTURE_SUMMARY.md) | Architecture, data flow, DataStore interface |
| [custom-nodes-architecture.md](./custom-nodes-architecture.md) | Phased plan for tenant-authored custom nodes |
| [ai-native-nodes-plan.md](./ai-native-nodes-plan.md) | Plan for the LLM and agent node family |

## Quick start

```typescript
import {
  Registry,
  registerStandardNodes,
  loadTreeFromYaml,
  BehaviorTree,
  ScopedBlackboard,
} from '@q1k-oss/behaviour-tree-workflows';

const registry = new Registry();
registerStandardNodes(registry);

const root = loadTreeFromYaml(yamlContent, registry);
const tree = new BehaviorTree(root);

// Standalone — for tests and development
const status = await root.tick({
  blackboard: new ScopedBlackboard(),
  treeRegistry: registry,
  timestamp: Date.now(),
});

// Production — durable execution on Temporal
const workflow = tree.toWorkflow();
```

## Node categories

`registerStandardNodes(registry)` provides 53 types. See the
[Node Reference](./NODE_REFERENCE.md) for every one.

| Category | Count | Examples |
|----------|-------|----------|
| Composites | 10 | `Sequence`, `Selector`, `Parallel`, `ForEach`, `While`, `Conditional` |
| Decorators | 11 | `Timeout`, `Delay`, `Repeat`, `Invert`, `Precondition`, `StreamingSink` |
| Actions | 30 | `LLMChat`, `LLMToolCall`, `CodeExecution`, `HttpRequest`, `HumanTask` |
| Conditions | 2 | `CheckCondition`, `AlwaysCondition` |

Nine of the actions are test and example helpers; the other 21 are meant for production
trees. Action leaves that perform I/O need matching Temporal activity implementations
supplied on the tick context.

## Key concepts

- **NodeStatus** — every tick returns `SUCCESS | FAILURE | RUNNING | IDLE`
- **ScopedBlackboard** — hierarchical state, inherited by child scopes, written locally
- **Registry** — builds nodes from definitions, so trees can be constructed at runtime
- **ExecutionTracker** — derives per-node state, a timeline and structured errors from events

## Related

- [q1k-oss](https://q1k.ai/open-source) - The rest of the q1k open-source family
- [Temporal.io](https://temporal.io) - Durable execution runtime
