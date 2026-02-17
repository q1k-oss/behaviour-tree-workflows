/**
 * StreamingSink Decorator
 *
 * Injects a streaming channel ID into the blackboard for child LLM calls.
 * LLMToolCall reads `__streamChannelId` and passes it to the activity,
 * enabling token-level streaming to a WebSocket or SSE channel.
 *
 * The decorator saves and restores the previous value, making it safe
 * to nest (inner StreamingSink overrides, then restores outer channel).
 */

import { DecoratorNode } from "../base-node.js";
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
 * Configuration for StreamingSink decorator
 */
export interface StreamingSinkConfig extends NodeConfiguration {
  /** Explicit channel ID */
  channelId?: string;
  /** OR: blackboard key to read channel ID from */
  channelKey?: string;
}

/**
 * StreamingSink Decorator
 *
 * Sets `__streamChannelId` on the blackboard before ticking the child,
 * then restores the previous value after.
 *
 * @example YAML
 * ```yaml
 * type: StreamingSink
 * id: stream-to-client
 * props:
 *   channelId: "ws-session-abc"
 * children:
 *   - type: LLMToolCall
 *     id: call-llm
 *     props:
 *       provider: anthropic
 *       model: claude-sonnet-4-20250514
 *       messagesKey: msgs
 *       outputKey: response
 * ```
 */
export class StreamingSink extends DecoratorNode {
  private channelId?: string;
  private channelKey?: string;

  constructor(config: StreamingSinkConfig) {
    super(config);

    if (!config.channelId && !config.channelKey) {
      throw new ConfigurationError(
        "StreamingSink requires either channelId or channelKey"
      );
    }

    this.channelId = config.channelId;
    this.channelKey = config.channelKey;
  }

  async executeTick(context: TemporalContext): Promise<NodeStatus> {
    if (!this.child) {
      throw new ConfigurationError(
        `${this.name}: Decorator must have a child`
      );
    }

    // Resolve channel ID
    let resolvedChannelId = this.channelId;
    if (this.channelKey) {
      const varCtx: VariableContext = {
        blackboard: context.blackboard,
        input: context.input,
        testData: context.testData,
      };
      resolvedChannelId = resolveValue(this.channelKey, varCtx) as string;
    }

    // Save previous value (stack-safe for nesting)
    const previousValue = context.blackboard.get("__streamChannelId");

    // Set channel ID
    context.blackboard.set("__streamChannelId", resolvedChannelId);
    this.log(`Set streaming channel: ${resolvedChannelId}`);

    try {
      // Tick child
      const childStatus = await this.child.tick(context);
      this._status = childStatus;
      return childStatus;
    } finally {
      // Restore previous value
      if (previousValue !== undefined) {
        context.blackboard.set("__streamChannelId", previousValue);
      } else {
        context.blackboard.delete("__streamChannelId");
      }
    }
  }
}
