/**
 * Demo: Runtime Variables & Input Parameters
 *
 * This demo showcases the unified variable resolution system:
 *
 * Variable Syntax:
 * - ${input.key}  - Workflow input parameters (immutable)
 * - ${bb.key}     - Blackboard values (mutable runtime state)
 * - ${env.KEY}    - Environment variables
 * - ${param.key}  - Test data parameters
 * - ${key}        - Shorthand for ${bb.key} (backward compatible)
 *
 * Script Node Proxies:
 * - $input.key    - Read-only workflow input
 * - $env.KEY      - Read-only allowed environment variables
 * - $bb.key       - Read/write blackboard
 *
 * SubTree Parameters:
 * - params: {}    - Values passed to subtree (supports variable resolution)
 * - outputs: []   - Keys exported back to parent after execution
 *
 * Run with:
 *   TAX_RATE=0.10 BASE_DISCOUNT=0.05 npx tsx demo-runtime-variables.ts
 */

import * as fs from "fs";
import * as path from "path";
import {
  Registry,
  registerStandardNodes,
  loadTreeFromYaml,
  BehaviorTree,
  NodeStatus,
} from "./src/index.js";

async function main() {
  console.log("=".repeat(60));
  console.log("  Runtime Variables & Input Parameters Demo");
  console.log("=".repeat(60));
  console.log();

  // Show environment configuration
  console.log("Environment Configuration:");
  console.log(`  TAX_RATE:      ${process.env.TAX_RATE || "0.08 (default)"}`);
  console.log(`  BASE_DISCOUNT: ${process.env.BASE_DISCOUNT || "0 (default)"}`);
  console.log();

  // 1. Setup registry
  const registry = new Registry();
  registerStandardNodes(registry);

  // 2. Load YAML workflow files from workflows/ directory
  const workflowsDir = path.join(import.meta.dirname, "workflows");
  console.log(`Loading workflows from: ${workflowsDir}`);
  console.log();

  // Load order-processor subtree
  const orderProcessorYaml = fs.readFileSync(
    path.join(workflowsDir, "order-processor.yaml"),
    "utf-8"
  );
  const orderProcessorTree = loadTreeFromYaml(orderProcessorYaml, registry);
  const orderProcessorBT = new BehaviorTree(orderProcessorTree);
  registry.registerTree("order-processor", orderProcessorBT, "order-processor.yaml");
  console.log("  Loaded: order-processor.yaml (SubTree)");

  // Load main workflow
  const mainWorkflowYaml = fs.readFileSync(
    path.join(workflowsDir, "process-order-workflow.yaml"),
    "utf-8"
  );
  const mainWorkflowTree = loadTreeFromYaml(mainWorkflowYaml, registry);
  const mainWorkflowBT = new BehaviorTree(mainWorkflowTree);
  console.log("  Loaded: process-order-workflow.yaml (Main)");
  console.log();

  // 3. Convert to workflow function (Temporal-compatible)
  const workflow = mainWorkflowBT.toWorkflow();

  // 4. Define workflow input (passed at runtime)
  const workflowInput = {
    orderId: "ORD-2024-0042",
    customerId: "CUST-001", // John Doe - gold tier
    items: [
      { name: "Widget Pro", price: 49.99, quantity: 2 },
      { name: "Gadget Plus", price: 29.99, quantity: 1 },
      { name: "Super Cable", price: 9.99, quantity: 3 },
    ],
  };

  console.log("Workflow Input:");
  console.log(`  orderId:    ${workflowInput.orderId}`);
  console.log(`  customerId: ${workflowInput.customerId}`);
  console.log(`  items:      ${workflowInput.items.length} items`);
  for (const item of workflowInput.items) {
    console.log(`    - ${item.name}: $${item.price} x ${item.quantity}`);
  }
  console.log();

  // 5. Execute workflow
  console.log("-".repeat(60));
  console.log("Workflow Execution:");
  console.log("-".repeat(60));
  console.log();

  const result = await workflow({
    input: workflowInput,
    treeRegistry: registry,
    sessionId: "demo-session-001",
  });

  console.log();
  console.log("-".repeat(60));
  console.log("Workflow Result:");
  console.log("-".repeat(60));
  console.log();

  console.log(`Status: ${result.status}`);
  console.log();

  if (result.status === NodeStatus.SUCCESS) {
    const output = result.output;

    console.log("Customer:");
    const customer = output.customer as Record<string, unknown>;
    console.log(`  Name:  ${customer?.name}`);
    console.log(`  Email: ${customer?.email}`);
    console.log(`  Tier:  ${customer?.tier}`);
    console.log();

    console.log("Order Result (from SubTree):");
    const orderResult = output.orderResult as Record<string, unknown>;
    console.log(`  Order ID:   ${orderResult?.orderId}`);
    console.log(`  Items:      ${orderResult?.itemCount}`);
    console.log(`  Subtotal:   $${orderResult?.subtotal}`);
    console.log(`  Tax Rate:   ${((orderResult?.taxRate as number) * 100).toFixed(0)}%`);
    console.log(`  Tax:        $${orderResult?.tax}`);
    console.log(`  Total:      $${orderResult?.total}`);
    console.log();

    console.log("Final Order (with discount):");
    const finalOrder = output.finalOrder as Record<string, unknown>;
    console.log(`  Discount:   ${finalOrder?.discountPercent}% (${customer?.tier} tier + base)`);
    console.log(`  Savings:    $${finalOrder?.discountAmount}`);
    console.log(`  Final:      $${finalOrder?.finalTotal}`);
    console.log();

    console.log("Notification:");
    const notification = output.notification as Record<string, unknown>;
    console.log(`  To:      ${notification?.to}`);
    console.log(`  Subject: ${notification?.subject}`);
    console.log(`  Sent:    ${notification?.sentAt}`);
  }

  console.log();
  console.log("=".repeat(60));
  console.log("  Demo Complete!");
  console.log("=".repeat(60));
  console.log();
  console.log("Key Features Demonstrated:");
  console.log("  1. YAML workflows loaded from files (production-like)");
  console.log("  2. ${input.key} - Immutable workflow input parameters");
  console.log("  3. ${bb.key} - Mutable blackboard state");
  console.log("  4. ${env.KEY} - Environment variable access");
  console.log("  5. SubTree params - Pass values to subtrees with resolution");
  console.log("  6. SubTree outputs - Export values back to parent");
  console.log("  7. Script $input/$env/$bb - Full access in JavaScript");
  console.log("  8. allowedEnvVars - Security-conscious env access");
  console.log();
  console.log("Try with different env vars:");
  console.log("  TAX_RATE=0.15 BASE_DISCOUNT=0.10 npx tsx demo-runtime-variables.ts");
}

main().catch(console.error);
