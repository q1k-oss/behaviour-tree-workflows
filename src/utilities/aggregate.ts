/**
 * Aggregate Node
 *
 * Compute metrics (count, sum, avg, min, max) over arrays with optional groupBy.
 * Replaces manual accumulation loops in CodeExecution.
 *
 * @example YAML
 * ```yaml
 * type: Aggregate
 * id: order-stats
 * props:
 *   input: "${bb.windowOrders}"
 *   outputKey: orderStats
 *   operations:
 *     - type: count
 *       as: orderCount
 *     - type: sum
 *       field: total_price
 *       as: totalRevenue
 *   groupBy: financial_status
 * ```
 */

import stringify from "safe-stable-stringify";
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

export interface AggregateOperation {
  /** Aggregation type */
  type: "count" | "sum" | "avg" | "min" | "max";
  /** Dot-path field to aggregate (not needed for "count") */
  field?: string;
  /** Result key name (defaults to type or type_field) */
  as?: string;
}

export interface AggregateConfig extends NodeConfiguration {
  /** Source array (supports variable resolution) */
  input: string;
  /** Blackboard key to store result */
  outputKey: string;
  /** Aggregation operations */
  operations: AggregateOperation[];
  /** Optional field to group by before aggregating */
  groupBy?: string;
}

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

function computeAggregations(
  items: unknown[],
  operations: AggregateOperation[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const op of operations) {
    const key = op.as ?? (op.field ? `${op.type}_${op.field}` : op.type);

    if (op.type === "count") {
      result[key] = items.length;
      continue;
    }

    if (!op.field) {
      result[key] = null;
      continue;
    }

    // Extract numeric values
    const values: number[] = [];
    for (const item of items) {
      const raw = getFieldValue(item, op.field);
      const num = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (!isNaN(num)) values.push(num);
    }

    switch (op.type) {
      case "sum":
        result[key] = values.reduce((a, b) => a + b, 0);
        break;
      case "avg":
        result[key] = values.length > 0
          ? values.reduce((a, b) => a + b, 0) / values.length
          : 0;
        break;
      case "min":
        result[key] = values.length > 0 ? Math.min(...values) : null;
        break;
      case "max":
        result[key] = values.length > 0 ? Math.max(...values) : null;
        break;
    }
  }

  return result;
}

export class Aggregate extends ActionNode {
  private input: string;
  private outputKey: string;
  private operations: AggregateOperation[];
  private groupBy?: string;

  constructor(config: AggregateConfig) {
    super(config);
    this.input = config.input;
    this.outputKey = config.outputKey;
    this.operations = config.operations;
    this.groupBy = config.groupBy;
  }

  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    try {
      const varCtx: VariableContext = {
        blackboard: context.blackboard,
        input: context.input,
        testData: context.testData,
      };

      const inputResolved = typeof this.input === "string"
        ? resolveValue(this.input, varCtx)
        : this.input;

      if (!Array.isArray(inputResolved)) {
        throw new ConfigurationError(
          `Input is not an array: got ${inputResolved === null ? "null" : typeof inputResolved}`
        );
      }

      if (!this.groupBy) {
        // Flat aggregation
        const result = computeAggregations(inputResolved, this.operations);
        context.blackboard.set(this.outputKey, result);
        this.log(`Aggregated ${inputResolved.length} items → ${stringify(result)}`);
      } else {
        // Group by field, then aggregate each group
        const groups: Record<string, unknown[]> = {};
        for (const item of inputResolved) {
          const groupVal = getFieldValue(item, this.groupBy);
          const groupKey = groupVal === null || groupVal === undefined
            ? "__null__"
            : String(groupVal);
          if (!groups[groupKey]) groups[groupKey] = [];
          groups[groupKey].push(item);
        }

        const result: Record<string, Record<string, unknown>> = {};
        for (const [groupKey, groupItems] of Object.entries(groups)) {
          result[groupKey] = computeAggregations(groupItems, this.operations);
        }

        context.blackboard.set(this.outputKey, result);
        this.log(
          `Aggregated ${inputResolved.length} items into ${Object.keys(groups).length} groups`
        );
      }

      return NodeStatus.SUCCESS;
    } catch (error) {
      if (error instanceof ConfigurationError) throw error;
      this._lastError = error instanceof Error ? error.message : String(error);
      this.log(`Aggregate failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
