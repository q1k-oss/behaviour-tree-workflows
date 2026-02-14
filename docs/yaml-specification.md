# YAML Workflow Specification

This document provides a comprehensive reference for defining behavior tree workflows using YAML in behaviour-tree.

## Table of Contents

1. [Overview](#overview)
2. [Basic Structure](#basic-structure)
3. [Node Types](#node-types)
4. [Validation Pipeline](#validation-pipeline)
5. [Composite Nodes](#composite-nodes)
6. [Decorator Nodes](#decorator-nodes)
7. [Action and Condition Nodes](#action-and-condition-nodes)
8. [Error Handling](#error-handling)
9. [Migration Guide](#migration-guide)

## Overview

The YAML workflow format allows you to define behavior trees declaratively, with comprehensive validation ensuring correctness before execution. All workflows undergo a 4-stage validation pipeline:

1. **YAML Syntax** - Validates YAML well-formedness
2. **Tree Structure** - Ensures required fields and correct data types
3. **Node Configuration** - Validates node-specific properties
4. **Semantic Rules** - Checks ID uniqueness, child counts, and references

## Basic Structure

Every workflow starts with a root node definition:

```yaml
type: NodeType        # Required: The node type (e.g., Sequence, Timeout)
id: unique-id         # Optional: Unique identifier for this node
name: Display Name    # Optional: Human-readable name
props:                # Optional: Node-specific configuration
  key: value
children:             # Optional: Child nodes (for composites/decorators)
  - type: ChildType
    id: child-id
```

### Minimal Example

```yaml
type: PrintAction
id: hello-world
props:
  message: "Hello, World!"
```

### Complete Example

```yaml
type: Sequence
id: user-onboarding
name: User Onboarding Flow

children:
  - type: PrintAction
    id: welcome-message
    props:
      message: "Welcome to our platform!"

  - type: Timeout
    id: profile-setup-timeout
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
            id: wait-for-input
            props:
              delayMs: 1000
            children:
              - type: PrintAction
                id: processing
                props:
                  message: "Processing..."
```

## Node Types

### Composites

Composites execute multiple children according to specific logic:

| Node Type | Children | Description |
|-----------|----------|-------------|
| `Sequence` | 1+ | Execute children in order until one fails |
| `Selector` | 1+ | Execute children in order until one succeeds |
| `Parallel` | 1+ | Execute all children concurrently |
| `ReactiveSequence` | 1+ | Like Sequence but re-ticks previous children |
| `MemorySequence` | 1+ | Like Sequence but remembers position |
| `ForEach` | 1+ | Iterate over collection, executing child for each item |
| `While` | 2 | Loop while condition succeeds, execute body |
| `Conditional` | 2-3 | If-then-else logic |
| `Recovery` | 1+ | Try children in order until one succeeds or all fail |
| `SubTree` | 0 | Reference another tree by ID |

### Decorators

Decorators wrap a single child and modify its behavior:

| Node Type | Children | Description |
|-----------|----------|-------------|
| `Timeout` | 1 | Fail if child exceeds time limit |
| `Delay` | 1 | Wait before executing child |
| `Repeat` | 1 | Execute child N times |
| `Invert` | 1 | Flip success/failure |
| `ForceSuccess` | 1 | Always return success |
| `ForceFailure` | 1 | Always return failure |
| `RunOnce` | 1 | Execute child only once |
| `KeepRunningUntilFailure` | 1 | Keep returning RUNNING until child fails |
| `Precondition` | 1 | Check condition before executing child |
| `SoftAssert` | 1 | Like Precondition but less strict |

### Actions and Conditions

Custom application-specific nodes defined in your registry.

## Validation Pipeline

### Stage 1: YAML Syntax Validation

Validates that the YAML is well-formed:

```yaml
# Invalid: Missing colon
type Sequence

# Invalid: Incorrect indentation
type: Sequence
  id: wrong-indent

# Valid
type: Sequence
id: correct
```

**Errors:**
- `YamlSyntaxError` - Malformed YAML, incorrect indentation, invalid characters

### Stage 2: Tree Structure Validation

Validates required fields and data types:

```yaml
# Invalid: Missing type field
id: my-node
children: []

# Invalid: children must be an array
type: Sequence
children: "not-an-array"

# Valid
type: Sequence
id: my-sequence
children:
  - type: PrintAction
    id: action1
```

**Errors:**
- `StructureValidationError` - Missing `type` field, incorrect data types, invalid structure

### Stage 3: Node Configuration Validation

Validates node-specific properties using Zod schemas:

```yaml
# Invalid: Negative timeout
type: Timeout
props:
  timeoutMs: -100

# Invalid: Missing required property
type: ForEach
props:
  itemKey: item
  # Missing collectionKey

# Valid
type: Timeout
props:
  timeoutMs: 5000
children:
  - type: PrintAction
    id: action
```

**Errors:**
- `ConfigValidationError` - Invalid property values, missing required properties, type mismatches

### Stage 4: Semantic Validation

Validates semantic rules and relationships:

```yaml
# Invalid: Duplicate IDs
type: Sequence
children:
  - type: PrintAction
    id: duplicate
  - type: PrintAction
    id: duplicate  # Error: ID already used

# Invalid: Decorator must have exactly 1 child
type: Timeout
props:
  timeoutMs: 1000
children:
  - type: PrintAction
    id: action1
  - type: PrintAction
    id: action2  # Error: Timeout requires exactly 1 child

# Invalid: Circular SubTree reference
type: SubTree
props:
  treeId: my-tree  # Error: Cannot reference self or create cycle

# Valid
type: Sequence
children:
  - type: PrintAction
    id: unique-id-1
  - type: PrintAction
    id: unique-id-2
```

**Errors:**
- `SemanticValidationError` - Duplicate IDs, wrong child count, circular references, unregistered node types

## Composite Nodes

### Sequence

Execute children in order until one fails or all succeed.

```yaml
type: Sequence
id: checkout-flow
children:
  - type: ValidateCart
    id: validate
  - type: ProcessPayment
    id: payment
  - type: SendConfirmation
    id: confirmation
```

**Configuration:** Base properties only

### Selector

Execute children in order until one succeeds or all fail.

```yaml
type: Selector
id: payment-methods
children:
  - type: TryCreditCard
    id: credit-card
  - type: TryPayPal
    id: paypal
  - type: TryBankTransfer
    id: bank
```

**Configuration:** Base properties only

### Parallel

Execute all children concurrently.

```yaml
type: Parallel
id: parallel-tasks
props:
  strategy: "strict"        # "strict" | "any"
  successThreshold: 2       # Optional: Number of successes needed
  failureThreshold: 1       # Optional: Number of failures to abort
children:
  - type: FetchUserData
    id: fetch-user
  - type: FetchProductData
    id: fetch-product
  - type: FetchInventory
    id: fetch-inventory
```

**Properties:**
- `strategy` (optional):
  - `"strict"` - All children must succeed (default)
  - `"any"` - At least one child must succeed
- `successThreshold` (optional): Number of children that must succeed
- `failureThreshold` (optional): Number of children that can fail before aborting

### ForEach

Iterate over a collection, executing child for each item.

```yaml
type: ForEach
id: process-orders
props:
  collectionKey: "orders"      # Required: Blackboard key with array
  itemKey: "currentOrder"      # Required: Blackboard key for current item
  indexKey: "orderIndex"       # Optional: Blackboard key for index
children:
  - type: ProcessOrder
    id: process-order
```

**Properties:**
- `collectionKey` (required): Blackboard key containing the array to iterate
- `itemKey` (required): Blackboard key where current item is stored
- `indexKey` (optional): Blackboard key where current index is stored

### While

Loop while condition succeeds, executing body.

```yaml
type: While
id: retry-loop
props:
  maxIterations: 1000  # Optional: Default 1000, prevents infinite loops
children:
  - type: HasMoreItems     # Condition (child 0)
    id: has-more
  - type: ProcessItem      # Body (child 1)
    id: process
```

**Properties:**
- `maxIterations` (optional): Maximum loop iterations (default: 1000)

**Requirements:**
- Must have exactly 2 children
- First child is the condition
- Second child is the body

### Conditional

If-then-else logic.

```yaml
type: Conditional
id: user-check
children:
  - type: IsUserLoggedIn   # Condition (child 0)
    id: check-login
  - type: ShowDashboard    # Then branch (child 1)
    id: show-dashboard
  - type: ShowLoginPage    # Else branch (child 2, optional)
    id: show-login
```

**Configuration:** Base properties only

**Requirements:**
- Must have 2-3 children
- First child is the condition
- Second child is the "then" branch
- Third child (optional) is the "else" branch

### ReactiveSequence

Like Sequence but re-ticks previous children on each tick.

```yaml
type: ReactiveSequence
id: reactive-flow
children:
  - type: CheckSensor
    id: sensor-check
  - type: ProcessData
    id: process
```

**Configuration:** Base properties only

### MemorySequence

Like Sequence but remembers last executing child.

```yaml
type: MemorySequence
id: memory-flow
children:
  - type: Step1
    id: step-1
  - type: Step2
    id: step-2
  - type: Step3
    id: step-3
```

**Configuration:** Base properties only

### Recovery

Try children in order until one succeeds or all fail (like Selector but for error recovery).

```yaml
type: Recovery
id: error-recovery
children:
  - type: TryPrimaryService
    id: primary
  - type: TryBackupService
    id: backup
  - type: UseCache
    id: cache
```

**Configuration:** Base properties only

### SubTree

Reference another tree by ID.

```yaml
type: SubTree
id: reusable-subtree
props:
  treeId: "common-validation"  # Required: ID of tree to reference
```

**Properties:**
- `treeId` (required): ID of the tree to execute

**Note:** Circular references are detected and prevented.

## Decorator Nodes

All decorators must have exactly 1 child.

### Timeout

Fail if child exceeds time limit.

```yaml
type: Timeout
id: api-timeout
props:
  timeoutMs: 5000  # Required: Timeout in milliseconds (> 0)
children:
  - type: CallExternalAPI
    id: api-call
```

**Properties:**
- `timeoutMs` (required): Timeout duration in milliseconds (must be > 0)

### Delay

Wait before executing child.

```yaml
type: Delay
id: wait-before-retry
props:
  delayMs: 1000  # Required: Delay in milliseconds (>= 0)
children:
  - type: RetryOperation
    id: retry
```

**Properties:**
- `delayMs` (required): Delay duration in milliseconds (must be >= 0)

### Repeat

Execute child N times.

```yaml
type: Repeat
id: retry-three-times
props:
  numCycles: 3  # Required: Number of times to repeat (> 0, integer)
children:
  - type: AttemptConnection
    id: connect
```

**Properties:**
- `numCycles` (required): Number of repetitions (must be > 0 and an integer)

### Invert

Flip success/failure status of child.

```yaml
type: Invert
id: invert-result
children:
  - type: CheckCondition
    id: condition
```

**Configuration:** Base properties only

### ForceSuccess

Always return success regardless of child result.

```yaml
type: ForceSuccess
id: optional-step
children:
  - type: OptionalOperation
    id: operation
```

**Configuration:** Base properties only

### ForceFailure

Always return failure regardless of child result.

```yaml
type: ForceFailure
id: force-fail
children:
  - type: SomeOperation
    id: operation
```

**Configuration:** Base properties only

### RunOnce

Execute child only once, then always return success.

```yaml
type: RunOnce
id: initialize-once
children:
  - type: InitializeSystem
    id: init
```

**Configuration:** Base properties only

### KeepRunningUntilFailure

Keep returning RUNNING until child fails.

```yaml
type: KeepRunningUntilFailure
id: keep-running
children:
  - type: MonitorProcess
    id: monitor
```

**Configuration:** Base properties only

### Precondition

Check condition before executing child. Fail if condition fails.

```yaml
type: Precondition
id: check-prerequisites
children:
  - type: CheckUserPermissions
    id: check-perms
```

**Configuration:** Base properties only

### SoftAssert

Like Precondition but less strict.

```yaml
type: SoftAssert
id: soft-check
children:
  - type: OptionalCheck
    id: check
```

**Configuration:** Base properties only

## Action and Condition Nodes

Action and condition nodes are application-specific and must be registered in your Registry before loading YAML workflows.

```yaml
# Custom action node
type: SendEmail
id: send-notification
props:
  recipient: "user@example.com"
  subject: "Welcome!"
  template: "welcome-email"

# Custom condition node
type: IsUserPremium
id: check-premium
props:
  userId: "{{userId}}"
```

**Requirements:**
- Node type must be registered in Registry
- Properties validated against node's schema (if defined)
- Can use blackboard variable interpolation (e.g., `"{{variableName}}"`)

## Error Handling

### Error Types

| Error Type | Stage | Description |
|------------|-------|-------------|
| `YamlSyntaxError` | 1 | YAML parsing failed |
| `StructureValidationError` | 2 | Invalid tree structure |
| `ConfigValidationError` | 3 | Invalid node configuration |
| `SemanticValidationError` | 4 | Semantic rule violation |

### Error Format

All validation errors include:
- **Message**: Description of the error
- **Path**: Location in the tree (e.g., `root.children[2].props.timeoutMs`)
- **Suggestion**: How to fix the error

Example error:

```
SemanticValidationError: Duplicate node ID 'process-payment'
  Path: root.children[3].id
  Previous occurrence: root.children[1].id
  Suggestion: Use unique IDs for each node in the tree
```

### Common Errors

#### Duplicate IDs

```yaml
# Error: Duplicate IDs
type: Sequence
children:
  - type: PrintAction
    id: my-action
  - type: PrintAction
    id: my-action  # Error!
```

**Fix:** Use unique IDs for each node.

#### Wrong Child Count

```yaml
# Error: Decorator with multiple children
type: Timeout
props:
  timeoutMs: 1000
children:
  - type: Action1
    id: a1
  - type: Action2
    id: a2  # Error: Timeout requires exactly 1 child
```

**Fix:** Decorators must have exactly 1 child. Wrap multiple children in a Sequence.

```yaml
# Fixed
type: Timeout
props:
  timeoutMs: 1000
children:
  - type: Sequence
    id: actions
    children:
      - type: Action1
        id: a1
      - type: Action2
        id: a2
```

#### Invalid Property Values

```yaml
# Error: Negative timeout
type: Timeout
props:
  timeoutMs: -100  # Error: Must be > 0
```

**Fix:** Use valid values per node schema.

```yaml
# Fixed
type: Timeout
props:
  timeoutMs: 5000
```

#### Missing Required Properties

```yaml
# Error: Missing required property
type: ForEach
props:
  itemKey: "item"
  # Missing collectionKey!
```

**Fix:** Include all required properties.

```yaml
# Fixed
type: ForEach
props:
  collectionKey: "items"
  itemKey: "item"
```

## Migration Guide

### From Programmatic API to YAML

**Before (TypeScript):**

```typescript
const tree = new Sequence({ id: "checkout" }, [
  new Timeout({ id: "payment-timeout", timeoutMs: 30000 }, [
    new ProcessPayment({ id: "payment" })
  ]),
  new SendConfirmation({ id: "confirmation" })
]);
```

**After (YAML):**

```yaml
type: Sequence
id: checkout
children:
  - type: Timeout
    id: payment-timeout
    props:
      timeoutMs: 30000
    children:
      - type: ProcessPayment
        id: payment

  - type: SendConfirmation
    id: confirmation
```

### Loading YAML Workflows

```typescript
import {
  Registry,
  registerStandardNodes,
  loadTreeFromYaml,
  loadTreeFromFile
} from '@q1k-oss/behaviour-tree-workflows';

// Setup registry with all 32 built-in nodes
const registry = new Registry();
registerStandardNodes(registry);  // One line instead of 32!

// Register your custom nodes
registry.register('ProcessPayment', ProcessPayment, { category: 'action' });
registry.register('SendConfirmation', SendConfirmation, { category: 'action' });

// Load from string
const yamlString = `
type: Sequence
id: checkout
children:
  - type: ProcessPayment
    id: payment
`;

const tree = loadTreeFromYaml(yamlString, registry);

// Load from file
const tree = await loadTreeFromFile('./workflows/checkout.yaml', registry);

// Execute
const result = await tree.execute();
```

**Built-in nodes** automatically registered by `registerStandardNodes()`:
- **10 Composites**: Sequence, Selector, Parallel, ForEach, While, Conditional, ReactiveSequence, MemorySequence, Recovery, SubTree
- **10 Decorators**: Timeout, Delay, Repeat, Invert, ForceSuccess, ForceFailure, RunOnce, KeepRunningUntilFailure, Precondition, SoftAssert
- **9 Actions/Conditions**: PrintAction, MockAction, CounterAction, CheckCondition, AlwaysCondition, WaitAction, Script, LogMessage, RegexExtract
- **3 Test Nodes**: SuccessNode, FailureNode, RunningNode

### Validation Without Execution

```typescript
import { validateYaml } from 'behaviour-tree';

const result = validateYaml(yamlString, registry);

if (!result.valid) {
  console.error('Validation errors:');
  result.errors.forEach(error => {
    console.error(error.format());
  });
} else {
  console.log('Workflow is valid!');
}
```

### Loading Options

```typescript
import { loadTreeFromYaml } from 'behaviour-tree';

const tree = loadTreeFromYaml(yamlString, registry, {
  validate: true,           // Enable validation (default: true)
  failFast: false,          // Collect all errors (default: true)
  autoGenerateIds: true     // Auto-generate missing IDs (default: true)
});
```

### Validation Options

```typescript
import { validateYaml } from 'behaviour-tree';

const result = validateYaml(yamlString, registry, {
  collectAllErrors: true,   // Collect all errors (default: false)
  checkReferences: true     // Check semantic rules (default: true)
});
```

## Best Practices

### 1. Always Provide IDs

While IDs can be auto-generated, explicit IDs make debugging easier:

```yaml
# Good
type: Sequence
id: user-registration
children:
  - type: ValidateEmail
    id: validate-email
  - type: CreateAccount
    id: create-account

# Avoid (auto-generated IDs are hard to track)
type: Sequence
children:
  - type: ValidateEmail
  - type: CreateAccount
```

### 2. Use Descriptive Names

Add names for better readability:

```yaml
type: Sequence
id: checkout-flow
name: E-commerce Checkout Flow
children:
  - type: ValidateCart
    id: validate-cart
    name: Validate Shopping Cart

  - type: ProcessPayment
    id: process-payment
    name: Process Customer Payment
```

### 3. Validate Before Deployment

Always validate workflows before deploying to production:

```typescript
const result = validateYaml(workflowYaml, registry);
if (!result.valid) {
  throw new Error('Invalid workflow');
}
```

### 4. Use SubTrees for Reusability

Extract common patterns into reusable subtrees:

```yaml
# common-validation.yaml
type: Sequence
id: common-validation
children:
  - type: CheckAuth
    id: check-auth
  - type: ValidateInput
    id: validate-input

# main-workflow.yaml
type: Sequence
id: api-endpoint
children:
  - type: SubTree
    id: validation
    props:
      treeId: "common-validation"

  - type: ProcessRequest
    id: process
```

### 5. Handle Timeouts Explicitly

Always set realistic timeouts for external operations:

```yaml
type: Timeout
id: api-timeout
props:
  timeoutMs: 5000  # 5 seconds for API call
children:
  - type: CallExternalAPI
    id: api-call
```

### 6. Use Recovery for Fallbacks

Implement graceful degradation with Recovery nodes:

```yaml
type: Recovery
id: data-source
children:
  - type: FetchFromDatabase
    id: db-fetch

  - type: FetchFromCache
    id: cache-fetch

  - type: UseDefaultData
    id: default-data
```

## Examples

See the `examples/yaml-workflows/` directory for complete examples:

**Working Examples** (tested with Temporal):
- `01-simple-sequence.yaml` - Basic sequential workflow with 3 print actions
- `02-parallel-timeout.yaml` - Parallel task execution with timeout protection
- `05-order-processing.yaml` - Complex e-commerce order processing (20+ nodes, 5 levels deep)

**Reference Examples** (showcase advanced patterns):
- `03-ecommerce-checkout.yaml` - Multi-phase checkout with conditional logic
- `04-ai-agent-workflow.yaml` - AI agent with decision trees and iterative processing

To run the working examples:
```bash
# Terminal 1: Start Temporal server
temporal server start-dev

# Terminal 2: Start worker
cd examples/temporal
npx tsx worker.ts

# Terminal 3: Execute workflows
npx tsx client.ts
```

## Further Reading

- [Core Concepts](./workflow-engine/01-core-concepts.md) - Behavior tree fundamentals
- [Node Reference](./workflow-engine/02-node-reference.md) - Complete node documentation
- [Schema Documentation](../src/schemas/README.md) - Zod schema reference
- [Registry Guide](./workflow-engine/03-registry.md) - Node registration and tree creation
