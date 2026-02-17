/**
 * SetVariable Node
 *
 * Simple utility node that sets a blackboard key to a value.
 * Supports variable resolution in both key and value.
 * Primary use case: controlling While loop conditions in agent loops.
 */

import { ActionNode } from "../base-node.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  NodeStatus,
} from "../types.js";
import {
  resolveValue,
  type VariableContext,
} from "./variable-resolver.js";

/**
 * Configuration for SetVariable node
 */
export interface SetVariableConfig extends NodeConfiguration {
  /** Blackboard key to set (supports ${bb.x} / ${input.x} resolution) */
  key: string;
  /** Value to set (supports variable resolution) */
  value: unknown;
}

/**
 * SetVariable Node
 *
 * Sets a blackboard key to a resolved value. Used for loop control,
 * intermediate state management, and data transformation.
 *
 * @example YAML - Loop control
 * ```yaml
 * type: SetVariable
 * id: init-loop
 * props:
 *   key: agentLooping
 *   value: true
 * ```
 *
 * @example YAML - Dynamic value
 * ```yaml
 * type: SetVariable
 * id: copy-result
 * props:
 *   key: finalAnswer
 *   value: "${bb.llmResponse.content}"
 * ```
 */
export class SetVariable extends ActionNode {
  private key: string;
  private value: unknown;

  constructor(config: SetVariableConfig) {
    super(config);
    this.key = config.key;
    this.value = config.value;
  }

  protected async executeTick(
    context: TemporalContext
  ): Promise<NodeStatus> {
    try {
      const varCtx: VariableContext = {
        blackboard: context.blackboard,
        input: context.input,
        testData: context.testData,
      };

      // Resolve the key (could be dynamic)
      const resolvedKey = typeof this.key === "string"
        ? (resolveValue(this.key, varCtx) as string)
        : String(this.key);

      // Resolve the value
      const resolvedValue = typeof this.value === "string"
        ? resolveValue(this.value, varCtx)
        : this.value;

      context.blackboard.set(resolvedKey, resolvedValue);

      this.log(`Set ${resolvedKey} = ${JSON.stringify(resolvedValue)}`);
      return NodeStatus.SUCCESS;
    } catch (error) {
      this._lastError =
        error instanceof Error ? error.message : String(error);
      this.log(`SetVariable failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
