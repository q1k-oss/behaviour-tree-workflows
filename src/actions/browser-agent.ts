/**
 * BrowserAgent Node
 *
 * Executes autonomous browser agent via Browserbase + Stagehand.
 * This node requires the `browserAgent` activity to be configured in the context -
 * it does not support standalone/inline execution because browser automation requires
 * capabilities outside the workflow sandbox.
 *
 * Features:
 * - Goal-directed autonomous web navigation
 * - Browserbase Contexts for session persistence (cookies, auth, cache)
 * - Session recording via Browserbase for debugging/audit
 * - Variable resolution in goal and startUrl
 * - Result stored in blackboard with debugUrl for session replay
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  type LLMProvider,
  type BrowserAgentRequest,
  NodeStatus,
} from "../types.js";
import {
  resolveValue,
  type VariableContext,
} from "../utilities/variable-resolver.js";

/**
 * Configuration for BrowserAgent node
 */
export interface BrowserAgentConfig extends NodeConfiguration {
  /** Goal for the agent to achieve (supports variable resolution) */
  goal: string;
  /** Starting URL (optional, supports variable resolution) */
  startUrl?: string;

  // Context persistence (for multi-step workflows)
  /** Blackboard key to store/retrieve contextId */
  contextKey?: string;
  /** Whether to persist context changes (cookies, auth, cache) */
  persistContext?: boolean;

  // Execution limits
  /** Timeout for entire agent execution (ms) */
  timeout?: number;
  /** Max steps/actions the agent can take */
  maxSteps?: number;

  // LLM for agent reasoning
  /** LLM provider for Stagehand agent */
  llmProvider?: LLMProvider;
  /** LLM model for Stagehand agent */
  llmModel?: string;

  /** Output key on blackboard for result */
  outputKey: string;
}

/**
 * BrowserAgent Node
 *
 * Executes autonomous browser agent via Browserbase + Stagehand and stores the result in blackboard.
 * Requires the `browserAgent` activity to be configured.
 *
 * @example YAML - Basic Usage
 * ```yaml
 * type: BrowserAgent
 * id: search
 * props:
 *   goal: "Search for weather in NYC and extract the temperature"
 *   startUrl: "https://google.com"
 *   timeout: 60000
 *   maxSteps: 15
 *   outputKey: searchResult
 * ```
 *
 * @example YAML - Multi-Step with Context Persistence
 * ```yaml
 * type: Sequence
 * id: authenticated-scrape
 * children:
 *   - type: BrowserAgent
 *     id: login
 *     props:
 *       goal: "Login with username ${input.user} and password ${input.pass}"
 *       startUrl: "${input.loginUrl}"
 *       contextKey: browserContext
 *       persistContext: true
 *       outputKey: loginResult
 *
 *   - type: BrowserAgent
 *     id: scrape
 *     props:
 *       goal: "Navigate to dashboard and extract all data as JSON"
 *       contextKey: browserContext
 *       outputKey: scrapeResult
 * ```
 */
export class BrowserAgent extends ActionNode {
  private goal: string;
  private startUrl?: string;
  private contextKey?: string;
  private persistContext: boolean;
  private timeout?: number;
  private maxSteps?: number;
  private llmProvider?: LLMProvider;
  private llmModel?: string;
  private outputKey: string;

  constructor(config: BrowserAgentConfig) {
    super(config);

    if (!config.goal) {
      throw new ConfigurationError("BrowserAgent requires goal");
    }

    if (!config.outputKey) {
      throw new ConfigurationError("BrowserAgent requires outputKey");
    }

    this.goal = config.goal;
    this.startUrl = config.startUrl;
    this.contextKey = config.contextKey;
    this.persistContext = config.persistContext ?? false;
    this.timeout = config.timeout;
    this.maxSteps = config.maxSteps;
    this.llmProvider = config.llmProvider;
    this.llmModel = config.llmModel;
    this.outputKey = config.outputKey;
  }

  protected async executeTick(
    context: TemporalContext
  ): Promise<NodeStatus> {
    // 1. Validate activity is available
    if (!context.activities?.browserAgent) {
      this._lastError =
        "BrowserAgent requires activities.browserAgent to be configured. " +
        "This activity handles browser automation via Browserbase + Stagehand.";
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

      // 3. Resolve goal (can contain variables)
      const resolvedGoal = resolveValue(this.goal, varCtx) as string;

      // 4. Resolve startUrl if provided
      const resolvedStartUrl = this.startUrl
        ? (resolveValue(this.startUrl, varCtx) as string)
        : undefined;

      // 5. Get contextId from blackboard if contextKey provided
      const contextId = this.contextKey
        ? (context.blackboard.get(this.contextKey) as string | undefined)
        : undefined;

      // 6. Build request
      const request: BrowserAgentRequest = {
        goal: resolvedGoal,
        startUrl: resolvedStartUrl,
        contextId,
        persistContext: this.persistContext,
        timeout: this.timeout,
        maxSteps: this.maxSteps,
        llmProvider: this.llmProvider,
        llmModel: this.llmModel,
      };

      this.log(
        `Browser agent: ${resolvedGoal.substring(0, 50)}${resolvedGoal.length > 50 ? "..." : ""}`
      );

      // 7. Execute via activity
      const result = await context.activities.browserAgent(request);

      // 8. Store contextId for future calls (even on failure, for debugging)
      if (this.contextKey && result.contextId) {
        context.blackboard.set(this.contextKey, result.contextId);
      }

      // 9. Store full result (includes debugUrl for audit even on failure)
      context.blackboard.set(this.outputKey, result);

      // 10. Check agent success (Stagehand returns success + completed)
      if (!result.success) {
        // Agent explicitly failed to achieve the goal
        this._lastError = `Browser agent failed to achieve goal: ${result.message}`;
        this.log(`Error: ${this._lastError}`);
        this.log(`Debug session: ${result.debugUrl}`);
        return NodeStatus.FAILURE;
      }

      if (!result.completed) {
        // Agent hit maxSteps limit before completing
        this._lastError = `Browser agent hit step limit before completing: ${result.message}`;
        this.log(`Error: ${this._lastError}`);
        this.log(`Debug session: ${result.debugUrl}`);
        return NodeStatus.FAILURE;
      }

      this.log(`Browser agent succeeded: ${result.message}`);
      this.log(`Debug session: ${result.debugUrl}`);

      return NodeStatus.SUCCESS;
    } catch (error) {
      // Handle activity errors (Browserbase API, network, timeout, etc.)
      this._lastError =
        error instanceof Error ? error.message : String(error);
      this.log(`Browser agent failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
