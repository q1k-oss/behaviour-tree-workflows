/**
 * PythonScript Node
 *
 * Executes Python code via a cross-language Temporal activity.
 * This node requires the `executePythonScript` activity to be configured
 * in the context - it does not support standalone/inline execution because
 * Python execution requires a separate Python worker process.
 *
 * Features:
 * - Access to blackboard state via `bb` dict in Python
 * - Access to workflow input via `input` dict in Python
 * - Modifications to `bb` dict are merged back to blackboard
 * - Configurable timeout and environment variables
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  type PythonScriptRequest,
  NodeStatus,
} from "../types.js";
import { resolveString, type VariableContext } from "../utilities/variable-resolver.js";

/**
 * Configuration for PythonScript node
 */
export interface PythonScriptConfig extends NodeConfiguration {
  /** Python code to execute */
  code: string;
  /** Required packages (for documentation/validation) */
  packages?: string[];
  /** Execution timeout in ms (default: 60000) */
  timeout?: number;
  /** Allowed environment variables to pass to Python */
  allowedEnvVars?: string[];
}

/**
 * PythonScript Node
 *
 * Executes Python code via a cross-language Temporal activity.
 * The Python code has access to:
 * - `bb`: dict - Blackboard state (read/write)
 * - `input`: dict - Workflow input (read-only)
 *
 * @example YAML
 * ```yaml
 * type: PythonScript
 * id: transform-data
 * props:
 *   code: |
 *     import pandas as pd
 *     df = pd.DataFrame(bb['orders'])
 *     bb['total'] = df['amount'].sum()
 *     bb['count'] = len(df)
 *   packages:
 *     - pandas
 *   timeout: 30000
 * ```
 */
export class PythonScript extends ActionNode {
  private code: string;
  private packages: string[];
  private timeout: number;
  private allowedEnvVars: string[];

  constructor(config: PythonScriptConfig) {
    super(config);

    if (!config.code) {
      throw new ConfigurationError("PythonScript requires code");
    }

    this.code = config.code;
    this.packages = config.packages || [];
    this.timeout = config.timeout || 60000;
    this.allowedEnvVars = config.allowedEnvVars || [];
  }

  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    // Validate activity is available (Python requires cross-language activity)
    if (!context.activities?.executePythonScript) {
      this._lastError =
        "PythonScript requires activities.executePythonScript to be configured. " +
        "This activity executes Python code in a separate worker process.";
      this.log(`Error: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }

    try {
      const request: PythonScriptRequest = {
        code: this.resolveCode(context),
        blackboard: context.blackboard.toJSON(),
        input: context.input ? { ...context.input } : undefined,
        env: this.getAllowedEnv(),
        timeout: this.timeout,
      };

      this.log(`Executing Python script (${this.code.length} chars, timeout: ${this.timeout}ms)`);
      const result = await context.activities.executePythonScript(request);

      // Merge Python changes back to blackboard
      for (const [key, value] of Object.entries(result.blackboard)) {
        context.blackboard.set(key, value);
      }

      this.log(`Python script completed, ${Object.keys(result.blackboard).length} blackboard keys updated`);

      // Log stdout/stderr if present
      if (result.stdout) {
        this.log(`Python stdout: ${result.stdout}`);
      }
      if (result.stderr) {
        this.log(`Python stderr: ${result.stderr}`);
      }

      return NodeStatus.SUCCESS;
    } catch (error) {
      this._lastError = error instanceof Error ? error.message : String(error);
      this.log(`Python script failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }

  /**
   * Resolve variable references in the Python code
   * Allows dynamic code templates like:
   * code: "bb['output_key'] = '${input.prefix}_result'"
   */
  private resolveCode(context: TemporalContext): string {
    const varCtx: VariableContext = {
      blackboard: context.blackboard,
      input: context.input,
      testData: context.testData,
    };
    return resolveString(this.code, varCtx) as string;
  }

  /**
   * Get allowed environment variables to pass to Python
   */
  private getAllowedEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const varName of this.allowedEnvVars) {
      const value = process.env[varName];
      if (value !== undefined) {
        env[varName] = value;
      }
    }
    return env;
  }
}
