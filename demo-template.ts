/**
 * Demo: Using GoogleSheets.InsertRow Template
 *
 * This demonstrates using templates for friendly Google Sheets integration.
 * The template handles data transformation automatically.
 */

import {
  Registry,
  registerStandardNodes,
  loadTreeFromYaml,
  loadTemplatesFromDirectory,
  ScopedBlackboard,
  NodeStatus,
} from "./src/index.js";
import type { IntegrationContext, TokenProvider } from "./src/integrations/integration-action.js";
import * as path from "path";

// Token provider that fetches from controlplane
const controlplaneTokenProvider: TokenProvider = async (context, provider) => {
  const integrationContext = context as IntegrationContext;

  const response = await fetch("http://localhost:5001/internal/integrations/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": process.env.INTERNAL_API_KEY || "dev-internal-key-12345",
    },
    body: JSON.stringify({
      tenantId: integrationContext.tenantId,
      userId: integrationContext.userId,
      providerName: provider,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get token: ${error}`);
  }

  const data = await response.json() as { accessToken: string };
  return { access_token: data.accessToken };
};

async function main() {
  console.log("===========================================");
  console.log("  Google Sheets Template Demo");
  console.log("===========================================\n");

  // 1. Setup registry with standard nodes
  const registry = new Registry();
  registerStandardNodes(registry);

  // 2. Load templates
  console.log("Loading templates...\n");
  const templatesDir = path.join(import.meta.dirname, "templates/google-sheets");
  await loadTemplatesFromDirectory(registry, {
    templatesDir,
    idPrefix: "GoogleSheets."
  });

  // 3. Create context
  const blackboard = new ScopedBlackboard();
  const context: IntegrationContext = {
    blackboard,
    treeRegistry: registry,
    timestamp: Date.now(),
    deltaTime: 0,
    tokenProvider: controlplaneTokenProvider,
    tenantId: process.env.DEV_TENANT_ID || "00000000-0000-0000-0000-000000000000",
    userId: process.env.DEV_USER_ID || "00000000-0000-0000-0000-000000000001",
  };

  // 4. First, create a spreadsheet (direct action)
  console.log("Step 1: Creating spreadsheet...\n");

  const timestamp = new Date().toISOString().slice(0, 19);
  const createYaml = `
type: IntegrationAction
id: create-sheet
props:
  provider: google
  action: create-spreadsheet
  inputs:
    title: "Template Demo - ${timestamp}"
    sheetName: "Orders"
`;

  const createNode = loadTreeFromYaml(createYaml, registry);
  const createStatus = await createNode.tick(context);

  if (createStatus !== NodeStatus.SUCCESS) {
    console.log("Failed to create spreadsheet:", createNode.lastError);
    return;
  }

  const createResult = blackboard.get("create-sheet.result") as { id?: string };
  const spreadsheetId = createResult?.id;
  console.log(`Created spreadsheet: ${spreadsheetId}`);
  console.log(`URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}\n`);

  // 5. Use TEMPLATE to insert rows with friendly syntax
  // The template reads from _tpl.* keys, transforms, and calls IntegrationAction
  console.log("Step 2: Inserting rows using template...\n");

  // Build workflow that uses SubTree to call template
  // Each insert: set _tpl.* inputs → call SubTree → template executes
  const insertYaml = `
type: Sequence
id: insert-orders
children:
  # --- Insert Header Row ---
  - type: CodeExecution
    id: set-header-inputs
    props:
      language: javascript
      code: |
        setBB('tpl_spreadsheet', '${spreadsheetId}');
        setBB('tpl_sheet', 0);
        setBB('tpl_values', ['Order ID', 'Customer', 'Amount', 'Status']);

  - type: SubTree
    id: insert-header
    props:
      treeId: "GoogleSheets.insert-row"

  - type: LogMessage
    id: log-header-done
    props:
      message: "Header row inserted"
      level: info

  # --- Insert Data Row 1 ---
  - type: CodeExecution
    id: set-row1-inputs
    props:
      language: javascript
      code: |
        setBB('tpl_spreadsheet', '${spreadsheetId}');
        setBB('tpl_sheet', 0);
        setBB('tpl_values', {
          'Order ID': 'ORD-001',
          'Customer': 'John Doe',
          'Amount': '99.99',
          'Status': 'Completed'
        });

  - type: SubTree
    id: insert-row-1
    props:
      treeId: "GoogleSheets.insert-row"

  - type: LogMessage
    id: log-row1-done
    props:
      message: "Row 1 inserted"
      level: info

  # --- Insert Data Row 2 ---
  - type: CodeExecution
    id: set-row2-inputs
    props:
      language: javascript
      code: |
        setBB('tpl_spreadsheet', '${spreadsheetId}');
        setBB('tpl_sheet', 0);
        setBB('tpl_values', {
          'Order ID': 'ORD-002',
          'Customer': 'Jane Smith',
          'Amount': '149.50',
          'Status': 'Pending'
        });

  - type: SubTree
    id: insert-row-2
    props:
      treeId: "GoogleSheets.insert-row"

  - type: LogMessage
    id: log-row2-done
    props:
      message: "Row 2 inserted"
      level: info
`;

  const insertNode = loadTreeFromYaml(insertYaml, registry);
  const insertStatus = await insertNode.tick(context);

  if (insertStatus === NodeStatus.SUCCESS) {
    console.log("\nAll rows inserted successfully!\n");
  } else {
    console.log("\nRow insertion failed:", insertNode.lastError);
  }

  // 6. Summary
  console.log("===========================================");
  console.log("  Demo Complete!");
  console.log("===========================================");
  console.log(`\nSpreadsheet: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  console.log("\nWhat we demonstrated:");
  console.log("  - Template loaded from YAML file");
  console.log("  - Friendly input format (object with column names)");
  console.log("  - Template transformed to Active Pieces format");
  console.log("  - SubTree for reusable workflow execution");
  console.log("  - LogMessage for debugging");
}

main().catch(console.error);
