/**
 * GenerateFile Node
 *
 * Generates CSV/Excel/JSON files from data via a Temporal activity.
 * This node requires the `generateFile` activity to be configured in the context -
 * it does not support standalone/inline execution because file I/O requires
 * capabilities outside the workflow sandbox.
 *
 * Features:
 * - CSV, Excel (xlsx), and JSON output formats
 * - Column definitions with header names and widths
 * - Temporary or persistent storage
 * - Result metadata stored in blackboard (filename, path, URL)
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  type GenerateFileRequest,
  NodeStatus,
} from "../types.js";
import { resolveValue, type VariableContext } from "../utilities/variable-resolver.js";

/**
 * Configuration for GenerateFile node
 */
export interface GenerateFileConfig extends NodeConfiguration {
  /** Output format */
  format: "csv" | "xlsx" | "json";
  /** Data source (blackboard key) */
  dataKey: string;
  /** Column definitions */
  columns?: Array<{ header: string; key: string; width?: number }>;
  /** Output filename template (supports ${input.x}, ${bb.x}) */
  filename: string;
  /** Storage type */
  storage: "temp" | "persistent";
  /** Output key for file metadata (path, url, size) */
  outputKey: string;
}

/**
 * GenerateFile Node
 *
 * Generates a file from data in the blackboard and stores file metadata.
 * Requires the `generateFile` activity to be configured.
 *
 * @example YAML
 * ```yaml
 * type: GenerateFile
 * id: export-report
 * props:
 *   format: csv
 *   dataKey: "processedOrders"
 *   columns:
 *     - header: "Order ID"
 *       key: "orderId"
 *     - header: "Customer"
 *       key: "customerName"
 *     - header: "Total"
 *       key: "amount"
 *       width: 15
 *   filename: "orders-${bb.timestamp}.csv"
 *   storage: persistent
 *   outputKey: "exportedFile"
 * ```
 */
export class GenerateFile extends ActionNode {
  private format: GenerateFileConfig["format"];
  private dataKey: string;
  private columns?: GenerateFileConfig["columns"];
  private filename: string;
  private storage: GenerateFileConfig["storage"];
  private outputKey: string;

  constructor(config: GenerateFileConfig) {
    super(config);

    if (!config.format) {
      throw new ConfigurationError("GenerateFile requires format");
    }

    if (!config.dataKey) {
      throw new ConfigurationError("GenerateFile requires dataKey");
    }

    if (!config.filename) {
      throw new ConfigurationError("GenerateFile requires filename");
    }

    if (!config.storage) {
      throw new ConfigurationError("GenerateFile requires storage");
    }

    if (!config.outputKey) {
      throw new ConfigurationError("GenerateFile requires outputKey");
    }

    this.format = config.format;
    this.dataKey = config.dataKey;
    this.columns = config.columns;
    this.filename = config.filename;
    this.storage = config.storage;
    this.outputKey = config.outputKey;
  }

  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    // Validate activity is available
    if (!context.activities?.generateFile) {
      this._lastError =
        "GenerateFile requires activities.generateFile to be configured. " +
        "This activity handles file I/O outside the workflow sandbox.";
      this.log(`Error: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }

    try {
      const varCtx: VariableContext = {
        blackboard: context.blackboard,
        input: context.input,
        testData: context.testData,
      };

      // Get data from blackboard
      const data = context.blackboard.get(this.dataKey);
      if (!Array.isArray(data)) {
        this._lastError = `Data at '${this.dataKey}' is not an array (got ${typeof data})`;
        this.log(`Error: ${this._lastError}`);
        return NodeStatus.FAILURE;
      }

      const resolvedFilename = resolveValue(this.filename, varCtx) as string;

      const request: GenerateFileRequest = {
        format: this.format,
        data: data as Record<string, unknown>[],
        columns: this.columns,
        filename: resolvedFilename,
        storage: this.storage,
      };

      this.log(
        `Generating ${this.format} file: ${resolvedFilename} ` +
        `(${data.length} rows, storage: ${this.storage})`
      );

      const result = await context.activities.generateFile(request);

      // Store file metadata in blackboard
      context.blackboard.set(this.outputKey, result);

      this.log(
        `Generated file: ${result.filename} ` +
        `(${result.size} bytes, path: ${result.path})`
      );

      return NodeStatus.SUCCESS;
    } catch (error) {
      this._lastError = error instanceof Error ? error.message : String(error);
      this.log(`Generate file failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
