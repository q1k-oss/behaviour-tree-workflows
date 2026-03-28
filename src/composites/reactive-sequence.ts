/**
 * ReactiveSequence node - Restarts from beginning each tick
 * Responds to condition changes during execution
 */

import { ConfigurationError } from "../errors.js";
import { type TemporalContext, NodeStatus } from "../types.js";
import { checkSignal } from "../utils/signal-check.js";
import { Sequence } from "./sequence.js";

/**
 * ReactiveSequence restarts from the beginning on each tick.
 * Unlike regular Sequence which remembers its position, ReactiveSequence
 * re-evaluates all children from the start, making it responsive to
 * conditions that might change between ticks.
 *
 * Use cases:
 * - Real-time monitoring where conditions might change
 * - Safety-critical checks that must be re-evaluated
 * - Guard conditions that need constant verification
 */
export class ReactiveSequence extends Sequence {
  async executeTick(context: TemporalContext): Promise<NodeStatus> {
    this.log("Ticking (reactive - always starts from beginning)");

    if (this._children.length === 0) {
      return NodeStatus.SUCCESS;
    }

    // Always start from child 0 (reactive behavior)
    // Don't use currentChildIndex from parent Sequence
    for (let i = 0; i < this._children.length; i++) {
      // Check for cancellation before ticking each child
      checkSignal(context.signal);

      const child = this._children[i];
      if (!child) {
        throw new ConfigurationError(`Child at index ${i} is undefined`);
      }

      this.log(`Ticking child ${i}: ${child.name}`);
      const childStatus = await child.tick(context);

      switch (childStatus) {
        case NodeStatus.SUCCESS:
          this.log(`Child ${child.name} succeeded`);
          // Continue to next child
          break;

        case NodeStatus.FAILURE:
          this.log(`Child ${child.name} failed - sequence fails`);
          this._status = NodeStatus.FAILURE;
          return NodeStatus.FAILURE;

        case NodeStatus.RUNNING:
          this.log(`Child ${child.name} is running`);
          this._status = NodeStatus.RUNNING;
          // Return RUNNING but don't save position - will restart next tick
          return NodeStatus.RUNNING;

        default:
          throw new ConfigurationError(`Unexpected status from child: ${childStatus}`);
      }
    }

    // All children succeeded
    this.log("All children succeeded");
    this._status = NodeStatus.SUCCESS;
    return NodeStatus.SUCCESS;
  }

  /**
   * Override to prevent parent Sequence from resetting currentChildIndex
   * (ReactiveSequence doesn't use currentChildIndex)
   */
  protected onReset(): void {
    // Call BaseNode reset (skip Sequence reset)
    this._status = NodeStatus.IDLE;

    // Reset all children
    for (const child of this._children) {
      child.reset();
    }
  }
}