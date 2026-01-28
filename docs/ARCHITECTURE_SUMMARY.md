# btree Architecture Summary

## Overview

btree is a behavior tree library for TypeScript, designed for AI-native workflows with native Temporal integration.

---

## Node Categories

### 1. Pure Control Flow Nodes - Run in Temporal Sandbox

| Category | Nodes | Purpose |
|----------|-------|---------|
| **Composites** (11) | Sequence, Selector, Parallel, ForEach, While, Conditional, Recovery, SubTree, MemorySequence, ReactiveSequence | Orchestration, control flow |
| **Decorators** (10) | Timeout, Delay, Repeat, Invert, ForceSuccess, ForceFailure, RunOnce, KeepRunningUntilFailure, Precondition, SoftAssert | Modify child behavior |
| **Conditions** (3) | CheckCondition, AlwaysCondition, LogMessage | Simple checks, logging |

These run entirely in Temporal's workflow sandbox - no external I/O.

### 2. Activity-Based I/O Nodes - Run via Activities

| Node | Activity | Purpose |
|------|----------|---------|
| **HttpRequest** | `fetchUrl` | HTTP requests (GET, POST, etc.) |
| **GenerateFile** | `generateFile` | Create CSV/Excel/JSON files |
| **ParseFile** | `parseFile` | Parse CSV/Excel files |
| **PythonScript** | `executePythonScript` | Run Python code |
| **JavaScriptNode** | `executeJavaScript` | Run JavaScript code (ES5) |
| **IntegrationAction** | `executePieceAction` | Active Pieces integrations |

These nodes require activities for external I/O. They follow the pattern:
1. Check if activity exists in context
2. Call activity with request
3. Store result reference in blackboard

---

## Decision: Replace Script with JavaScriptNode

### Rationale

The current `Script` node uses `js-interpreter` inline, which fails in Temporal's sandbox due to frozen objects. Instead of maintaining dual execution paths, we'll:

1. **Deprecate `Script` node** - Remove inline js-interpreter execution
2. **Add `JavaScriptNode`** - Activity-based, same pattern as `PythonScript`

This provides consistency:
- `PythonScript` → runs Python via activity
- `JavaScriptNode` → runs JavaScript via activity

### Migration

```yaml
# OLD (Script - deprecated)
type: CodeExecution
id: transform
props:
  code: |
    var items = getBB('items');
    setBB('total', items.length);

# NEW (JavaScriptNode)
type: JavaScriptNode
id: transform
props:
  code: |
    var items = getBB('items');
    setBB('total', items.length);
  timeout: 5000
  outputKey: "scriptResult"  # Optional: store full result
```

The API remains the same (`getBB`, `setBB`, `getInput`, `getEnv`).

---

## Large Payload Architecture

### The Problem

Temporal has limits:
- **2MB payload limit** per activity argument/result
- **50MB event history limit** per workflow
- Large data round-trips are inefficient

### Solution: Shared Data Store

Activities communicate via a shared data store. The workflow only sees references and metadata.

```
┌──────────────────────────────────────────────────────────────┐
│                     DataStore (Abstract)                      │
│    Implementation: GCS / Redis / PostgreSQL / Mock (tests)   │
└──────────────────────────────────────────────────────────────┘
        ▲                    ▲                    ▲
        │ write              │ read/write         │ read
        │                    │                    │
┌───────┴───────┐    ┌───────┴───────┐    ┌──────┴────────┐
│  HttpRequest  │    │ JavaScriptNode│    │  GenerateFile │
│   Activity    │    │    Activity   │    │    Activity   │
│               │    │               │    │               │
│ Fetches API   │    │ Transforms    │    │ Creates file  │
│ Stores in DS  │    │ data from DS  │    │ from DS data  │
│ Returns: ref  │    │ Returns: ref  │    │ Returns: path │
└───────────────┘    └───────────────┘    └───────────────┘
        │                    │                    │
        │ { ref, count }     │ { ref, summary }   │ { filePath }
        ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────────┐
│                   Workflow (Temporal Sandbox)                 │
│                                                              │
│  Blackboard stores ONLY:                                     │
│  - References: { dataRef: "gs://bucket/workflow/123/data" }  │
│  - Metadata: { rowCount: 5000, status: "ready" }             │
│  - Flags: { hasErrors: false, needsRetry: true }             │
│                                                              │
│  Blackboard NEVER stores large data directly                 │
└──────────────────────────────────────────────────────────────┘
```

---

## DataStore Interface

### Abstract Interface (Mockable)

```typescript
/**
 * Abstract data store for large payload handling.
 * Activities use this to store/retrieve data without passing through workflow.
 *
 * Implementations:
 * - GCSDataStore: Production (Google Cloud Storage)
 * - RedisDataStore: Fast ephemeral data
 * - MemoryDataStore: Unit tests
 */
export interface DataStore {
  /**
   * Store data and return a reference
   * @param key - Unique key (e.g., "workflow:123:httpResponse:456")
   * @param data - Data to store (will be JSON serialized)
   * @param options - TTL, metadata, etc.
   * @returns Reference object with retrieval info
   */
  put(key: string, data: unknown, options?: PutOptions): Promise<DataRef>;

  /**
   * Retrieve data by reference
   * @param ref - Reference returned from put()
   * @returns The stored data (JSON deserialized)
   */
  get(ref: DataRef): Promise<unknown>;

  /**
   * Delete data by reference
   * @param ref - Reference to delete
   */
  delete(ref: DataRef): Promise<void>;

  /**
   * Check if data exists
   * @param ref - Reference to check
   */
  exists(ref: DataRef): Promise<boolean>;
}

export interface DataRef {
  /** Storage backend identifier */
  store: 'gcs' | 'redis' | 'memory';
  /** Full key/path to data */
  key: string;
  /** Size in bytes (for decisions) */
  sizeBytes?: number;
  /** When data expires (if applicable) */
  expiresAt?: number;
}

export interface PutOptions {
  /** Time-to-live in seconds */
  ttlSeconds?: number;
  /** Content type hint */
  contentType?: 'json' | 'csv' | 'binary';
  /** Workflow context for key namespacing */
  workflowId?: string;
}
```

### GCS Implementation (Production)

```typescript
import { Storage } from '@google-cloud/storage';

export class GCSDataStore implements DataStore {
  private storage: Storage;
  private bucket: string;
  private prefix: string;

  constructor(config: { projectId?: string; bucket: string; prefix?: string }) {
    this.storage = new Storage({ projectId: config.projectId });
    this.bucket = config.bucket;
    this.prefix = config.prefix ?? 'workflows/';
  }

  async put(key: string, data: unknown, options?: PutOptions): Promise<DataRef> {
    const fullKey = `${this.prefix}${key}`;
    const body = JSON.stringify(data);
    const sizeBytes = Buffer.byteLength(body, 'utf8');

    const file = this.storage.bucket(this.bucket).file(fullKey);

    const metadata: Record<string, string> = {};
    if (options?.workflowId) metadata['workflow-id'] = options.workflowId;

    let expiresAt: number | undefined;
    if (options?.ttlSeconds) {
      expiresAt = Date.now() + options.ttlSeconds * 1000;
      metadata['expires-at'] = String(expiresAt);
    }

    await file.save(body, {
      contentType: 'application/json',
      metadata: { metadata },
    });

    return {
      store: 'gcs',
      key: fullKey,
      sizeBytes,
      expiresAt,
    };
  }

  async get(ref: DataRef): Promise<unknown> {
    const file = this.storage.bucket(this.bucket).file(ref.key);
    const [contents] = await file.download();
    return JSON.parse(contents.toString('utf8'));
  }

  async delete(ref: DataRef): Promise<void> {
    const file = this.storage.bucket(this.bucket).file(ref.key);
    await file.delete({ ignoreNotFound: true });
  }

  async exists(ref: DataRef): Promise<boolean> {
    const file = this.storage.bucket(this.bucket).file(ref.key);
    const [exists] = await file.exists();
    return exists;
  }
}
```

### Memory Implementation (Tests)

```typescript
export class MemoryDataStore implements DataStore {
  private store = new Map<string, { data: unknown; expiresAt?: number }>();

  async put(key: string, data: unknown, options?: PutOptions): Promise<DataRef> {
    const expiresAt = options?.ttlSeconds
      ? Date.now() + options.ttlSeconds * 1000
      : undefined;

    this.store.set(key, { data, expiresAt });

    return {
      store: 'memory',
      key,
      sizeBytes: JSON.stringify(data).length,
      expiresAt
    };
  }

  async get(ref: DataRef): Promise<unknown> {
    const entry = this.store.get(ref.key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(ref.key);
      return null;
    }
    return entry.data;
  }

  async delete(ref: DataRef): Promise<void> {
    this.store.delete(ref.key);
  }

  async exists(ref: DataRef): Promise<boolean> {
    const entry = this.store.get(ref.key);
    if (!entry) return false;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(ref.key);
      return false;
    }
    return true;
  }

  /** Test helper: clear all data */
  clear(): void {
    this.store.clear();
  }
}
```

---

## Updated BtreeActivities Interface

```typescript
export interface BtreeActivities {
  /** Execute an Active Pieces action */
  executePieceAction: (request: PieceActivityRequest) => Promise<unknown>;

  /** Execute Python code */
  executePythonScript?: (request: PythonScriptRequest) => Promise<ScriptResult>;

  /** Execute JavaScript code (replaces inline Script node) */
  executeJavaScript?: (request: JavaScriptRequest) => Promise<ScriptResult>;

  /** Parse CSV/Excel file */
  parseFile?: (request: ParseFileRequest) => Promise<ParseFileResult>;

  /** Generate CSV/Excel/JSON file */
  generateFile?: (request: GenerateFileRequest) => Promise<GenerateFileResult>;

  /** Make HTTP request */
  fetchUrl?: (request: HttpRequestActivity) => Promise<HttpResponseActivity>;
}

/** Request for JavaScript execution */
export interface JavaScriptRequest {
  /** JavaScript code (ES5 syntax) */
  code: string;
  /** DataRefs to resolve before execution */
  dataRefs?: Record<string, DataRef>;
  /** Small values to pass directly */
  context?: Record<string, unknown>;
  /** Workflow input (read-only in script) */
  input?: Record<string, unknown>;
  /** Allowed environment variables */
  allowedEnvVars?: string[];
  /** Execution timeout in ms (default: 5000) */
  timeout?: number;
  /** Workflow ID for data store namespacing */
  workflowId?: string;
}

/** Result from script execution */
export interface ScriptResult {
  /** Small values returned directly */
  values: Record<string, unknown>;
  /** Large values stored in data store */
  dataRefs: Record<string, DataRef>;
  /** Console.log output */
  logs: string[];
  /** Execution time in ms */
  executionTimeMs: number;
}
```

---

## Activity Data Flow Pattern

### HttpRequest Activity

```typescript
async function fetchUrlActivity(
  request: HttpRequestActivity,
  dataStore: DataStore,
  workflowId: string
): Promise<HttpResponseActivity> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body ? JSON.stringify(request.body) : undefined,
  });

  const data = await response.json();
  const dataSize = JSON.stringify(data).length;

  // Threshold: 100KB - below this, return directly
  const INLINE_THRESHOLD = 100 * 1024;

  if (dataSize < INLINE_THRESHOLD) {
    // Small response: return directly
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      data,  // Inline
    };
  } else {
    // Large response: store in data store
    const ref = await dataStore.put(
      `${workflowId}/http/${Date.now()}`,
      data,
      { ttlSeconds: 3600 }  // 1 hour TTL
    );

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      dataRef: ref,  // Reference only
      rowCount: Array.isArray(data) ? data.length : undefined,
    };
  }
}
```

### JavaScriptNode Activity

```typescript
async function executeJavaScriptActivity(
  request: JavaScriptRequest,
  dataStore: DataStore
): Promise<ScriptResult> {
  const startTime = Date.now();

  // 1. Resolve all data refs to actual data
  const resolvedContext: Record<string, unknown> = { ...request.context };

  for (const [key, ref] of Object.entries(request.dataRefs || {})) {
    resolvedContext[key] = await dataStore.get(ref);
  }

  // 2. Execute script with js-interpreter
  const Interpreter = require('js-interpreter');
  const modifiedValues: Record<string, unknown> = {};
  const logs: string[] = [];

  const initFunc = (interpreter: any, globalObject: any) => {
    // getBB - reads from resolved context
    interpreter.setProperty(globalObject, 'getBB',
      interpreter.createNativeFunction((key: string) => {
        return interpreter.nativeToPseudo(resolvedContext[key]);
      })
    );

    // setBB - writes to modified values
    interpreter.setProperty(globalObject, 'setBB',
      interpreter.createNativeFunction((key: string, value: any) => {
        modifiedValues[key] = interpreter.pseudoToNative(value);
      })
    );

    // getInput - read-only workflow input
    interpreter.setProperty(globalObject, 'getInput',
      interpreter.createNativeFunction((key: string) => {
        return interpreter.nativeToPseudo(request.input?.[key]);
      })
    );

    // getEnv - allowed env vars only
    interpreter.setProperty(globalObject, 'getEnv',
      interpreter.createNativeFunction((key: string) => {
        if (request.allowedEnvVars?.includes(key)) {
          return interpreter.nativeToPseudo(process.env[key]);
        }
        return interpreter.nativeToPseudo(undefined);
      })
    );

    // console.log
    interpreter.setProperty(globalObject, 'console',
      interpreter.nativeToPseudo({
        log: (...args: any[]) => logs.push(args.map(String).join(' '))
      })
    );
  };

  const interp = new Interpreter(request.code, initFunc);

  // Execute with timeout
  const timeout = request.timeout || 5000;
  while (interp.step()) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Script execution timeout after ${timeout}ms`);
    }
  }

  // 3. Store large results in data store, keep small ones inline
  const INLINE_THRESHOLD = 10 * 1024; // 10KB
  const resultValues: Record<string, unknown> = {};
  const resultRefs: Record<string, DataRef> = {};

  for (const [key, value] of Object.entries(modifiedValues)) {
    const size = JSON.stringify(value).length;

    if (size < INLINE_THRESHOLD) {
      resultValues[key] = value;
    } else {
      resultRefs[key] = await dataStore.put(
        `${request.workflowId}/js/${key}/${Date.now()}`,
        value,
        { ttlSeconds: 3600 }
      );
    }
  }

  return {
    values: resultValues,
    dataRefs: resultRefs,
    logs,
    executionTimeMs: Date.now() - startTime,
  };
}
```

---

## Blackboard: Reference Resolution

The blackboard needs to understand data references. When a node needs actual data, it resolves the ref via the data store.

```typescript
// In node execution
const httpResult = context.blackboard.get('apiResponse');

if (isDataRef(httpResult)) {
  // This is a reference - actual data is in data store
  // Node can either:
  // 1. Pass the ref to an activity (activity resolves it)
  // 2. Use a utility to resolve inline (if small data expected)
} else {
  // This is actual data (small payload returned inline)
}
```

### Helper Type Guard

```typescript
export function isDataRef(value: unknown): value is DataRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'store' in value &&
    'key' in value &&
    ['gcs', 'redis', 'memory'].includes((value as DataRef).store)
  );
}
```

---

## Worker Configuration

```typescript
// worker.ts
import { GCSDataStore, MemoryDataStore } from './data-store';

// Production: Use GCS
const dataStore = new GCSDataStore({
  projectId: process.env.GCP_PROJECT_ID,
  bucket: process.env.GCS_BUCKET!,
  prefix: 'workflows/',
});

// Tests: Use memory
// const dataStore = new MemoryDataStore();

// Create activities with data store injected
const activities = {
  fetchUrlActivity: (req) => fetchUrlActivity(req, dataStore, workflowId),
  executeJavaScriptActivity: (req) => executeJavaScriptActivity(req, dataStore),
  generateFileActivity: (req) => generateFileActivity(req, dataStore),
  // ... etc
};
```

---

## Summary

| Component | Responsibility |
|-----------|---------------|
| **Workflow Sandbox** | Orchestration only. Stores refs + metadata in blackboard. |
| **Activities** | All I/O. Read/write data store. Return refs for large data. |
| **DataStore** | Shared storage between activities. GCS for prod, Memory for tests. |
| **Blackboard** | Holds small values inline, DataRefs for large values. |
| **JavaScriptNode** | Activity-based JS execution. Replaces inline Script node. |

### Key Principles

1. **Blackboard is lightweight** - Never store large data directly
2. **Activities share via DataStore** - Not through workflow state
3. **DataStore is abstract** - Can swap GCS/Redis/Memory without code changes
4. **References carry metadata** - Size, expiry, type for smart decisions
5. **Threshold-based inline** - Small data (<100KB) can skip data store

---

## Storage Alternatives

### Google Cloud Filestore (NFS) - Future Option

If local filesystem semantics are needed (similar to AWS EFS), consider **Google Cloud Filestore**:

| Feature | GCS (Current) | Filestore |
|---------|---------------|-----------|
| **Interface** | Object storage API | NFS mount (local filesystem) |
| **Use Case** | Data refs, long-term storage | Scratch space, temp files |
| **Min Size** | Pay per use | 1 TiB (Basic tier) |
| **Performance** | High throughput | Up to 26 GiB/s, 900K IOPS |
| **GKE Integration** | SDK calls | CSI driver, PersistentVolumes |

**When to consider Filestore:**
- Worker pods need shared scratch filesystem
- Code execution needs local file I/O patterns
- AI/ML workloads with large datasets

**Hybrid approach (if needed):**
- Filestore → Worker scratch space, temp files during execution
- GCS → Long-term storage, workflow data refs, archived outputs
