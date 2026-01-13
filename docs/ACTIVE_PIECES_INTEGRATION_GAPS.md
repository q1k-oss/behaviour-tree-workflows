# Active Pieces Integration - Gap Analysis & Improvement Plan

## Overview

This document analyzes the gaps between our current `IntegrationAction` node implementation and the full Active Pieces framework capabilities. Understanding these gaps is essential for supporting complex actions like `insert_row` with dynamic properties.

---

## Current Architecture

```
┌─────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│  YAML Workflow  │ --> │ IntegrationAction │ --> │  piece-executor  │
│                 │     │      Node         │     │                  │
│  inputs:        │     │  resolveInputs()  │     │ executePieceAction()
│    values: ...  │     │  (bb resolution)  │     │                  │
└─────────────────┘     └───────────────────┘     └──────────────────┘
                                                           │
                                                           v
                                                  ┌──────────────────┐
                                                  │ Active Pieces    │
                                                  │ action.run({     │
                                                  │   auth,          │
                                                  │   propsValue     │
                                                  │ })               │
                                                  └──────────────────┘
```

**Current Flow:**
1. YAML defines `inputs` as static values or `${bb.key}` references
2. `IntegrationAction.resolveInputs()` replaces blackboard references
3. `piece-executor` passes resolved inputs directly to `action.run()`

**Problem:** We skip Active Pieces' property resolution layer entirely.

---

## Gap 1: Dynamic Properties (CRITICAL)

### What Active Pieces Does

Active Pieces has a property type called `DYNAMIC` that generates its schema at runtime based on other property values:

```typescript
// From @activepieces/piece-google-sheets insert_row action
values: Property.Dynamic({
  displayName: 'Values',
  refreshers: ['sheetId', 'spreadsheetId', 'first_row_headers'],
  props: async ({ auth, spreadsheetId, sheetId, first_row_headers }) => {
    // Fetches headers from the actual spreadsheet
    const headers = await getHeaderRow({ spreadsheetId, auth, sheetId });

    if (!first_row_headers) {
      // Returns array property
      return {
        values: Property.Array({ displayName: 'Values', required: true })
      };
    }

    // Returns object with column-labeled properties
    const properties = {};
    for (let i = 0; i < headers.length; i++) {
      const label = columnToLabel(i); // A, B, C, ...
      properties[label] = Property.ShortText({
        displayName: headers[i],
        required: false,
      });
    }
    return properties;
  }
})
```

### Expected Input Format

**When `first_row_headers: false`:**
```yaml
inputs:
  values:
    values:  # Note: nested 'values' array
      - "Value 1"
      - "Value 2"
      - "Value 3"
```

**When `first_row_headers: true`:**
```yaml
inputs:
  values:
    A: "Value for column A"
    B: "Value for column B"
    C: "Value for column C"
```

### Current Gap

Our `piece-executor` passes inputs directly without:
1. Calling the `props()` function to resolve dynamic schemas
2. Transforming user-friendly input formats to Active Pieces' expected format
3. Fetching metadata (like spreadsheet headers) needed for schema resolution

### Proposed Solutions

#### Option A: Schema Pre-Resolution (Recommended)

Add a property resolution layer that mirrors Active Pieces' behavior:

```typescript
// piece-executor.ts - Enhanced
export async function executePieceAction(request: PieceActionRequest): Promise<unknown> {
  const { provider, action, inputs, auth } = request;

  // ... load piece ...

  // NEW: Resolve dynamic properties
  const resolvedInputs = await resolveDynamicProperties(
    actionDef.props,
    inputs,
    auth
  );

  // Execute with resolved inputs
  return actionDef.run({ auth, propsValue: resolvedInputs });
}

async function resolveDynamicProperties(
  propsDef: Record<string, PropertyDef>,
  inputs: Record<string, unknown>,
  auth: PieceAuth
): Promise<Record<string, unknown>> {
  const resolved: Record<string, unknown> = {};

  for (const [key, prop] of Object.entries(propsDef)) {
    if (prop.type === 'DYNAMIC' && typeof prop.props === 'function') {
      // Call the dynamic props function with current resolved values
      const dynamicSchema = await prop.props({
        auth,
        ...resolved,
        ...inputs,
      });

      // Transform input according to dynamic schema
      resolved[key] = transformInput(inputs[key], dynamicSchema);
    } else {
      resolved[key] = inputs[key];
    }
  }

  return resolved;
}
```

#### Option B: Input Format Adapters

Create provider-specific adapters that transform user-friendly YAML to Active Pieces format:

```typescript
// adapters/google-sheets.ts
export const googleSheetsAdapter = {
  'insert_row': (inputs: Record<string, unknown>) => {
    const { values, first_row_headers, ...rest } = inputs;

    if (!first_row_headers && Array.isArray(values)) {
      // Transform array to expected nested format
      return { ...rest, first_row_headers, values: { values } };
    }

    if (first_row_headers && typeof values === 'object') {
      // Already in correct format (or transform from headers to labels)
      return { ...rest, first_row_headers, values };
    }

    return inputs;
  }
};
```

#### Option C: Extended YAML Syntax

Add special syntax for complex Active Pieces properties:

```yaml
type: IntegrationAction
id: insert-row
props:
  provider: google
  action: insert_row
  inputs:
    spreadsheetId: "${bb.sheetId}"
    sheetId: 0
    first_row_headers: true
    # New: @columns directive for header-based mapping
    values:
      @columns:
        "Order ID": "${bb.orderId}"
        "Customer": "${bb.customerName}"
        "Amount": "${bb.amount}"
```

---

## Gap 2: Dropdown Properties (MEDIUM)

### What Active Pieces Does

Many properties use `DROPDOWN` type with dynamic options fetched from APIs:

```typescript
spreadsheetId: Property.Dropdown({
  displayName: 'Spreadsheet',
  refreshers: ['includeTeamDrives'],
  options: async ({ auth, includeTeamDrives }) => {
    const spreadsheets = await listSpreadsheets(auth, includeTeamDrives);
    return {
      options: spreadsheets.map(s => ({ label: s.name, value: s.id }))
    };
  }
})
```

### Current Gap

We accept raw IDs but don't:
1. Validate against available options
2. Support name-to-ID resolution (e.g., "My Spreadsheet" → "1abc...")
3. Provide autocomplete for workflow builders

### Proposed Solution

Add optional name resolution for dropdown properties:

```typescript
// In IntegrationAction or piece-executor
async function resolveDropdownValue(
  prop: DropdownProperty,
  value: string,
  context: { auth: PieceAuth }
): Promise<string> {
  // If value looks like an ID, use it directly
  if (looksLikeId(value)) return value;

  // Otherwise, fetch options and find by name
  const { options } = await prop.options(context);
  const match = options.find(o => o.label === value);

  if (!match) {
    throw new Error(`"${value}" not found. Available: ${options.map(o => o.label).join(', ')}`);
  }

  return match.value;
}
```

---

## Gap 3: Property Validation (MEDIUM)

### What Active Pieces Does

Properties have built-in validation:
- `required: true/false`
- Type coercion (string to number, etc.)
- Custom validators
- Regex patterns

### Current Gap

We pass inputs without validation, leading to cryptic errors from the piece actions.

### Proposed Solution

Add a validation layer:

```typescript
function validateInputs(
  propsDef: Record<string, PropertyDef>,
  inputs: Record<string, unknown>
): ValidationResult {
  const errors: string[] = [];

  for (const [key, prop] of Object.entries(propsDef)) {
    if (prop.required && inputs[key] === undefined) {
      errors.push(`Missing required property: ${key}`);
    }

    if (prop.type === 'NUMBER' && typeof inputs[key] === 'string') {
      inputs[key] = Number(inputs[key]);
    }

    // ... more validation rules
  }

  return { valid: errors.length === 0, errors, coercedInputs: inputs };
}
```

---

## Gap 4: Store & Files Context (LOW)

### What Active Pieces Does

Actions receive `store` and `files` context for:
- Persisting state between runs
- Handling file uploads/downloads

### Current Gap

We provide mock implementations:

```typescript
// Current mock
store: {
  get: async (key) => storage[key],
  put: async (key, value) => { storage[key] = value },
  delete: async (key) => { delete storage[key] }
}
```

### Proposed Solution

Integrate with blackboard or external storage:

```typescript
function createStoreFromBlackboard(blackboard: ScopedBlackboard, nodeId: string) {
  const prefix = `__store:${nodeId}:`;
  return {
    get: async (key: string) => blackboard.get(`${prefix}${key}`),
    put: async (key: string, value: unknown) => blackboard.set(`${prefix}${key}`, value),
    delete: async (key: string) => blackboard.delete(`${prefix}${key}`)
  };
}
```

---

## Gap 5: Auth Type Handling (LOW)

### What Active Pieces Does

Supports multiple auth types per piece:
- `OAUTH2` - Access token + refresh
- `API_KEY` - Simple API key
- `BASIC_AUTH` - Username + password
- `CUSTOM_AUTH` - Provider-specific (e.g., service accounts)

### Current Gap

We only handle `OAUTH2` and `API_KEY` well. Service accounts and custom auth need work.

### Proposed Solution

Extend `TokenProvider` interface:

```typescript
export type PieceAuth =
  | { type: 'oauth2'; access_token: string; refresh_token?: string }
  | { type: 'api_key'; api_key: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'custom'; [key: string]: unknown };

export type TokenProvider = (
  context: IntegrationContext,
  provider: string,
  connectionId?: string
) => Promise<PieceAuth>;
```

---

## Implementation Priority

| Gap | Priority | Effort | Impact |
|-----|----------|--------|--------|
| Dynamic Properties | CRITICAL | High | Enables complex actions like insert_row |
| Input Validation | MEDIUM | Medium | Better error messages, fewer runtime failures |
| Dropdown Resolution | MEDIUM | Medium | Better UX for workflow builders |
| Store/Files | LOW | Low | Needed for stateful pieces |
| Auth Types | LOW | Low | Needed for service accounts |

---

## Recommended Next Steps

### Phase 1: Make insert_row Work (1-2 days)

1. Add input format adapter for Google Sheets
2. Support the specific formats needed:
   - `{ values: ["a", "b"] }` for array mode
   - `{ A: "a", B: "b" }` for header mode

### Phase 2: Generic Dynamic Property Support (3-5 days)

1. Implement `resolveDynamicProperties()` in piece-executor
2. Cache dynamic schema results to avoid repeated API calls
3. Add tests for common Active Pieces actions

### Phase 3: Validation & UX (2-3 days)

1. Add property validation layer
2. Improve error messages with property context
3. Add dropdown name resolution

---

## Working Example (Array Mode)

The following format **works today** with the current implementation:

```yaml
# Array mode (no headers) - WORKING
type: IntegrationAction
id: insert-row
props:
  provider: google
  action: insert_row
  inputs:
    spreadsheetId: "${bb.spreadsheetId}"
    sheetId: 0
    first_row_headers: false
    as_string: true
    values:
      values:  # Note: nested 'values' key required by Active Pieces
        - "ORD-001"
        - "John Doe"
        - "99.99"
        - "Completed"
```

**Key insight:** Active Pieces expects `values.values` (nested) for array mode.

## Future: Header Mode (Needs Work)

Header mode requires dynamic property resolution (Gap 1):

```yaml
# Header mode - NEEDS GAP 1 IMPLEMENTATION
type: IntegrationAction
id: insert-row-headers
props:
  provider: google
  action: insert_row
  inputs:
    spreadsheetId: "${bb.spreadsheetId}"
    sheetId: 0
    first_row_headers: true
    values:
      A: "ORD-001"      # Column A
      B: "John Doe"     # Column B
      C: "99.99"        # Column C
```

This would require fetching the spreadsheet headers first to validate column labels.

---

## References

- [Active Pieces Source](https://github.com/activepieces/activepieces)
- [Pieces Framework](https://github.com/activepieces/activepieces/tree/main/packages/pieces/framework)
- [Google Sheets Piece](https://github.com/activepieces/activepieces/tree/main/packages/pieces/community/google-sheets)
