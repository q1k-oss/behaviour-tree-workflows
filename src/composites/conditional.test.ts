/**
 * Tests for Conditional node
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ScopedBlackboard } from "../blackboard.js";
import { ConfigurationError } from "../errors.js";
import { FailureNode, RunningNode, SuccessNode } from "../test-nodes.js";
import { type TemporalContext, NodeStatus } from "../types.js";
import { Conditional } from "./conditional.js";

describe("Conditional", () => {
  let blackboard: ScopedBlackboard;
  let context: TemporalContext;

  beforeEach(() => {
    blackboard = new ScopedBlackboard("root");
    context = {
      blackboard,
      timestamp: Date.now(),
      deltaTime: 0,
    };
  });

  describe("If-Then Logic", () => {
    it("should execute then branch when condition succeeds", async () => {
      const conditional = new Conditional({ id: "cond1" });
      const condition = new SuccessNode({ id: "condition" });
      const thenBranch = new SuccessNode({ id: "then" });

      conditional.addChild(condition);
      conditional.addChild(thenBranch);

      const result = await conditional.tick(context);
      expect(result).toBe(NodeStatus.SUCCESS);
      expect(thenBranch.status()).toBe(NodeStatus.SUCCESS);
    });

    it("should return then branch status", async () => {
      const conditional = new Conditional({ id: "cond1" });
      const condition = new SuccessNode({ id: "condition" });
      const thenBranch = new FailureNode({ id: "then" });

      conditional.addChild(condition);
      conditional.addChild(thenBranch);

      const result = await conditional.tick(context);
      expect(result).toBe(NodeStatus.FAILURE);
    });
  });

  describe("If-Else Logic", () => {
    it("should execute else branch when condition fails", async () => {
      const conditional = new Conditional({ id: "cond1" });
      const condition = new FailureNode({ id: "condition" });
      const thenBranch = new SuccessNode({ id: "then" });
      const elseBranch = new SuccessNode({ id: "else" });

      conditional.addChild(condition);
      conditional.addChild(thenBranch);
      conditional.addChild(elseBranch);

      const result = await conditional.tick(context);
      expect(result).toBe(NodeStatus.SUCCESS);
      expect(thenBranch.status()).toBe(NodeStatus.IDLE); // Not executed
      expect(elseBranch.status()).toBe(NodeStatus.SUCCESS);
    });

    it("should return else branch status", async () => {
      const conditional = new Conditional({ id: "cond1" });
      const condition = new FailureNode({ id: "condition" });
      const thenBranch = new SuccessNode({ id: "then" });
      const elseBranch = new FailureNode({ id: "else" });

      conditional.addChild(condition);
      conditional.addChild(thenBranch);
      conditional.addChild(elseBranch);

      const result = await conditional.tick(context);
      expect(result).toBe(NodeStatus.FAILURE);
    });

    it(
      "should return FAILURE when condition fails and no else branch",
      async () => {
        const conditional = new Conditional({ id: "cond1" });
        const condition = new FailureNode({ id: "condition" });
        const thenBranch = new SuccessNode({ id: "then" });

        conditional.addChild(condition);
        conditional.addChild(thenBranch);

        const result = await conditional.tick(context);
        expect(result).toBe(NodeStatus.FAILURE);
        expect(thenBranch.status()).toBe(NodeStatus.IDLE);
      },
    );
  });

  describe("RUNNING State", () => {
    it("should return RUNNING when condition is running", async () => {
      const conditional = new Conditional({ id: "cond1" });
      const condition = new RunningNode({ id: "condition" });
      const thenBranch = new SuccessNode({ id: "then" });

      conditional.addChild(condition);
      conditional.addChild(thenBranch);

      const result = await conditional.tick(context);
      expect(result).toBe(NodeStatus.RUNNING);
      expect(thenBranch.status()).toBe(NodeStatus.IDLE); // Not executed
    });

    it("should return RUNNING when then branch is running", async () => {
      const conditional = new Conditional({ id: "cond1" });
      const condition = new SuccessNode({ id: "condition" });
      const thenBranch = new RunningNode({ id: "then" });

      conditional.addChild(condition);
      conditional.addChild(thenBranch);

      const result = await conditional.tick(context);
      expect(result).toBe(NodeStatus.RUNNING);
    });

    it("should return RUNNING when else branch is running", async () => {
      const conditional = new Conditional({ id: "cond1" });
      const condition = new FailureNode({ id: "condition" });
      const thenBranch = new SuccessNode({ id: "then" });
      const elseBranch = new RunningNode({ id: "else" });

      conditional.addChild(condition);
      conditional.addChild(thenBranch);
      conditional.addChild(elseBranch);

      const result = await conditional.tick(context);
      expect(result).toBe(NodeStatus.RUNNING);
    });
  });

  describe("Edge Cases", () => {
    it("should enforce maximum 3 children", () => {
      const conditional = new Conditional({ id: "cond1" });
      conditional.addChild(new SuccessNode({ id: "child1" }));
      conditional.addChild(new SuccessNode({ id: "child2" }));
      conditional.addChild(new SuccessNode({ id: "child3" }));

      expect(() => {
        conditional.addChild(new SuccessNode({ id: "child4" }));
      }).toThrow("Conditional can have maximum 3 children");
    });

    it("should throw ConfigurationError without condition", async () => {
      const conditional = new Conditional({ id: "cond1" });

      await expect(conditional.tick(context)).rejects.toThrow(ConfigurationError);
    });

    it("should throw ConfigurationError without then branch", async () => {
      const conditional = new Conditional({ id: "cond1" });
      conditional.addChild(new SuccessNode({ id: "condition" }));

      await expect(conditional.tick(context)).rejects.toThrow(ConfigurationError);
    });
  });

  describe("Multi-tick branch execution - FIXED BEHAVIOR", () => {
    it(
      "should check condition ONCE and not re-check while branch is RUNNING",
      async () => {
        let conditionTickCount = 0;
        let branchTickCount = 0;

        // Condition that counts how many times it's checked
        class CountingCondition extends SuccessNode {
          async tick(_context: TemporalContext): Promise<NodeStatus> {
            conditionTickCount++;
            console.log(`[CountingCondition] Tick #${conditionTickCount}`);
            this._status = NodeStatus.SUCCESS;
            return NodeStatus.SUCCESS;
          }
        }

        // Branch that returns RUNNING for first 2 ticks, then SUCCESS
        class MultiTickBranch extends SuccessNode {
          async tick(context: TemporalContext): Promise<NodeStatus> {
            const superTick = super.tick.bind(this);
            branchTickCount++;
            console.log(`[MultiTickBranch] Tick #${branchTickCount}`);

            if (branchTickCount < 3) {
              this._status = NodeStatus.RUNNING;
              return NodeStatus.RUNNING;
            }

            return await superTick(context); // SUCCESS on tick 3
          }
        }

        const condition = new CountingCondition({ id: "counting-condition" });
        const thenBranch = new MultiTickBranch({ id: "multi-tick-branch" });
        const conditional = new Conditional({
          id: "test-conditional",
          name: "test-conditional",
        });

        conditional.addChild(condition);
        conditional.addChild(thenBranch);

        // Tick 1: Should check condition, then execute branch (returns RUNNING)
        const status1 = await conditional.tick(context);
        expect(status1).toBe(NodeStatus.RUNNING);
        expect(conditionTickCount).toBe(1); // Condition checked once
        expect(branchTickCount).toBe(1); // Branch executed once

        // Tick 2: FIXED: Should NOT re-check condition, just execute branch (returns RUNNING)
        const status2 = await conditional.tick(context);
        expect(status2).toBe(NodeStatus.RUNNING);
        expect(conditionTickCount).toBe(1); // Still 1! Not re-checked
        expect(branchTickCount).toBe(2); // Branch executed again

        // Tick 3: FIXED: Should NOT re-check condition, just execute branch (returns SUCCESS)
        const status3 = await conditional.tick(context);
        expect(status3).toBe(NodeStatus.SUCCESS);
        expect(conditionTickCount).toBe(1); // Still 1! Not re-checked
        expect(branchTickCount).toBe(3); // Branch completes

        // Summary: Condition was checked only 1 time (on first tick)
        // This confirms the condition is NOT re-evaluated on subsequent ticks
        console.log(
          "\n✅ FIXED: Condition checked only 1 time, not re-checked during branch execution",
        );
      },
    );

    it(
      "should NOT be affected if condition changes while branch is RUNNING",
      async () => {
        let branchTickCount = 0;
        let conditionShouldSucceed = true;

        // Condition that succeeds initially, then fails on subsequent ticks
        class ChangeableCondition extends SuccessNode {
          async tick(_context: TemporalContext): Promise<NodeStatus> {
            const result = conditionShouldSucceed
              ? NodeStatus.SUCCESS
              : NodeStatus.FAILURE;
            console.log(`[ChangeableCondition] Returning: ${result}`);
            this._status = result;
            return result;
          }
        }

        // Branch that takes 3 ticks to complete
        class SlowBranch extends SuccessNode {
          async tick(context: TemporalContext): Promise<NodeStatus> {
            const superTick = super.tick.bind(this);
            branchTickCount++;
            console.log(`[SlowBranch] Tick #${branchTickCount}`);

            if (branchTickCount < 3) {
              this._status = NodeStatus.RUNNING;
              return NodeStatus.RUNNING;
            }

            return await superTick(context); // SUCCESS on tick 3
          }
        }

        const condition = new ChangeableCondition({
          id: "changeable-condition",
        });
        const thenBranch = new SlowBranch({ id: "slow-branch" });
        const conditional = new Conditional({
          id: "test-conditional",
          name: "test-conditional",
        });

        conditional.addChild(condition);
        conditional.addChild(thenBranch);

        // Tick 1: Condition passes, branch returns RUNNING
        const status1 = await conditional.tick(context);
        expect(status1).toBe(NodeStatus.RUNNING);
        expect(branchTickCount).toBe(1);

        // Change condition to fail
        conditionShouldSucceed = false;

        // Tick 2: FIXED: Condition is NOT re-checked, branch continues
        const status2 = await conditional.tick(context);
        expect(status2).toBe(NodeStatus.RUNNING); // Still RUNNING!
        expect(branchTickCount).toBe(2); // Branch continues executing

        // Tick 3: FIXED: Branch completes successfully despite condition now failing
        const status3 = await conditional.tick(context);
        expect(status3).toBe(NodeStatus.SUCCESS); // Branch completes!
        expect(branchTickCount).toBe(3); // Branch executed all 3 ticks

        // This demonstrates the fix: branch execution is NOT interrupted
        // even though the condition would now fail if re-checked
        console.log(
          "\n✅ SAFE: Branch execution continues uninterrupted despite condition change",
        );
      },
    );
  });
});
