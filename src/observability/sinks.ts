/**
 * Workflow Sink types for exporting events from Temporal workflows
 * Sinks allow workflows to export data without affecting determinism
 */

import type { Sinks } from "@temporalio/workflow";
import type { ObservableNodeEvent } from "./types.js";

/**
 * Observability sinks for workflow event export
 *
 * Usage in workflow:
 * ```typescript
 * import { proxySinks } from '@temporalio/workflow';
 * import type { ObservabilitySinks } from '@wayfarer-ai/btree-workflows';
 *
 * const { events } = proxySinks<ObservabilitySinks>();
 * events.push(nodeEvent);  // Fire-and-forget
 * ```
 *
 * The sink handler runs in the worker (outside the deterministic sandbox)
 * and can safely perform I/O like database writes or triggering agents.
 */
export interface ObservabilitySinks extends Sinks {
  events: {
    /**
     * Push a node event to external observers
     * This is fire-and-forget - workflow execution continues immediately
     */
    push(event: ObservableNodeEvent): void;
  };
}

/**
 * Configuration for creating sink handlers
 */
export interface SinkHandlerConfig {
  /**
   * Called when a node event is received
   * Can be async - workflow doesn't wait for completion
   */
  onEvent?: (
    workflowId: string,
    runId: string,
    event: ObservableNodeEvent
  ) => void | Promise<void>;

  /**
   * Called specifically for ERROR events
   * Use this to trigger analyzer agent or alerting
   */
  onError?: (
    workflowId: string,
    runId: string,
    event: ObservableNodeEvent
  ) => void | Promise<void>;

  /**
   * Whether to log events to console (default: false)
   */
  logEvents?: boolean;
}

/**
 * Sink function signature for InjectedSinks
 */
export interface SinkFunction<T extends (...args: any[]) => any> {
  fn(info: { workflowId: string; runId: string }, ...args: Parameters<T>): ReturnType<T>;
  callDuringReplay: boolean;
}

/**
 * Type for InjectedSinks<ObservabilitySinks>
 */
export type InjectedObservabilitySinks = {
  events: {
    push: SinkFunction<(event: ObservableNodeEvent) => void>;
  };
};

/**
 * Create sink handler functions for InjectedSinks
 *
 * Usage in worker:
 * ```typescript
 * import { createObservabilitySinkHandler } from '@wayfarer-ai/btree-workflows';
 *
 * const sinks = createObservabilitySinkHandler({
 *   onEvent: (workflowId, runId, event) => {
 *     // Store event to database
 *   },
 *   onError: (workflowId, runId, event) => {
 *     // Trigger analyzer agent
 *   },
 * });
 *
 * const worker = await Worker.create({ sinks, ... });
 * ```
 */
export function createObservabilitySinkHandler(
  config: SinkHandlerConfig = {}
): InjectedObservabilitySinks {
  return {
    events: {
      push: {
        fn: (
          workflowInfo: { workflowId: string; runId: string },
          event: ObservableNodeEvent
        ) => {
          const { workflowId, runId } = workflowInfo;

          // Log if configured
          if (config.logEvents) {
            console.log(
              `[Sink] [${workflowId}] ${event.type}: ${event.nodeId} (${event.nodeType})`
            );
          }

          // Call general event handler
          if (config.onEvent) {
            Promise.resolve(config.onEvent(workflowId, runId, event)).catch(
              (err) => console.error("[Sink] Error in onEvent handler:", err)
            );
          }

          // Call error handler for ERROR events
          if (event.type === "error" && config.onError) {
            Promise.resolve(config.onError(workflowId, runId, event)).catch(
              (err) => console.error("[Sink] Error in onError handler:", err)
            );
          }
        },
        // Don't call during replay - events were already processed
        callDuringReplay: false,
      },
    },
  };
}
