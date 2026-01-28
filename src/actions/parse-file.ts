/**
 * ParseFile Node
 *
 * Parses CSV/Excel files into structured data via a Temporal activity.
 * This node requires the `parseFile` activity to be configured in the context -
 * it does not support standalone/inline execution because file I/O requires
 * capabilities outside the workflow sandbox.
 *
 * Features:
 * - CSV and Excel (xlsx, xls) file format support
 * - Column mapping/renaming
 * - Parse options (skip rows, trim, date parsing)
 * - Result stored in blackboard
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  type ParseFileRequest,
  NodeStatus,
} from "../types.js";
import { resolveValue, type VariableContext } from "../utilities/variable-resolver.js";

/**
 * Configuration for ParseFile node
 */
export interface ParseFileConfig extends NodeConfiguration {
  /** Path to file (supports ${input.file}, ${bb.filePath}) */
  file: string;
  /** File format */
  format?: "csv" | "xlsx" | "xls" | "auto";
  /** Sheet name for Excel (default: first sheet) */
  sheetName?: string;
  /** Column mapping { "Original Name": "normalizedName" } */
  columnMapping?: Record<string, string>;
  /** Output key on blackboard */
  outputKey: string;
  /** Parse options */
  options?: ParseFileRequest["options"];
}

/**
 * ParseFile Node
 *
 * Parses CSV/Excel files into structured data and stores the result in blackboard.
 * Requires the `parseFile` activity to be configured.
 *
 * @example YAML
 * ```yaml
 * type: ParseFile
 * id: parse-orders
 * props:
 *   file: "${input.orderFile}"
 *   format: csv
 *   columnMapping:
 *     "Order ID": "orderId"
 *     "Customer Name": "customerName"
 *     "Amount": "amount"
 *   outputKey: "orders"
 *   options:
 *     skipRows: 1
 *     trim: true
 * ```
 */
export class ParseFile extends ActionNode {
  private file: string;
  private format: ParseFileConfig["format"];
  private sheetName?: string;
  private columnMapping?: Record<string, string>;
  private outputKey: string;
  private options?: ParseFileRequest["options"];

  constructor(config: ParseFileConfig) {
    super(config);

    if (!config.file) {
      throw new ConfigurationError("ParseFile requires file");
    }

    if (!config.outputKey) {
      throw new ConfigurationError("ParseFile requires outputKey");
    }

    this.file = config.file;
    this.format = config.format || "auto";
    this.sheetName = config.sheetName;
    this.columnMapping = config.columnMapping;
    this.outputKey = config.outputKey;
    this.options = config.options;
  }

  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    // Validate activity is available
    if (!context.activities?.parseFile) {
      this._lastError =
        "ParseFile requires activities.parseFile to be configured. " +
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

      const resolvedFile = resolveValue(this.file, varCtx) as string;

      const request: ParseFileRequest = {
        file: resolvedFile,
        format: this.format,
        sheetName: this.sheetName,
        columnMapping: this.columnMapping,
        options: this.options,
      };

      this.log(`Parsing file: ${resolvedFile} (format: ${this.format || "auto"})`);
      const result = await context.activities.parseFile(request);

      // Store parsed data in blackboard
      context.blackboard.set(this.outputKey, result.data);

      this.log(
        `Parsed ${result.rowCount} rows from ${resolvedFile}, ` +
        `columns: [${result.columns.join(", ")}]`
      );

      return NodeStatus.SUCCESS;
    } catch (error) {
      this._lastError = error instanceof Error ? error.message : String(error);
      this.log(`Parse file failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
