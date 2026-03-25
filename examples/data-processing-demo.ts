/**
 * Data Processing Nodes Demo
 *
 * Demonstrates the 5 new data processing nodes (ArrayFilter, Aggregate,
 * MathOp, ThresholdCheck, DataTransform) by running Shopify monitoring
 * templates with mock data — no Shopify connection needed.
 *
 * Run: npx tsx examples/data-processing-demo.ts
 */

import {
  Registry,
  registerStandardNodes,
  ScopedBlackboard,
  NodeStatus,
  type TemporalContext,
} from "../src/index.js";

// --- Mock Shopify Data ---

const mockProducts = [
  {
    id: "prod_1",
    title: "Classic T-Shirt",
    variants: [
      { id: "var_1a", sku: "TSH-S", title: "Small", inventory_quantity: 0 },
      { id: "var_1b", sku: "TSH-M", title: "Medium", inventory_quantity: 5 },
      { id: "var_1c", sku: "TSH-L", title: "Large", inventory_quantity: 25 },
    ],
  },
  {
    id: "prod_2",
    title: "Premium Hoodie",
    variants: [
      { id: "var_2a", sku: "HOD-S", title: "Small", inventory_quantity: 3 },
      { id: "var_2b", sku: "HOD-M", title: "Medium", inventory_quantity: 0 },
      { id: "var_2c", sku: "HOD-L", title: "Large", inventory_quantity: 50 },
    ],
  },
  {
    id: "prod_3",
    title: "Running Shoes",
    variants: [
      { id: "var_3a", sku: "SHO-8", title: "Size 8", inventory_quantity: 100 },
      { id: "var_3b", sku: "SHO-9", title: "Size 9", inventory_quantity: 8 },
    ],
  },
];

const now = Date.now();
const mockOrders = [
  { id: "ord_1", total_price: "89.99", financial_status: "paid", fulfillment_status: null, created_at_ms: now - 20 * 60 * 1000, shipping_carrier: "ups", pending_hours: 4 },
  { id: "ord_2", total_price: "149.99", financial_status: "paid", fulfillment_status: null, created_at_ms: now - 40 * 60 * 1000, shipping_carrier: "fedex", pending_hours: 15 },
  { id: "ord_3", total_price: "29.99", financial_status: "pending", fulfillment_status: "unfulfilled", created_at_ms: now - 90 * 60 * 1000, shipping_carrier: "ups", pending_hours: 8 },
  { id: "ord_4", total_price: "199.99", financial_status: "paid", fulfillment_status: "fulfilled", created_at_ms: now - 50 * 60 * 1000, shipping_carrier: "fedex", pending_hours: 0 },
  { id: "ord_5", total_price: "59.99", financial_status: "refunded", fulfillment_status: null, created_at_ms: now - 120 * 60 * 1000, shipping_carrier: "ups", pending_hours: 20 },
];

// --- Helpers ---

function createContext(bb: ScopedBlackboard, reg: Registry): TemporalContext {
  return { blackboard: bb, timestamp: Date.now(), deltaTime: 0, treeRegistry: reg };
}

function header(title: string) {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function printBB(bb: ScopedBlackboard, keys: string[]) {
  for (const key of keys) {
    const val = bb.get(key);
    console.log(`  ${key}: ${JSON.stringify(val, null, 2)}`);
  }
}

// --- Demo ---

async function main() {
  const registry = new Registry();
  registerStandardNodes(registry);

  // =============================
  // Demo 1: Order Volume Pipeline
  // =============================
  header("Demo 1: Order Volume Pipeline (ArrayFilter → Aggregate → MathOp → DataTransform)");

  const bb1 = new ScopedBlackboard("order-vol");
  const ctx1 = createContext(bb1, registry);

  // Simulate IntegrationAction output
  bb1.set("recentOrders", mockOrders);
  bb1.set("lookbackMinutes", 60);
  bb1.set("nowTimestamp", now);

  // Step 1: Compute cutoff
  const cutoff = registry.create("MathOp", {
    id: "compute-cutoff",
    expression: "${bb.nowTimestamp} - ${bb.lookbackMinutes} * 60 * 1000",
    outputKey: "cutoffTimestamp",
  });
  await cutoff.tick(ctx1);

  // Step 2: Filter recent orders
  const filter = registry.create("ArrayFilter", {
    id: "filter-recent",
    input: "${bb.recentOrders}",
    outputKey: "windowOrders",
    conditions: [{ field: "created_at_ms", operator: "gte", value: "${bb.cutoffTimestamp}" }],
  });
  await filter.tick(ctx1);
  console.log(`  Filtered: ${mockOrders.length} → ${(bb1.get("windowOrders") as any[]).length} orders in window`);

  // Step 3: Aggregate
  const agg = registry.create("Aggregate", {
    id: "order-stats",
    input: "${bb.windowOrders}",
    outputKey: "orderStats",
    operations: [
      { type: "count", as: "orderCount" },
      { type: "sum", field: "total_price", as: "totalRevenue" },
    ],
  });
  await agg.tick(ctx1);

  // Step 4: Group by status
  const groupBy = registry.create("Aggregate", {
    id: "status-breakdown",
    input: "${bb.windowOrders}",
    outputKey: "statusBreakdown",
    groupBy: "financial_status",
    operations: [{ type: "count" }],
  });
  await groupBy.tick(ctx1);

  // Step 5: Compute rate
  const rate = registry.create("MathOp", {
    id: "compute-rate",
    expression: "${bb.orderStats.orderCount} / (${bb.lookbackMinutes} / 60)",
    outputKey: "hourlyRate",
    round: "round",
    precision: 1,
  });
  await rate.tick(ctx1);

  // Step 6: Build snapshot
  const snapshot = registry.create("DataTransform", {
    id: "build-snapshot",
    outputKey: "snapshotData",
    wrapInArray: true,
    mappings: [
      { target: "metricName", value: "order_volume_hourly" },
      { target: "value", value: "${bb.hourlyRate}" },
      { target: "source", value: "computed" },
      { target: "context_json.orderCount", value: "${bb.orderStats.orderCount}" },
      { target: "context_json.totalRevenue", value: "${bb.orderStats.totalRevenue}" },
      { target: "context_json.statusBreakdown", value: "${bb.statusBreakdown}" },
    ],
  });
  await snapshot.tick(ctx1);

  printBB(bb1, ["orderStats", "statusBreakdown", "hourlyRate", "snapshotData"]);

  // ================================
  // Demo 2: Carrier Delay Pipeline
  // ================================
  header("Demo 2: Carrier Delay Pipeline (ArrayFilter → Aggregate groupBy)");

  const bb2 = new ScopedBlackboard("carrier");
  const ctx2 = createContext(bb2, registry);
  bb2.set("customerOrders", mockOrders);
  bb2.set("thresholdHours", 12);

  // Filter unfulfilled
  const filterUnfulfilled = registry.create("ArrayFilter", {
    id: "filter-unfulfilled",
    input: "${bb.customerOrders}",
    outputKey: "unfulfilledOrders",
    conditions: [{ field: "fulfillment_status", operator: "in", value: [null, "unfulfilled"] }],
  });
  await filterUnfulfilled.tick(ctx2);
  console.log(`  Unfulfilled: ${(bb2.get("unfulfilledOrders") as any[]).length} orders`);

  // Aggregate by carrier
  const carrierAgg = registry.create("Aggregate", {
    id: "carrier-stats",
    input: "${bb.unfulfilledOrders}",
    outputKey: "carrierStats",
    groupBy: "shipping_carrier",
    operations: [
      { type: "count", as: "totalOrders" },
      { type: "avg", field: "pending_hours", as: "avgPendingHours" },
      { type: "max", field: "pending_hours", as: "maxPendingHours" },
    ],
  });
  await carrierAgg.tick(ctx2);

  // Filter delayed
  const filterDelayed = registry.create("ArrayFilter", {
    id: "filter-delayed",
    input: "${bb.unfulfilledOrders}",
    outputKey: "delayedOrders",
    conditions: [{ field: "pending_hours", operator: "gt", value: "${bb.thresholdHours}" }],
  });
  await filterDelayed.tick(ctx2);
  console.log(`  Delayed (>${bb2.get("thresholdHours")}h): ${(bb2.get("delayedOrders") as any[]).length} orders`);

  printBB(bb2, ["carrierStats"]);

  // ====================================
  // Demo 3: Inventory Threshold Pipeline
  // ====================================
  header("Demo 3: Inventory ThresholdCheck (classify each variant)");

  const bb3 = new ScopedBlackboard("inventory");
  const ctx3 = createContext(bb3, registry);
  bb3.set("lowStockThreshold", 10);

  const results: Array<{ sku: string; qty: number; status: string }> = [];

  for (const product of mockProducts) {
    for (const variant of product.variants) {
      bb3.set("currentVariant", variant);
      bb3.set("currentProduct", product);

      const check = registry.create("ThresholdCheck", {
        id: "check-stock",
        value: "${bb.currentVariant.inventory_quantity}",
        thresholds: [
          { operator: "lte", value: 0, label: "out_of_stock" },
          { operator: "lte", value: "${bb.lowStockThreshold}", label: "low_stock" },
        ],
        outputKey: "stockStatus",
      });
      await check.tick(ctx3);

      results.push({
        sku: variant.sku,
        qty: variant.inventory_quantity,
        status: bb3.get("stockStatus") as string,
      });
    }
  }

  console.log("\n  Variant Classification:");
  for (const r of results) {
    const icon = r.status === "out_of_stock" ? "X" : r.status === "low_stock" ? "!" : " ";
    console.log(`    [${icon}] ${r.sku.padEnd(8)} qty=${String(r.qty).padStart(4)}  → ${r.status}`);
  }

  const outOfStock = results.filter(r => r.status === "out_of_stock").length;
  const lowStock = results.filter(r => r.status === "low_stock").length;
  const healthy = results.filter(r => r.status === "normal").length;
  console.log(`\n  Summary: ${outOfStock} out_of_stock, ${lowStock} low_stock, ${healthy} healthy`);

  // ====================================
  // Summary
  // ====================================
  header("Summary");
  console.log("  All 3 pipelines ran with zero CodeExecution.");
  console.log("  Nodes used: ArrayFilter, Aggregate, MathOp, ThresholdCheck, DataTransform");
  console.log("  Templates are now 100% declarative YAML — LLM-authorable.");
  console.log("");
}

main().catch(console.error);
