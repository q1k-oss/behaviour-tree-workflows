/**
 * ArrayFilter Node
 *
 * Declaratively filter arrays by field conditions.
 * Replaces array.filter() CodeExecution blocks.
 *
 * @example YAML
 * ```yaml
 * type: ArrayFilter
 * id: filter-unfulfilled
 * props:
 *   input: "${bb.customerOrders}"
 *   outputKey: unfulfilledOrders
 *   conditions:
 *     - field: fulfillment_status
 *       operator: in
 *       value: [null, "unfulfilled"]
 *     - field: pending_hours
 *       operator: gt
 *       value: "${bb.thresholdHours}"
 *   logic: and
 * ```
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
} from "./variable-resolver.js";

export interface FilterCondition {
  /** Dot-path field on each item */
  field: string;
  /** Comparison operator */
  operator:
    | "eq" | "ne" | "gt" | "lt" | "gte" | "lte"
    | "in" | "nin" | "exists" | "regex" | "between" | "contains";
  /** Value to compare against (supports variable resolution) */
  value?: unknown;
  /** For "between" operator: [min, max] inclusive */
  range?: [unknown, unknown];
}

export interface ArrayFilterConfig extends NodeConfiguration {
  /** Source array (supports variable resolution) */
  input: string;
  /** Blackboard key to store filtered result */
  outputKey: string;
  /** Filter conditions */
  conditions: FilterCondition[];
  /** Logic for combining conditions: "and" (default) | "or" */
  logic?: "and" | "or";
}

/**
 * Get a nested value from an object using dot-path notation.
 * Supports numeric indices for arrays: "shipping_lines.0.source"
 */
function getFieldValue(item: unknown, path: string): unknown {
  if (item === null || item === undefined) return undefined;
  const parts = path.split(".");
  let current: unknown = item;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateCondition(item: unknown, condition: FilterCondition, resolvedValue: unknown, resolvedRange?: [unknown, unknown]): boolean {
  const fieldVal = getFieldValue(item, condition.field);

  switch (condition.operator) {
    case "eq":
      return fieldVal === resolvedValue;
    case "ne":
      return fieldVal !== resolvedValue;
    case "gt":
      return (fieldVal as number) > (resolvedValue as number);
    case "lt":
      return (fieldVal as number) < (resolvedValue as number);
    case "gte":
      return (fieldVal as number) >= (resolvedValue as number);
    case "lte":
      return (fieldVal as number) <= (resolvedValue as number);
    case "in":
      if (!Array.isArray(resolvedValue)) return false;
      return resolvedValue.includes(fieldVal);
    case "nin":
      if (!Array.isArray(resolvedValue)) return true;
      return !resolvedValue.includes(fieldVal);
    case "exists":
      // value: true (default) checks exists, value: false checks not exists
      const shouldExist = resolvedValue !== false;
      const exists = fieldVal !== null && fieldVal !== undefined;
      return shouldExist ? exists : !exists;
    case "regex": {
      if (typeof fieldVal !== "string" || typeof resolvedValue !== "string") return false;
      try {
        return new RegExp(resolvedValue).test(fieldVal);
      } catch {
        return false;
      }
    }
    case "between": {
      if (!resolvedRange) return false;
      const [min, max] = resolvedRange;
      return (fieldVal as number) >= (min as number) && (fieldVal as number) <= (max as number);
    }
    case "contains": {
      if (typeof fieldVal === "string" && typeof resolvedValue === "string") {
        return fieldVal.includes(resolvedValue);
      }
      if (Array.isArray(fieldVal)) {
        return fieldVal.includes(resolvedValue);
      }
      return false;
    }
    default:
      return false;
  }
}

export class ArrayFilter extends ActionNode {
  private input: string;
  private outputKey: string;
  private conditions: FilterCondition[];
  private logic: "and" | "or";

  constructor(config: ArrayFilterConfig) {
    super(config);
    this.input = config.input;
    this.outputKey = config.outputKey;
    this.conditions = config.conditions;
    this.logic = config.logic ?? "and";
  }

  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    try {
      const varCtx: VariableContext = {
        blackboard: context.blackboard,
        input: context.input,
        testData: context.testData,
      };

      // Resolve input array
      const inputResolved = typeof this.input === "string"
        ? resolveValue(this.input, varCtx)
        : this.input;

      if (!Array.isArray(inputResolved)) {
        throw new ConfigurationError(
          `Input is not an array: got ${inputResolved === null ? "null" : typeof inputResolved}`
        );
      }

      // Pre-resolve condition values
      const resolvedConditions = this.conditions.map((c) => ({
        condition: c,
        value: c.value !== undefined ? resolveValue(c.value as string, varCtx) : undefined,
        range: c.range
          ? [resolveValue(c.range[0] as string, varCtx), resolveValue(c.range[1] as string, varCtx)] as [unknown, unknown]
          : undefined,
      }));

      // Filter
      const result = inputResolved.filter((item) => {
        const results = resolvedConditions.map(({ condition, value, range }) =>
          evaluateCondition(item, condition, value, range)
        );
        return this.logic === "and"
          ? results.every(Boolean)
          : results.some(Boolean);
      });

      context.blackboard.set(this.outputKey, result);
      this.log(`Filtered ${inputResolved.length} → ${result.length} items`);
      return NodeStatus.SUCCESS;
    } catch (error) {
      if (error instanceof ConfigurationError) throw error;
      this._lastError = error instanceof Error ? error.message : String(error);
      this.log(`ArrayFilter failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
