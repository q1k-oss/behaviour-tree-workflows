/**
 * Integration Action Node
 * Execute third-party service actions via Active Pieces packages
 *
 * Features:
 * - Variable resolution: ${input.key}, ${bb.key}, ${env.KEY}, ${param.key}
 * - Pluggable token provider for OAuth/API key authentication
 * - Dynamic Active Pieces action execution
 * - Result storage in blackboard
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  NodeStatus,
} from "../types.js";
import { executePieceAction, type PieceAuth } from "./piece-executor.js";
import { resolveValue, type VariableContext } from "../utilities/variable-resolver.js";

/**
 * Token provider function type
 * Implementations can fetch tokens from controlplane, environment, etc.
 */
export type TokenProvider = (
  context: TemporalContext,
  provider: string,
  connectionId?: string
) => Promise<PieceAuth>;

/**
 * Configuration for IntegrationAction node
 */
export interface IntegrationActionConfig extends NodeConfiguration {
  /** Provider name: 'google-sheets', 'slack', 'openai', etc. */
  provider: string;
  /** Action name from Active Pieces: 'append_row', 'send_message', etc. */
  action: string;
  /** Action inputs (supports ${input.key}, ${bb.key}, ${env.KEY}, ${param.key}) */
  inputs?: Record<string, unknown>;
  /** Connection ID to use (optional, defaults to user's primary connection) */
  connectionId?: string;
  /** Whether to store the result in blackboard (default: true) */
  storeResult?: boolean;
  /** Custom blackboard key for result (default: ${nodeId}.result) */
  resultKey?: string;
}

/**
 * Extended context with token provider
 */
export interface IntegrationContext extends TemporalContext {
  /** Token provider function for fetching OAuth tokens */
  tokenProvider?: TokenProvider;
  /** Tenant ID for multi-tenant token lookup */
  tenantId?: string;
  /** User ID for user-scoped token lookup */
  userId?: string;
}

/**
 * Integration Action Node
 *
 * Executes actions on third-party services using Active Pieces packages.
 * Requires a token provider to be set in context for authentication.
 *
 * Supports variable resolution:
 * - ${input.key} - Workflow input parameters
 * - ${bb.key} - Blackboard values
 * - ${env.KEY} - Environment variables
 * - ${param.key} - Test data parameters
 *
 * @example
 * ```yaml
 * type: IntegrationAction
 * id: add-to-sheet
 * props:
 *   provider: google-sheets
 *   action: append_row
 *   inputs:
 *     spreadsheetId: "${input.spreadsheetId}"
 *     sheetName: "Orders"
 *     values:
 *       - "${input.orderId}"
 *       - "${bb.customerName}"
 *       - "${bb.total}"
 * ```
 */
export class IntegrationAction extends ActionNode {
  private provider: string;
  private action: string;
  private inputs: Record<string, unknown>;
  private connectionId?: string;
  private storeResult: boolean;
  private resultKey: string;

  constructor(config: IntegrationActionConfig) {
    super(config);

    if (!config.provider) {
      throw new ConfigurationError("IntegrationAction requires provider");
    }

    if (!config.action) {
      throw new ConfigurationError("IntegrationAction requires action");
    }

    this.provider = config.provider;
    this.action = config.action;
    this.inputs = config.inputs || {};
    this.connectionId = config.connectionId;
    this.storeResult = config.storeResult !== false; // Default true
    this.resultKey = config.resultKey || `${this.id}.result`;
  }

  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    const integrationContext = context as IntegrationContext;

    // Validate token provider is available
    if (!integrationContext.tokenProvider) {
      this._lastError =
        "No token provider configured in context. " +
        "Set context.tokenProvider to fetch OAuth tokens.";
      this.log(`Error: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }

    try {
      // 1. Resolve inputs from blackboard
      const resolvedInputs = this.resolveInputs(context);
      this.log(`Resolved inputs: ${JSON.stringify(resolvedInputs)}`);

      // 2. Get authentication via token provider
      const auth = await integrationContext.tokenProvider(
        context,
        this.provider,
        this.connectionId
      );
      this.log(`Got authentication for provider: ${this.provider}`);

      // 3. Execute Active Pieces action
      const result = await executePieceAction({
        provider: this.provider,
        action: this.action,
        inputs: resolvedInputs,
        auth,
      });

      // 4. Store result in blackboard if enabled
      if (this.storeResult) {
        context.blackboard.set(this.resultKey, result);
        this.log(`Stored result in blackboard: ${this.resultKey}`);
      }

      this.log(
        `Integration action completed: ${this.provider}/${this.action}`
      );
      return NodeStatus.SUCCESS;
    } catch (error) {
      this._lastError =
        error instanceof Error ? error.message : String(error);
      this.log(`Integration action failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }

  /**
   * Resolve variable references in inputs
   * Supports ${input.key}, ${bb.key}, ${env.KEY}, ${param.key}
   */
  private resolveInputs(context: TemporalContext): Record<string, unknown> {
    const varCtx: VariableContext = {
      blackboard: context.blackboard,
      input: context.input,
      testData: context.testData,
    };
    // Use preserveUndefined: false to return empty string/undefined for missing values
    // This matches the original behavior
    return resolveValue(this.inputs, varCtx, { preserveUndefined: false }) as Record<string, unknown>;
  }
}

/**
 * Default token provider that reads from environment variables
 * Useful for testing and simple deployments
 *
 * Looks for:
 * - {PROVIDER}_ACCESS_TOKEN (e.g., GOOGLE_ACCESS_TOKEN)
 * - {PROVIDER}_API_KEY (e.g., OPENAI_API_KEY)
 */
export const envTokenProvider: TokenProvider = async (
  _context,
  provider
): Promise<PieceAuth> => {
  const normalizedProvider = provider.toUpperCase().replace(/-/g, "_");

  // Try access token first
  const accessToken = process.env[`${normalizedProvider}_ACCESS_TOKEN`];
  if (accessToken) {
    return { access_token: accessToken };
  }

  // Try API key
  const apiKey = process.env[`${normalizedProvider}_API_KEY`];
  if (apiKey) {
    return { api_key: apiKey };
  }

  throw new Error(
    `No token found for provider ${provider}. ` +
    `Set ${normalizedProvider}_ACCESS_TOKEN or ${normalizedProvider}_API_KEY environment variable.`
  );
};
