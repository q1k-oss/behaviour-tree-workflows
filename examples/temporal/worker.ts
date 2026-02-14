/**
 * Temporal Worker
 * Registers and runs behavior tree workflows with activity support
 */

import { NativeConnection, Worker, bundleWorkflowCode } from "@temporalio/worker";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Import activities
import * as activities from "./activities.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function run() {
  console.log("🚀 Starting Temporal worker for behavior tree workflows...");

  const connection = await NativeConnection.connect({
    address: "localhost:7233",
  });

  // Bundle workflows ahead of time with better control
  console.log("📦 Bundling workflows...");
  const { code } = await bundleWorkflowCode({
    workflowsPath: join(__dirname, "workflows.ts"),
    // Ignore modules that are used by behaviour-tree but not needed in workflow context
    // Note: 'vm' is used by js-interpreter but not at runtime in the workflow
    ignoreModules: ["fs", "fs/promises", "path", "vm"],
    webpackConfigHook: (config) => {
      config.target = "webworker";
      if (config.output) {
        config.output.publicPath = "";
        config.output.globalObject = "globalThis";
      }
      // Force single bundle without code splitting
      config.optimization = {
        minimize: false,
        splitChunks: false,
        runtimeChunk: false,
      };
      return config;
    },
  });

  console.log("✅ Workflows bundled successfully");

  const worker = await Worker.create({
    connection,
    namespace: "default",
    workflowBundle: { code },
    taskQueue: "behaviour-tree-workflows",
    activities, // Register activity implementations
  });

  console.log("✅ Worker started successfully!");
  console.log("📋 Task Queue: behaviour-tree-workflows");
  console.log("🔄 Listening for workflow tasks...\n");

  await worker.run();
}

run().catch((err) => {
  console.error("❌ Worker error:", err);
  process.exit(1);
});
