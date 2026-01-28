/**
 * Tests for Variable Resolver Utility
 */

import { describe, expect, it } from "vitest";
import { ScopedBlackboard } from "../blackboard.js";
import {
  resolveString,
  resolveValue,
  hasVariables,
  extractVariables,
  type VariableContext,
} from "./variable-resolver.js";

describe("Variable Resolver", () => {
  // Helper to create a context
  function createContext(overrides: Partial<VariableContext> = {}): VariableContext {
    return {
      blackboard: new ScopedBlackboard(),
      ...overrides,
    };
  }

  describe("resolveString", () => {
    describe("blackboard variables (${bb.key} and ${key})", () => {
      it("should resolve ${bb.key} from blackboard", () => {
        const ctx = createContext();
        ctx.blackboard.set("username", "john");

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${bb.username}", ctx);
        expect(result).toBe("john");
      });

      it("should resolve ${key} shorthand from blackboard", () => {
        const ctx = createContext();
        ctx.blackboard.set("username", "john");

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${username}", ctx);
        expect(result).toBe("john");
      });

      it("should resolve nested blackboard values", () => {
        const ctx = createContext();
        ctx.blackboard.set("user", { profile: { name: "Alice" } });

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${bb.user.profile.name}", ctx);
        expect(result).toBe("Alice");
      });

      it("should preserve type for full match", () => {
        const ctx = createContext();
        const user = { name: "Bob", age: 30 };
        ctx.blackboard.set("user", user);

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${bb.user}", ctx);
        expect(result).toEqual(user);
        expect(typeof result).toBe("object");
      });

      it("should preserve array type for full match", () => {
        const ctx = createContext();
        const items = ["a", "b", "c"];
        ctx.blackboard.set("items", items);

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${bb.items}", ctx);
        expect(result).toEqual(items);
        expect(Array.isArray(result)).toBe(true);
      });

      it("should interpolate multiple values in string", () => {
        const ctx = createContext();
        ctx.blackboard.set("name", "Alice");
        ctx.blackboard.set("age", 25);

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${name} is ${age} years old", ctx);
        expect(result).toBe("Alice is 25 years old");
      });

      it("should JSON stringify objects in interpolation", () => {
        const ctx = createContext();
        ctx.blackboard.set("data", { key: "value" });

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("Data: ${data}", ctx);
        expect(result).toBe('Data: {"key":"value"}');
      });
    });

    describe("input variables (${input.key})", () => {
      it("should resolve ${input.key} from input", () => {
        const ctx = createContext({
          input: { orderId: "ORD-123" },
        });

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${input.orderId}", ctx);
        expect(result).toBe("ORD-123");
      });

      it("should resolve nested input values", () => {
        const ctx = createContext({
          input: { order: { id: "ORD-456", customer: "Jane" } },
        });

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${input.order.id}", ctx);
        expect(result).toBe("ORD-456");
      });

      it("should preserve type for full input match", () => {
        const order = { id: "ORD-789", items: ["a", "b"] };
        const ctx = createContext({
          input: { order },
        });

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${input.order}", ctx);
        expect(result).toEqual(order);
      });

      it("should return undefined for missing input", () => {
        const ctx = createContext({
          input: { existing: "value" },
        });

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${input.missing}", ctx, { preserveUndefined: false });
        expect(result).toBeUndefined();
      });
    });

    describe("environment variables (${env.KEY})", () => {
      it("should resolve ${env.KEY} from process.env", () => {
        const ctx = createContext();

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${env.NODE_ENV}", ctx, {
          envSource: { NODE_ENV: "test" },
        });
        expect(result).toBe("test");
      });

      it("should use custom env source", () => {
        const ctx = createContext();

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${env.CUSTOM_VAR}", ctx, {
          envSource: { CUSTOM_VAR: "custom-value" },
        });
        expect(result).toBe("custom-value");
      });

      it("should preserve placeholder for missing env var", () => {
        const ctx = createContext();

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${env.MISSING_VAR}", ctx, {
          envSource: {},
        });
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        expect(result).toBe("${env.MISSING_VAR}");
      });
    });

    describe("test data variables (${param.key})", () => {
      it("should resolve ${param.key} from testData", () => {
        const testData = new Map<string, unknown>();
        testData.set("testId", "TEST-001");

        const ctx = createContext({ testData });

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${param.testId}", ctx);
        expect(result).toBe("TEST-001");
      });

      it("should resolve nested param values", () => {
        const testData = new Map<string, unknown>();
        testData.set("test", { data: { value: 42 } });

        const ctx = createContext({ testData });

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${param.test.data.value}", ctx);
        expect(result).toBe(42);
      });
    });

    describe("undefined value handling", () => {
      it("should preserve placeholder when preserveUndefined is true (default)", () => {
        const ctx = createContext();

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${bb.missing}", ctx);
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        expect(result).toBe("${bb.missing}");
      });

      it("should return undefined when preserveUndefined is false (full match)", () => {
        const ctx = createContext();

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("${bb.missing}", ctx, { preserveUndefined: false });
        expect(result).toBeUndefined();
      });

      it("should return empty string when preserveUndefined is false (interpolation)", () => {
        const ctx = createContext();

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("Value: ${bb.missing}", ctx, { preserveUndefined: false });
        expect(result).toBe("Value: ");
      });
    });

    describe("edge cases", () => {
      it("should handle null values", () => {
        const ctx = createContext();
        ctx.blackboard.set("nullVal", null);

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("Value: ${nullVal}", ctx);
        expect(result).toBe("Value: null");
      });

      it("should handle number values", () => {
        const ctx = createContext();
        ctx.blackboard.set("count", 42);

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("Count: ${count}", ctx);
        expect(result).toBe("Count: 42");
      });

      it("should handle boolean values", () => {
        const ctx = createContext();
        ctx.blackboard.set("active", true);

        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        const result = resolveString("Active: ${active}", ctx);
        expect(result).toBe("Active: true");
      });

      it("should return string as-is when no variables", () => {
        const ctx = createContext();
        const result = resolveString("Hello World", ctx);
        expect(result).toBe("Hello World");
      });

      it("should handle empty string", () => {
        const ctx = createContext();
        const result = resolveString("", ctx);
        expect(result).toBe("");
      });
    });
  });

  describe("resolveValue", () => {
    it("should resolve string values", () => {
      const ctx = createContext();
      ctx.blackboard.set("name", "Alice");

      // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
      const result = resolveValue("Hello ${name}", ctx);
      expect(result).toBe("Hello Alice");
    });

    it("should resolve values in objects recursively", () => {
      const ctx = createContext();
      ctx.blackboard.set("orderId", "ORD-123");
      ctx.blackboard.set("customer", "Bob");

      const input = {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        id: "${orderId}",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        name: "${customer}",
        nested: {
          // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
          value: "${orderId}",
        },
      };

      const result = resolveValue(input, ctx);
      expect(result).toEqual({
        id: "ORD-123",
        name: "Bob",
        nested: {
          value: "ORD-123",
        },
      });
    });

    it("should resolve values in arrays", () => {
      const ctx = createContext();
      ctx.blackboard.set("a", "first");
      ctx.blackboard.set("b", "second");

      // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
      const result = resolveValue(["${a}", "${b}", "static"], ctx);
      expect(result).toEqual(["first", "second", "static"]);
    });

    it("should pass through primitives unchanged", () => {
      const ctx = createContext();

      expect(resolveValue(42, ctx)).toBe(42);
      expect(resolveValue(true, ctx)).toBe(true);
      expect(resolveValue(null, ctx)).toBe(null);
      expect(resolveValue(undefined, ctx)).toBe(undefined);
    });

    it("should handle mixed objects and arrays", () => {
      const ctx = createContext();
      ctx.blackboard.set("val", "resolved");

      const input = {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
        items: [{ key: "${val}" }, { key: "static" }],
        count: 5,
      };

      const result = resolveValue(input, ctx);
      expect(result).toEqual({
        items: [{ key: "resolved" }, { key: "static" }],
        count: 5,
      });
    });
  });

  describe("hasVariables", () => {
    it("should return true for strings with variables", () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
      expect(hasVariables("${bb.key}")).toBe(true);
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
      expect(hasVariables("${key}")).toBe(true);
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
      expect(hasVariables("${input.val}")).toBe(true);
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
      expect(hasVariables("Hello ${name}")).toBe(true);
    });

    it("should return false for strings without variables", () => {
      expect(hasVariables("Hello World")).toBe(false);
      expect(hasVariables("")).toBe(false);
      expect(hasVariables("$notvar")).toBe(false);
      expect(hasVariables("{notvar}")).toBe(false);
    });
  });

  describe("extractVariables", () => {
    it("should extract single variable", () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
      const result = extractVariables("${bb.username}");
      expect(result).toEqual([{ namespace: "bb", key: "username" }]);
    });

    it("should extract shorthand variable as blackboard", () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
      const result = extractVariables("${username}");
      expect(result).toEqual([{ namespace: "bb", key: "username" }]);
    });

    it("should extract multiple variables", () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
      const result = extractVariables("${input.a} and ${bb.b} and ${c}");
      expect(result).toEqual([
        { namespace: "input", key: "a" },
        { namespace: "bb", key: "b" },
        { namespace: "bb", key: "c" },
      ]);
    });

    it("should extract variables with nested keys", () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
      const result = extractVariables("${bb.user.profile.name}");
      expect(result).toEqual([{ namespace: "bb", key: "user.profile.name" }]);
    });

    it("should return empty array for no variables", () => {
      const result = extractVariables("Hello World");
      expect(result).toEqual([]);
    });
  });

  describe("backward compatibility", () => {
    it("should work with LogMessage-style ${key} syntax", () => {
      const ctx = createContext();
      ctx.blackboard.set("username", "alice");
      ctx.blackboard.set("count", 10);

      // This is how LogMessage currently works
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
      const result = resolveString("User ${username} has ${count} items", ctx);
      expect(result).toBe("User alice has 10 items");
    });

    it("should work with IntegrationAction-style ${bb.key} syntax", () => {
      const ctx = createContext();
      ctx.blackboard.set("spreadsheetId", "sheet-123");
      ctx.blackboard.set("values", ["a", "b", "c"]);

      // This is how IntegrationAction currently works
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
      expect(resolveString("${bb.spreadsheetId}", ctx)).toBe("sheet-123");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing variable syntax
      expect(resolveString("${bb.values}", ctx)).toEqual(["a", "b", "c"]);
    });
  });
});
