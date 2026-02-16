/**
 * GitHubAction Node
 *
 * Executes deterministic GitHub operations via a Temporal activity.
 * This node requires the `githubAction` activity to be configured in the context -
 * it does not support standalone/inline execution because GitHub API access requires
 * capabilities outside the workflow sandbox.
 *
 * Features:
 * - 10 supported operations (branches, PRs, reviews, issues, releases)
 * - Variable resolution in repo and params
 * - Auth handled at activity layer — no tokens in YAML
 * - Result stored in blackboard
 *
 * @example YAML - Create a PR
 * ```yaml
 * type: GitHubAction
 * id: create-pr
 * props:
 *   operation: createPullRequest
 *   repo: "${input.repo}"
 *   params:
 *     title: "feat: new feature"
 *     body: "Description"
 *     head: "feat/branch"
 *     base: "main"
 *   outputKey: prResult
 * ```
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  type GitHubOperation,
  type GitHubActionRequest,
  NodeStatus,
} from "../types.js";
import {
  resolveValue,
  type VariableContext,
} from "../utilities/variable-resolver.js";

const VALID_OPERATIONS: GitHubOperation[] = [
  "createBranch",
  "createPullRequest",
  "getPullRequest",
  "mergePullRequest",
  "closePullRequest",
  "createReview",
  "listIssues",
  "addLabels",
  "createComment",
  "createRelease",
];

/**
 * Configuration for GitHubAction node
 */
export interface GitHubActionConfig extends NodeConfiguration {
  /** The GitHub operation to perform */
  operation: GitHubOperation;
  /** Repository in "owner/repo" format (supports variable resolution) */
  repo: string;
  /** Operation-specific parameters (string values support variable resolution) */
  params?: Record<string, unknown>;
  /** Output key on blackboard for result */
  outputKey: string;
}

/**
 * GitHubAction Node
 *
 * Executes deterministic GitHub operations (branches, PRs, reviews, issues,
 * releases) via an activity and stores the result in blackboard.
 */
export class GitHubAction extends ActionNode {
  private operation: GitHubOperation;
  private repo: string;
  private params: Record<string, unknown>;
  private outputKey: string;

  constructor(config: GitHubActionConfig) {
    super(config);

    if (!config.operation) {
      throw new ConfigurationError("GitHubAction requires operation");
    }

    if (!VALID_OPERATIONS.includes(config.operation)) {
      throw new ConfigurationError(
        `GitHubAction: invalid operation "${config.operation}". ` +
        `Valid operations: ${VALID_OPERATIONS.join(", ")}`
      );
    }

    if (!config.repo) {
      throw new ConfigurationError("GitHubAction requires repo");
    }

    if (!config.outputKey) {
      throw new ConfigurationError("GitHubAction requires outputKey");
    }

    this.operation = config.operation;
    this.repo = config.repo;
    this.params = config.params ?? {};
    this.outputKey = config.outputKey;
  }

  protected async executeTick(
    context: TemporalContext
  ): Promise<NodeStatus> {
    // 1. Validate activity is available
    if (!context.activities?.githubAction) {
      this._lastError =
        "GitHubAction requires activities.githubAction to be configured. " +
        "This activity handles GitHub API operations.";
      this.log(`Error: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }

    try {
      // 2. Build variable context for resolution
      const varCtx: VariableContext = {
        blackboard: context.blackboard,
        input: context.input,
        testData: context.testData,
      };

      // 3. Resolve repo
      const resolvedRepo = resolveValue(this.repo, varCtx) as string;

      // 4. Resolve string values in params
      const resolvedParams: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(this.params)) {
        if (typeof value === "string") {
          resolvedParams[key] = resolveValue(value, varCtx);
        } else {
          resolvedParams[key] = value;
        }
      }

      // 5. Build request
      const request: GitHubActionRequest = {
        operation: this.operation,
        repo: resolvedRepo,
        params: resolvedParams,
      };

      this.log(
        `GitHub ${this.operation}: ${resolvedRepo}`
      );

      // 6. Execute via activity
      const result = await context.activities.githubAction(request);

      // 7. Store result in blackboard
      context.blackboard.set(this.outputKey, result.data);

      // 8. Check success
      if (!result.success) {
        this._lastError = `GitHub ${this.operation} failed`;
        this.log(`Error: ${this._lastError}`);
        return NodeStatus.FAILURE;
      }

      this.log(`GitHub ${this.operation} completed successfully`);
      return NodeStatus.SUCCESS;
    } catch (error) {
      this._lastError =
        error instanceof Error ? error.message : String(error);
      this.log(`GitHub ${this.operation} failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
