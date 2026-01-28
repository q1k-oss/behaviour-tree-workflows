/**
 * Base implementation for all behavior tree nodes
 */

import { ConfigurationError } from "./errors.js";
import { NodeEventType } from "./events.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  NodeStatus,
  type PortDefinition,
  type TreeNode,
} from "./types.js";
import { OperationCancelledError } from "./utils/signal-check.js";
import { handleNodeError } from "./utils/error-handler.js";

/**
 * Abstract base class for all tree nodes
 */
export abstract class BaseNode implements TreeNode {
  readonly id: string;
  readonly name: string;
  readonly type: string;

  protected _status: NodeStatus = NodeStatus.IDLE;
  protected _lastError?: string;
  protected config: NodeConfiguration;
  protected _eventEmitter?: import("./events.js").NodeEventEmitter;

  parent?: TreeNode;
  children?: TreeNode[];

  constructor(config: NodeConfiguration) {
    this.id = config.id;
    this.name = config.name || config.id;
    this.type = this.constructor.name;
    this.config = config;
  }

  /**
   * Main tick method - subclasses override to implement execution logic
   * Returns Promise for async/RUNNING semantics
   * All errors are caught and converted to NodeStatus.FAILURE
   */
  abstract tick(context: TemporalContext): Promise<NodeStatus>;

  /**
   * Clone this node (deep copy including children)
   * Must be implemented by subclasses
   */
  abstract clone(): TreeNode;

  halt(): void {
    console.log(`[${this.type}:${this.name}] Halting...`);

    // Emit HALT event
    this._eventEmitter?.emit({
      type: NodeEventType.HALT,
      nodeId: this.id,
      nodeName: this.name,
      nodeType: this.type,
      timestamp: Date.now(),
    });

    if (this._status === NodeStatus.RUNNING) {
      this.onHalt();
      this._status = NodeStatus.IDLE;
    }
  }

  reset(): void {
    console.log(`[${this.type}:${this.name}] Resetting...`);

    // Emit RESET event
    this._eventEmitter?.emit({
      type: NodeEventType.RESET,
      nodeId: this.id,
      nodeName: this.name,
      nodeType: this.type,
      timestamp: Date.now(),
    });

    this._status = NodeStatus.IDLE;
    this._lastError = undefined;
    this.onReset();
  }

  status(): NodeStatus {
    return this._status;
  }

  get lastError(): string | undefined {
    return this._lastError;
  }

  providedPorts(): PortDefinition[] {
    return [];
  }

  /**
   * Hook for derived classes to implement custom halt logic
   */
  protected onHalt(): void {
    // Override in derived classes if needed
  }

  /**
   * Hook for derived classes to implement custom reset logic
   */
  protected onReset(): void {
    // Override in derived classes if needed
  }

  /**
   * Helper to get input value from blackboard
   */
  protected getInput<T>(
    context: TemporalContext,
    key: string,
    defaultValue?: T,
  ): T {
    const fullKey = (this.config[key] as string) || key;
    return context.blackboard.getPort<T>(fullKey, defaultValue);
  }

  /**
   * Helper to set output value to blackboard
   */
  protected setOutput<T>(
    context: TemporalContext,
    key: string,
    value: T,
  ): void {
    const fullKey = (this.config[key] as string) || key;
    context.blackboard.setPort(fullKey, value);
  }

  /**
   * Log helper for debugging
   */
  protected log(message: string, ...args: unknown[]): void {
    console.log(`[${this.type}:${this.name}] ${message}`, ...args);
  }
}

/**
 * Base class for action nodes
 * Includes resumable execution support and Effect-based async/RUNNING semantics
 */
export abstract class ActionNode extends BaseNode {
  /**
   * Clone this action node
   * Leaf nodes have no children to clone
   */
  clone(): TreeNode {
    const ClonedClass = this.constructor as new (
      config: NodeConfiguration,
    ) => this;
    return new ClonedClass({ ...this.config });
  }

  /**
   * Tick with resumable execution support for leaf nodes
   * Uses async/await for Promise-based async/RUNNING semantics
   * All errors are caught and converted to NodeStatus.FAILURE
   */
  async tick(context: TemporalContext): Promise<NodeStatus> {
    try {
      // Store eventEmitter reference for halt/reset
      this._eventEmitter = context.eventEmitter;

      // Emit TICK_START event
      context.eventEmitter?.emit({
        type: NodeEventType.TICK_START,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
      });

      // Execute the actual node logic
      const status = await this.executeTick(context);
      this._status = status;

      // Emit TICK_END event with status
      context.eventEmitter?.emit({
        type: NodeEventType.TICK_END,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
        data: { status },
      });

      return status;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Store the error message
      this._lastError = errorMessage;
      this._status = NodeStatus.FAILURE;

      // Emit ERROR event with proper format for ExecutionTracker
      context.eventEmitter?.emit({
        type: NodeEventType.ERROR,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
        data: {
          error: {
            message: errorMessage,
            stack: errorStack,
          },
          blackboard: context.blackboard?.toJSON?.() ?? {},
        },
      });

      // Emit TICK_END with FAILURE status
      context.eventEmitter?.emit({
        type: NodeEventType.TICK_END,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
        data: { status: NodeStatus.FAILURE },
      });

      // Use centralized error handler for consistent behavior
      return handleNodeError(error);
    }
  }

  /**
   * Abstract method for subclasses to implement their execution logic
   * Returns Promise for async operations
   */
  protected abstract executeTick(
    context: TemporalContext,
  ): Promise<NodeStatus>;
}

/**
 * Base class for condition nodes
 * Includes resumable execution support and async/RUNNING semantics
 */
export abstract class ConditionNode extends BaseNode {
  /**
   * Clone this condition node
   * Leaf nodes have no children to clone
   */
  clone(): TreeNode {
    const ClonedClass = this.constructor as new (
      config: NodeConfiguration,
    ) => this;
    return new ClonedClass({ ...this.config });
  }

  /**
   * Tick with resumable execution support for leaf nodes
   * Uses async/await for Promise-based async/RUNNING semantics
   * All errors are caught and converted to NodeStatus.FAILURE
   */
  async tick(context: TemporalContext): Promise<NodeStatus> {
    try {
      // Store eventEmitter reference for halt/reset
      this._eventEmitter = context.eventEmitter;

      // Emit TICK_START event
      context.eventEmitter?.emit({
        type: NodeEventType.TICK_START,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
      });

      // Execute the actual node logic
      const status = await this.executeTick(context);
      this._status = status;

      // Emit TICK_END event with status
      context.eventEmitter?.emit({
        type: NodeEventType.TICK_END,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
        data: { status },
      });

      return status;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Store the error message
      this._lastError = errorMessage;
      this._status = NodeStatus.FAILURE;

      // Emit ERROR event with proper format for ExecutionTracker
      context.eventEmitter?.emit({
        type: NodeEventType.ERROR,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
        data: {
          error: {
            message: errorMessage,
            stack: errorStack,
          },
          blackboard: context.blackboard?.toJSON?.() ?? {},
        },
      });

      // Emit TICK_END with FAILURE status
      context.eventEmitter?.emit({
        type: NodeEventType.TICK_END,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
        data: { status: NodeStatus.FAILURE },
      });

      // Use centralized error handler for consistent behavior
      return handleNodeError(error);
    }
  }

  /**
   * Abstract method for subclasses to implement their execution logic
   * Returns Promise for async operations
   */
  protected abstract executeTick(
    context: TemporalContext,
  ): Promise<NodeStatus>;
}

/**
 * Base class for decorator nodes (single child)
 */
export abstract class DecoratorNode extends BaseNode {
  protected child?: TreeNode;

  /**
   * Clone this decorator node including its child
   */
  clone(): TreeNode {
    const ClonedClass = this.constructor as new (
      config: NodeConfiguration,
    ) => this;
    const cloned = new ClonedClass({ ...this.config });
    if (this.child) {
      cloned.setChild(this.child.clone());
    }
    return cloned;
  }

  /**
   * Tick with resumable execution support - decorators can be resume points
   * Uses async/await for Promise-based async/RUNNING semantics
   * All errors are caught and converted to NodeStatus.FAILURE
   */
  async tick(context: TemporalContext): Promise<NodeStatus> {
    try {
      // Emit TICK_START event
      context.eventEmitter?.emit({
        type: NodeEventType.TICK_START,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
      });

      // Execute decorator's tick logic
      const status = await this.executeTick(context);

      // Emit TICK_END event
      context.eventEmitter?.emit({
        type: NodeEventType.TICK_END,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
        data: { status },
      });

      return status;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Store the error message
      this._lastError = errorMessage;
      this._status = NodeStatus.FAILURE;

      // Emit ERROR event with proper format for ExecutionTracker
      context.eventEmitter?.emit({
        type: NodeEventType.ERROR,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
        data: {
          error: {
            message: errorMessage,
            stack: errorStack,
          },
          blackboard: context.blackboard?.toJSON?.() ?? {},
        },
      });

      // Emit TICK_END with FAILURE status
      context.eventEmitter?.emit({
        type: NodeEventType.TICK_END,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
        data: { status: NodeStatus.FAILURE },
      });

      // Use centralized error handler for consistent behavior
      return handleNodeError(error);
    }
  }

  /**
   * Decorator nodes must implement their wrapping logic
   * Returns Promise for async operations
   */
  protected abstract executeTick(
    context: TemporalContext,
  ): Promise<NodeStatus>;

  setChild(child: TreeNode): void {
    if (!child) {
      throw new Error("Cannot set undefined child on decorator node");
    }
    this.child = child;
    this.children = [child];
    child.parent = this;
  }

  halt(): void {
    super.halt();
    if (this.child && this.child.status() === NodeStatus.RUNNING) {
      this.child.halt();
    }
  }

  reset(): void {
    super.reset();
    if (this.child) {
      this.child.reset();
    }
  }
}

/**
 * Base class for composite nodes (multiple children)
 */
export abstract class CompositeNode extends BaseNode {
  protected _children: TreeNode[] = [];

  /**
   * Clone this composite node including all children
   */
  clone(): TreeNode {
    const ClonedClass = this.constructor as new (
      config: NodeConfiguration,
    ) => this;
    const cloned = new ClonedClass({ ...this.config });
    // Clone all children
    const clonedChildren = this._children.map((child) => child.clone());
    cloned.addChildren(clonedChildren);
    return cloned;
  }

  /**
   * Tick with resumable execution support - composites can be resume points
   * Uses async/await for Promise-based async/RUNNING semantics
   * All errors are caught and converted to NodeStatus.FAILURE
   */
  async tick(context: TemporalContext): Promise<NodeStatus> {
    try {
      // Emit TICK_START event
      context.eventEmitter?.emit({
        type: NodeEventType.TICK_START,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
      });

      // Execute composite's tick logic
      const status = await this.executeTick(context);

      // Emit TICK_END event
      context.eventEmitter?.emit({
        type: NodeEventType.TICK_END,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
        data: { status },
      });

      return status;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Store the error message
      this._lastError = errorMessage;
      this._status = NodeStatus.FAILURE;

      // Emit ERROR event with proper format for ExecutionTracker
      context.eventEmitter?.emit({
        type: NodeEventType.ERROR,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
        data: {
          error: {
            message: errorMessage,
            stack: errorStack,
          },
          blackboard: context.blackboard?.toJSON?.() ?? {},
        },
      });

      // Emit TICK_END with FAILURE status
      context.eventEmitter?.emit({
        type: NodeEventType.TICK_END,
        nodeId: this.id,
        nodeName: this.name,
        nodeType: this.type,
        timestamp: Date.now(),
        data: { status: NodeStatus.FAILURE },
      });

      // Use centralized error handler for consistent behavior
      return handleNodeError(error);
    }
  }

  /**
   * Composite nodes must implement their traversal logic
   * Returns Promise for async operations
   */
  protected abstract executeTick(
    context: TemporalContext,
  ): Promise<NodeStatus>;

  addChild(child: TreeNode): void {
    if (!child) {
      throw new Error("Cannot add undefined child to composite node");
    }
    this._children.push(child);
    this.children = this._children;
    child.parent = this;
  }

  addChildren(children: TreeNode[]): void {
    children.forEach((child) => {
      this.addChild(child);
    });
  }

  halt(): void {
    super.halt();
    // Halt all running children
    for (const child of this._children) {
      if (child.status() === NodeStatus.RUNNING) {
        child.halt();
      }
    }
  }

  reset(): void {
    super.reset();
    // Reset all children
    for (const child of this._children) {
      child.reset();
    }
  }

  protected haltChildren(startIndex: number = 0): void {
    for (let i = startIndex; i < this._children.length; i++) {
      const child = this._children[i];
      if (child && child.status() === NodeStatus.RUNNING) {
        child.halt();
      }
    }
  }
}
