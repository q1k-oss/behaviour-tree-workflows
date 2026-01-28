/**
 * ExecutionTracker - Aggregates node events into queryable state
 * Used by workflow query handlers to expose real-time execution progress
 */

import { NodeEventType } from "../events.js";
import type {
  ExecutionProgress,
  NodeState,
  StructuredError,
  TimelineEntry,
  ObservableNodeEvent,
} from "./types.js";

/**
 * Tracks execution state by subscribing to node events
 * Provides query methods for progress, node states, errors, and timeline
 */
export class ExecutionTracker {
  private nodeStates = new Map<string, NodeState>();
  private timeline: TimelineEntry[] = [];
  private errors: StructuredError[] = [];
  private pathTaken: string[] = [];
  private startedAt: number = Date.now();
  private currentNodeId: string | null = null;
  private totalNodes: number;
  private finished: boolean = false;

  constructor(totalNodes: number) {
    this.totalNodes = totalNodes;
  }

  /**
   * Process a node event and update internal state
   * Called by NodeEventEmitter subscription
   */
  onNodeEvent(event: ObservableNodeEvent): void {
    const state = this.getOrCreateState(
      event.nodeId,
      event.nodeType,
      event.nodeName,
      event.nodePath
    );

    const eventType = event.type as NodeEventType;

    switch (eventType) {
      case NodeEventType.TICK_START:
        this.handleTickStart(state, event);
        break;

      case NodeEventType.TICK_END:
        this.handleTickEnd(state, event);
        break;

      case NodeEventType.ERROR:
        this.handleError(state, event);
        break;

      case NodeEventType.LOG:
        // Log events don't affect tracking state
        break;

      case NodeEventType.HALT:
      case NodeEventType.RESET:
        // Could track these for debugging, but not critical for progress
        break;
    }
  }

  private handleTickStart(state: NodeState, event: ObservableNodeEvent): void {
    state.status = "running";
    state.tickCount++;
    state.lastTickAt = event.timestamp;
    this.currentNodeId = event.nodeId;

    this.timeline.push({
      nodeId: event.nodeId,
      nodeType: event.nodeType,
      nodeName: event.nodeName,
      nodePath: event.nodePath ?? "",
      event: "start",
      timestamp: event.timestamp,
    });
  }

  private handleTickEnd(state: NodeState, event: ObservableNodeEvent): void {
    const status = event.data?.status;
    const durationMs = event.data?.durationMs;

    // Map NodeStatus strings to our simpler status
    if (status === "SUCCESS") {
      state.status = "success";
      if (!this.pathTaken.includes(event.nodeId)) {
        this.pathTaken.push(event.nodeId);
      }
    } else if (status === "FAILURE") {
      state.status = "failure";
    } else if (status === "RUNNING") {
      state.status = "running";
    } else {
      state.status = "idle";
    }

    if (durationMs !== undefined) {
      state.durationMs = durationMs;
    }

    this.timeline.push({
      nodeId: event.nodeId,
      nodeType: event.nodeType,
      nodeName: event.nodeName,
      nodePath: event.nodePath ?? "",
      event: "end",
      timestamp: event.timestamp,
      status: state.status,
      durationMs: state.durationMs,
    });

    // Clear current node if this was it
    if (this.currentNodeId === event.nodeId && state.status !== "running") {
      this.currentNodeId = null;
    }
  }

  private handleError(state: NodeState, event: ObservableNodeEvent): void {
    state.status = "failure";
    const errorData = event.data?.error;
    state.lastError = errorData?.message ?? "Unknown error";

    const structuredError: StructuredError = {
      nodeId: event.nodeId,
      nodeType: event.nodeType,
      nodeName: event.nodeName,
      nodePath: event.nodePath ?? "",
      message: errorData?.message ?? "Unknown error",
      stack: errorData?.stack,
      timestamp: event.timestamp,
      blackboardSnapshot: event.data?.blackboard ?? {},
      nodeInput: errorData?.input,
      recoverable: this.isRecoverable(event.nodeType),
      suggestedFix: this.suggestFix(event),
    };

    this.errors.push(structuredError);

    this.timeline.push({
      nodeId: event.nodeId,
      nodeType: event.nodeType,
      nodeName: event.nodeName,
      nodePath: event.nodePath ?? "",
      event: "error",
      timestamp: event.timestamp,
      error: {
        message: structuredError.message,
        stack: structuredError.stack,
      },
    });
  }

  /**
   * Mark execution as finished
   */
  markFinished(): void {
    this.finished = true;
    this.currentNodeId = null;
  }

  /**
   * Get overall execution progress
   */
  getProgress(): ExecutionProgress {
    const states = [...this.nodeStates.values()];
    const completed = states.filter((n) => n.status === "success").length;
    const failed = states.filter((n) => n.status === "failure").length;

    let status: "running" | "completed" | "failed";
    if (failed > 0) {
      status = "failed";
    } else if (this.finished) {
      status = "completed";
    } else if (this.currentNodeId) {
      status = "running";
    } else {
      status = "completed";
    }

    return {
      totalNodes: this.totalNodes,
      completedNodes: completed,
      failedNodes: failed,
      currentNodeId: this.currentNodeId,
      currentNodeType: this.nodeStates.get(this.currentNodeId ?? "")?.type ?? null,
      pathTaken: [...this.pathTaken],
      startedAt: this.startedAt,
      lastActivityAt:
        this.timeline[this.timeline.length - 1]?.timestamp ?? this.startedAt,
      status,
    };
  }

  /**
   * Get all node states
   */
  getNodeStates(): Map<string, NodeState> {
    return new Map(this.nodeStates);
  }

  /**
   * Get node states as a plain object (for JSON serialization)
   */
  getNodeStatesObject(): Record<string, NodeState> {
    const result: Record<string, NodeState> = {};
    for (const [id, state] of this.nodeStates) {
      result[id] = { ...state };
    }
    return result;
  }

  /**
   * Get all errors that occurred during execution
   */
  getErrors(): StructuredError[] {
    return [...this.errors];
  }

  /**
   * Get the full execution timeline
   */
  getTimeline(): TimelineEntry[] {
    return [...this.timeline];
  }

  /**
   * Get state for a specific node
   */
  getNodeState(nodeId: string): NodeState | undefined {
    return this.nodeStates.get(nodeId);
  }

  private getOrCreateState(
    id: string,
    type: string,
    name: string,
    path?: string
  ): NodeState {
    if (!this.nodeStates.has(id)) {
      this.nodeStates.set(id, {
        id,
        type,
        name,
        path: path ?? "",
        status: "idle",
        tickCount: 0,
      });
    }
    return this.nodeStates.get(id)!;
  }

  /**
   * Check if an error type is potentially recoverable with retry
   */
  private isRecoverable(nodeType: string): boolean {
    // Nodes that often fail due to transient issues
    const recoverableTypes = [
      "FetchUrl",
      "HttpRequest",
      "CodeExecution",
      "ParseFile",
      "GenerateFile",
      "IntegrationAction",
    ];
    return recoverableTypes.includes(nodeType);
  }

  /**
   * Suggest a fix based on error patterns
   */
  private suggestFix(event: ObservableNodeEvent): string | undefined {
    const msg = event.data?.error?.message ?? "";
    const nodeType = event.nodeType;

    // Timeout errors
    if (msg.includes("timeout") || msg.includes("TIMEOUT") || msg.includes("timed out")) {
      return "Consider increasing timeout or adding retry decorator";
    }

    // Undefined/null access
    if (msg.includes("undefined") || msg.includes("null") || msg.includes("Cannot read property")) {
      return "Check if required blackboard key exists before accessing";
    }

    // Network errors
    if (msg.includes("network") || msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      return "Check URL accessibility, consider adding retry decorator";
    }

    // Authentication errors
    if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized")) {
      return "Check authentication credentials and permissions";
    }

    // File not found
    if (msg.includes("not found") || msg.includes("ENOENT") || msg.includes("404")) {
      return "Verify file path or URL exists";
    }

    // Code execution errors
    if (nodeType === "CodeExecution") {
      if (msg.includes("SyntaxError")) {
        return "Fix syntax error in code";
      }
      if (msg.includes("ReferenceError")) {
        return "Variable not defined - check getBB() keys";
      }
    }

    return undefined;
  }
}
