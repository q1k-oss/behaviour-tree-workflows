# Observability Module

The btree library includes an observability module for tracking workflow execution, capturing errors with context, and building execution timelines.

## Overview

The observability system provides:

- **ExecutionTracker**: Aggregates node events into queryable state
- **Structured Errors**: Rich error context including blackboard snapshots
- **Execution Timeline**: Chronological trace of node execution
- **Workflow Sinks**: Fire-and-forget event export for external analysis

## Components

### ExecutionTracker

Aggregates node lifecycle events into queryable state:

```typescript
import { ExecutionTracker } from '@wayfarer-ai/btree';

const tracker = new ExecutionTracker(totalNodes);

// Process events from NodeEventEmitter
eventEmitter.onAll((event) => {
  tracker.onNodeEvent(event);
});

// Query current state
const progress = tracker.getProgress();     // Overall status
const states = tracker.getNodeStates();     // Per-node status
const errors = tracker.getErrors();         // Structured errors
const timeline = tracker.getTimeline();     // Execution trace
```

### Data Types

#### ExecutionProgress

```typescript
interface ExecutionProgress {
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  currentNodeId: string | null;
  currentNodeType: string | null;
  pathTaken: string[];
  startedAt: number;
  lastActivityAt: number;
  status: 'running' | 'completed' | 'failed';
}
```

#### StructuredError

```typescript
interface StructuredError {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  nodePath: string;           // Tree path, e.g., "/0/1/2"
  message: string;
  stack?: string;
  timestamp: number;
  blackboardSnapshot: Record<string, unknown>;  // State at error time
  nodeInput?: unknown;
  recoverable: boolean;
  suggestedFix?: string;      // Heuristic-based suggestion
}
```

#### TimelineEntry

```typescript
interface TimelineEntry {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  nodePath: string;
  event: 'start' | 'end' | 'error';
  timestamp: number;
  status?: string;
  durationMs?: number;
  error?: { message: string; stack?: string };
}
```

### Workflow Sinks

For Temporal integration, the module provides sink types for exporting events:

```typescript
import { ObservabilitySinks } from '@wayfarer-ai/btree';

// In Temporal workflow
const { events } = proxySinks<ObservabilitySinks>();

eventEmitter.onAll((event) => {
  events.push(event);  // Fire-and-forget to sink handler
});
```

## Error Event Emission

All node types (ActionNode, ConditionNode, DecoratorNode, CompositeNode) automatically emit ERROR events when exceptions occur. These events include:

- Error message and stack trace
- Blackboard snapshot at the time of error
- Node path and type information

```typescript
// ERROR event data format
{
  type: NodeEventType.ERROR,
  nodeId: 'step-3',
  nodeName: 'Process Data',
  nodeType: 'CodeExecution',
  timestamp: 1706000000000,
  data: {
    error: {
      message: 'Cannot read property of undefined',
      stack: '...',
    },
    blackboard: { counter: 1, status: 'processing' },
  },
}
```

## Suggested Fixes

The ExecutionTracker provides heuristic-based fix suggestions for common errors:

| Error Pattern | Suggested Fix |
|---------------|---------------|
| `timeout` | Consider increasing timeout or adding retry |
| `undefined` | Check if required blackboard key exists |
| `network` | Check URL accessibility, consider retry |
| `permission` | Check API credentials and permissions |
| `parse` | Verify input data format |

## Integration with Temporal

When using btree with Temporal, the observability module integrates via:

1. **Query Handlers**: Expose tracker state to external queries
2. **Workflow Sinks**: Export events without affecting determinism
3. **Workflow Results**: Include errors and timeline in completion

See the q1k-controlplane application for a complete implementation example.

## Exports

```typescript
// Types
export type {
  ExecutionProgress,
  NodeState,
  StructuredError,
  TimelineEntry,
  ObservableNodeEvent,
} from './observability/types';

// Sink types
export type {
  ObservabilitySinks,
  InjectedObservabilitySinks,
} from './observability/sinks';

// ExecutionTracker class
export { ExecutionTracker } from './observability/execution-tracker';

// Sink handler factory
export { createObservabilitySinkHandler } from './observability/sinks';
```
