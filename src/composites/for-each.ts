/**
 * ForEach node - Iterate over collection
 */

import { CompositeNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  NodeStatus,
} from "../types.js";
import { checkSignal } from "../utils/signal-check.js";

/**
 * Resolve a dot-path from the blackboard.
 * "currentProduct.variants" → blackboard.get("currentProduct").variants
 */
function resolveFromBlackboard(blackboard: { get(key: string): unknown }, path: string): unknown {
  const parts = path.split(".");
  const firstPart = parts[0];
  if (!firstPart) return undefined;

  let value: unknown = blackboard.get(firstPart);

  for (let i = 1; i < parts.length && value != null; i++) {
    const part = parts[i];
    if (part && typeof value === "object") {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return value;
}

export interface ForEachConfiguration extends NodeConfiguration {
  collectionKey: string; // Blackboard key for array
  itemKey: string; // Blackboard key for current item
  indexKey?: string; // Blackboard key for current index
}

/**
 * ForEach iterates over a collection from the blackboard.
 * For each item, it sets the item (and optionally index) in the blackboard
 * and executes the body (first child).
 */
export class ForEach extends CompositeNode {
  private collectionKey: string;
  private itemKey: string;
  private indexKey?: string;
  private currentIndex: number = 0;

  constructor(config: ForEachConfiguration) {
    super(config);
    this.collectionKey = config.collectionKey;
    this.itemKey = config.itemKey;
    this.indexKey = config.indexKey;
  }

  async executeTick(context: TemporalContext): Promise<NodeStatus> {
    if (this._children.length === 0) {
      throw new ConfigurationError(
        "ForEach requires at least one child (body)",
      );
    }

    const body = this._children[0];
    if (!body) {
      throw new ConfigurationError(
        "ForEach requires at least one child (body)",
      );
    }

    // Support dot-path: "currentProduct.variants" → blackboard.get("currentProduct").variants
    const collection = this.collectionKey.includes(".")
      ? resolveFromBlackboard(context.blackboard, this.collectionKey)
      : context.blackboard.get(this.collectionKey);

    if (!collection) {
      this.log(`Collection '${this.collectionKey}' not found in blackboard`);
      this._status = NodeStatus.FAILURE;
      return NodeStatus.FAILURE;
    }

    if (!Array.isArray(collection)) {
      throw new Error(`Collection '${this.collectionKey}' is not an array`);
    }

    // Empty collection is success
    if (collection.length === 0) {
      this.log("Collection is empty - returning SUCCESS");
      this._status = NodeStatus.SUCCESS;
      return NodeStatus.SUCCESS;
    }

    this.log(
      `Iterating over collection (${collection.length} items), starting at index ${this.currentIndex}`,
    );

    // Continue from where we left off
    while (this.currentIndex < collection.length) {
      // Check for cancellation before processing each item
      checkSignal(context.signal);

      const item = collection[this.currentIndex];

      // Set current item and index in blackboard
      context.blackboard.set(this.itemKey, item);
      if (this.indexKey) {
        context.blackboard.set(this.indexKey, this.currentIndex);
      }

      this.log(
        `Processing item ${this.currentIndex}: ${JSON.stringify(item)}`,
      );
      const bodyStatus = await body.tick(context);

      switch (bodyStatus) {
        case NodeStatus.SUCCESS:
          this.log(`Item ${this.currentIndex} succeeded`);
          this.currentIndex++;
          body.reset(); // Reset for next iteration
          break;

        case NodeStatus.FAILURE:
          this.log(`Item ${this.currentIndex} failed - ForEach fails`);
          this._status = NodeStatus.FAILURE;
          this.currentIndex = 0; // Reset for next tick
          return NodeStatus.FAILURE;

        case NodeStatus.RUNNING:
          this.log(`Item ${this.currentIndex} is running`);
          this._status = NodeStatus.RUNNING;
          return NodeStatus.RUNNING; // Will resume from this index next tick

        default:
          throw new Error(`Unexpected status from body: ${bodyStatus}`);
      }
    }

    // All items processed successfully
    this.log("All items processed successfully");
    this._status = NodeStatus.SUCCESS;
    this.currentIndex = 0; // Reset for next tick
    return NodeStatus.SUCCESS;
  }

  protected onReset(): void {
    super.onReset();
    this.currentIndex = 0;
  }

  protected onHalt(): void {
    super.onHalt();
    this.currentIndex = 0;
  }
}