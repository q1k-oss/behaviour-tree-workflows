/**
 * DataTransform Node
 *
 * Build objects from blackboard values using declarative field mappings.
 * Replaces snapshot-construction CodeExecution blocks.
 *
 * @example YAML
 * ```yaml
 * type: DataTransform
 * id: build-snapshot
 * props:
 *   outputKey: snapshotData
 *   wrapInArray: true
 *   mappings:
 *     - target: metricName
 *       value: "order_volume_hourly"
 *     - target: context_json.orderCount
 *       value: "${bb.orderStats.orderCount}"
 *       coerce: number
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

export interface TransformMapping {
  /** Target field name (dot notation for nesting: "context_json.totalOrders") */
  target: string;
  /** Source value: variable reference "${bb.x}" or literal */
  value: unknown;
  /** Optional type coercion */
  coerce?: "string" | "number" | "boolean";
}

export interface DataTransformConfig extends NodeConfiguration {
  /** Blackboard key to store result */
  outputKey: string;
  /** Field mappings */
  mappings: TransformMapping[];
  /** Wrap result in array (default: false) */
  wrapInArray?: boolean;
}

/**
 * Set a value at a dot-path in an object, creating intermediate objects as needed.
 * "context_json.totalOrders" → { context_json: { totalOrders: value } }
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (current[part] === undefined || current[part] === null || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const lastPart = parts[parts.length - 1];
  if (lastPart !== undefined) {
    current[lastPart] = value;
  }
}

function coerceValue(value: unknown, coerce: string): unknown {
  switch (coerce) {
    case "string":
      return value === null || value === undefined ? "" : String(value);
    case "number": {
      if (typeof value === "number") return value;
      const num = parseFloat(String(value));
      if (isNaN(num)) throw new Error(`Cannot coerce "${value}" to number`);
      return num;
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === "true" || value === 1) return true;
      if (value === "false" || value === 0 || value === "" || value === null || value === undefined) return false;
      return Boolean(value);
    default:
      return value;
  }
}

export class DataTransform extends ActionNode {
  private outputKey: string;
  private mappings: TransformMapping[];
  private wrapInArray: boolean;

  constructor(config: DataTransformConfig) {
    super(config);
    this.outputKey = config.outputKey;
    this.mappings = config.mappings;
    this.wrapInArray = config.wrapInArray ?? false;
  }

  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    try {
      const varCtx: VariableContext = {
        blackboard: context.blackboard,
        input: context.input,
        testData: context.testData,
      };

      const result: Record<string, unknown> = {};

      for (const mapping of this.mappings) {
        let resolved = resolveValue(mapping.value, varCtx);

        if (mapping.coerce) {
          resolved = coerceValue(resolved, mapping.coerce);
        }

        setNestedValue(result, mapping.target, resolved);
      }

      const output = this.wrapInArray ? [result] : result;
      context.blackboard.set(this.outputKey, output);
      this.log(`Built object with ${this.mappings.length} fields → ${this.outputKey}`);
      return NodeStatus.SUCCESS;
    } catch (error) {
      this._lastError = error instanceof Error ? error.message : String(error);
      this.log(`DataTransform failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
