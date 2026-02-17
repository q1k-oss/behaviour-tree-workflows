/**
 * WaitForSignal Node
 *
 * Pauses workflow execution until an external Temporal signal arrives.
 * Uses the same pattern as HumanTask: the actual waiting is done via
 * Temporal's condition() in the workflow layer, exposed as a pseudo-activity.
 *
 * Use cases:
 * - Multi-turn conversational agents waiting for user messages
 * - External event triggers (webhooks, API callbacks)
 * - Inter-workflow coordination
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  NodeStatus,
} from "../types.js";
import {
  resolveValue,
  type VariableContext,
} from "../utilities/variable-resolver.js";

/**
 * Configuration for WaitForSignal node
 */
export interface WaitForSignalConfig extends NodeConfiguration {
  /** Signal name to wait for (e.g., "user_message") */
  signalName: string;
  /** Optional discriminator key (supports ${input.x} resolution) */
  signalKey?: string;
  /** Timeout in milliseconds (default: 24h) */
  timeoutMs?: number;
  /** Blackboard key for received signal data */
  outputKey: string;
}

/**
 * WaitForSignal Node
 *
 * Waits for a generic Temporal signal and stores the payload in the blackboard.
 *
 * @example YAML - Wait for user message
 * ```yaml
 * type: WaitForSignal
 * id: wait-msg
 * props:
 *   signalName: user_message
 *   signalKey: "${input.sessionId}"
 *   timeoutMs: 300000
 *   outputKey: userInput
 * ```
 *
 * Signal via CLI:
 * ```bash
 * temporal workflow signal --workflow-id <id> --name genericSignal \
 *   --input '{"signalName":"user_message","signalKey":"session-1","data":{"content":"Hello!"}}'
 * ```
 */
export class WaitForSignal extends ActionNode {
  private signalName: string;
  private signalKey?: string;
  private timeoutMs: number;
  private outputKey: string;

  constructor(config: WaitForSignalConfig) {
    super(config);

    if (!config.signalName) {
      throw new ConfigurationError("WaitForSignal requires signalName");
    }
    if (!config.outputKey) {
      throw new ConfigurationError("WaitForSignal requires outputKey");
    }

    this.signalName = config.signalName;
    this.signalKey = config.signalKey;
    this.timeoutMs = config.timeoutMs ?? 86400000; // 24h default
    this.outputKey = config.outputKey;
  }

  protected async executeTick(
    context: TemporalContext
  ): Promise<NodeStatus> {
    if (!context.activities?.waitForSignal) {
      this._lastError =
        "WaitForSignal requires activities.waitForSignal to be configured. " +
        "This is implemented as a Temporal condition in the workflow layer.";
      this.log(`Error: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }

    try {
      // Resolve signalKey (could reference input.sessionId, etc.)
      const varCtx: VariableContext = {
        blackboard: context.blackboard,
        input: context.input,
        testData: context.testData,
      };

      const resolvedSignalKey = this.signalKey
        ? (resolveValue(this.signalKey, varCtx) as string)
        : undefined;

      this.log(
        `Waiting for signal "${this.signalName}"${resolvedSignalKey ? `:${resolvedSignalKey}` : ""} (timeout: ${this.timeoutMs}ms)`
      );

      const result = await context.activities.waitForSignal({
        signalName: this.signalName,
        signalKey: resolvedSignalKey,
        timeoutMs: this.timeoutMs,
      });

      if (result.timedOut) {
        this._lastError = `Signal "${this.signalName}" timed out after ${this.timeoutMs}ms`;
        this.log(this._lastError);
        return NodeStatus.FAILURE;
      }

      // Store signal data in blackboard
      context.blackboard.set(this.outputKey, result.data);
      this.log(`Signal received, data stored at "${this.outputKey}"`);

      return NodeStatus.SUCCESS;
    } catch (error) {
      this._lastError =
        error instanceof Error ? error.message : String(error);
      this.log(`WaitForSignal failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
