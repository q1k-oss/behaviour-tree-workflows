/**
 * Sequence composite node
 * Executes children in order until one fails or all succeed
 */

import { CompositeNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import { type TemporalContext, NodeStatus } from "../types.js";
import { checkSignal } from "../utils/signal-check.js";

export class Sequence extends CompositeNode {
  private currentChildIndex: number = 0;

  async executeTick(context: TemporalContext): Promise<NodeStatus> {
    this.log("Ticking with", this._children.length, "children");

    if (this._children.length === 0) {
      return NodeStatus.SUCCESS;
    }

    // Continue from where we left off if RUNNING
    while (this.currentChildIndex < this._children.length) {
      // Check for cancellation before ticking each child
      checkSignal(context.signal);

      const child = this._children[this.currentChildIndex];
      if (!child) {
        throw new ConfigurationError(
          `Child at index ${this.currentChildIndex} is undefined`,
        );
      }

      this.log(`Ticking child ${this.currentChildIndex}: ${child.name}`);
      const childStatus = await child.tick(context);

      switch (childStatus) {
        case NodeStatus.SUCCESS:
          this.log(`Child ${child.name} succeeded`);
          this.currentChildIndex++;
          break;

        case NodeStatus.FAILURE:
          this.log(`Child ${child.name} failed - sequence fails`);
          this._status = NodeStatus.FAILURE;
          this.currentChildIndex = 0;
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
    this.currentChildIndex = 0;
    return NodeStatus.SUCCESS;
  }

  protected onHalt(): void {
    this.haltChildren(this.currentChildIndex);
    this.currentChildIndex = 0;
  }

  protected onReset(): void {
    this.currentChildIndex = 0;
  }
}