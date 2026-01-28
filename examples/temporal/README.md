# Temporal Activity Test

This directory contains examples for running btree workflows with Temporal, including activity execution for I/O operations.

## Prerequisites

1. **Temporal Server** - Running locally on `localhost:7233`
   ```bash
   # Option 1: Use Temporal CLI (recommended for testing)
   brew install temporal
   temporal server start-dev

   # Option 2: Use Docker
   docker-compose up -d
   ```

2. **Build btree** - The dist folder must be built
   ```bash
   cd /path/to/btree
   npm run build
   ```

## Running the Test

### 1. Start the Worker (Terminal 1)

```bash
cd /path/to/btree/examples/temporal

# For mock activities (no real API calls)
BTREE_MOCK_ACTIVITIES=true npx tsx worker.ts

# For real activities (requires actual credentials)
# GOOGLE_SHEETS_ACCESS_TOKEN=xxx npx tsx worker.ts
```

You should see:
```
🚀 Starting Temporal worker for behavior tree workflows...
📦 Bundling workflows...
✅ Workflows bundled successfully
✅ Worker started successfully!
📋 Task Queue: btree-workflows
🔄 Listening for workflow tasks...
```

### 2. Run the Client (Terminal 2)

```bash
cd /path/to/btree/examples/temporal
npx tsx client.ts
```

You should see:
```
🔌 Connecting to Temporal server at localhost:7233...
✅ Connected to Temporal server

============================================================
Workflow: Activity Test (IntegrationAction via Activity)
============================================================
✅ Result: { status: 'SUCCESS', output: { ... } }
```

## What's Being Tested

The activity test workflow (`06-activity-test.yaml`) demonstrates:

1. **IntegrationAction with Activities** - The `IntegrationAction` node uses `context.activities.executePieceAction` instead of inline execution, making it deterministic for Temporal replay.

2. **Mock Token Provider** - The `yaml-workflow-loader.ts` includes a mock token provider for testing without real OAuth credentials.

3. **Mock Activity Responses** - When `BTREE_MOCK_ACTIVITIES=true`, activities return simulated responses instead of making real API calls.

## Files

| File | Description |
|------|-------------|
| `worker.ts` | Temporal worker that registers workflows and activities |
| `client.ts` | Client that executes workflows |
| `activities.ts` | Activity implementations (run outside workflow sandbox) |
| `yaml-workflow-loader.ts` | Workflow that loads YAML and passes activities to btree |
| `workflows.ts` | Re-exports workflows for Temporal bundler |

## Activity Flow

```
Client                Worker (Workflow)              Worker (Activity)
  |                         |                              |
  | execute(workflow)       |                              |
  |------------------------>|                              |
  |                         |                              |
  |                         | IntegrationAction.tick()     |
  |                         |   -> context.activities      |
  |                         |      .executePieceAction()   |
  |                         |                              |
  |                         |----------- activity -------->|
  |                         |                              |
  |                         |                              | executePieceActionActivity()
  |                         |                              |   -> executePieceAction()
  |                         |                              |   -> API call (or mock)
  |                         |                              |
  |                         |<---------- result -----------|
  |                         |                              |
  |                         | Store result in blackboard   |
  |                         |                              |
  |<-- WorkflowResult ------|                              |
```

## Node Behavior Summary

| Node | Activity Required | Standalone Fallback |
|------|-------------------|---------------------|
| `IntegrationAction` | Optional | Yes (inline execution) |
| `PythonScript` | **Required** | No (needs Python worker) |
| `ParseFile` | **Required** | No (needs file I/O) |
| `GenerateFile` | **Required** | No (needs file I/O) |
