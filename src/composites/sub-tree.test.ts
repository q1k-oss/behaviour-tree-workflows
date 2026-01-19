/**
 * Tests for SubTree node
 */

import { beforeEach, describe, expect, it } from "vitest";
import { BehaviorTree } from "../behavior-tree.js";
import { ScopedBlackboard } from "../blackboard.js";
import { Registry } from "../registry.js";
import { FailureNode, RunningNode, SuccessNode } from "../test-nodes.js";
import type { TreeNode } from "../types.js";
import { type TemporalContext, NodeStatus } from "../types.js";
import { Sequence } from "./sequence.js";
import { SubTree } from "./sub-tree.js";

describe("SubTree", () => {
  let blackboard: ScopedBlackboard;
  let treeRegistry: Registry;
  let context: TemporalContext;

  // Helper to register a tree with BehaviorTree wrapper (uses test-scoped registry)
  const registerTree = (id: string, rootNode: TreeNode): void => {
    const tree = new BehaviorTree(rootNode);
    treeRegistry.registerTree(id, tree, "test-source");
  };

  beforeEach(() => {
    blackboard = new ScopedBlackboard("root");
    treeRegistry = new Registry();
    context = {
      blackboard,
      treeRegistry,
      timestamp: Date.now(),
      deltaTime: 0,
    };
  });

  describe("Basic Functionality", () => {
    it("should reference and execute a registered behavior tree", async () => {
      // Register a simple tree
      const reusableTree = new Sequence({
        id: "reusable",
        name: "Reusable Steps",
      });
      reusableTree.addChildren([
        new SuccessNode({ id: "child1" }),
        new SuccessNode({ id: "child2" }),
      ]);
      registerTree("login-steps", reusableTree);

      // Create SubTree that references the tree
      const subTree = new SubTree({
        id: "sg1",
        name: "Login",
        treeId: "login-steps",
      });

      const result = await subTree.tick(context);
      expect(result).toBe(NodeStatus.SUCCESS);
    });

    it("should fail when tree completes with failure", async () => {
      // Register a tree that fails
      const failingTree = new Sequence({
        id: "failing",
        name: "Failing Steps",
      });
      failingTree.addChildren([
        new SuccessNode({ id: "child1" }),
        new FailureNode({ id: "child2" }),
      ]);
      registerTree("failing-steps", failingTree);

      const subTree = new SubTree({
        id: "sg1",
        name: "Failing Group",
        treeId: "failing-steps",
      });

      const result = await subTree.tick(context);
      expect(result).toBe(NodeStatus.FAILURE);
    });

    it("should return running when tree is running", async () => {
      // Register a tree that stays running
      const runningTree = new Sequence({
        id: "running",
        name: "Running Steps",
      });
      runningTree.addChildren([
        new SuccessNode({ id: "child1" }),
        new RunningNode({ id: "child2" }),
      ]);
      registerTree("running-steps", runningTree);

      const subTree = new SubTree({
        id: "sg1",
        name: "Running Group",
        treeId: "running-steps",
      });

      const result = await subTree.tick(context);
      expect(result).toBe(NodeStatus.RUNNING);
    });

    it("should throw error when tree ID is not found", async () => {
      const subTree = new SubTree({
        id: "sg1",
        name: "Invalid Group",
        treeId: "nonexistent-tree",
      });

      const status = await subTree.tick(context);
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it("should include available trees in error message", async () => {
      // Register some trees
      registerTree("tree1", new SuccessNode({ id: "t1" }));
      registerTree("tree2", new SuccessNode({ id: "t2" }));

      const subTree = new SubTree({
        id: "sg1",
        name: "Invalid Group",
        treeId: "nonexistent-tree",
      });

      const status = await subTree.tick(context);
      expect(status).toBe(NodeStatus.FAILURE);
    });
  });

  describe("Scoped Blackboard", () => {
    it("should create scoped blackboard for subTree", async () => {
      // Create a custom node that checks its blackboard scope
      let capturedScopePath: string = "";
      class CheckScopeNode extends SuccessNode {
        async tick(context: TemporalContext) {
          capturedScopePath = context.blackboard.getFullScopePath();
          return await super.tick(context);
        }
      }

      const tree = new Sequence({ id: "scoped", name: "Scoped Tree" });
      tree.addChild(new CheckScopeNode({ id: "child1" }));
      registerTree("scoped-steps", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "Scoped Group",
        treeId: "scoped-steps",
      });

      await subTree.tick(context);

      // Should have created a scope
      expect(capturedScopePath).toContain("subtree_sg1");
    });

    it("should isolate variables between subTrees", async () => {
      // First tree sets a value
      class SetValueNode extends SuccessNode {
        async tick(context: TemporalContext) {
          context.blackboard.set("localValue", "from-sg1");
          return await super.tick(context);
        }
      }

      // Second tree tries to read the value
      let capturedValue: unknown = "not-set";
      class ReadValueNode extends SuccessNode {
        async tick(context: TemporalContext) {
          capturedValue = context.blackboard.get("localValue");
          return await super.tick(context);
        }
      }

      const tree1 = new Sequence({ id: "tree1", name: "Tree 1" });
      tree1.addChild(new SetValueNode({ id: "child1" }));
      registerTree("steps1", tree1);

      const tree2 = new Sequence({ id: "tree2", name: "Tree 2" });
      tree2.addChild(new ReadValueNode({ id: "child2" }));
      registerTree("steps2", tree2);

      const sg1 = new SubTree({
        id: "sg1",
        name: "Group 1",
        treeId: "steps1",
      });
      const sg2 = new SubTree({
        id: "sg2",
        name: "Group 2",
        treeId: "steps2",
      });

      // Execute sg1 - sets localValue in its scope
      await sg1.tick(context);

      // Execute sg2 - should NOT see sg1's value
      await sg2.tick(context);

      // sg2 should not have access to sg1's scoped value
      expect(capturedValue).toBeUndefined();
    });

    it("should inherit parent blackboard values", async () => {
      // Create a node that reads from parent scope
      let parentValue: unknown = "not-set";
      class ReadParentNode extends SuccessNode {
        async tick(context: TemporalContext) {
          parentValue = context.blackboard.get("inheritedValue");
          return await super.tick(context);
        }
      }

      const tree = new Sequence({ id: "tree", name: "Tree" });
      tree.addChild(new ReadParentNode({ id: "child1" }));
      registerTree("read-parent", tree);

      // Set value in parent blackboard
      blackboard.set("inheritedValue", "from-parent");

      const subTree = new SubTree({
        id: "sg1",
        name: "Reading Group",
        treeId: "read-parent",
      });

      await subTree.tick(context);

      // Should be able to read parent value
      expect(parentValue).toBe("from-parent");
    });

    it("should not leak subTree-scoped values to parent", async () => {
      // Create a node that sets a value in its context
      class SetValueNode extends SuccessNode {
        async tick(context: TemporalContext) {
          context.blackboard.set("groupLocalValue", "group-value");
          return await super.tick(context);
        }
      }

      const tree = new Sequence({ id: "tree", name: "Tree" });
      tree.addChild(new SetValueNode({ id: "child1" }));
      registerTree("set-local", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "Setting Group",
        treeId: "set-local",
      });

      await subTree.tick(context);

      // Group-local value should NOT exist in parent blackboard
      expect(blackboard.has("groupLocalValue")).toBe(false);
    });
  });

  describe("Lazy Tree Cloning", () => {
    it("should clone tree only on first tick", async () => {
      const tree = new SuccessNode({ id: "tree" });
      registerTree("lazy-tree", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "Lazy Group",
        treeId: "lazy-tree",
      });

      // First tick should clone the tree
      await subTree.tick(context);
      expect(subTree.clonedTree).toBeDefined();

      // Store reference to cloned tree
      const clonedTree = subTree.clonedTree;

      // Second tick should reuse the same cloned tree
      await subTree.tick(context);
      expect(subTree.clonedTree).toBe(clonedTree);
    });

    it("should clone separate instances for different subTrees", async () => {
      const tree = new SuccessNode({ id: "tree" });
      registerTree("shared-tree", tree);

      const sg1 = new SubTree({
        id: "sg1",
        name: "Group 1",
        treeId: "shared-tree",
      });
      const sg2 = new SubTree({
        id: "sg2",
        name: "Group 2",
        treeId: "shared-tree",
      });

      await sg1.tick(context);
      await sg2.tick(context);

      // Each should have its own cloned instance
      expect(sg1.clonedTree).toBeDefined();
      expect(sg2.clonedTree).toBeDefined();
      expect(sg1.clonedTree).not.toBe(sg2.clonedTree);
    });
  });

  describe("Reset and Halt", () => {
    it("should reset the referenced tree", async () => {
      const tree = new RunningNode({ id: "tree" });
      registerTree("reset-tree", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "Reset Group",
        treeId: "reset-tree",
      });

      await subTree.tick(context);
      expect(subTree.status()).toBe(NodeStatus.RUNNING);

      subTree.reset();
      expect(subTree.status()).toBe(NodeStatus.IDLE);
      expect(subTree.clonedTree?.status()).toBe(NodeStatus.IDLE);
    });

    it("should halt the referenced tree", async () => {
      const tree = new RunningNode({ id: "tree" });
      registerTree("halt-tree", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "Halt Group",
        treeId: "halt-tree",
      });

      await subTree.tick(context);
      expect(subTree.status()).toBe(NodeStatus.RUNNING);
      expect(subTree.clonedTree?.status()).toBe(NodeStatus.RUNNING);

      subTree.halt();
      expect(subTree.status()).toBe(NodeStatus.IDLE);
      expect(subTree.clonedTree?.status()).toBe(NodeStatus.IDLE);
    });
  });

  describe("Clone", () => {
    it("should clone the subTree without cloning the cached tree", () => {
      const subTree = new SubTree({
        id: "sg1",
        name: "Original SubTree",
        treeId: "some-tree",
      });

      const cloned = subTree.clone() as SubTree;

      expect(cloned.id).toBe("sg1");
      expect(cloned.name).toBe("Original SubTree");
      expect(cloned.treeId).toBe("some-tree");
      expect(cloned.clonedTree).toBeUndefined();
    });

    it("should allow cloned subTree to lazy-load its own tree", async () => {
      const tree = new SuccessNode({ id: "tree" });
      registerTree("clone-tree", tree);

      const original = new SubTree({
        id: "sg1",
        name: "Original",
        treeId: "clone-tree",
      });

      // Tick original to trigger lazy loading
      await original.tick(context);
      expect(original.clonedTree).toBeDefined();

      // Clone should not have a cached tree yet
      const cloned = original.clone() as SubTree;
      expect(cloned.clonedTree).toBeUndefined();

      // Tick clone to trigger its own lazy loading
      await cloned.tick(context);
      expect(cloned.clonedTree).toBeDefined();

      // Should be different instances
      expect(cloned.clonedTree).not.toBe(original.clonedTree);
    });
  });

  describe("Parameter Passing (params)", () => {
    it("should pass static params to subtree blackboard", async () => {
      // Create a node that reads params from its blackboard
      let capturedOrderId: unknown = "not-set";
      let capturedQuantity: unknown = "not-set";
      class ReadParamsNode extends SuccessNode {
        async tick(ctx: TemporalContext) {
          capturedOrderId = ctx.blackboard.get("orderId");
          capturedQuantity = ctx.blackboard.get("quantity");
          return await super.tick(ctx);
        }
      }

      const tree = new Sequence({ id: "tree", name: "Tree" });
      tree.addChild(new ReadParamsNode({ id: "reader" }));
      registerTree("params-tree", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "With Params",
        treeId: "params-tree",
        params: {
          orderId: "ORD-123",
          quantity: 5,
        },
      });

      await subTree.tick(context);

      expect(capturedOrderId).toBe("ORD-123");
      expect(capturedQuantity).toBe(5);
    });

    it("should resolve variable references in params from parent blackboard", async () => {
      // Set values in parent blackboard
      blackboard.set("currentCustomer", "CUST-456");
      blackboard.set("selectedProduct", { id: "PROD-789", name: "Widget" });

      let capturedCustomer: unknown = "not-set";
      let capturedProduct: unknown = "not-set";
      class ReadParamsNode extends SuccessNode {
        async tick(ctx: TemporalContext) {
          capturedCustomer = ctx.blackboard.get("customer");
          capturedProduct = ctx.blackboard.get("product");
          return await super.tick(ctx);
        }
      }

      const tree = new Sequence({ id: "tree", name: "Tree" });
      tree.addChild(new ReadParamsNode({ id: "reader" }));
      registerTree("resolve-params-tree", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "With Variable Params",
        treeId: "resolve-params-tree",
        params: {
          customer: "${bb.currentCustomer}",
          product: "${bb.selectedProduct}",
        },
      });

      await subTree.tick(context);

      expect(capturedCustomer).toBe("CUST-456");
      expect(capturedProduct).toEqual({ id: "PROD-789", name: "Widget" });
    });

    it("should resolve params from workflow input", async () => {
      // Set workflow input
      context.input = Object.freeze({
        orderId: "INPUT-ORD-999",
        priority: "high",
      });

      let capturedOrderId: unknown = "not-set";
      let capturedPriority: unknown = "not-set";
      class ReadParamsNode extends SuccessNode {
        async tick(ctx: TemporalContext) {
          capturedOrderId = ctx.blackboard.get("orderId");
          capturedPriority = ctx.blackboard.get("priority");
          return await super.tick(ctx);
        }
      }

      const tree = new Sequence({ id: "tree", name: "Tree" });
      tree.addChild(new ReadParamsNode({ id: "reader" }));
      registerTree("input-params-tree", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "With Input Params",
        treeId: "input-params-tree",
        params: {
          orderId: "${input.orderId}",
          priority: "${input.priority}",
        },
      });

      await subTree.tick(context);

      expect(capturedOrderId).toBe("INPUT-ORD-999");
      expect(capturedPriority).toBe("high");
    });

    it("should resolve nested property access in params", async () => {
      blackboard.set("user", {
        profile: {
          name: "Alice",
          email: "alice@example.com",
        },
      });

      let capturedName: unknown = "not-set";
      let capturedEmail: unknown = "not-set";
      class ReadParamsNode extends SuccessNode {
        async tick(ctx: TemporalContext) {
          capturedName = ctx.blackboard.get("userName");
          capturedEmail = ctx.blackboard.get("userEmail");
          return await super.tick(ctx);
        }
      }

      const tree = new Sequence({ id: "tree", name: "Tree" });
      tree.addChild(new ReadParamsNode({ id: "reader" }));
      registerTree("nested-params-tree", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "With Nested Params",
        treeId: "nested-params-tree",
        params: {
          userName: "${bb.user.profile.name}",
          userEmail: "${bb.user.profile.email}",
        },
      });

      await subTree.tick(context);

      expect(capturedName).toBe("Alice");
      expect(capturedEmail).toBe("alice@example.com");
    });

    it("should handle complex nested params structure", async () => {
      blackboard.set("basePrice", 100);
      context.input = Object.freeze({ taxRate: 0.08 });

      let capturedConfig: unknown = "not-set";
      class ReadParamsNode extends SuccessNode {
        async tick(ctx: TemporalContext) {
          capturedConfig = ctx.blackboard.get("config");
          return await super.tick(ctx);
        }
      }

      const tree = new Sequence({ id: "tree", name: "Tree" });
      tree.addChild(new ReadParamsNode({ id: "reader" }));
      registerTree("complex-params-tree", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "With Complex Params",
        treeId: "complex-params-tree",
        params: {
          config: {
            price: "${bb.basePrice}",
            tax: "${input.taxRate}",
            metadata: {
              source: "parent",
              timestamp: 12345,
            },
          },
        },
      });

      await subTree.tick(context);

      expect(capturedConfig).toEqual({
        price: 100,
        tax: 0.08,
        metadata: {
          source: "parent",
          timestamp: 12345,
        },
      });
    });

    it("should not leak params to parent scope", async () => {
      const tree = new SuccessNode({ id: "tree" });
      registerTree("leak-test-tree", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "Leak Test",
        treeId: "leak-test-tree",
        params: {
          secretParam: "should-not-leak",
        },
      });

      await subTree.tick(context);

      // Parent blackboard should NOT have the param
      expect(blackboard.has("secretParam")).toBe(false);
    });
  });

  describe("Output Export (outputs)", () => {
    it("should export specified outputs to parent blackboard", async () => {
      // Create a node that sets values in its blackboard
      class SetOutputsNode extends SuccessNode {
        async tick(ctx: TemporalContext) {
          ctx.blackboard.set("result", "computation-result");
          ctx.blackboard.set("processingTime", 150);
          ctx.blackboard.set("internalState", "should-not-export");
          return await super.tick(ctx);
        }
      }

      const tree = new Sequence({ id: "tree", name: "Tree" });
      tree.addChild(new SetOutputsNode({ id: "setter" }));
      registerTree("outputs-tree", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "With Outputs",
        treeId: "outputs-tree",
        outputs: ["result", "processingTime"],
      });

      await subTree.tick(context);

      // Exported values should be in parent
      expect(blackboard.get("result")).toBe("computation-result");
      expect(blackboard.get("processingTime")).toBe(150);
      // Non-exported values should NOT be in parent
      expect(blackboard.has("internalState")).toBe(false);
    });

    it("should skip missing output keys without error", async () => {
      class SetPartialOutputsNode extends SuccessNode {
        async tick(ctx: TemporalContext) {
          ctx.blackboard.set("existingOutput", "value");
          // Note: "missingOutput" is not set
          return await super.tick(ctx);
        }
      }

      const tree = new Sequence({ id: "tree", name: "Tree" });
      tree.addChild(new SetPartialOutputsNode({ id: "setter" }));
      registerTree("partial-outputs-tree", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "With Partial Outputs",
        treeId: "partial-outputs-tree",
        outputs: ["existingOutput", "missingOutput"],
      });

      const status = await subTree.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("existingOutput")).toBe("value");
      expect(blackboard.has("missingOutput")).toBe(false);
    });

    it("should export complex objects", async () => {
      class SetComplexOutputNode extends SuccessNode {
        async tick(ctx: TemporalContext) {
          ctx.blackboard.set("userResult", {
            id: "USER-123",
            profile: { name: "Bob", score: 95 },
            tags: ["active", "premium"],
          });
          return await super.tick(ctx);
        }
      }

      const tree = new Sequence({ id: "tree", name: "Tree" });
      tree.addChild(new SetComplexOutputNode({ id: "setter" }));
      registerTree("complex-output-tree", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "With Complex Output",
        treeId: "complex-output-tree",
        outputs: ["userResult"],
      });

      await subTree.tick(context);

      expect(blackboard.get("userResult")).toEqual({
        id: "USER-123",
        profile: { name: "Bob", score: 95 },
        tags: ["active", "premium"],
      });
    });

    it("should not export outputs on failure", async () => {
      class SetThenFailNode extends FailureNode {
        async tick(ctx: TemporalContext) {
          ctx.blackboard.set("shouldNotExport", "value");
          return await super.tick(ctx);
        }
      }

      const tree = new Sequence({ id: "tree", name: "Tree" });
      tree.addChild(new SetThenFailNode({ id: "failer" }));
      registerTree("fail-output-tree", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "Failing SubTree",
        treeId: "fail-output-tree",
        outputs: ["shouldNotExport"],
      });

      const status = await subTree.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      // Output should NOT be exported on failure
      expect(blackboard.has("shouldNotExport")).toBe(false);
    });

    it("should export outputs on running status", async () => {
      class SetThenRunningNode extends RunningNode {
        async tick(ctx: TemporalContext) {
          ctx.blackboard.set("partialResult", "in-progress");
          return await super.tick(ctx);
        }
      }

      const tree = new Sequence({ id: "tree", name: "Tree" });
      tree.addChild(new SetThenRunningNode({ id: "runner" }));
      registerTree("running-output-tree", tree);

      const subTree = new SubTree({
        id: "sg1",
        name: "Running SubTree",
        treeId: "running-output-tree",
        outputs: ["partialResult"],
      });

      const status = await subTree.tick(context);

      expect(status).toBe(NodeStatus.RUNNING);
      // Output should be exported even when running (useful for streaming results)
      expect(blackboard.get("partialResult")).toBe("in-progress");
    });
  });

  describe("Combined Params and Outputs", () => {
    it("should pass params and export outputs in same subtree", async () => {
      // Create a node that reads params, computes, and sets outputs
      class ComputeNode extends SuccessNode {
        async tick(ctx: TemporalContext) {
          const price = ctx.blackboard.get("price") as number;
          const quantity = ctx.blackboard.get("quantity") as number;
          const taxRate = ctx.blackboard.get("taxRate") as number;

          const subtotal = price * quantity;
          const tax = subtotal * taxRate;
          const total = subtotal + tax;

          ctx.blackboard.set("subtotal", subtotal);
          ctx.blackboard.set("tax", tax);
          ctx.blackboard.set("total", total);
          return await super.tick(ctx);
        }
      }

      const tree = new Sequence({ id: "tree", name: "Tree" });
      tree.addChild(new ComputeNode({ id: "compute" }));
      registerTree("compute-tree", tree);

      // Set parent values
      blackboard.set("productPrice", 100);
      blackboard.set("orderQuantity", 3);

      const subTree = new SubTree({
        id: "calculate-order",
        name: "Calculate Order",
        treeId: "compute-tree",
        params: {
          price: "${bb.productPrice}",
          quantity: "${bb.orderQuantity}",
          taxRate: 0.08,
        },
        outputs: ["subtotal", "tax", "total"],
      });

      await subTree.tick(context);

      // Outputs should be in parent blackboard
      expect(blackboard.get("subtotal")).toBe(300);
      expect(blackboard.get("tax")).toBe(24);
      expect(blackboard.get("total")).toBe(324);

      // Params should NOT be in parent blackboard
      expect(blackboard.has("price")).toBe(false);
      expect(blackboard.has("quantity")).toBe(false);
      expect(blackboard.has("taxRate")).toBe(false);
    });

    it("should handle real-world order processing scenario", async () => {
      // Simulate order processing subtree
      class ProcessOrderNode extends SuccessNode {
        async tick(ctx: TemporalContext) {
          const orderId = ctx.blackboard.get("orderId") as string;
          const items = ctx.blackboard.get("items") as Array<{ price: number; qty: number }>;

          // Simulate processing
          const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);

          ctx.blackboard.set("orderResult", {
            orderId,
            total,
            status: "processed",
            timestamp: Date.now(),
          });
          ctx.blackboard.set("orderStatus", "SUCCESS");

          return await super.tick(ctx);
        }
      }

      const tree = new Sequence({ id: "tree", name: "Tree" });
      tree.addChild(new ProcessOrderNode({ id: "process" }));
      registerTree("order-processor", tree);

      // Set up workflow input and parent state
      context.input = Object.freeze({
        orderId: "ORD-2024-001",
      });
      blackboard.set("cartItems", [
        { price: 25, qty: 2 },
        { price: 50, qty: 1 },
        { price: 10, qty: 3 },
      ]);

      const subTree = new SubTree({
        id: "process-order",
        name: "Process Order",
        treeId: "order-processor",
        params: {
          orderId: "${input.orderId}",
          items: "${bb.cartItems}",
        },
        outputs: ["orderResult", "orderStatus"],
      });

      await subTree.tick(context);

      // Check exported outputs
      expect(blackboard.get("orderStatus")).toBe("SUCCESS");
      const orderResult = blackboard.get("orderResult") as Record<string, unknown>;
      expect(orderResult.orderId).toBe("ORD-2024-001");
      expect(orderResult.total).toBe(130); // 25*2 + 50*1 + 10*3
      expect(orderResult.status).toBe("processed");
    });

    it("should work with multiple subtree calls sharing outputs", async () => {
      class IncrementNode extends SuccessNode {
        async tick(ctx: TemporalContext) {
          const current = ctx.blackboard.get("counter") as number;
          ctx.blackboard.set("counter", current + 1);
          return await super.tick(ctx);
        }
      }

      const tree = new Sequence({ id: "tree", name: "Tree" });
      tree.addChild(new IncrementNode({ id: "increment" }));
      registerTree("incrementer", tree);

      blackboard.set("counter", 0);

      const subTree1 = new SubTree({
        id: "inc1",
        name: "Increment 1",
        treeId: "incrementer",
        params: { counter: "${bb.counter}" },
        outputs: ["counter"],
      });

      const subTree2 = new SubTree({
        id: "inc2",
        name: "Increment 2",
        treeId: "incrementer",
        params: { counter: "${bb.counter}" },
        outputs: ["counter"],
      });

      await subTree1.tick(context);
      expect(blackboard.get("counter")).toBe(1);

      await subTree2.tick(context);
      expect(blackboard.get("counter")).toBe(2);

      await subTree1.tick(context);
      expect(blackboard.get("counter")).toBe(3);
    });
  });
});
