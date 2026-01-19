# BTree Node Reference

Quick reference for all available nodes in the btree library.

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

## Actions

### Script
Execute JavaScript in isolated sandbox. Access blackboard via `$bb`.

```yaml
type: Script
id: transform-data
props:
  timeout: 5000  # Optional, default 5000ms
  code: |
    const items = $bb.items || [];
    $bb.count = items.length;
    $bb.total = items.reduce((sum, i) => sum + i.price, 0);
```

**$bb is a proxy:**
- Read: `const x = $bb.myKey`
- Write: `$bb.myKey = value`
- Nested: `const name = $bb.user.name` (read from `user` object)
- Set nested: `$bb.result = { a: 1, b: 2 }`

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

For Script node, use `$bb.key` directly in JavaScript:

```yaml
type: Script
props:
  code: |
    const user = $bb.userId;
    $bb.greeting = `Hello, ${user}!`;
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
