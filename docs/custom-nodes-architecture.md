# Custom Nodes Plugin System Architecture

**Goal**: Allow tenants to create custom workflow nodes without writing code initially, then progressively enable full TypeScript node development.

---

## Phased Rollout Strategy

### Phase 1 (MVP - Week 1-4): Built-in Nodes Only
- ✅ 32 standard nodes from `registerStandardNodes()`
- ✅ Python/JavaScript interpreter nodes (coming in Phase 2A)
- ❌ No custom uploads yet

### Phase 2A (Week 5-6): Interpreter Nodes
- ✅ Python interpreter node (user provides Python code inline)
- ✅ JavaScript interpreter node (user provides JS code inline)
- ✅ Sandboxed execution with timeouts and memory limits

### Phase 2B (Week 7-8): Custom Node Uploads
- ✅ Upload TypeScript files
- ✅ Server compiles and bundles
- ✅ Per-tenant node registry
- ✅ Versioning and rollback

### Phase 3 (Week 9-12): Full SDK
- ✅ Type-safe custom node SDK
- ✅ Local development with CLI
- ✅ Automated testing
- ✅ Marketplace for sharing nodes

---

## Phase 2A: Interpreter Nodes (Week 5-6)

### Architecture

```
YAML Workflow
  ↓
Contains PythonInterpreter node with inline script
  ↓
Worker executes node
  ↓
Node calls executePython activity
  ↓
Activity spawns Python subprocess
  ↓
Script executes with blackboard variables as context
  ↓
Result written back to blackboard
```

### YAML Definition

```yaml
type: Sequence
id: data-processing
children:
  # Fetch data via HTTP
  - type: HttpRequest
    id: fetch-data
    props:
      url: "https://api.example.com/data"
      method: "GET"

  # Process data with Python
  - type: PythonInterpreter
    id: process-data
    props:
      outputKey: "processedData"
      timeout: "30s"
      script: |
        import json
        import numpy as np

        # httpResponse comes from blackboard
        data = httpResponse['data']

        # Process data
        values = [item['value'] for item in data]
        mean = np.mean(values)
        std = np.std(values)

        # Result stored in blackboard under 'processedData'
        result = {
            'mean': mean,
            'std': std,
            'count': len(values)
        }

  # Send processed data
  - type: HttpRequest
    id: send-results
    props:
      url: "https://api.example.com/results"
      method: "POST"
      body:
        stats: "{{processedData}}"
```

### Implementation

```typescript
// worker/src/actions/python-interpreter.ts
import { ActionNode } from '@q1k-oss/behaviour-tree-workflows';
import { proxyActivities } from '@temporalio/workflow';
import type { NodeStatus, TemporalContext } from '@q1k-oss/behaviour-tree-workflows';

interface InterpreterActivities {
  executePython(
    script: string,
    context: Record<string, any>,
    options: { timeout: string }
  ): Promise<any>;
}

const activities = proxyActivities<InterpreterActivities>({
  startToCloseTimeout: '5m',
  heartbeatTimeout: '30s',
});

export class PythonInterpreter extends ActionNode {
  private script: string;
  private outputKey: string;
  private timeout: string;

  constructor(config: any) {
    super(config);
    this.script = config.script;
    this.outputKey = config.outputKey || 'pythonResult';
    this.timeout = config.timeout || '30s';
  }

  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    try {
      // Gather blackboard data as script context
      const scriptContext = context.blackboard.toJSON();

      // Execute Python in activity
      const result = await activities.executePython(
        this.script,
        scriptContext,
        { timeout: this.timeout }
      );

      // Store result
      context.blackboard.set(this.outputKey, result);

      return NodeStatus.SUCCESS;
    } catch (error) {
      this._lastError = `Python execution failed: ${error.message}`;
      return NodeStatus.FAILURE;
    }
  }
}
```

```typescript
// worker/src/activities/python-interpreter.ts
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuid } from 'uuid';

const PYTHON_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max

export async function executePython(
  script: string,
  context: Record<string, any>,
  options: { timeout: string }
): Promise<any> {
  const scriptId = uuid();
  const tempDir = join('/tmp', 'python-scripts');

  // Create temp directory
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }

  const scriptPath = join(tempDir, `${scriptId}.py`);

  // Build full Python script with context injection
  const fullScript = `
import json
import sys

# Inject context variables from blackboard
${Object.entries(context)
  .map(([key, val]) => `${key} = ${JSON.stringify(val)}`)
  .join('\n')}

# User script
${script}

# Capture result variable
if 'result' in locals():
    print(json.dumps(result))
else:
    print(json.dumps({}))
`;

  writeFileSync(scriptPath, fullScript);

  try {
    // Parse timeout
    const timeoutMs = parseTimeout(options.timeout);

    // Execute Python subprocess
    const output = await executeWithTimeout(scriptPath, timeoutMs);

    // Parse JSON output
    try {
      return JSON.parse(output.trim());
    } catch (e) {
      throw new Error(`Python script did not return valid JSON: ${output}`);
    }
  } finally {
    // Cleanup
    try {
      unlinkSync(scriptPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

function executeWithTimeout(
  scriptPath: string,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', [scriptPath]);
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Timeout timer
    const timer = setTimeout(() => {
      timedOut = true;
      python.kill('SIGTERM');
      reject(new Error(`Python script timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      clearTimeout(timer);

      if (timedOut) return; // Already rejected

      if (code !== 0) {
        reject(new Error(`Python exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });

    python.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start Python: ${err.message}`));
    });
  });
}

function parseTimeout(timeout: string): number {
  const match = timeout.match(/^(\d+)(s|m|h)?$/);
  if (!match) return 30000; // default 30s

  const value = parseInt(match[1]);
  const unit = match[2] || 's';

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    default: return value * 1000;
  }
}
```

### Security & Sandboxing

**Baseline Security**:
```python
# 1. No network access (use Docker with --network=none)
# 2. Limited filesystem access (read-only mount)
# 3. Memory limits (Docker --memory flag)
# 4. CPU limits (Docker --cpus flag)
# 5. Timeout enforcement (killed after timeout)
```

**Docker-based Execution** (Production):

```typescript
// worker/src/activities/python-interpreter.ts (production version)
import Docker from 'dockerode';

const docker = new Docker();

export async function executePython(
  script: string,
  context: Record<string, any>,
  options: { timeout: string }
): Promise<any> {
  const scriptId = uuid();

  // Create container
  const container = await docker.createContainer({
    Image: 'python:3.11-slim',
    Cmd: ['python', '-c', buildScript(script, context)],
    HostConfig: {
      Memory: 512 * 1024 * 1024, // 512MB
      MemorySwap: 512 * 1024 * 1024,
      NanoCpus: 1 * 1e9, // 1 CPU
      NetworkMode: 'none', // No network access
      ReadonlyRootfs: true, // Read-only filesystem
      AutoRemove: true,
    },
    WorkingDir: '/workspace',
  });

  try {
    // Start container
    await container.start();

    // Wait for completion with timeout
    const timeoutMs = parseTimeout(options.timeout);
    const result = await Promise.race([
      container.wait(),
      new Promise((_, reject) => {
        setTimeout(() => {
          container.kill();
          reject(new Error('Timeout'));
        }, timeoutMs);
      }),
    ]);

    // Get logs
    const logs = await container.logs({
      stdout: true,
      stderr: true,
    });

    // Parse output
    return JSON.parse(logs.toString());
  } finally {
    // Container auto-removed due to AutoRemove: true
  }
}
```

**Allowed Python Packages** (pre-installed in Docker image):
- numpy, pandas, scipy (data processing)
- requests (HTTP - but network disabled, just for lib compatibility)
- json, datetime, math (stdlib)
- No database drivers, no subprocess, no file I/O

---

## Phase 2B: Custom Node Uploads (Week 7-8)

### Architecture

```
User writes TypeScript node
  ↓
Uploads to platform (POST /api/custom-nodes)
  ↓
Server validates and compiles with esbuild
  ↓
Bundle stored in GCS
  ↓
Metadata stored in PostgreSQL
  ↓
Workers dynamically import bundle
  ↓
Node available in workflows
```

### Database Schema

```sql
CREATE TABLE custom_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  name VARCHAR(255) NOT NULL,  -- e.g., "SendSlackMessage"
  version VARCHAR(20) NOT NULL,  -- e.g., "1.0.0"
  description TEXT,
  source_code TEXT NOT NULL,  -- TypeScript source
  bundle_url VARCHAR(500),  -- GCS URL
  schema JSONB,  -- Zod schema for props validation
  status VARCHAR(50) DEFAULT 'draft',  -- draft, active, deprecated
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(tenant_id, name, version)
);

CREATE TABLE workflow_node_dependencies (
  workflow_id UUID REFERENCES workflows(id),
  custom_node_id UUID REFERENCES custom_nodes(id),

  PRIMARY KEY(workflow_id, custom_node_id)
);
```

### Upload API

```typescript
// api-server/src/routes/custom-nodes.ts
import { FastifyInstance } from 'fastify';
import * as esbuild from 'esbuild';
import { Storage } from '@google-cloud/storage';
import { z } from 'zod';

const storage = new Storage();
const bucket = storage.bucket(process.env.GCS_BUCKET!);

const uploadSchema = z.object({
  name: z.string().min(1).max(255),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),  // semver
  description: z.string().optional(),
  sourceCode: z.string().min(1),
  schema: z.record(z.any()).optional(),  // Zod schema as JSON
});

export default async (fastify: FastifyInstance) => {
  // Upload custom node
  fastify.post('/custom-nodes', {
    onRequest: [fastify.authenticate],
    schema: { body: uploadSchema },
  }, async (request) => {
    const { name, version, description, sourceCode, schema } = request.body;
    const { tenantId } = request;

    // 1. Validate TypeScript syntax
    try {
      await esbuild.transform(sourceCode, {
        loader: 'ts',
        target: 'es2020',
      });
    } catch (error) {
      throw fastify.httpErrors.badRequest(
        `TypeScript compilation failed: ${error.message}`
      );
    }

    // 2. Bundle the code
    const bundleResult = await esbuild.build({
      stdin: {
        contents: sourceCode,
        loader: 'ts',
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'esm',
      external: ['@q1k-oss/behaviour-tree-workflows', '@temporalio/workflow'],
      write: false,
    });

    const bundleCode = bundleResult.outputFiles[0].text;

    // 3. Upload bundle to GCS
    const bundlePath = `${tenantId}/custom-nodes/${name}/${version}/bundle.js`;
    const file = bucket.file(bundlePath);

    await file.save(bundleCode, {
      contentType: 'application/javascript',
      metadata: {
        tenantId,
        nodeName: name,
        version,
      },
    });

    const bundleUrl = `gs://${process.env.GCS_BUCKET}/${bundlePath}`;

    // 4. Save metadata to database
    const [customNode] = await fastify.db
      .insert(schema.customNodes)
      .values({
        tenantId,
        name,
        version,
        description,
        sourceCode,
        bundleUrl,
        schema,
        status: 'draft',
        createdBy: request.user.id,
      })
      .returning();

    return { customNode };
  });

  // List custom nodes
  fastify.get('/custom-nodes', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const { tenantId } = request;

    const nodes = await fastify.db
      .select()
      .from(schema.customNodes)
      .where(eq(schema.customNodes.tenantId, tenantId))
      .orderBy(desc(schema.customNodes.createdAt));

    return { nodes };
  });

  // Activate custom node (make available in workflows)
  fastify.post('/custom-nodes/:id/activate', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const { id } = request.params;
    const { tenantId } = request;

    const [node] = await fastify.db
      .update(schema.customNodes)
      .set({ status: 'active' })
      .where(and(
        eq(schema.customNodes.id, id),
        eq(schema.customNodes.tenantId, tenantId)
      ))
      .returning();

    return { node, message: 'Custom node activated' };
  });
};
```

### Worker Integration

```typescript
// worker/src/custom-node-loader.ts
import { Storage } from '@google-cloud/storage';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const storage = new Storage();
const bucket = storage.bucket(process.env.GCS_BUCKET!);

export class CustomNodeLoader {
  private cache = new Map<string, any>();

  async loadCustomNode(
    tenantId: string,
    nodeName: string,
    version: string
  ): Promise<any> {
    const cacheKey = `${tenantId}:${nodeName}:${version}`;

    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Download bundle from GCS
    const bundlePath = `${tenantId}/custom-nodes/${nodeName}/${version}/bundle.js`;
    const localPath = join('/tmp', 'custom-nodes', bundlePath);

    const file = bucket.file(bundlePath);
    await file.download({ destination: localPath });

    // Dynamic import
    const module = await import(localPath);
    const NodeClass = module.default || module[nodeName];

    if (!NodeClass) {
      throw new Error(`Node class not found in bundle: ${nodeName}`);
    }

    // Cache for future use
    this.cache.set(cacheKey, NodeClass);

    return NodeClass;
  }

  clearCache() {
    this.cache.clear();
  }
}
```

```typescript
// worker/src/workflows/yaml-workflow.ts
import {
  BehaviorTree,
  Registry,
  registerStandardNodes,
  loadTreeFromYaml,
} from '@q1k-oss/behaviour-tree-workflows';
import { CustomNodeLoader } from '../custom-node-loader';

const customNodeLoader = new CustomNodeLoader();

export async function yamlWorkflow(args: YamlWorkflowArgs) {
  const { tenantId } = args.metadata;

  // 1. Setup registry with standard nodes
  const registry = new Registry();
  registerStandardNodes(registry);

  // 2. Load custom nodes for this tenant
  const customNodes = await fetchCustomNodes(tenantId);

  for (const node of customNodes) {
    const NodeClass = await customNodeLoader.loadCustomNode(
      tenantId,
      node.name,
      node.version
    );

    registry.register(node.name, NodeClass, {
      category: 'action',  // or from node metadata
    });
  }

  // 3. Parse YAML and execute
  const root = loadTreeFromYaml(args.yamlContent, registry);
  const tree = new BehaviorTree(root);
  return tree.toWorkflow()(args);
}

async function fetchCustomNodes(tenantId: string) {
  // Fetch from database (cached via worker startup)
  // In production, cache this with TTL
  return []; // TODO: implement
}
```

### YAML Usage

Once uploaded and activated, use like built-in nodes:

```yaml
type: Sequence
id: notification-workflow
children:
  # Custom node uploaded by tenant
  - type: SendSlackMessage
    id: notify-slack
    props:
      channel: "#alerts"
      message: "Order {{orderId}} received!"

  # Another custom node
  - type: CreateJiraTicket
    id: create-ticket
    props:
      project: "OPS"
      summary: "New order: {{orderId}}"
      description: "Customer: {{customerEmail}}"
```

### Example Custom Node Source

```typescript
// User uploads this TypeScript code
import { ActionNode } from '@q1k-oss/behaviour-tree-workflows';
import { proxyActivities } from '@temporalio/workflow';
import type { NodeStatus, TemporalContext } from '@q1k-oss/behaviour-tree-workflows';

interface SlackActivities {
  sendSlackMessage(channel: string, message: string): Promise<void>;
}

const activities = proxyActivities<SlackActivities>({
  startToCloseTimeout: '30s',
});

export default class SendSlackMessage extends ActionNode {
  private channel: string;
  private message: string;

  constructor(config: any) {
    super(config);
    this.channel = config.channel;
    this.message = config.message;
  }

  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    try {
      // Resolve template variables
      const resolvedMessage = this.resolveVariables(
        this.message,
        context.blackboard.toJSON()
      );

      // Call activity
      await activities.sendSlackMessage(this.channel, resolvedMessage);

      return NodeStatus.SUCCESS;
    } catch (error) {
      this._lastError = `Slack message failed: ${error.message}`;
      return NodeStatus.FAILURE;
    }
  }

  private resolveVariables(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return context[key] || '';
    });
  }
}
```

### Security Considerations

**Code Review Required**:
- Manual approval before activation (Week 9 feature)
- Automated scanning for malicious patterns
- Rate limiting on custom node executions

**Isolation**:
- Per-tenant node registry (tenant A can't use tenant B's nodes)
- Separate GCS paths per tenant
- Worker cache isolation

**Versioning**:
- Immutable versions (can't modify v1.0.0 once deployed)
- Workflows pin to specific versions
- Deprecation warnings for old versions

---

## Phase 3: Full SDK (Week 9-12)

### Local Development

```bash
# Install SDK
npm install -g @q1k-oss/workflow-sdk

# Create new custom node
workflow-sdk init SendSlackMessage

# Generated template:
# src/
#   send-slack-message.ts
#   send-slack-message.test.ts
#   send-slack-message.schema.ts
```

### CLI Commands

```bash
# Test locally
workflow-sdk test

# Validate
workflow-sdk validate

# Upload to platform
workflow-sdk deploy --tenant mycompany
```

### Marketplace

- Browse community nodes
- One-click install
- Reviews and ratings
- Verified publishers

---

## Comparison: Interpreter vs Custom Nodes

| Feature | Interpreter Nodes | Custom Node Uploads |
|---------|------------------|---------------------|
| **Ease of Use** | ✅ Very easy (paste code) | ⚠️ Requires TypeScript |
| **Performance** | ⚠️ Subprocess overhead | ✅ Native performance |
| **Type Safety** | ❌ No validation | ✅ Full TypeScript |
| **Reusability** | ❌ Copy-paste | ✅ Import in any workflow |
| **Versioning** | ❌ Manual | ✅ Semver |
| **Best For** | Quick scripts, data transforms | Reusable integrations, complex logic |

---

## Recommended Approach for MVP

**Week 1-4 (MVP)**:
- Ship with 32 built-in nodes
- Document Python/JavaScript interpreter pattern
- No custom uploads yet

**Week 5-6 (Phase 2A)**:
- Add PythonInterpreter and JavaScriptInterpreter nodes
- Sandboxed execution
- Allow inline scripts in YAML

**Week 7-8 (Phase 2B)**:
- Enable custom node uploads
- Basic UI for upload
- No marketplace yet

**Week 9-12 (Phase 3)**:
- Full SDK
- CLI tools
- Marketplace

This gives you a **production platform in 4 weeks** and custom nodes in **8 weeks**.

---

## Next Steps

1. **Decide on Phase 2A timeline**: Do you need interpreters for MVP, or can you wait until Week 5?

2. **Activity implementations**: Which integrations do you want built-in?
   - Slack, Discord, email?
   - Database (Postgres, MySQL, MongoDB)?
   - AI (OpenAI, Anthropic)?

3. **Sandboxing approach**: Docker containers or simple subprocess?

Let me know and I can provide detailed implementation for any of these phases!
