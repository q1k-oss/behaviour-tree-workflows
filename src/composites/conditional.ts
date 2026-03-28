/**
 * Conditional node - If-then-else logic for behavior trees
 */

import { CompositeNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import { type TemporalContext, NodeStatus, type TreeNode } from "../types.js";
import { checkSignal } from "../utils/signal-check.js";

/**
 * Conditional implements if-then-else logic.
 * Structure:
 * - First child = condition
 * - Second child = then branch
 * - Third child (optional) = else branch
 */
export class Conditional extends CompositeNode {
  private condition?: TreeNode;
  private thenBranch?: TreeNode;
  private elseBranch?: TreeNode;
  private conditionEvaluated: boolean = false;
  private selectedBranch?: TreeNode;

  /**
   * Override addChild to enforce conditional structure
   */
  addChild(child: TreeNode): void {
    if (!this.condition) {
      this.condition = child;
      this._children.push(child);
      child.parent = this;
    } else if (!this.thenBranch) {
      this.thenBranch = child;
      this._children.push(child);
      child.parent = this;
    } else if (!this.elseBranch) {
      this.elseBranch = child;
      this._children.push(child);
      child.parent = this;
    } else {
      throw new ConfigurationError(
        "Conditional can have maximum 3 children (condition, then, else)",
      );
    }
  }

  async executeTick(context: TemporalContext): Promise<NodeStatus> {
    // Check for cancellation before processing conditional
    checkSignal(context.signal);

    if (!this.condition) {
      throw new ConfigurationError("Conditional requires at least a condition child");
    }

    if (!this.thenBranch) {
      throw new ConfigurationError(
        "Conditional requires at least condition and then branch",
      );
    }

    // Only evaluate condition if not already evaluated
    if (!this.conditionEvaluated) {
      this.log("Evaluating condition");
      const conditionStatus = await this.condition.tick(context);

      switch (conditionStatus) {
        case NodeStatus.SUCCESS:
          this.log("Condition succeeded - will execute then branch");
          this.selectedBranch = this.thenBranch;
          this.conditionEvaluated = true;
          break;

        case NodeStatus.FAILURE:
          if (this.elseBranch) {
            this.log("Condition failed - will execute else branch");
            this.selectedBranch = this.elseBranch;
            this.conditionEvaluated = true;
          } else {
            this.log("Condition failed - no else branch, returning FAILURE");
            this._status = NodeStatus.FAILURE;
            return NodeStatus.FAILURE;
          }
          break;

        case NodeStatus.RUNNING:
          this.log("Condition is running");
          this._status = NodeStatus.RUNNING;
          return NodeStatus.RUNNING;

        default:
          throw new ConfigurationError(
            `Unexpected status from condition: ${conditionStatus}`,
          );
      }
    } else {
      this.log("Condition already evaluated - continuing branch execution");
    }

    // Execute selected branch
    if (!this.selectedBranch) {
      throw new ConfigurationError("No branch selected for execution");
    }

    const branchStatus = await this.selectedBranch.tick(context);
    this._status = branchStatus;

    // Reset flag when branch completes
    if (branchStatus !== NodeStatus.RUNNING) {
      this.log("Branch completed - resetting condition check flag");
      this.conditionEvaluated = false;
      this.selectedBranch = undefined;
    }

    return branchStatus;
  }

  protected onHalt(): void {
    this.log("Halting - resetting condition check flag");
    this.conditionEvaluated = false;
    this.selectedBranch = undefined;
    super.onHalt();
  }

  protected onReset(): void {
    this.log("Resetting - clearing condition check flag");
    this.conditionEvaluated = false;
    this.selectedBranch = undefined;
  }
}
