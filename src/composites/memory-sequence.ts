/**
 * MemorySequence node - Remembers which children succeeded and skips them on retry
 * Useful for long test sequences where early steps shouldn't re-run
 */

import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  NodeStatus,
} from "../types.js";
import { checkSignal } from "../utils/signal-check.js";
import { Sequence } from "./sequence.js";

/**
 * MemorySequence extends Sequence with memory of completed children.
 * When a child fails, subsequent retries will skip already-successful children.
 * This is particularly useful for expensive setup steps that shouldn't be re-executed.
 */
export class MemorySequence extends Sequence {
  private completedChildren: Set<string> = new Set();

  async executeTick(context: TemporalContext): Promise<NodeStatus> {
    this.log(
      `Ticking with ${this._children.length} children (${this.completedChildren.size} completed)`,
    );

    if (this._children.length === 0) {
      return NodeStatus.SUCCESS;
    }

    // Start from first non-completed child
    for (let i = 0; i < this._children.length; i++) {
      // Check for cancellation before ticking each child
      checkSignal(context.signal);

      const child = this._children[i];
      if (!child) {
        throw new ConfigurationError(`Child at index ${i} is undefined`);
      }

      // Skip if already completed
      if (this.completedChildren.has(child.id)) {
        this.log(`Skipping completed child: ${child.name}`);
        continue;
      }

      this.log(`Ticking child ${i}: ${child.name}`);
      const childStatus = await child.tick(context);

      switch (childStatus) {
        case NodeStatus.SUCCESS:
          this.log(`Child ${child.name} succeeded - remembering`);
          this.completedChildren.add(child.id);
          break;

        case NodeStatus.FAILURE:
          this.log(`Child ${child.name} failed - sequence fails`);
          this._status = NodeStatus.FAILURE;
          return NodeStatus.FAILURE;

        case NodeStatus.RUNNING:
          this.log(`Child ${child.name} is running`);
          this._status = NodeStatus.RUNNING;
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

  protected onReset(): void {
    super.onReset();
    this.log("Clearing completed children memory");
    this.completedChildren.clear();
  }

  protected onHalt(): void {
    super.onHalt();
    // Note: we don't clear memory on halt, only on reset
    // This allows resuming after interruption
  }
}

/**
 * SequenceWithMemory is an alias for MemorySequence (BehaviorTree.CPP compatibility)
 */
export class SequenceWithMemory extends MemorySequence {
  constructor(config: NodeConfiguration) {
    super({ ...config, type: "SequenceWithMemory" });
  }
}