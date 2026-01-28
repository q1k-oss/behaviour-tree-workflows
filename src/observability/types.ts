/**
 * Observability types for workflow execution tracking
 * Used by ExecutionTracker and Analyzer Agent
 */

/**
 * Overall execution progress summary
 */
export interface ExecutionProgress {
  /** Total number of nodes in the tree */
  totalNodes: number;
  /** Number of nodes that completed successfully */
  completedNodes: number;
  /** Number of nodes that failed */
  failedNodes: number;
  /** Currently executing node ID (null if not running) */
  currentNodeId: string | null;
  /** Type of currently executing node */
  currentNodeType: string | null;
  /** Ordered list of node IDs that have been executed */
  pathTaken: string[];
  /** Timestamp when execution started */
  startedAt: number;
  /** Timestamp of last activity */
  lastActivityAt: number;
  /** Overall status */
  status: "running" | "completed" | "failed";
}

/**
 * State of a single node during execution
 */
export interface NodeState {
  /** Node ID */
  id: string;
  /** Node type (e.g., "Sequence", "CodeExecution") */
  type: string;
  /** Node name */
  name: string;
  /** Tree path (e.g., "/0/1/2") */
  path: string;
  /** Current status */
  status: "idle" | "running" | "success" | "failure";
  /** Last error message if failed */
  lastError?: string;
  /** Number of times this node has been ticked */
  tickCount: number;
  /** Timestamp of last tick */
  lastTickAt?: number;
  /** Duration of last tick in ms */
  durationMs?: number;
}

/**
 * Structured error with rich context for debugging
 */
export interface StructuredError {
  /** Node ID where error occurred */
  nodeId: string;
  /** Node type */
  nodeType: string;
  /** Node name */
  nodeName: string;
  /** Tree path (e.g., "/0/1/2") */
  nodePath: string;
  /** Error message */
  message: string;
  /** Error stack trace (if available) */
  stack?: string;
  /** Timestamp when error occurred */
  timestamp: number;
  /** Blackboard snapshot at time of error */
  blackboardSnapshot: Record<string, unknown>;
  /** Input that was passed to the node */
  nodeInput?: unknown;
  /** Whether this error is potentially recoverable with retry */
  recoverable: boolean;
  /** Suggested fix based on error analysis */
  suggestedFix?: string;
}

/**
 * Entry in the execution timeline
 */
export interface TimelineEntry {
  /** Node ID */
  nodeId: string;
  /** Node type */
  nodeType: string;
  /** Node name */
  nodeName: string;
  /** Tree path */
  nodePath: string;
  /** Event type */
  event: "start" | "end" | "error";
  /** Timestamp */
  timestamp: number;
  /** Final status (for end events) */
  status?: string;
  /** Duration in ms (for end events) */
  durationMs?: number;
  /** Error details (for error events) */
  error?: {
    message: string;
    stack?: string;
  };
}

/**
 * Extended NodeEvent with path and blackboard context
 * Used internally by ExecutionTracker
 */
export interface ObservableNodeEvent {
  type: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  nodePath?: string;
  timestamp: number;
  data?: {
    status?: string;
    durationMs?: number;
    error?: {
      message: string;
      stack?: string;
      input?: unknown;
    };
    blackboard?: Record<string, unknown>;
  };
}
