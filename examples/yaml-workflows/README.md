# YAML Workflow Examples

This directory contains curated YAML workflow examples demonstrating the power and flexibility of declarative behavior tree definitions.

## ✅ Working Examples

These workflows are actively tested with Temporal and demonstrate production-ready patterns.

### 01-simple-sequence.yaml
**Complexity**: Low
**Pattern**: Sequential execution
**Nodes**: 4 nodes, 1 level deep

Basic sequence of print actions. Perfect for getting started and testing the YAML workflow system.

**Use cases:**
- Learning YAML workflow format
- Testing Temporal integration
- Simple linear processes

---

### 02-parallel-timeout.yaml
**Complexity**: Low-Medium
**Pattern**: Parallel execution with timeout protection
**Nodes**: 6 nodes, 3 levels deep

Demonstrates concurrent task execution with timeout wrapper. All tasks must complete within 5 seconds.

**Patterns demonstrated:**
- Parallel execution (strict strategy)
- Timeout decorator
- Sequential flow with parallel section

**Use cases:**
- Concurrent API calls
- Parallel data fetching
- Time-critical operations

---

### 05-order-processing.yaml
**Complexity**: High
**Pattern**: Multi-phase workflow with parallel operations
**Nodes**: 20+ nodes, 5 levels deep

**Real-world e-commerce order processing workflow with 3 phases:**

**Phase 1: Validation**
- Parallel validation checks (inventory, payment, shipping)
- 5-second timeout protection

**Phase 2: Payment Processing**
- Sequential payment flow
- 1-second simulated delay
- 10-second timeout

**Phase 3: Order Fulfillment**
- Parallel fulfillment tasks (inventory update, shipping label, email)
- 500ms delays for each task

**Patterns demonstrated:**
- Nested sequences
- Parallel execution at multiple levels
- Multiple timeout wrappers
- Delay decorators
- Multi-phase workflow structure

**Use cases:**
- E-commerce checkout flows
- Multi-step transaction processing
- Complex orchestration workflows

---

## 📝 Reference Examples (Not Tested)

These workflows showcase advanced patterns but contain node types that may require additional setup.

### 03-ecommerce-checkout.yaml
**Complexity**: Medium
**Patterns**: Conditional logic, CheckCondition nodes, complex validation
**Note**: Requires CheckCondition and additional node types to be registered

Multi-phase checkout with validation, payment processing, and parallel post-checkout tasks.

---

### 04-ai-agent-workflow.yaml
**Complexity**: Very High
**Patterns**: Decision trees, iterative processing, complex routing
**Note**: AI-generated workflow showcasing LLM's strength at complex decision logic

Multi-step AI agent with decision routing, iterative research, quality checks, and fallback handling.

**Key Insight**: This demonstrates where LLMs excel - generating complex decision logic that would be tedious to build manually.

---

## Usage

### Running with Temporal

```bash
# Terminal 1: Start Temporal server
temporal server start-dev

# Terminal 2: Build and start worker
npm run build
cd examples/temporal
npx tsx worker.ts

# Terminal 3: Execute workflows
cd examples/temporal
npx tsx client.ts
```

### Loading in Your Code

```typescript
import { readFileSync } from 'fs';
import { loadTreeFromYaml, Registry, registerStandardNodes } from '@q1k-oss/behaviour-tree-workflows';

// Setup registry with all built-in nodes
const registry = new Registry();
registerStandardNodes(registry);

// Optionally register your custom nodes
// registry.register('MyCustomAction', MyCustomAction, { category: 'action' });

// Load YAML
const yamlContent = readFileSync('./01-simple-sequence.yaml', 'utf-8');
const tree = loadTreeFromYaml(yamlContent, registry);

// Execute
await tree.execute();
```

### With Temporal

```typescript
import { yamlWorkflow } from './yaml-workflow-loader.js';

// In client
const yamlContent = readFileSync('./workflow.yaml', 'utf-8');

const result = await client.workflow.execute("yamlWorkflow", {
  taskQueue: "behaviour-tree-workflows",
  workflowId: `my-workflow-${Date.now()}`,
  args: [{
    input: {},
    treeRegistry: new Registry(),
    yamlContent
  }]
});
```

## Node Types Reference

### All Standard Nodes (via `registerStandardNodes()`)

The `registerStandardNodes()` utility automatically registers all built-in nodes:

**Composites (10):**
- Sequence, Selector, Parallel
- Conditional, ForEach, While
- Recovery, ReactiveSequence, MemorySequence
- SubTree

**Decorators (10):**
- Timeout, Delay, Repeat
- Invert, ForceSuccess, ForceFailure
- RunOnce, KeepRunningUntilFailure
- Precondition, SoftAssert

**Actions/Conditions (9):**
- PrintAction, MockAction, CounterAction
- CheckCondition, AlwaysCondition, WaitAction
- Script, LogMessage, RegexExtract

**Test Nodes (3):**
- SuccessNode, FailureNode, RunningNode

### Adding Custom Nodes

```typescript
import { Registry, registerStandardNodes } from "@q1k-oss/behaviour-tree";
import { MyCustomNode } from "./my-nodes.js";

const registry = new Registry();
registerStandardNodes(registry);  // Register all built-in nodes

// Add your custom nodes
registry.register("MyCustomNode", MyCustomNode, { category: "action" });
```

## Benefits of YAML Workflows

✅ **Declarative** - Define what, not how
✅ **Version Controlled** - Track workflow changes in git
✅ **AI-Friendly** - Easy for LLMs to generate and modify
✅ **Validated** - 4-stage validation catches errors early
✅ **Type-Safe** - Runtime validation via Zod schemas
✅ **Portable** - Same YAML works standalone or in Temporal
✅ **Readable** - Non-developers can understand workflow logic

## Complete Documentation

- [YAML Specification](../../docs/yaml-specification.md) - Complete format reference
- [Temporal Integration](../temporal/README.md) - Running YAML workflows in Temporal
- [Node Reference](../../docs/workflow-engine/02-node-reference.md) - All available node types
