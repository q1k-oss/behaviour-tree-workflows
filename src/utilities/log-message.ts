/**
 * LogMessage Node - Log messages for debugging and test visibility
 *
 * Utility node that logs messages to console with optional variable resolution.
 * Useful for debugging test flows and tracking execution progress.
 *
 * Supports variable resolution:
 * - ${key} - Shorthand for blackboard (backward compatible)
 * - ${input.key} - Workflow input parameters
 * - ${bb.key} - Blackboard values
 * - ${env.KEY} - Environment variables
 * - ${param.key} - Test data parameters
 *
 * Use Cases:
 * - Log intermediate values during test execution
 * - Debug blackboard state at specific points
 * - Add visibility to test steps
 * - Track execution flow
 *
 * Examples:
 * - Log static message: <LogMessage message="Starting form submission" />
 * - Log blackboard value: <LogMessage message="Current URL: ${currentUrl}" />
 * - Log input value: <LogMessage message="Order ID: ${input.orderId}" />
 * - Log with level: <LogMessage message="Error occurred" level="error" />
 */

import stringify from "safe-stable-stringify";
import { ActionNode } from "../base-node.js";
import { NodeEventType } from "../events.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  NodeStatus,
} from "../types.js";
import { resolveString, type VariableContext } from "./variable-resolver.js";

/**
 * Configuration for LogMessage node
 */
export interface LogMessageConfig extends NodeConfiguration {
  message: string; // Message to log (supports ${key}, ${input.key}, ${bb.key}, ${env.KEY})
  level?: "info" | "warn" | "error" | "debug"; // Log level (default: 'info')
}

/**
 * LogMessage Node - Logs messages with optional variable resolution
 */
export class LogMessage extends ActionNode {
  private message: string;
  private level: "info" | "warn" | "error" | "debug";

  constructor(config: LogMessageConfig) {
    super(config);
    this.message = config.message;
    this.level = config.level || "info";
  }

  async executeTick(context: TemporalContext): Promise<NodeStatus> {
    try {
      // Resolve variable references in message
      const resolvedMessage = this.resolveMessage(this.message, context);

      // Log based on level
      switch (this.level) {
        case "warn":
          console.warn(`[LogMessage:${this.name}] ${resolvedMessage}`);
          break;
        case "error":
          console.error(`[LogMessage:${this.name}] ${resolvedMessage}`);
          break;
        case "debug":
          console.debug(`[LogMessage:${this.name}] ${resolvedMessage}`);
          break;
        default:
          console.log(`[LogMessage:${this.name}] ${resolvedMessage}`);
          break;
      }

      // Emit LOG event for collection
      context.eventEmitter?.emit({
        type: NodeEventType.LOG,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
        data: { level: this.level, message: resolvedMessage },
      });

      this._status = NodeStatus.SUCCESS;
      return NodeStatus.SUCCESS;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[LogMessage:${this.name}] Failed to log message: ${errorMessage}`,
      );
      this._status = NodeStatus.FAILURE;
      return NodeStatus.FAILURE;
    }
  }

  /**
   * Resolve variable references in message string
   * Supports ${key}, ${input.key}, ${bb.key}, ${env.KEY}, ${param.key}
   */
  private resolveMessage(message: string, context: TemporalContext): string {
    const varCtx: VariableContext = {
      blackboard: context.blackboard,
      input: context.input,
      testData: context.testData,
    };

    const resolved = resolveString(message, varCtx);

    // Always return a string for logging
    if (typeof resolved === "string") {
      return resolved;
    }

    // If resolved to non-string (shouldn't happen for message templates), stringify
    if (resolved === null) {
      return "null";
    }

    if (typeof resolved === "object") {
      return stringify(resolved) ?? String(resolved);
    }

    return String(resolved);
  }
}
