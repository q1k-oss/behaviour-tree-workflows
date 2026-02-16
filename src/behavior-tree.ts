/**
 * BehaviorTree - Wrapper for TreeNode with path-based indexing
 * Enables partial tree updates without full reload
 */

import type {
  TreeNode,
  TemporalContext,
  WorkflowArgs,
  WorkflowResult,
} from "./types.js";
import { ScopedBlackboard } from "./blackboard.js";

/**
 * BehaviorTree class that wraps a TreeNode root with path-based indexing
 * Paths use child indices: /0/1/2 represents root → child[0] → child[1] → child[2]
 */
/**
 * Result of parsing a path with tree ID prefix
 */
export interface ParsedPath {
  treeId: string;
  nodePath: string;
}

export class BehaviorTree {
  private root: TreeNode;
  private pathIndex: Map<string, TreeNode> = new Map();
  private idIndex: Map<string, TreeNode> = new Map();

  constructor(root: TreeNode) {
    this.root = root;
    this.buildNodeIndex();
  }

  /**
   * Parse a path with tree ID prefix.
   * Format: #TreeID/node/path
   *
   * @param fullPath Path string starting with # followed by tree ID
   * @returns Object with treeId and nodePath
   * @throws Error if path format is invalid
   *
   * Valid examples:
   * - "#SimpleTest/0/1" -> { treeId: "SimpleTest", nodePath: "/0/1" }
   * - "#MyTree/" -> { treeId: "MyTree", nodePath: "/" }
   * - "#OnlyTree" -> { treeId: "OnlyTree", nodePath: "/" }
   *
   * Invalid examples:
   * - "/0/1" - missing #TreeID prefix
   * - "#/0/1" - empty tree ID
   * - "#" - empty tree ID
   */
  static parsePathWithTreeId(fullPath: string): ParsedPath {
    if (!fullPath.startsWith("#")) {
      throw new Error(
        `Invalid path format: '${fullPath}'. Path must start with #TreeID (e.g., #SimpleTest/0/1)`,
      );
    }

    const slashIndex = fullPath.indexOf("/");
    let treeId: string;
    let nodePath: string;

    if (slashIndex === -1) {
      // No slash after tree ID, e.g., "#TreeId" means root of that tree
      treeId = fullPath.slice(1);
      nodePath = "/";
    } else {
      treeId = fullPath.slice(1, slashIndex);
      nodePath = fullPath.slice(slashIndex);
    }

    // Validate tree ID is not empty
    if (!treeId || treeId.trim() === "") {
      throw new Error(
        `Invalid path: tree ID cannot be empty in '${fullPath}'. Expected format: #TreeID/path`,
      );
    }

    // Validate node path starts with /
    if (!nodePath.startsWith("/")) {
      throw new Error(
        `Invalid path: node path must start with '/' in '${fullPath}'`,
      );
    }

    return { treeId, nodePath };
  }

  /**
   * Get the root node of the tree
   */
  getRoot(): TreeNode {
    return this.root;
  }

  /**
   * Find a node by its path
   * Path format: / for root, /0 for first child, /0/1 for second child of first child
   */
  findNodeByPath(path: string): TreeNode | null {
    return this.pathIndex.get(path) || null;
  }

  /**
   * Find a node by its ID (if it has one)
   * Convenience method for nodes with explicit IDs
   */
  findNodeById(nodeId: string): TreeNode | null {
    return this.idIndex.get(nodeId) || null;
  }

  /**
   * Get the path for a given node
   * Returns null if the node is not in the tree
   */
  getNodePath(targetNode: TreeNode): string | null {
    for (const [path, node] of this.pathIndex.entries()) {
      if (node === targetNode) {
        return path;
      }
    }
    return null;
  }

  /**
   * Get the path for a node by its ID
   * More reliable than instance-based lookup
   * Returns null if the node is not in the tree
   */
  getNodePathById(nodeId: string): string | null {
    const node = this.findNodeById(nodeId);
    if (!node) return null;

    // Search pathIndex for this node
    for (const [path, indexedNode] of this.pathIndex.entries()) {
      if (indexedNode.id === nodeId) {
        return path;
      }
    }
    return null;
  }

  /**
   * Clone this BehaviorTree (deep clones the underlying TreeNode)
   */
  clone(): BehaviorTree {
    const clonedRoot = this.root.clone();
    return new BehaviorTree(clonedRoot);
  }

  /**
   * Convert this BehaviorTree to a Temporal workflow function
   * Returns a workflow function that can be registered with Temporal
   *
   * @returns A Temporal workflow function that executes this behavior tree
   *
   * @example
   * ```typescript
   * import { BehaviorTree } from '@q1k-oss/behaviour-tree-workflows';
   * import { Sequence } from '@q1k-oss/behaviour-tree-workflows';
   * import { PrintAction } from '@q1k-oss/behaviour-tree-workflows';
   *
   * const root = new Sequence({ id: 'root' });
   * root.addChild(new PrintAction({ id: 'step1', message: 'Hello' }));
   * root.addChild(new PrintAction({ id: 'step2', message: 'World' }));
   *
   * const tree = new BehaviorTree(root);
   * const workflow = tree.toWorkflow();
   *
   * // Register with Temporal worker
   * // Worker.create({ workflows: { myWorkflow: workflow }, ... })
   * ```
   */
  toWorkflow(): (args: WorkflowArgs) => Promise<WorkflowResult> {
    const root = this.root;

    return async function behaviorTreeWorkflow(
      args: WorkflowArgs,
    ): Promise<WorkflowResult> {
      // Create TemporalContext
      const context: TemporalContext = {
        blackboard: new ScopedBlackboard(),
        treeRegistry: args.treeRegistry,
        timestamp: Date.now(),
        sessionId: args.sessionId || `session-${Date.now()}`,
        // Store input immutably for ${input.key} resolution
        input: args.input ? Object.freeze({ ...args.input }) : undefined,
        // Pass activities for I/O operations (deterministic Temporal execution)
        activities: args.activities,
        // Pass tokenProvider for IntegrationAction authentication
        tokenProvider: args.tokenProvider,
      };

      // Also copy input to blackboard for backward compatibility
      // This allows ${key} or ${bb.key} to access input values
      if (args.input) {
        for (const [key, value] of Object.entries(args.input)) {
          context.blackboard.set(key, value);
        }
      }

      // Execute tree
      const status = await root.tick(context);

      // Return result with output
      return {
        status,
        output: context.blackboard.toJSON(),
      };
    };
  }

  /**
   * Replace a node at the given path with a new node
   * Updates parent-child relationships and rebuilds the index
   */
  replaceNodeAtPath(path: string, newNode: TreeNode): void {
    const oldNode = this.findNodeByPath(path);
    if (!oldNode) {
      throw new Error(`Node not found at path: ${path}`);
    }

    if (path === "/") {
      // Special case: replacing root
      this.root = newNode;
      newNode.parent = undefined;
    } else {
      // Find parent and child index from path
      const pathParts = path.split("/").filter((p) => p);
      const lastPart = pathParts[pathParts.length - 1];

      if (!lastPart) {
        throw new Error(`Invalid path format: ${path}`);
      }

      const childIndex = parseInt(lastPart, 10);

      const parent = oldNode.parent;
      if (!parent || !parent.children) {
        throw new Error(`Cannot replace node: invalid parent at path ${path}`);
      }

      // Update parent's children array
      parent.children[childIndex] = newNode;
      newNode.parent = parent;
    }

    // Rebuild index (paths may have changed if newNode has different children)
    this.buildNodeIndex();
  }

  /**
   * Build the node index with path-based and ID-based lookups
   */
  private buildNodeIndex(): void {
    this.pathIndex.clear();
    this.idIndex.clear();

    const indexNode = (node: TreeNode, path: string) => {
      // Index by path (always works)
      this.pathIndex.set(path, node);

      // Also index by ID if present
      if (node.id) {
        this.idIndex.set(node.id, node);
      }

      // Recursively index children
      if (node.children) {
        node.children.forEach((child, index) => {
          // Build child path: / becomes /0, /0 becomes /0/1, etc.
          const childPath = path === "/" ? `/${index}` : `${path}/${index}`;
          indexNode(child, childPath);
        });
      }
    };

    // Start indexing from root with path '/'
    indexNode(this.root, "/");
  }
}
