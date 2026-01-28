/**
 * CodeExecution Node
 *
 * Executes JavaScript or Python code in a secure sandboxed environment
 * via Microsandbox (libkrun microVM). This node replaces the inline Script
 * node for production use where untrusted/AI-generated code needs isolation.
 *
 * Features:
 * - Support for JavaScript and Python
 * - Full VM isolation (no network, no filesystem, no cloud credentials)
 * - DataStore integration for large payloads
 * - getBB/setBB helpers for blackboard access
 * - getInput helper for workflow input access
 * - Configurable timeout
 * - Python package installation support
 *
 * Security:
 * - Code runs in Microsandbox microVM
 * - No cloud credentials exposed to sandbox
 * - Activity fetches data from DataStore, not the sandbox
 * - Only JSON data crosses the sandbox boundary
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  type CodeExecutionRequest,
  type DataRef,
  NodeStatus,
} from "../types.js";
import { isDataRef } from "../data-store/types.js";

/**
 * Configuration for CodeExecution node
 */
export interface CodeExecutionConfig extends NodeConfiguration {
  /** Code to execute */
  code: string;
  /** Programming language: 'javascript' or 'python' */
  language: "javascript" | "python";
  /** Execution timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Python packages to install before execution */
  packages?: string[];
}

/**
 * CodeExecution Node
 *
 * Executes code in a sandboxed environment via Temporal activity.
 * Requires the `executeCode` activity to be configured.
 *
 * @example YAML (JavaScript)
 * ```yaml
 * type: CodeExecution
 * id: transform-data
 * props:
 *   language: javascript
 *   code: |
 *     const users = getBB('apiUsers');
 *     const processed = users.map(u => ({
 *       id: u.id,
 *       name: u.name.toUpperCase()
 *     }));
 *     setBB('processedUsers', processed);
 *   timeout: 30000
 * ```
 *
 * @example YAML (Python)
 * ```yaml
 * type: CodeExecution
 * id: analyze-data
 * props:
 *   language: python
 *   packages:
 *     - pandas
 *   code: |
 *     import pandas as pd
 *
 *     users = getBB('apiUsers')
 *     df = pd.DataFrame(users)
 *
 *     setBB('userCount', len(df))
 *     setBB('domains', df['email'].str.split('@').str[1].unique().tolist())
 *   timeout: 60000
 * ```
 *
 * Available functions in sandbox:
 * - getBB(key): Get value from blackboard
 * - setBB(key, value): Set value on blackboard
 * - getInput(key): Get value from workflow input (read-only)
 */
export class CodeExecution extends ActionNode {
  private code: string;
  private language: "javascript" | "python";
  private timeout: number;
  private packages: string[];

  constructor(config: CodeExecutionConfig) {
    super(config);

    if (!config.code) {
      throw new ConfigurationError("CodeExecution requires code");
    }

    if (!config.language) {
      throw new ConfigurationError("CodeExecution requires language");
    }

    if (!["javascript", "python"].includes(config.language)) {
      throw new ConfigurationError(
        `CodeExecution language must be 'javascript' or 'python', got: ${config.language}`
      );
    }

    this.code = config.code;
    this.language = config.language;
    this.timeout = config.timeout ?? 30000;
    this.packages = config.packages ?? [];
  }

  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    // Validate activity is available
    if (!context.activities?.executeCode) {
      this._lastError =
        "CodeExecution requires activities.executeCode to be configured. " +
        "This activity handles sandboxed code execution via Microsandbox.";
      this.log(`Error: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }

    try {
      // Separate DataRefs from inline values in blackboard
      const dataRefs: Record<string, DataRef> = {};
      const inlineContext: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(context.blackboard.toJSON())) {
        if (isDataRef(value)) {
          dataRefs[key] = value;
        } else {
          inlineContext[key] = value;
        }
      }

      // Build the request
      const request: CodeExecutionRequest = {
        code: this.code,
        language: this.language,
        dataRefs,
        context: inlineContext,
        input: context.input ? { ...context.input } : undefined,
        timeout: this.timeout,
        packages: this.packages.length > 0 ? this.packages : undefined,
        workflowId: context.workflowInfo?.workflowId,
      };

      this.log(
        `Executing ${this.language} code (timeout: ${this.timeout}ms, packages: ${this.packages.length})`
      );

      // Execute in sandbox via activity
      const result = await context.activities.executeCode(request);

      // Log any output from the sandbox
      if (result.logs.length > 0) {
        for (const log of result.logs) {
          this.log(`[sandbox] ${log}`);
        }
      }

      // Merge results back to blackboard
      for (const [key, value] of Object.entries(result.values)) {
        context.blackboard.set(key, value);
      }

      // Store DataRefs for large results
      for (const [key, ref] of Object.entries(result.dataRefs)) {
        context.blackboard.set(key, ref);
      }

      this.log(
        `Code execution completed in ${result.executionTimeMs}ms ` +
          `(${Object.keys(result.values).length} values, ${Object.keys(result.dataRefs).length} refs)`
      );

      return NodeStatus.SUCCESS;
    } catch (error) {
      // Extract the actual error message from Temporal's ActivityFailure chain
      // ActivityFailure -> ApplicationFailure -> cause -> actual error
      let actualMessage = error instanceof Error ? error.message : String(error);

      // Try to extract the actual cause from Temporal's error chain
      if (error && typeof error === "object") {
        const err = error as {
          cause?: {
            message?: string;
            cause?: { message?: string };
          };
        };
        // ActivityFailure.cause is ApplicationFailure
        // ApplicationFailure.cause.message is the actual error
        if (err.cause?.cause?.message) {
          actualMessage = err.cause.cause.message;
        } else if (err.cause?.message) {
          actualMessage = err.cause.message;
        }
      }

      this.log(`Code execution failed: ${actualMessage}`);

      // Re-throw with the extracted message so ActionNode's error handler
      // can emit ERROR event with the actual error context
      throw new Error(`Code execution failed: ${actualMessage}`);
    }
  }
}
