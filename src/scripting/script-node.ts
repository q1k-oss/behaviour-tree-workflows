/**
 * Script Node - Execute JavaScript in isolated V8 sandbox
 * Uses isolated-vm for secure sandboxed execution (same approach as Temporal)
 */

import ivm from "isolated-vm";
import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  NodeStatus,
} from "../types.js";

export interface ScriptConfiguration extends NodeConfiguration {
  /** JavaScript code to execute */
  code: string;
  /** Execution timeout in milliseconds (default: 5000) */
  timeout?: number;
}

/**
 * Script node that executes JavaScript in an isolated V8 sandbox
 *
 * Features:
 * - Full JavaScript support (ES2020+)
 * - Blackboard access via $bb proxy
 * - Async/await support
 * - Secure sandboxing (no access to Node.js APIs)
 * - Configurable timeout
 *
 * @example
 * ```yaml
 * type: Script
 * id: calculate-total
 * props:
 *   code: |
 *     const { price, quantity } = $bb;
 *     $bb.total = price * quantity;
 * ```
 */
export class Script extends ActionNode {
  private code: string;
  private timeout: number;

  constructor(config: ScriptConfiguration) {
    super(config);

    const scriptCode = config.code?.trim();

    if (!scriptCode) {
      throw new ConfigurationError("Script node requires code property");
    }

    this.code = scriptCode;
    this.timeout = config.timeout ?? 5000;
  }

  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    // Create isolate with memory limit (128MB)
    const isolate = new ivm.Isolate({ memoryLimit: 128 });

    try {
      const vmContext = await isolate.createContext();
      const jail = vmContext.global;

      // Set up global reference
      await jail.set("global", jail.derefInto());

      // Create a snapshot of blackboard values for the isolate
      const bbSnapshot: Record<string, unknown> = {};
      const bbKeys = context.blackboard.keys();
      for (const key of bbKeys) {
        const value = context.blackboard.get(key);
        // Only copy serializable values
        if (this.isSerializable(value)) {
          bbSnapshot[key] = value;
        }
      }

      // Transfer snapshot to isolate
      await jail.set(
        "__bbSnapshot",
        new ivm.ExternalCopy(bbSnapshot).copyInto()
      );

      // Track changes made in isolate
      const changes: Record<string, unknown> = {};

      // Create a reference for setting blackboard values
      const setBBRef = new ivm.Reference((key: string, value: unknown) => {
        changes[key] = value;
      });
      await jail.set("__setBB", setBBRef);

      // Wrapper script that provides $bb proxy
      const wrappedCode = `
        (async () => {
          // Create $bb proxy that reads from snapshot and tracks writes
          const $bb = new Proxy(__bbSnapshot, {
            get: (target, key) => {
              if (typeof key === 'string') {
                return target[key];
              }
              return undefined;
            },
            set: (target, key, value) => {
              if (typeof key === 'string') {
                target[key] = value;
                __setBB.applySync(undefined, [key, value]);
              }
              return true;
            }
          });

          ${this.code}
        })();
      `;

      // Compile and run the script
      const script = await isolate.compileScript(wrappedCode);
      await script.run(vmContext, { timeout: this.timeout });

      // Apply changes back to the real blackboard
      for (const [key, value] of Object.entries(changes)) {
        context.blackboard.set(key, value);
      }

      this.log("Script executed successfully");
      return NodeStatus.SUCCESS;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this._lastError = errorMessage;
      this.log(`Script error: ${errorMessage}`);
      return NodeStatus.FAILURE;
    } finally {
      isolate.dispose();
    }
  }

  /**
   * Check if a value can be serialized for transfer to isolate
   */
  private isSerializable(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    const type = typeof value;
    if (
      type === "string" ||
      type === "number" ||
      type === "boolean"
    ) {
      return true;
    }
    if (Array.isArray(value)) {
      return value.every((item) => this.isSerializable(item));
    }
    if (type === "object") {
      // Plain objects only
      if (Object.getPrototypeOf(value) !== Object.prototype) {
        return false;
      }
      return Object.values(value as Record<string, unknown>).every((v) =>
        this.isSerializable(v)
      );
    }
    return false;
  }
}

/**
 * Validate script syntax by attempting to compile it
 * @throws Error if syntax is invalid
 */
export function validateScriptSyntax(code: string): void {
  const isolate = new ivm.Isolate({ memoryLimit: 8 });
  try {
    // Wrap in async IIFE like we do in execution
    const wrappedCode = `(async () => { ${code} })();`;
    isolate.compileScriptSync(wrappedCode);
  } finally {
    isolate.dispose();
  }
}
