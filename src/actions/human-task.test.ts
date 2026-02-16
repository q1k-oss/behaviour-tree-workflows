/**
 * HumanTask Node Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScopedBlackboard } from "../blackboard.js";
import { Registry } from "../registry.js";
import { registerStandardNodes } from "../registry-utils.js";
import { loadTreeFromYaml } from "../yaml/parser.js";
import {
  type TemporalContext,
  type BtreeActivities,
  type CreateHumanTaskResult,
  type WaitForHumanTaskResult,
  NodeStatus,
} from "../types.js";
import { ConfigurationError } from "../errors.js";
import { HumanTask, type HumanTaskConfig } from "./human-task.js";

// Helpers
function makeContext(
  overrides: Partial<TemporalContext> = {}
): TemporalContext {
  return {
    blackboard: overrides.blackboard ?? new ScopedBlackboard(),
    treeRegistry: overrides.treeRegistry ?? new Registry(),
    timestamp: Date.now(),
    deltaTime: 0,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<HumanTaskConfig> = {}): HumanTaskConfig {
  return {
    id: "test-task",
    title: "Test Task",
    a2ui: {
      components: [
        { id: "root", component: { Column: { children: { explicitList: ["text"] } } } },
        { id: "text", component: { Text: { text: { literalString: "Hello" } } } },
      ],
    },
    ...overrides,
  };
}

const mockCreateResult: CreateHumanTaskResult = {
  taskId: "task-uuid-123",
  taskUrl: "/tasks/task-uuid-123",
};

const mockWaitResult: WaitForHumanTaskResult = {
  completed: true,
  submittedData: { amount: 1500, category: "travel" },
  decision: "approved",
  completedBy: "user-uuid-456",
  completedAt: "2026-01-30T12:00:00Z",
  timedOut: false,
};

describe("HumanTask Node", () => {
  let blackboard: ScopedBlackboard;

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    vi.clearAllMocks();
  });

  describe("Construction and validation", () => {
    it("should create node with valid config", () => {
      const node = new HumanTask(makeConfig());
      expect(node).toBeDefined();
      expect(node.id).toBe("test-task");
    });

    it("should throw ConfigurationError when title is missing", () => {
      expect(() => {
        new HumanTask(makeConfig({ title: "" }));
      }).toThrow(ConfigurationError);
      expect(() => {
        new HumanTask(makeConfig({ title: "" }));
      }).toThrow(/requires title/i);
    });

    it("should throw ConfigurationError when a2ui.components is empty", () => {
      expect(() => {
        new HumanTask(makeConfig({ a2ui: { components: [] } }));
      }).toThrow(ConfigurationError);
      expect(() => {
        new HumanTask(makeConfig({ a2ui: { components: [] } }));
      }).toThrow(/at least one component/i);
    });

    it("should throw ConfigurationError when a2ui.components is missing", () => {
      expect(() => {
        new HumanTask(makeConfig({ a2ui: {} as any }));
      }).toThrow(ConfigurationError);
    });

    it("should set default timeoutMs to 86400000 (24h)", () => {
      const node = new HumanTask(makeConfig());
      // We verify the default through execution — the node passes timeoutMs to the activity
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue(mockWaitResult);

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      node.tick(ctx);

      // Activity called with default timeout
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ timeoutMs: 86400000 })
      );
    });

    it("should set default onTimeout to 'expire'", () => {
      const node = new HumanTask(makeConfig());
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue(mockWaitResult);

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      node.tick(ctx);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ onTimeout: "expire" })
      );
    });

    it("should accept custom timeoutMs and onTimeout", () => {
      const node = new HumanTask(
        makeConfig({ timeoutMs: 3600000, onTimeout: "approve" })
      );
      expect(node).toBeDefined();
    });

    it("should accept optional description, assignee, assigneeRole, outputKey", () => {
      const node = new HumanTask(
        makeConfig({
          description: "Review this request",
          assignee: "manager@test.com",
          assigneeRole: "manager",
          outputKey: "approvalResult",
        })
      );
      expect(node).toBeDefined();
    });
  });

  describe("Activity requirement", () => {
    it("should return FAILURE when activities are undefined", async () => {
      const ctx = makeContext({
        blackboard,
        activities: undefined,
      });

      const node = new HumanTask(makeConfig());
      const status = await node.tick(ctx);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.createHumanTask");
    });

    it("should return FAILURE when createHumanTask activity is missing", async () => {
      const ctx = makeContext({
        blackboard,
        activities: {
          waitForHumanTask: vi.fn(),
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(makeConfig());
      const status = await node.tick(ctx);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.createHumanTask");
    });

    it("should return FAILURE when waitForHumanTask activity is missing", async () => {
      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: vi.fn().mockResolvedValue(mockCreateResult),
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(makeConfig());
      const status = await node.tick(ctx);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.waitForHumanTask");
    });
  });

  describe("Happy path execution", () => {
    it("should return SUCCESS when task is completed", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue(mockWaitResult);

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(makeConfig());
      const status = await node.tick(ctx);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(mockCreate).toHaveBeenCalledOnce();
      expect(mockWait).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "task-uuid-123",
          nodeId: "test-task",
        })
      );
    });

    it("should return FAILURE when completed is false", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue({
        ...mockWaitResult,
        completed: false,
        timedOut: false,
      });

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(makeConfig());
      const status = await node.tick(ctx);

      expect(status).toBe(NodeStatus.FAILURE);
    });

    it("should store response in blackboard under outputKey prefix", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue(mockWaitResult);

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(makeConfig({ outputKey: "approval" }));
      await node.tick(ctx);

      expect(blackboard.get("approval.taskId")).toBe("task-uuid-123");
      expect(blackboard.get("approval.completed")).toBe(true);
      expect(blackboard.get("approval.decision")).toBe("approved");
      expect(blackboard.get("approval.submittedData")).toEqual({
        amount: 1500,
        category: "travel",
      });
      expect(blackboard.get("approval.completedBy")).toBe("user-uuid-456");
      expect(blackboard.get("approval.timedOut")).toBe(false);
    });

    it("should store response under node id when outputKey not specified", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue(mockWaitResult);

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(makeConfig({ id: "my-task" }));
      await node.tick(ctx);

      expect(blackboard.get("my-task.taskId")).toBe("task-uuid-123");
      expect(blackboard.get("my-task.decision")).toBe("approved");
    });

    it("should pass correct request to createHumanTask activity", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue(mockWaitResult);

      blackboard.set("__tenantId", "tenant-001");
      blackboard.set("__executionId", "exec-001");

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const components = [
        { id: "root", component: { Column: {} } },
      ];

      const node = new HumanTask(
        makeConfig({
          title: "Test Title",
          description: "Test Desc",
          assignee: "user@test.com",
          assigneeRole: "approver",
          a2ui: { components },
          timeoutMs: 3600000,
          onTimeout: "approve",
        })
      );

      await node.tick(ctx);

      expect(mockCreate).toHaveBeenCalledWith({
        nodeId: "test-task",
        tenantId: "tenant-001",
        executionId: "exec-001",
        title: "Test Title",
        description: "Test Desc",
        assigneeEmail: "user@test.com",
        assigneeRole: "approver",
        a2uiComponents: components,
        a2uiDataModel: {},
        timeoutMs: 3600000,
        onTimeout: "approve",
      });
    });
  });

  describe("Variable resolution", () => {
    it("should resolve ${input.x} in title, description, assignee", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue(mockWaitResult);

      const ctx = makeContext({
        blackboard,
        input: {
          managerEmail: "mgr@test.com",
          employeeName: "Alice",
          requestType: "Travel",
        },
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(
        makeConfig({
          title: "${input.requestType} Approval",
          description: "Review request from ${input.employeeName}",
          assignee: "${input.managerEmail}",
        })
      );

      await node.tick(ctx);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Travel Approval",
          description: "Review request from Alice",
          assigneeEmail: "mgr@test.com",
        })
      );
    });

    it("should resolve ${bb.x} in title and data bindings", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue(mockWaitResult);

      blackboard.set("category", "Equipment");
      blackboard.set("totalAmount", 2500);

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(
        makeConfig({
          title: "${bb.category} Approval",
          a2ui: {
            components: [{ id: "root", component: { Column: {} } }],
            dataBindings: {
              "/category": "${bb.category}",
              "/amount": "${bb.totalAmount}",
            },
          },
        })
      );

      await node.tick(ctx);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Equipment Approval",
          a2uiDataModel: {
            category: "Equipment",
            amount: 2500,
          },
        })
      );
    });

    it("should handle nested data bindings (e.g., /form/amount)", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue(mockWaitResult);

      blackboard.set("expenseAmount", 1500);
      blackboard.set("expenseCategory", "travel");

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(
        makeConfig({
          a2ui: {
            components: [{ id: "root", component: { Column: {} } }],
            dataBindings: {
              "/form/amount": "${bb.expenseAmount}",
              "/form/category": "${bb.expenseCategory}",
              "/submitter": "Alice",
            },
          },
        })
      );

      await node.tick(ctx);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          a2uiDataModel: {
            form: {
              amount: 1500,
              category: "travel",
            },
            submitter: "Alice",
          },
        })
      );
    });

    it("should handle empty dataBindings (no bindings defined)", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue(mockWaitResult);

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(
        makeConfig({
          a2ui: {
            components: [{ id: "root", component: { Column: {} } }],
            // No dataBindings
          },
        })
      );

      await node.tick(ctx);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          a2uiDataModel: {},
        })
      );
    });
  });

  describe("Timeout handling", () => {
    it("should return FAILURE when timed out with onTimeout='expire'", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue({
        completed: false,
        submittedData: null,
        decision: null,
        completedBy: null,
        completedAt: null,
        timedOut: true,
      });

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(makeConfig({ onTimeout: "expire" }));
      const status = await node.tick(ctx);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("timed out");
    });

    it("should return SUCCESS when timed out with onTimeout='approve'", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue({
        completed: false,
        submittedData: null,
        decision: null,
        completedBy: null,
        completedAt: null,
        timedOut: true,
      });

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(makeConfig({ onTimeout: "approve" }));
      const status = await node.tick(ctx);

      expect(status).toBe(NodeStatus.SUCCESS);
    });

    it("should return FAILURE when timed out with onTimeout='reject'", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue({
        completed: false,
        submittedData: null,
        decision: null,
        completedBy: null,
        completedAt: null,
        timedOut: true,
      });

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(makeConfig({ onTimeout: "reject" }));
      const status = await node.tick(ctx);

      expect(status).toBe(NodeStatus.FAILURE);
    });

    it("should store timedOut=true in blackboard on timeout", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue({
        completed: false,
        submittedData: null,
        decision: null,
        completedBy: null,
        completedAt: null,
        timedOut: true,
      });

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(makeConfig({ outputKey: "result" }));
      await node.tick(ctx);

      expect(blackboard.get("result.timedOut")).toBe(true);
      expect(blackboard.get("result.completed")).toBe(false);
    });
  });

  describe("Error handling", () => {
    it("should return FAILURE and set lastError when createHumanTask throws", async () => {
      const mockCreate = vi
        .fn()
        .mockRejectedValue(new Error("Database connection failed"));
      const mockWait = vi.fn().mockResolvedValue(mockWaitResult);

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(makeConfig());
      const status = await node.tick(ctx);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("Database connection failed");
    });

    it("should return FAILURE and set lastError when waitForHumanTask throws", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi
        .fn()
        .mockRejectedValue(new Error("Signal timeout"));

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(makeConfig());
      const status = await node.tick(ctx);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("Signal timeout");
    });
  });

  describe("Tenant and execution context", () => {
    it("should read __tenantId and __executionId from blackboard", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue(mockWaitResult);

      blackboard.set("__tenantId", "tenant-abc");
      blackboard.set("__executionId", "exec-xyz");

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(makeConfig());
      await node.tick(ctx);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-abc",
          executionId: "exec-xyz",
        })
      );
    });

    it("should fall back to workflowInfo.workflowId for executionId", async () => {
      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue(mockWaitResult);

      // No __executionId in blackboard, but workflowInfo is set
      const ctx = makeContext({
        blackboard,
        workflowInfo: { workflowId: "wf-fallback-123" } as any,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const node = new HumanTask(makeConfig());
      await node.tick(ctx);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          executionId: "wf-fallback-123",
        })
      );
    });
  });

  describe("YAML integration", () => {
    it("should parse HumanTask from YAML and create valid node via registry", () => {
      const registry = new Registry();
      registerStandardNodes(registry);

      const yamlContent = `
type: HumanTask
id: expense-approval
props:
  title: "Expense Approval"
  description: "Review the expense"
  assignee: "\${input.managerEmail}"
  a2ui:
    components:
      - id: root
        component:
          Column:
            children:
              explicitList: [header, actions]
      - id: header
        component:
          Text:
            text:
              literalString: "Expense Request"
      - id: actions
        component:
          Row:
            children:
              explicitList: [approve-btn]
      - id: approve-btn
        component:
          Button:
            child: btn-text
            primary: true
            action:
              name: submit
              context:
                - key: decision
                  value:
                    literalString: approved
      - id: btn-text
        component:
          Text:
            text:
              literalString: Approve
    dataBindings:
      /submitter: "\${input.employeeName}"
      /amount: "\${input.requestedAmount}"
  timeoutMs: 3600000
  onTimeout: expire
  outputKey: approval
`;

      const tree = loadTreeFromYaml(yamlContent, registry);

      expect(tree).toBeInstanceOf(HumanTask);
      expect(tree.id).toBe("expense-approval");
    });

    it("should execute YAML-loaded HumanTask with mocked activities", async () => {
      const registry = new Registry();
      registerStandardNodes(registry);

      const yamlContent = `
type: HumanTask
id: review-task
props:
  title: "Review Item"
  a2ui:
    components:
      - id: root
        component:
          Column:
            children:
              explicitList: [text]
      - id: text
        component:
          Text:
            text:
              literalString: "Please review"
  outputKey: review
`;

      const tree = loadTreeFromYaml(yamlContent, registry);

      const mockCreate = vi.fn().mockResolvedValue(mockCreateResult);
      const mockWait = vi.fn().mockResolvedValue(mockWaitResult);

      const ctx = makeContext({
        blackboard,
        activities: {
          createHumanTask: mockCreate,
          waitForHumanTask: mockWait,
        } as unknown as BtreeActivities,
      });

      const status = await tree.tick(ctx);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Review Item",
          nodeId: "review-task",
        })
      );
      expect(blackboard.get("review.decision")).toBe("approved");
      expect(blackboard.get("review.completed")).toBe(true);
    });
  });
});
