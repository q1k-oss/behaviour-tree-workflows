/**
 * Universal YAML Workflow Loader
 * Executes any YAML-defined workflow in Temporal with activity support
 */

import { proxyActivities } from "@temporalio/workflow";
import {
  BehaviorTree,
  Registry,
  registerStandardNodes,
  loadTreeFromYaml,
  type WorkflowArgs,
  type WorkflowResult,
  type BtreeActivities,
  type TokenProvider,
  type PieceAuth,
} from "../../dist/index.js";

// Import activity types for proxy creation
import type * as activitiesModule from "./activities.js";

// Create activity proxies - these route calls to the activity worker
const activities = proxyActivities<typeof activitiesModule>({
  startToCloseTimeout: "30s",
  retry: {
    maximumAttempts: 3,
  },
});

// Create the BtreeActivities object that nodes expect
const btreeActivities: BtreeActivities = {
  executePieceAction: activities.executePieceActionActivity,
  executePythonScript: activities.executePythonScriptActivity,
  parseFile: activities.parseFileActivity,
  generateFile: activities.generateFileActivity,
};

/**
 * Mock token provider for testing
 * In production, this would fetch real OAuth tokens from controlplane
 */
const mockTokenProvider: TokenProvider = async (
  _context,
  provider,
  _connectionId
): Promise<PieceAuth> => {
  // For testing, return mock tokens
  // In production, this would call controlplane to get real tokens
  console.log(`[TokenProvider] Fetching token for provider: ${provider}`);
  return {
    access_token: `mock_token_for_${provider}_${Date.now()}`,
  };
};

/**
 * Extended workflow args with YAML content
 */
export interface YamlWorkflowArgs extends WorkflowArgs {
  yamlContent: string;
}

/**
 * Universal YAML workflow executor
 * Loads and executes any YAML workflow definition
 *
 * Usage:
 * ```typescript
 * const result = await client.workflow.execute(yamlWorkflow, {
 *   args: [{
 *     input: {},
 *     treeRegistry: new Registry(),
 *     yamlContent: readFileSync('./my-workflow.yaml', 'utf-8')
 *   }]
 * });
 * ```
 */
export async function yamlWorkflow(
  args: YamlWorkflowArgs,
): Promise<WorkflowResult> {
  if (!args.yamlContent) {
    throw new Error("yamlContent is required in workflow arguments");
  }

  // Create registry and register all standard built-in nodes
  const registry = new Registry();
  registerStandardNodes(registry);

  // Users can register custom nodes here:
  // registry.register("MyCustomNode", MyCustomNode, { category: "action" });

  // Parse and validate YAML
  const root = loadTreeFromYaml(args.yamlContent, registry);

  // Convert to Temporal workflow
  const tree = new BehaviorTree(root);
  const workflow = tree.toWorkflow();

  // Execute with original args (without yamlContent), activities, and tokenProvider
  return workflow({
    input: args.input,
    treeRegistry: args.treeRegistry,
    activities: btreeActivities,
    tokenProvider: mockTokenProvider,
  });
}
