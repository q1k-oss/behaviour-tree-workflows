/**
 * HumanTask Schema Tests
 */

import { describe, it, expect } from "vitest";
import { SchemaRegistry } from "../schemas/index.js";
import { humanTaskSchema } from "./human-task.schema.js";

describe("HumanTask Schema", () => {
  const schemaRegistry = new SchemaRegistry();

  it("should be registered in schema registry", () => {
    expect(schemaRegistry.hasSchema("HumanTask")).toBe(true);
  });

  it("should validate a correct HumanTask configuration", () => {
    const config = {
      id: "expense-approval",
      title: "Expense Approval",
      description: "Review the expense request",
      assignee: "${input.managerEmail}",
      a2ui: {
        components: [
          {
            id: "root",
            component: { Column: { children: { explicitList: ["header"] } } },
          },
          {
            id: "header",
            component: { Text: { text: { literalString: "Hello" } } },
          },
        ],
        dataBindings: {
          "/submitter": "${input.employeeName}",
          "/form/amount": "${input.amount}",
        },
      },
      timeoutMs: 3600000,
      onTimeout: "approve",
      outputKey: "approvalResult",
    };

    const result = humanTaskSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("should reject missing title", () => {
    const config = {
      id: "test",
      a2ui: {
        components: [{ id: "root", component: { Column: {} } }],
      },
    };

    const result = humanTaskSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should reject empty title", () => {
    const config = {
      id: "test",
      title: "",
      a2ui: {
        components: [{ id: "root", component: { Column: {} } }],
      },
    };

    const result = humanTaskSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should reject missing a2ui.components", () => {
    const config = {
      id: "test",
      title: "Test Task",
      a2ui: {},
    };

    const result = humanTaskSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should reject empty a2ui.components array", () => {
    const config = {
      id: "test",
      title: "Test Task",
      a2ui: {
        components: [],
      },
    };

    const result = humanTaskSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should reject component with empty id", () => {
    const config = {
      id: "test",
      title: "Test Task",
      a2ui: {
        components: [{ id: "", component: { Text: {} } }],
      },
    };

    const result = humanTaskSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should apply default timeoutMs of 86400000", () => {
    const config = {
      id: "test",
      title: "Test Task",
      a2ui: {
        components: [{ id: "root", component: { Column: {} } }],
      },
    };

    const result = humanTaskSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeoutMs).toBe(86400000);
    }
  });

  it("should apply default onTimeout of 'expire'", () => {
    const config = {
      id: "test",
      title: "Test Task",
      a2ui: {
        components: [{ id: "root", component: { Column: {} } }],
      },
    };

    const result = humanTaskSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.onTimeout).toBe("expire");
    }
  });

  it("should reject invalid onTimeout value", () => {
    const config = {
      id: "test",
      title: "Test Task",
      a2ui: {
        components: [{ id: "root", component: { Column: {} } }],
      },
      onTimeout: "escalate",
    };

    const result = humanTaskSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should allow optional fields to be omitted", () => {
    const config = {
      id: "test",
      title: "Minimal Task",
      a2ui: {
        components: [{ id: "root", component: { Column: {} } }],
      },
    };

    const result = humanTaskSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeUndefined();
      expect(result.data.assignee).toBeUndefined();
      expect(result.data.assigneeRole).toBeUndefined();
      expect(result.data.outputKey).toBeUndefined();
    }
  });

  it("should validate via schema registry", () => {
    const config = {
      id: "test",
      title: "Test Task",
      a2ui: {
        components: [{ id: "root", component: { Column: {} } }],
      },
    };

    const result = schemaRegistry.safeParse("HumanTask", config);
    expect(result.success).toBe(true);
  });
});
