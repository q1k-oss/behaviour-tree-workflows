/**
 * Core types for the Behavior Tree implementation
 * Inspired by BehaviorTree.CPP
 */

/**
 * Status of a node after tick execution
 */
export enum NodeStatus {
  SUCCESS = "SUCCESS",
  FAILURE = "FAILURE",
  RUNNING = "RUNNING",
  IDLE = "IDLE",
}

/**
 * Base configuration for all nodes
 */
export interface NodeConfiguration {
  id: string;
  name?: string;
  [key: string]: unknown; // Additional properties can be passed
}

/**
 * Context passed during tick execution
 */
export interface TickContext {
  blackboard: IScopedBlackboard;
  treeRegistry: ITreeRegistry;
  signal?: AbortSignal;
  deltaTime?: number;
  timestamp: number;

  // Test data parameters (from CSV, data tables, etc.)
  // Used for ${param.key} variable resolution
  testData?: Map<string, unknown>;

  /**
   * Immutable workflow input parameters
   * Accessible via ${input.key} syntax in variable resolution
   * These are passed when the workflow starts and should not be modified
   */
  input?: Readonly<Record<string, unknown>>;

  sessionId?: string;

  // Observable event system (for monitoring, debugging, visualization)
  // External systems can subscribe to node lifecycle events
  eventEmitter?: import("./events.js").NodeEventEmitter;
}

/**
 * Token provider function type for OAuth/API key authentication
 */
export type TokenProvider = (
  context: TemporalContext,
  provider: string,
  connectionId?: string
) => Promise<PieceAuth>;

/**
 * Extended context for Temporal workflow execution
 * Replaces EffectTickContext for Temporal-native execution
 */
export interface TemporalContext extends TickContext {
  // Optional workflow metadata (for activities that need workflow context)
  workflowInfo?: {
    workflowId: string;
    runId: string;
    namespace: string;
  };

  /**
   * Activity functions for I/O operations
   * When provided, I/O nodes use these instead of inline execution
   * Controlplane creates these via proxyActivities() and passes to context
   */
  activities?: BtreeActivities;

  /**
   * Token provider for IntegrationAction authentication
   * Returns OAuth tokens or API keys for third-party services
   */
  tokenProvider?: TokenProvider;
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Activity capabilities that can be provided to btree
 * Controlplane creates these via proxyActivities() and passes to context
 */
export interface BtreeActivities {
  /** Execute an Active Pieces action (Google Sheets, Slack, etc.) */
  executePieceAction: (request: PieceActivityRequest) => Promise<unknown>;

  /** Execute Python code via cross-language activity */
  executePythonScript?: (request: PythonScriptRequest) => Promise<PythonScriptResult>;

  /** Parse CSV/Excel file into structured data */
  parseFile?: (request: ParseFileRequest) => Promise<ParseFileResult>;

  /** Generate CSV/Excel file from data */
  generateFile?: (request: GenerateFileRequest) => Promise<GenerateFileResult>;

  /** Make HTTP request (for nodes that don't use Active Pieces) */
  fetchUrl?: (request: HttpRequestActivity) => Promise<HttpResponseActivity>;

  /** Execute code in sandbox (Microsandbox) - supports JavaScript and Python */
  executeCode?: (request: CodeExecutionRequest) => Promise<CodeExecutionResult>;

  /** Upload file to storage, returns DataRef */
  uploadFile?: (request: UploadFileRequest) => Promise<UploadFileResult>;

  /** Download file from storage */
  downloadFile?: (request: DownloadFileRequest) => Promise<DownloadFileResult>;

  /** Delete file from storage */
  deleteFile?: (request: DeleteFileRequest) => Promise<DeleteFileResult>;

  /** Check if file exists in storage */
  fileExists?: (request: FileExistsRequest) => Promise<FileExistsResult>;

  /** Create approval request and return ID/URL */
  createApproval?: (request: CreateApprovalRequest) => Promise<CreateApprovalResponse>;

  /** Wait for approval signal (uses Temporal condition) */
  waitForApproval?: (request: WaitForApprovalRequest) => Promise<WaitForApprovalResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity Request/Response Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Authentication credentials for a piece
 */
export type PieceAuth =
  | { access_token: string; refresh_token?: string }
  | { api_key: string }
  | Record<string, unknown>;

export interface PieceActivityRequest {
  provider: string;
  action: string;
  inputs: Record<string, unknown>;
  auth: PieceAuth;
}

export interface PythonScriptRequest {
  /** Python code to execute */
  code: string;
  /** Blackboard snapshot (serializable) */
  blackboard: Record<string, unknown>;
  /** Workflow input (read-only) */
  input?: Record<string, unknown>;
  /** Allowed environment variables */
  env?: Record<string, string>;
  /** Execution timeout in ms */
  timeout?: number;
}

export interface PythonScriptResult {
  /** Modified blackboard values */
  blackboard: Record<string, unknown>;
  /** Stdout from Python execution */
  stdout?: string;
  /** Stderr from Python execution */
  stderr?: string;
}

export interface ParseFileRequest {
  /** File path or URL */
  file: string;
  /** File format (auto-detect if not specified) */
  format?: "csv" | "xlsx" | "xls" | "auto";
  /** Sheet name for Excel (default: first sheet) */
  sheetName?: string;
  /** Column mapping { "Original Name": "normalizedName" } */
  columnMapping?: Record<string, string>;
  /** Parse options */
  options?: {
    skipRows?: number;
    trim?: boolean;
    emptyAsNull?: boolean;
    dateColumns?: string[];
    dateFormat?: string;
  };
}

export interface ParseFileResult {
  /** Parsed data rows */
  data: Record<string, unknown>[];
  /** Number of rows parsed */
  rowCount: number;
  /** Column names detected */
  columns: string[];
}

export interface GenerateFileRequest {
  /** Output format */
  format: "csv" | "xlsx" | "json";
  /** Data to write */
  data: Record<string, unknown>[];
  /** Column definitions */
  columns?: Array<{ header: string; key: string; width?: number }>;
  /** Output filename */
  filename: string;
  /** Storage type */
  storage: "temp" | "persistent";
}

export interface GenerateFileResult {
  /** Generated filename */
  filename: string;
  /** MIME type */
  contentType: string;
  /** File size in bytes */
  size: number;
  /** File path or storage key */
  path: string;
  /** Pre-signed download URL (if persistent) */
  url?: string;
}

export interface HttpRequestActivity {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

export interface HttpResponseActivity {
  status: number;
  headers: Record<string, string>;
  data: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// File Storage Activity Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadFileRequest {
  /** Base64-encoded file content */
  fileBytes: string;
  /** Target filename */
  filename: string;
  /** MIME type */
  contentType?: string;
  /** Workflow ID for organizing storage */
  workflowId?: string;
}

export interface UploadFileResult {
  /** Reference to stored file */
  dataRef: DataRef;
  /** Uploaded filename */
  filename: string;
  /** File size in bytes */
  sizeBytes: number;
}

export interface DownloadFileRequest {
  /** Reference to file in storage */
  dataRef: DataRef;
}

export interface DownloadFileResult {
  /** Base64-encoded file content */
  fileBytes: string;
  /** File size in bytes */
  sizeBytes: number;
}

export interface DeleteFileRequest {
  /** Reference to file in storage */
  dataRef: DataRef;
}

export interface DeleteFileResult {
  /** Whether deletion was successful */
  deleted: boolean;
  /** Key of deleted file */
  key: string;
}

export interface FileExistsRequest {
  /** Reference to file in storage */
  dataRef: DataRef;
}

export interface FileExistsResult {
  /** Whether file exists */
  exists: boolean;
  /** Key checked */
  key: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Code Execution Types (Microsandbox)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reference to data stored in a DataStore
 * Import from data-store module for full type, this is a lightweight re-export
 */
export interface DataRef {
  store: "gcs" | "s3" | "redis" | "memory";
  key: string;
  sizeBytes?: number;
  expiresAt?: number;
}

/**
 * Request for code execution in a sandboxed environment
 */
export interface CodeExecutionRequest {
  /** Code to execute */
  code: string;
  /** Programming language */
  language: "javascript" | "python";
  /** References to large data stored in DataStore */
  dataRefs?: Record<string, DataRef>;
  /** Inline context data (small values) */
  context?: Record<string, unknown>;
  /** Workflow input data (read-only) */
  input?: Record<string, unknown>;
  /** Execution timeout in milliseconds */
  timeout?: number;
  /** Python packages to install before execution */
  packages?: string[];
  /** Associated workflow ID for data storage */
  workflowId?: string;
}

/**
 * Result from code execution
 */
export interface CodeExecutionResult {
  /** Small values returned inline */
  values: Record<string, unknown>;
  /** Large values stored in DataStore (returns refs) */
  dataRefs: Record<string, DataRef>;
  /** Console/stdout output from execution */
  logs: string[];
  /** Total execution time in milliseconds */
  executionTimeMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval Activity Types (Human-in-the-Loop)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Request to create an approval request in database
 */
export interface CreateApprovalRequest {
  /** Node ID that initiated approval */
  nodeId: string;
  /** Email of person who can approve */
  approverEmail: string;
  /** Optional role requirement */
  approverRole?: string;
  /** Approval title/subject */
  title: string;
  /** Detailed description */
  description?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Workflow ID for association */
  workflowId?: string;
}

/**
 * Response from creating approval request
 */
export interface CreateApprovalResponse {
  /** Generated approval ID */
  approvalId: string;
  /** URL for approval UI */
  approvalUrl: string;
}

/**
 * Request to wait for approval (used in workflow)
 */
export interface WaitForApprovalRequest {
  /** Node ID to match against signal */
  nodeId: string;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Behavior on timeout */
  onTimeout: "approve" | "reject";
}

/**
 * Response from approval (either via signal or timeout)
 */
export interface WaitForApprovalResponse {
  /** Whether approved or rejected */
  approved: boolean;
  /** User ID who approved/rejected */
  approverId?: string;
  /** Optional comments from approver */
  comments?: string;
  /** When response was received */
  respondedAt: string;
}

/**
 * Port definition for typed inputs/outputs
 */
export interface PortDefinition {
  name: string;
  type: "input" | "output" | "inout";
  description?: string;
  defaultValue?: unknown;
  required?: boolean;
}

/**
 * Base interface for all tree nodes
 */
export interface TreeNode {
  readonly id: string;
  readonly name: string;
  readonly type: string;

  // Core methods - returns Promise for async/RUNNING semantics
  // All errors are caught and converted to NodeStatus.FAILURE
  tick(context: TemporalContext): Promise<NodeStatus>;
  halt(): void;
  reset(): void;
  clone(): TreeNode;

  // Port management
  providedPorts?(): PortDefinition[];

  // Status
  status(): NodeStatus;

  // Error tracking - stores the actual error message when node fails
  lastError?: string;

  // Hierarchy
  parent?: TreeNode;
  children?: TreeNode[];
}

/**
 * Constructor type for node factories
 */
export type NodeConstructor<T extends TreeNode = TreeNode> = new (
  config: NodeConfiguration,
) => T;

/**
 * Node metadata for registry
 */
export interface NodeMetadata {
  type: string;
  category: "action" | "condition" | "decorator" | "composite" | "subtree";
  description?: string;
  ports?: PortDefinition[];
}

/**
 * Interface for tree registry (session-scoped)
 * Used by nodes like StepGroup and LocateElement to lookup behavior trees
 */
export interface ITreeRegistry {
  hasTree(id: string): boolean;
  cloneTree(id: string): { getRoot(): TreeNode };
  getAllTreeIds(): string[];
  registerTree(
    id: string,
    tree: { getRoot(): TreeNode; clone(): { getRoot(): TreeNode } },
    sourceFile: string,
  ): void;
  getTree(
    id: string,
  ): { getRoot(): TreeNode; clone(): { getRoot(): TreeNode } } | undefined;
  getTreeSourceFile(id: string): string | undefined;
  getTreesForFile(
    filePath: string,
  ): Map<string, { getRoot(): TreeNode; clone(): { getRoot(): TreeNode } }>;
}

/**
 * Interface for scoped blackboard
 */
export interface IScopedBlackboard {
  // Basic operations - simple mutable API
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;

  // Scoped operations
  createScope(name: string): IScopedBlackboard;
  getParentScope(): IScopedBlackboard | null;
  getScopeName(): string;
  getFullScopePath(): string;

  // Port operations (typed access)
  getPort<T>(key: string, defaultValue?: T): T;
  setPort<T>(key: string, value: T): void;

  // Utilities
  keys(): string[];
  entries(): [string, unknown][];
  toJSON(): Record<string, unknown>;

  // Snapshot utilities - uses native structuredClone for deep cloning
  clone(): IScopedBlackboard;
}

/**
 * Arguments passed to a BehaviorTree workflow
 */
export interface WorkflowArgs {
  /**
   * Input data to initialize the blackboard
   */
  input?: Record<string, unknown>;

  /**
   * Tree registry for looking up subtrees
   */
  treeRegistry: ITreeRegistry;

  /**
   * Optional session ID
   */
  sessionId?: string;

  /**
   * Activity functions for I/O operations (optional)
   * When provided, nodes that support activities will use them instead of inline execution
   * Controlplane creates these via proxyActivities() and passes them here
   */
  activities?: BtreeActivities;

  /**
   * Token provider for IntegrationAction authentication (optional)
   * Returns OAuth tokens or API keys for third-party services
   */
  tokenProvider?: TokenProvider;
}

/**
 * Result returned from a BehaviorTree workflow
 */
export interface WorkflowResult {
  /**
   * Final status of the tree
   */
  status: NodeStatus;

  /**
   * Final blackboard state
   */
  output: Record<string, unknown>;
}
