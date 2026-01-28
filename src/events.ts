/**
 * Event system for observing behavior tree execution
 * Enables external systems (debuggers, monitors, agents) to track execution in real-time
 */

// Effect-TS removed in Phase 1 - toStream() method commented out

/**
 * Types of events emitted by nodes during execution
 */
export enum NodeEventType {
  TICK_START = "tick_start",
  TICK_END = "tick_end",
  STATUS_CHANGE = "status_change",
  ERROR = "error",
  HALT = "halt",
  RESET = "reset",
  LOG = "log",
}

/**
 * Data for LOG events emitted by LogMessage nodes
 */
export interface LogEventData {
  level: "info" | "warn" | "error" | "debug";
  message: string;
}

/**
 * Event emitted by a node during execution
 */
export interface NodeEvent<TData> {
  type: NodeEventType;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  timestamp: number;
  /** Tree path (e.g., "/0/1/2") - set by tree execution */
  nodePath?: string;
  data?: TData;
}

/**
 * Callback function for node events
 */
export type NodeEventCallback<TData> = (event: NodeEvent<TData>) => void;

/**
 * Event emitter for behavior tree nodes
 * Supports subscribing to specific event types and emitting events
 */
export class NodeEventEmitter {
  private listeners: Map<NodeEventType, Set<NodeEventCallback<unknown>>> =
    new Map();
  private allListeners: Set<NodeEventCallback<unknown>> = new Set();

  /**
   * Subscribe to a specific event type
   * @param type - The event type to listen for
   * @param callback - Function to call when event occurs
   */
  on<TData>(type: NodeEventType, callback: NodeEventCallback<TData>): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(callback as NodeEventCallback<unknown>);
  }

  /**
   * Subscribe to all event types
   * @param callback - Function to call for any event
   */
  onAll<TData>(callback: NodeEventCallback<TData>): void {
    this.allListeners.add(callback as NodeEventCallback<unknown>);
  }

  /**
   * Unsubscribe from a specific event type
   * @param type - The event type to stop listening for
   * @param callback - The callback to remove
   */
  off<TData>(type: NodeEventType, callback: NodeEventCallback<TData>): void {
    this.listeners.get(type)?.delete(callback as NodeEventCallback<unknown>);
  }

  /**
   * Unsubscribe from all events
   * @param callback - The callback to remove
   */
  offAll<TData>(callback: NodeEventCallback<TData>): void {
    this.allListeners.delete(callback as NodeEventCallback<unknown>);
  }

  /**
   * Emit an event to all registered listeners
   * Errors in callbacks are caught and logged to prevent breaking execution
   * @param event - The event to emit
   */
  emit<TData>(event: NodeEvent<TData>): void {
    // Emit to type-specific listeners
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const callback of typeListeners) {
        try {
          callback(event as NodeEvent<unknown>);
        } catch (error) {
          console.error(`Error in event callback for ${event.type}:`, error);
        }
      }
    }

    // Emit to "all events" listeners
    for (const callback of this.allListeners) {
      try {
        callback(event);
      } catch (error) {
        console.error("Error in event callback (onAll):", error);
      }
    }
  }

  /**
   * Remove all listeners
   */
  clear(): void {
    this.listeners.clear();
    this.allListeners.clear();
  }

  /**
   * Get count of listeners for a specific type
   * @param type - The event type to check
   * @returns Number of listeners
   */
  listenerCount(type: NodeEventType): number {
    return this.listeners.get(type)?.size || 0;
  }

  /**
   * Get count of "all events" listeners
   * @returns Number of listeners
   */
  allListenerCount(): number {
    return this.allListeners.size;
  }

  /**
   * Check if there are any listeners
   * @returns True if any listeners are registered
   */
  hasListeners(): boolean {
    return this.listeners.size > 0 || this.allListeners.size > 0;
  }

  /**
   * Returns an Effect Stream of all events
   * REMOVED: Effect-TS integration removed in Phase 1
   * For streaming events in Temporal workflows, use native event emitter pattern
   */
  // toStream(): Stream.Stream<NodeEvent<unknown>> {
  //   return Stream.asyncPush<NodeEvent<unknown>>((emit) =>
  //     Effect.acquireRelease(
  //       Effect.sync(() => {
  //         const callback = (event: NodeEvent<unknown>) => {
  //           emit.single(event);
  //         };
  //         this.onAll(callback);
  //         return callback;
  //       }),
  //       (callback) => Effect.sync(() => this.offAll(callback)),
  //     ),
  //   );
  // }

  /**
   * Returns an AsyncIterable of all events
   * REMOVED: Effect-TS dependency removed in Phase 1
   * Implement using native async generators if needed
   */
  // toAsyncIterable(): AsyncIterable<NodeEvent<unknown>> {
  //   return Stream.toAsyncIterable(this.toStream());
  // }
}
