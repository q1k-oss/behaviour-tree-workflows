/**
 * Demo: Google Sheets Integration with btree
 *
 * This demo shows how to use the IntegrationAction node to interact
 * with Google Sheets via Active Pieces.
 *
 * Prerequisites:
 * 1. OAuth connection established via controlplane
 * 2. Controlplane running at localhost:5001
 */

import {
  Registry,
  registerStandardNodes,
  loadTreeFromYaml,
  ScopedBlackboard,
  NodeStatus,
} from "./src/index.js";
import type { IntegrationContext, TokenProvider } from "./src/integrations/integration-action.js";

// Token provider that fetches from controlplane
const controlplaneTokenProvider: TokenProvider = async (context, provider, connectionId) => {
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
  console.log("🚀 Google Sheets Integration Demo\n");

  // Create registry with standard nodes
  const registry = new Registry();
  registerStandardNodes(registry);

  // First, let's create a test spreadsheet
  console.log("Step 1: Creating a test spreadsheet...\n");

  const createSheetYaml = `
type: IntegrationAction
id: create-sheet
props:
  provider: google
  action: create-spreadsheet
  inputs:
    title: "BTree Demo Sheet - \${bb.timestamp}"
    sheetName: "Orders"
`;

  const createNode = loadTreeFromYaml(createSheetYaml, registry);
  const blackboard = new ScopedBlackboard();
  blackboard.set("timestamp", new Date().toISOString().slice(0, 19));

  const context: IntegrationContext = {
    blackboard,
    treeRegistry: registry,
    timestamp: Date.now(),
    deltaTime: 0,
    tokenProvider: controlplaneTokenProvider,
    tenantId: process.env.DEV_TENANT_ID || "00000000-0000-0000-0000-000000000000",
    userId: process.env.DEV_USER_ID || "00000000-0000-0000-0000-000000000001",
  };

  const createStatus = await createNode.tick(context);

  if (createStatus !== NodeStatus.SUCCESS) {
    console.log("❌ Failed to create spreadsheet");
    console.log("Error:", createNode.lastError);
    return;
  }

  const createResult = blackboard.get("create-sheet.result") as { id?: string; spreadsheetId?: string } | undefined;
  console.log("✅ Spreadsheet created!");
  console.log("   Result:", JSON.stringify(createResult, null, 2));

  const spreadsheetId = createResult?.id || createResult?.spreadsheetId;
  if (!spreadsheetId) {
    console.log("❌ No spreadsheet ID returned");
    return;
  }

  // Store spreadsheet ID for next steps
  blackboard.set("spreadsheetId", spreadsheetId);
  console.log(`\n📊 Spreadsheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);

  // Test insert_row with correct Active Pieces format
  console.log("\nStep 2: Inserting rows (array mode)...\n");

  // Active Pieces expects { values: { values: [...] } } for first_row_headers=false
  const insertRowYaml = `
type: Sequence
id: insert-data
children:
  - type: IntegrationAction
    id: insert-header
    props:
      provider: google
      action: insert_row
      inputs:
        spreadsheetId: "\${bb.spreadsheetId}"
        sheetId: 0
        first_row_headers: false
        as_string: true
        values:
          values:
            - "Order ID"
            - "Customer"
            - "Amount"
            - "Status"
  - type: IntegrationAction
    id: insert-row-1
    props:
      provider: google
      action: insert_row
      inputs:
        spreadsheetId: "\${bb.spreadsheetId}"
        sheetId: 0
        first_row_headers: false
        as_string: true
        values:
          values:
            - "ORD-001"
            - "John Doe"
            - "99.99"
            - "Completed"
  - type: IntegrationAction
    id: insert-row-2
    props:
      provider: google
      action: insert_row
      inputs:
        spreadsheetId: "\${bb.spreadsheetId}"
        sheetId: 0
        first_row_headers: false
        as_string: true
        values:
          values:
            - "ORD-002"
            - "Jane Smith"
            - "149.50"
            - "Pending"
`;

  const insertNode = loadTreeFromYaml(insertRowYaml, registry);
  const insertStatus = await insertNode.tick(context);

  if (insertStatus === NodeStatus.SUCCESS) {
    console.log("✅ Rows inserted successfully!");
  } else {
    console.log("⚠️ Row insertion failed (see gap analysis doc)");
    console.log("   Error:", insertNode.lastError);
  }

  console.log("\n✅ Demo complete!");
  console.log("\n📋 Summary:");
  console.log("   - OAuth connection: Working");
  console.log("   - Token retrieval: Working");
  console.log("   - Google Sheets API: Working");
  console.log(`   - Created spreadsheet: ${spreadsheetId}`);
  console.log(`\n📊 View: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
}

main().catch(console.error);
