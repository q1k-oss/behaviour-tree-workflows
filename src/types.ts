/**
 * Core types for the Behavior Tree implementation
 * Inspired by BehaviorTree.CPP
 */

/**
 * Status of a node after tick execution
 */
export enum NodeStatus {
  SUCCESS = "SUCCESS",
  FAILURE = "FAILURE",
  RUNNING = "RUNNING",
  IDLE = "IDLE",
}

/**
 * Base configuration for all nodes
 */
export interface NodeConfiguration {
  id: string;
  name?: string;
  [key: string]: unknown; // Additional properties can be passed
}

/**
 * Context passed during tick execution
 */
export interface TickContext {
  blackboard: IScopedBlackboard;
  treeRegistry: ITreeRegistry;
  signal?: AbortSignal;
  deltaTime?: number;
  timestamp: number;

  // Test data parameters (from CSV, data tables, etc.)
  // Used for ${param.key} variable resolution
  testData?: Map<string, unknown>;

  /**
   * Immutable workflow input parameters
   * Accessible via ${input.key} syntax in variable resolution
   * These are passed when the workflow starts and should not be modified
   */
  input?: Readonly<Record<string, unknown>>;

  sessionId?: string;

  // Observable event system (for monitoring, debugging, visualization)
  // External systems can subscribe to node lifecycle events
  eventEmitter?: import("./events.js").NodeEventEmitter;
}

/**
 * Extended context for Temporal workflow execution
 * Replaces EffectTickContext for Temporal-native execution
 */
export interface TemporalContext extends TickContext {
  // Optional workflow metadata (for activities that need workflow context)
  workflowInfo?: {
    workflowId: string;
    runId: string;
    namespace: string;
  };
}

/**
 * Port definition for typed inputs/outputs
 */
export interface PortDefinition {
  name: string;
  type: "input" | "output" | "inout";
  description?: string;
  defaultValue?: unknown;
  required?: boolean;
}

/**
 * Base interface for all tree nodes
 */
export interface TreeNode {
  readonly id: string;
  readonly name: string;
  readonly type: string;

  // Core methods - returns Promise for async/RUNNING semantics
  // All errors are caught and converted to NodeStatus.FAILURE
  tick(context: TemporalContext): Promise<NodeStatus>;
  halt(): void;
  reset(): void;
  clone(): TreeNode;

  // Port management
  providedPorts?(): PortDefinition[];

  // Status
  status(): NodeStatus;

  // Error tracking - stores the actual error message when node fails
  lastError?: string;

  // Hierarchy
  parent?: TreeNode;
  children?: TreeNode[];
}

/**
 * Constructor type for node factories
 */
export type NodeConstructor<T extends TreeNode = TreeNode> = new (
  config: NodeConfiguration,
) => T;

/**
 * Node metadata for registry
 */
export interface NodeMetadata {
  type: string;
  category: "action" | "condition" | "decorator" | "composite" | "subtree";
  description?: string;
  ports?: PortDefinition[];
}

/**
 * Interface for tree registry (session-scoped)
 * Used by nodes like StepGroup and LocateElement to lookup behavior trees
 */
export interface ITreeRegistry {
  hasTree(id: string): boolean;
  cloneTree(id: string): { getRoot(): TreeNode };
  getAllTreeIds(): string[];
  registerTree(
    id: string,
    tree: { getRoot(): TreeNode; clone(): { getRoot(): TreeNode } },
    sourceFile: string,
  ): void;
  getTree(
    id: string,
  ): { getRoot(): TreeNode; clone(): { getRoot(): TreeNode } } | undefined;
  getTreeSourceFile(id: string): string | undefined;
  getTreesForFile(
    filePath: string,
  ): Map<string, { getRoot(): TreeNode; clone(): { getRoot(): TreeNode } }>;
}

/**
 * Interface for scoped blackboard
 */
export interface IScopedBlackboard {
  // Basic operations - simple mutable API
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;

  // Scoped operations
  createScope(name: string): IScopedBlackboard;
  getParentScope(): IScopedBlackboard | null;
  getScopeName(): string;
  getFullScopePath(): string;

  // Port operations (typed access)
  getPort<T>(key: string, defaultValue?: T): T;
  setPort<T>(key: string, value: T): void;

  // Utilities
  keys(): string[];
  entries(): [string, unknown][];
  toJSON(): Record<string, unknown>;

  // Snapshot utilities - uses native structuredClone for deep cloning
  clone(): IScopedBlackboard;
}

/**
 * Arguments passed to a BehaviorTree workflow
 */
export interface WorkflowArgs {
  /**
   * Input data to initialize the blackboard
   */
  input?: Record<string, unknown>;

  /**
   * Tree registry for looking up subtrees
   */
  treeRegistry: ITreeRegistry;

  /**
   * Optional session ID
   */
  sessionId?: string;
}

/**
 * Result returned from a BehaviorTree workflow
 */
export interface WorkflowResult {
  /**
   * Final status of the tree
   */
  status: NodeStatus;

  /**
   * Final blackboard state
   */
  output: Record<string, unknown>;
}
