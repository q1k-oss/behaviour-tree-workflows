/**
 * ThresholdCheck Node
 *
 * Multi-level threshold classification. Returns FAILURE when breach conditions
 * are met, enabling behavior tree control flow (Recovery, Selector alternatives).
 *
 * @example YAML
 * ```yaml
 * type: ThresholdCheck
 * id: check-stock
 * props:
 *   value: "${bb.currentVariant.inventory_quantity}"
 *   thresholds:
 *     - operator: lte
 *       value: 0
 *       label: out_of_stock
 *     - operator: lte
 *       value: "${bb.lowStockThreshold}"
 *       label: low_stock
 *   outputKey: stockStatus
 *   failOn: [out_of_stock, low_stock]
 * ```
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

export interface ThresholdLevel {
  /** Comparison operator */
  operator: "lte" | "lt" | "gte" | "gt" | "eq" | "ne" | "between";
  /** Threshold value (supports variable resolution) */
  value?: unknown;
  /** For "between": [min, max] inclusive */
  range?: [unknown, unknown];
  /** Label assigned when this threshold matches */
  label: string;
}

export interface ThresholdCheckConfig extends NodeConfiguration {
  /** Value to check (supports variable resolution) */
  value: unknown;
  /** Threshold levels, evaluated top-to-bottom (first match wins) */
  thresholds: ThresholdLevel[];
  /** Blackboard key to store the matched label */
  outputKey?: string;
  /** Labels that cause the node to return FAILURE */
  failOn?: string[];
}

function evaluateThreshold(val: number, threshold: ThresholdLevel, resolvedValue: unknown, resolvedRange?: [unknown, unknown]): boolean {
  switch (threshold.operator) {
    case "lte":
      return val <= (resolvedValue as number);
    case "lt":
      return val < (resolvedValue as number);
    case "gte":
      return val >= (resolvedValue as number);
    case "gt":
      return val > (resolvedValue as number);
    case "eq":
      return val === (resolvedValue as number);
    case "ne":
      return val !== (resolvedValue as number);
    case "between": {
      if (!resolvedRange) return false;
      return val >= (resolvedRange[0] as number) && val <= (resolvedRange[1] as number);
    }
    default:
      return false;
  }
}

export class ThresholdCheck extends ActionNode {
  private valueRef: unknown;
  private thresholds: ThresholdLevel[];
  private outputKey?: string;
  private failOn: string[];

  constructor(config: ThresholdCheckConfig) {
    super(config);
    this.valueRef = config.value;
    this.thresholds = config.thresholds;
    this.outputKey = config.outputKey;
    this.failOn = config.failOn ?? [];
  }

  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    try {
      const varCtx: VariableContext = {
        blackboard: context.blackboard,
        input: context.input,
        testData: context.testData,
      };

      // Resolve the input value
      const resolved = typeof this.valueRef === "string"
        ? resolveValue(this.valueRef, varCtx)
        : this.valueRef;

      const numValue = typeof resolved === "number"
        ? resolved
        : parseFloat(String(resolved));

      if (isNaN(numValue)) {
        throw new Error(`Value is not numeric: ${JSON.stringify(resolved)}`);
      }

      // Evaluate thresholds top-to-bottom
      let matchedLabel = "normal";
      for (const threshold of this.thresholds) {
        const thresholdValue = threshold.value !== undefined
          ? resolveValue(threshold.value as string, varCtx)
          : undefined;
        const thresholdRange = threshold.range
          ? [resolveValue(threshold.range[0] as string, varCtx), resolveValue(threshold.range[1] as string, varCtx)] as [unknown, unknown]
          : undefined;

        if (evaluateThreshold(numValue, threshold, thresholdValue, thresholdRange)) {
          matchedLabel = threshold.label;
          break;
        }
      }

      // Store label
      if (this.outputKey) {
        context.blackboard.set(this.outputKey, matchedLabel);
      }

      this.log(`Value ${numValue} → ${matchedLabel}`);

      // Check if label triggers failure
      if (this.failOn.includes(matchedLabel)) {
        this._lastError = `Threshold breach: ${matchedLabel} (value: ${numValue})`;
        return NodeStatus.FAILURE;
      }

      return NodeStatus.SUCCESS;
    } catch (error) {
      this._lastError = error instanceof Error ? error.message : String(error);
      this.log(`ThresholdCheck failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
