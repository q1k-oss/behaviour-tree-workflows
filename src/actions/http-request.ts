/**
 * HttpRequest Node
 *
 * Makes HTTP requests via a Temporal activity.
 * This node requires the `fetchUrl` activity to be configured in the context -
 * it does not support standalone/inline execution because HTTP I/O requires
 * capabilities outside the workflow sandbox.
 *
 * Features:
 * - Support for GET, POST, PUT, DELETE, PATCH methods
 * - Variable resolution in URL, headers, and body
 * - Configurable response parsing (JSON/text/binary)
 * - Retry with exponential backoff support
 * - Timeout configuration
 * - Result stored in blackboard
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  type HttpRequestActivity,
  NodeStatus,
} from "../types.js";
import { resolveValue, type VariableContext } from "../utilities/variable-resolver.js";

/**
 * Configuration for HttpRequest node
 */
export interface HttpRequestConfig extends NodeConfiguration {
  /** URL to request (supports ${input.x}, ${bb.x}) */
  url: string;
  /** HTTP method (default: GET) */
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** Request headers (supports variable resolution) */
  headers?: Record<string, string>;
  /** Request body (supports variable resolution) */
  body?: unknown;
  /** Expected response type for parsing */
  responseType?: "json" | "text" | "binary";
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    backoffMs: number;
  };
  /** Output key on blackboard for response */
  outputKey: string;
}

/**
 * HttpRequest Node
 *
 * Makes HTTP requests via a Temporal activity and stores the response in blackboard.
 * Requires the `fetchUrl` activity to be configured.
 *
 * @example YAML
 * ```yaml
 * type: HttpRequest
 * id: fetch-user
 * props:
 *   url: "https://api.example.com/users/${input.userId}"
 *   method: GET
 *   headers:
 *     Authorization: "Bearer ${bb.accessToken}"
 *   timeout: 5000
 *   responseType: json
 *   outputKey: "userData"
 * ```
 *
 * @example YAML with POST
 * ```yaml
 * type: HttpRequest
 * id: create-order
 * props:
 *   url: "https://api.example.com/orders"
 *   method: POST
 *   headers:
 *     Content-Type: "application/json"
 *     Authorization: "Bearer ${bb.token}"
 *   body:
 *     customerId: "${input.customerId}"
 *     items: "${bb.cartItems}"
 *   timeout: 10000
 *   retry:
 *     maxAttempts: 3
 *     backoffMs: 1000
 *   outputKey: "orderResponse"
 * ```
 */
export class HttpRequest extends ActionNode {
  private url: string;
  private method: HttpRequestConfig["method"];
  private headers?: Record<string, string>;
  private body?: unknown;
  private responseType: HttpRequestConfig["responseType"];
  private timeout?: number;
  private retry?: HttpRequestConfig["retry"];
  private outputKey: string;

  constructor(config: HttpRequestConfig) {
    super(config);

    if (!config.url) {
      throw new ConfigurationError("HttpRequest requires url");
    }

    if (!config.outputKey) {
      throw new ConfigurationError("HttpRequest requires outputKey");
    }

    this.url = config.url;
    this.method = config.method || "GET";
    this.headers = config.headers;
    this.body = config.body;
    this.responseType = config.responseType || "json";
    this.timeout = config.timeout;
    this.retry = config.retry;
    this.outputKey = config.outputKey;
  }

  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    // Validate activity is available
    if (!context.activities?.fetchUrl) {
      this._lastError =
        "HttpRequest requires activities.fetchUrl to be configured. " +
        "This activity handles HTTP I/O outside the workflow sandbox.";
      this.log(`Error: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }

    try {
      const varCtx: VariableContext = {
        blackboard: context.blackboard,
        input: context.input,
        testData: context.testData,
      };

      // Resolve variables in URL, headers, and body
      const resolvedUrl = resolveValue(this.url, varCtx) as string;
      const resolvedHeaders = this.headers
        ? (resolveValue(this.headers, varCtx) as Record<string, string>)
        : undefined;
      const resolvedBody = this.body !== undefined
        ? resolveValue(this.body, varCtx)
        : undefined;

      const request: HttpRequestActivity = {
        url: resolvedUrl,
        method: this.method || "GET",
        headers: resolvedHeaders,
        body: resolvedBody,
        timeout: this.timeout,
      };

      this.log(`HTTP ${request.method} ${resolvedUrl}`);

      // Execute with retry logic if configured
      let response;
      let lastError: Error | undefined;
      const maxAttempts = this.retry?.maxAttempts || 1;
      const backoffMs = this.retry?.backoffMs || 1000;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          response = await context.activities.fetchUrl(request);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (attempt < maxAttempts) {
            const delay = backoffMs * Math.pow(2, attempt - 1);
            this.log(`Request failed, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
            await this.sleep(delay);
          }
        }
      }

      if (lastError) {
        throw lastError;
      }

      if (!response) {
        throw new Error("No response received");
      }

      // Parse response based on responseType
      let parsedData = response.data;
      if (this.responseType === "json" && typeof response.data === "string") {
        try {
          parsedData = JSON.parse(response.data);
        } catch {
          // Keep as string if parsing fails
          this.log("Response is not valid JSON, keeping as string");
        }
      }

      // Store response in blackboard
      context.blackboard.set(this.outputKey, {
        status: response.status,
        headers: response.headers,
        data: parsedData,
      });

      this.log(
        `HTTP ${request.method} ${resolvedUrl} -> ${response.status}`
      );

      // Consider 2xx status codes as success
      return response.status >= 200 && response.status < 300
        ? NodeStatus.SUCCESS
        : NodeStatus.FAILURE;
    } catch (error) {
      this._lastError = error instanceof Error ? error.message : String(error);
      this.log(`HTTP request failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }

  /**
   * Sleep for the specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
