/**
 * While node - Loop while condition is true
 */

import { CompositeNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  NodeStatus,
  type TreeNode,
} from "../types.js";
import { checkSignal } from "../utils/signal-check.js";

export interface WhileConfiguration extends NodeConfiguration {
  maxIterations?: number; // Safety limit
}

/**
 * While loops while the condition returns SUCCESS.
 * Structure:
 * - First child = condition
 * - Second child = body
 */
export class While extends CompositeNode {
  private maxIterations: number;
  private currentIteration: number = 0;
  private condition?: TreeNode;
  private body?: TreeNode;
  private bodyStarted: boolean = false;

  constructor(config: WhileConfiguration) {
    super(config);
    this.maxIterations = config.maxIterations ?? 1000;
  }

  addChild(child: TreeNode): void {
    if (!this.condition) {
      this.condition = child;
      this._children.push(child);
      child.parent = this;
    } else if (!this.body) {
      this.body = child;
      this._children.push(child);
      child.parent = this;
    } else {
      throw new ConfigurationError(
        "While can have maximum 2 children (condition, body)",
      );
    }
  }

  async executeTick(context: TemporalContext): Promise<NodeStatus> {
    if (!this.condition) {
      throw new ConfigurationError("While requires a condition child");
    }
    if (!this.body) {
      throw new ConfigurationError("While requires a body child");
    }

    this.log(
      `Starting while loop (iteration ${this.currentIteration}/${this.maxIterations})`,
    );

    // Loop while condition is SUCCESS
    while (this.currentIteration < this.maxIterations) {
      // Check for cancellation before each iteration
      checkSignal(context.signal);

      // Only check condition if body hasn't started for this iteration
      if (!this.bodyStarted) {
        // Evaluate condition
        this.log(`Evaluating condition (iteration ${this.currentIteration})`);
        const conditionStatus = await this.condition.tick(context);

        if (conditionStatus === NodeStatus.RUNNING) {
          this.log("Condition is running");
          this._status = NodeStatus.RUNNING;
          return NodeStatus.RUNNING;
        }

        if (conditionStatus === NodeStatus.FAILURE) {
          this.log("Condition failed - exiting loop");
          this._status = NodeStatus.SUCCESS;
          this.currentIteration = 0;
          this.bodyStarted = false;
          return NodeStatus.SUCCESS;
        }

        // Condition succeeded, mark body as started
        this.bodyStarted = true;
      } else {
        this.log(
          `Body already started for iteration ${this.currentIteration} - continuing execution`,
        );
      }

      // Execute body
      this.log(`Executing body (iteration ${this.currentIteration})`);
      const bodyStatus = await this.body.tick(context);

      switch (bodyStatus) {
        case NodeStatus.SUCCESS:
          this.log("Body succeeded - continuing loop");
          this.currentIteration++;
          this.bodyStarted = false; // Reset for next iteration
          this.condition.reset(); // Reset for next iteration
          this.body.reset();
          break;

        case NodeStatus.FAILURE:
          this.log("Body failed - While fails");
          this._status = NodeStatus.FAILURE;
          this.currentIteration = 0;
          this.bodyStarted = false;
          return NodeStatus.FAILURE;

        case NodeStatus.RUNNING:
          this.log("Body is running");
          this._status = NodeStatus.RUNNING;
          return NodeStatus.RUNNING;

        default:
          throw new ConfigurationError(`Unexpected status from body: ${bodyStatus}`);
      }
    }

    // Max iterations reached
    this.log(`Max iterations (${this.maxIterations}) reached`);
    this._status = NodeStatus.FAILURE;
    this.currentIteration = 0;
    this.bodyStarted = false;
    return NodeStatus.FAILURE;
  }

  protected onReset(): void {
    super.onReset();
    this.log("Resetting - clearing body started flag");
    this.currentIteration = 0;
    this.bodyStarted = false;
  }

  protected onHalt(): void {
    super.onHalt();
    this.log("Halting - clearing body started flag");
    this.currentIteration = 0;
    this.bodyStarted = false;
  }
}
