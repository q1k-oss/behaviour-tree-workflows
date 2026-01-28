/**
 * Activity implementations for btree workflows
 *
 * These run in the worker process (outside the workflow sandbox)
 * and handle all I/O operations deterministically for Temporal.
 */

import {
  executePieceAction,
  type PieceActivityRequest,
  type PythonScriptRequest,
  type PythonScriptResult,
  type ParseFileRequest,
  type ParseFileResult,
  type GenerateFileRequest,
  type GenerateFileResult,
  type HttpRequestActivity,
  type HttpResponseActivity,
} from "../../dist/index.js";

/**
 * Execute an Active Pieces action
 * This wraps the btree executePieceAction for use as a Temporal activity
 */
export async function executePieceActionActivity(
  request: PieceActivityRequest
): Promise<unknown> {
  console.log(
    `[Activity] executePieceAction: ${request.provider}/${request.action}`
  );
  console.log(`[Activity] Inputs:`, JSON.stringify(request.inputs, null, 2));

  // For testing without actual credentials, we can mock responses
  if (process.env.BTREE_MOCK_ACTIVITIES === "true") {
    console.log(`[Activity] MOCK MODE - returning simulated response`);
    return mockPieceAction(request);
  }

  // Real execution via Active Pieces
  const result = await executePieceAction(request);
  console.log(`[Activity] Result:`, JSON.stringify(result, null, 2));
  return result;
}

/**
 * Execute Python code (placeholder - would need Python worker)
 */
export async function executePythonScriptActivity(
  request: PythonScriptRequest
): Promise<PythonScriptResult> {
  console.log(`[Activity] executePythonScript`);
  console.log(`[Activity] Code length: ${request.code.length} chars`);

  // Mock implementation for testing
  if (process.env.BTREE_MOCK_ACTIVITIES === "true") {
    console.log(`[Activity] MOCK MODE - returning simulated Python result`);
    return {
      blackboard: request.blackboard,
      stdout: "Mock Python execution",
      stderr: "",
    };
  }

  // Real implementation would call a Python worker via gRPC or subprocess
  throw new Error(
    "Real Python execution requires a Python worker. Set BTREE_MOCK_ACTIVITIES=true for testing."
  );
}

/**
 * Parse a file (CSV/Excel)
 */
export async function parseFileActivity(
  request: ParseFileRequest
): Promise<ParseFileResult> {
  console.log(`[Activity] parseFile: ${request.file}`);

  // Mock implementation for testing
  if (process.env.BTREE_MOCK_ACTIVITIES === "true") {
    console.log(`[Activity] MOCK MODE - returning simulated parsed data`);
    return {
      data: [
        { orderId: "ORD-001", product: "Widget", quantity: 5, price: 10.99 },
        { orderId: "ORD-002", product: "Gadget", quantity: 3, price: 24.99 },
        { orderId: "ORD-003", product: "Gizmo", quantity: 10, price: 5.49 },
      ],
      rowCount: 3,
      columns: ["orderId", "product", "quantity", "price"],
    };
  }

  // Real implementation would use papaparse for CSV, xlsx for Excel
  throw new Error(
    "Real file parsing requires file system access. Set BTREE_MOCK_ACTIVITIES=true for testing."
  );
}

/**
 * Generate a file (CSV/Excel/JSON)
 */
export async function generateFileActivity(
  request: GenerateFileRequest
): Promise<GenerateFileResult> {
  console.log(`[Activity] generateFile: ${request.filename} (${request.format})`);
  console.log(`[Activity] Data rows: ${request.data.length}`);

  // Mock implementation for testing
  if (process.env.BTREE_MOCK_ACTIVITIES === "true") {
    console.log(`[Activity] MOCK MODE - returning simulated file metadata`);
    return {
      filename: request.filename,
      contentType: getContentType(request.format),
      size: JSON.stringify(request.data).length,
      path: `/tmp/${request.filename}`,
      url:
        request.storage === "persistent"
          ? `https://storage.example.com/files/${request.filename}`
          : undefined,
    };
  }

  // Real implementation would use json2csv, xlsx, etc.
  throw new Error(
    "Real file generation requires file system access. Set BTREE_MOCK_ACTIVITIES=true for testing."
  );
}

/**
 * Fetch a URL (HTTP request)
 * Uses native fetch() API with timeout support via AbortController
 */
export async function fetchUrlActivity(
  request: HttpRequestActivity
): Promise<HttpResponseActivity> {
  console.log(`[Activity] fetchUrl: ${request.method} ${request.url}`);

  // Mock implementation for testing
  if (process.env.BTREE_MOCK_ACTIVITIES === "true") {
    console.log(`[Activity] MOCK MODE - returning simulated HTTP response`);
    return mockFetchUrl(request);
  }

  // Real implementation using native fetch
  const controller = new AbortController();
  const timeoutId = request.timeout
    ? setTimeout(() => controller.abort(), request.timeout)
    : null;

  try {
    const fetchOptions: RequestInit = {
      method: request.method,
      headers: request.headers,
      signal: controller.signal,
    };

    // Add body for non-GET requests
    if (request.body !== undefined && request.method !== "GET") {
      fetchOptions.body =
        typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body);
    }

    const response = await fetch(request.url, fetchOptions);

    // Extract headers into a plain object
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Parse response based on content type
    const contentType = response.headers.get("content-type") || "";
    let data: unknown;

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else if (contentType.includes("text/")) {
      data = await response.text();
    } else {
      // For binary data, convert to base64
      const buffer = await response.arrayBuffer();
      data = Buffer.from(buffer).toString("base64");
    }

    console.log(`[Activity] fetchUrl response: ${response.status}`);
    return {
      status: response.status,
      headers,
      data,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${request.timeout}ms`);
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mockPieceAction(request: PieceActivityRequest): unknown {
  const { provider, action, inputs } = request;

  // Google Sheets mocks
  if (provider === "google-sheets" || provider === "google") {
    if (action === "append_row" || action === "insert_row") {
      return {
        spreadsheetId: inputs.spreadsheetId,
        updatedRange: "Sheet1!A1:C1",
        updatedRows: 1,
        updatedColumns: (inputs.values as unknown[])?.length || 3,
        updatedCells: (inputs.values as unknown[])?.length || 3,
      };
    }
    if (action === "get_values" || action === "read_rows") {
      return {
        values: [
          ["Header1", "Header2", "Header3"],
          ["Value1", "Value2", "Value3"],
          ["Value4", "Value5", "Value6"],
        ],
      };
    }
  }

  // Slack mocks
  if (provider === "slack") {
    if (action === "send_message" || action === "post_message") {
      return {
        ok: true,
        channel: inputs.channel || "#general",
        ts: `${Date.now()}.000000`,
        message: {
          text: inputs.text || inputs.message,
          ts: `${Date.now()}.000000`,
        },
      };
    }
  }

  // OpenAI mocks
  if (provider === "openai") {
    if (action === "chat" || action === "ask_chatgpt") {
      return {
        id: `chatcmpl-${Date.now()}`,
        choices: [
          {
            message: {
              role: "assistant",
              content: "This is a mock response from the AI assistant.",
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      };
    }
  }

  // Default mock response
  return {
    success: true,
    provider,
    action,
    timestamp: new Date().toISOString(),
    mock: true,
  };
}

function mockFetchUrl(request: HttpRequestActivity): HttpResponseActivity {
  const { url, method } = request;

  // Simulate different API responses based on URL patterns
  if (url.includes("/users")) {
    if (method === "GET") {
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        data: {
          id: 1,
          name: "Mock User",
          email: "mock@example.com",
        },
      };
    }
    if (method === "POST") {
      return {
        status: 201,
        headers: { "content-type": "application/json" },
        data: {
          id: 123,
          success: true,
          message: "User created",
        },
      };
    }
  }

  if (url.includes("/orders")) {
    if (method === "POST") {
      return {
        status: 201,
        headers: { "content-type": "application/json" },
        data: {
          orderId: `ORD-${Date.now()}`,
          status: "created",
          timestamp: new Date().toISOString(),
        },
      };
    }
    if (method === "GET") {
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        data: {
          orders: [
            { id: "ORD-001", total: 99.99, status: "shipped" },
            { id: "ORD-002", total: 149.99, status: "pending" },
          ],
        },
      };
    }
  }

  if (url.includes("/error")) {
    return {
      status: 500,
      headers: { "content-type": "application/json" },
      data: { error: "Internal Server Error", mock: true },
    };
  }

  if (url.includes("/not-found")) {
    return {
      status: 404,
      headers: { "content-type": "application/json" },
      data: { error: "Not Found", mock: true },
    };
  }

  // Default success response
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    data: {
      success: true,
      url,
      method,
      timestamp: new Date().toISOString(),
      mock: true,
    },
  };
}

function getContentType(format: string): string {
  switch (format) {
    case "csv":
      return "text/csv";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}
