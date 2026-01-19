/**
 * Script Node tests (isolated-vm based)
 * Tests the Script action node with full JavaScript support in V8 isolate
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ScopedBlackboard } from "../blackboard.js";
import { Registry } from "../registry.js";
import { type TemporalContext, NodeStatus } from "../types.js";
import { Script, type ScriptConfiguration } from "./script-node.js";

describe("Script Node (isolated-vm)", () => {
  let blackboard: ScopedBlackboard;
  let registry: Registry;
  let context: TemporalContext;

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    registry = new Registry();
    context = {
      blackboard,
      treeRegistry: registry,
      timestamp: Date.now(),
      deltaTime: 0,
    };
  });

  describe("Construction and validation", () => {
    it("should create script node with valid code", () => {
      const node = new Script({
        id: "script-1",
        code: "$bb.x = 10;",
      });
      expect(node).toBeDefined();
      expect(node.id).toBe("script-1");
    });

    it("should require code property", () => {
      expect(() => {
        new Script({ id: "test" } as unknown as ScriptConfiguration);
      }).toThrow(/requires.*code/i);
    });

    it("should reject empty code", () => {
      expect(() => {
        new Script({ id: "test", code: "" });
      }).toThrow(/requires.*code/i);
    });
  });

  describe("Blackboard operations via $bb", () => {
    it("should execute simple assignment", async () => {
      const node = new Script({
        id: "script-1",
        code: "$bb.result = 42;",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("result")).toBe(42);
    });

    it("should read from blackboard", async () => {
      blackboard.set("input", 10);

      const node = new Script({
        id: "script-1",
        code: "$bb.output = $bb.input * 2;",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("output")).toBe(20);
    });

    it("should execute multiple statements", async () => {
      const node = new Script({
        id: "script-1",
        code: `
          $bb.x = 10;
          $bb.y = 20;
          $bb.sum = $bb.x + $bb.y;
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("x")).toBe(10);
      expect(blackboard.get("y")).toBe(20);
      expect(blackboard.get("sum")).toBe(30);
    });

    it("should handle string operations", async () => {
      blackboard.set("firstName", "John");
      blackboard.set("lastName", "Doe");

      const node = new Script({
        id: "script-1",
        code: "$bb.fullName = $bb.firstName + ' ' + $bb.lastName;",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("fullName")).toBe("John Doe");
    });

    it("should handle comparison operations", async () => {
      blackboard.set("age", 25);

      const node = new Script({
        id: "script-1",
        code: "$bb.isAdult = $bb.age >= 18;",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("isAdult")).toBe(true);
    });

    it("should handle logical operations", async () => {
      blackboard.set("count", 10);
      blackboard.set("title", "Test");

      const node = new Script({
        id: "script-1",
        code: "$bb.isValid = $bb.count > 0 && $bb.title !== null;",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("isValid")).toBe(true);
    });

    it("should handle nested object property access", async () => {
      blackboard.set("user", {
        profile: {
          name: "John Doe",
          age: 30,
        },
      });

      const node = new Script({
        id: "script-1",
        code: `
          const user = $bb.user;
          $bb.userName = user.profile.name;
          $bb.userAge = user.profile.age;
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("userName")).toBe("John Doe");
      expect(blackboard.get("userAge")).toBe(30);
    });

    it("should handle arrays", async () => {
      blackboard.set("items", [1, 2, 3, 4, 5]);

      const node = new Script({
        id: "script-1",
        code: `
          const items = $bb.items;
          $bb.count = items.length;
          $bb.sum = items.reduce((a, b) => a + b, 0);
          $bb.first = items[0];
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("count")).toBe(5);
      expect(blackboard.get("sum")).toBe(15);
      expect(blackboard.get("first")).toBe(1);
    });
  });

  describe("Full JavaScript support", () => {
    it("should support const and let declarations", async () => {
      const node = new Script({
        id: "script-1",
        code: `
          const a = 10;
          let b = 20;
          b = b + 5;
          $bb.result = a + b;
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("result")).toBe(35);
    });

    it("should support arrow functions", async () => {
      const node = new Script({
        id: "script-1",
        code: `
          const double = x => x * 2;
          const add = (a, b) => a + b;
          $bb.doubled = double(5);
          $bb.sum = add(3, 4);
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("doubled")).toBe(10);
      expect(blackboard.get("sum")).toBe(7);
    });

    it("should support destructuring", async () => {
      blackboard.set("data", { name: "Alice", age: 30, city: "NYC" });

      const node = new Script({
        id: "script-1",
        code: `
          const { name, age } = $bb.data;
          $bb.userName = name;
          $bb.userAge = age;
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("userName")).toBe("Alice");
      expect(blackboard.get("userAge")).toBe(30);
    });

    it("should support template literals", async () => {
      blackboard.set("name", "World");
      blackboard.set("count", 42);

      const node = new Script({
        id: "script-1",
        code: "$bb.message = `Hello, ${$bb.name}! Count is ${$bb.count}.`;",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("message")).toBe("Hello, World! Count is 42.");
    });

    it("should support spread operator", async () => {
      blackboard.set("arr1", [1, 2, 3]);
      blackboard.set("arr2", [4, 5, 6]);

      const node = new Script({
        id: "script-1",
        code: "$bb.combined = [...$bb.arr1, ...$bb.arr2];",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("combined")).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("should support object spread", async () => {
      blackboard.set("base", { a: 1, b: 2 });

      const node = new Script({
        id: "script-1",
        code: "$bb.extended = { ...$bb.base, c: 3 };",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("extended")).toEqual({ a: 1, b: 2, c: 3 });
    });

    it("should support async/await", async () => {
      const node = new Script({
        id: "script-1",
        code: `
          const delay = (ms) => new Promise(r => setTimeout(r, ms));
          await delay(10);
          $bb.completed = true;
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("completed")).toBe(true);
    });

    it("should support try-catch", async () => {
      const node = new Script({
        id: "script-1",
        code: `
          try {
            throw new Error("Test error");
          } catch (e) {
            $bb.caught = true;
            $bb.errorMessage = e.message;
          }
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("caught")).toBe(true);
      expect(blackboard.get("errorMessage")).toBe("Test error");
    });

    it("should support classes", async () => {
      const node = new Script({
        id: "script-1",
        code: `
          class Calculator {
            add(a, b) { return a + b; }
            multiply(a, b) { return a * b; }
          }
          const calc = new Calculator();
          $bb.sum = calc.add(2, 3);
          $bb.product = calc.multiply(4, 5);
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("sum")).toBe(5);
      expect(blackboard.get("product")).toBe(20);
    });
  });

  describe("Error handling", () => {
    it("should return FAILURE for thrown errors", async () => {
      const node = new Script({
        id: "script-1",
        code: "throw new Error('Test error');",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("Test error");
    });

    it("should return FAILURE for runtime errors", async () => {
      const node = new Script({
        id: "script-1",
        code: "const x = null; x.property;", // TypeError
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
    });

    it("should return FAILURE for syntax errors", async () => {
      const node = new Script({
        id: "script-1",
        code: "const x = {;", // SyntaxError
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
    });
  });

  describe("Sandbox security", () => {
    it("should prevent access to Node.js require", async () => {
      const node = new Script({
        id: "script-1",
        code: "const fs = require('fs');",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
    });

    it("should prevent access to process", async () => {
      const node = new Script({
        id: "script-1",
        code: "$bb.env = process.env;",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
    });

    it("should timeout long-running scripts", async () => {
      const node = new Script({
        id: "script-1",
        code: "while(true) {}", // Infinite loop
        timeout: 100, // 100ms timeout
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
    }, 5000);
  });

  describe("Real-world scenarios", () => {
    it("should calculate order total with discount", async () => {
      blackboard.set("price", 100);
      blackboard.set("quantity", 5);
      blackboard.set("discountPercent", 10);

      const node = new Script({
        id: "calculate-total",
        code: `
          const price = $bb.price;
          const quantity = $bb.quantity;
          const discount = $bb.discountPercent;

          const subtotal = price * quantity;
          const discountAmount = subtotal * discount / 100;
          const total = subtotal - discountAmount;

          $bb.subtotal = subtotal;
          $bb.discountAmount = discountAmount;
          $bb.total = total;
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("subtotal")).toBe(500);
      expect(blackboard.get("discountAmount")).toBe(50);
      expect(blackboard.get("total")).toBe(450);
    });

    it("should perform data transformation", async () => {
      blackboard.set("users", [
        { name: "Alice", age: 25 },
        { name: "Bob", age: 30 },
        { name: "Charlie", age: 35 },
      ]);

      const node = new Script({
        id: "transform-data",
        code: `
          const users = $bb.users;
          $bb.names = users.map(u => u.name);
          $bb.totalAge = users.reduce((sum, u) => sum + u.age, 0);
          $bb.averageAge = $bb.totalAge / users.length;
          $bb.adults = users.filter(u => u.age >= 18);
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("names")).toEqual(["Alice", "Bob", "Charlie"]);
      expect(blackboard.get("totalAge")).toBe(90);
      expect(blackboard.get("averageAge")).toBe(30);
      expect(blackboard.get("adults")).toHaveLength(3);
    });

    it("should validate form data", async () => {
      blackboard.set("formData", {
        email: "test@example.com",
        password: "securePass123",
        age: 25,
      });

      const node = new Script({
        id: "validate-form",
        code: `
          const { email, password, age } = $bb.formData;
          const errors = [];

          if (!email || !email.includes('@')) {
            errors.push('Invalid email');
          }
          if (!password || password.length < 8) {
            errors.push('Password too short');
          }
          if (age < 18) {
            errors.push('Must be 18 or older');
          }

          $bb.isValid = errors.length === 0;
          $bb.errors = errors;
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("isValid")).toBe(true);
      expect(blackboard.get("errors")).toEqual([]);
    });
  });

  describe("Integration with behavior tree", () => {
    it("should work with node reset", async () => {
      const node = new Script({
        id: "script-1",
        code: "$bb.value = 100;",
      });

      await node.tick(context);
      expect(node.status()).toBe(NodeStatus.SUCCESS);

      node.reset();
      expect(node.status()).toBe(NodeStatus.IDLE);

      // Should be able to execute again after reset
      await node.tick(context);
      expect(node.status()).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("value")).toBe(100);
    });

    it("should work with node clone", async () => {
      const node = new Script({
        id: "script-1",
        code: "$bb.value = 300;",
      });

      const cloned = node.clone() as Script;

      expect(cloned.id).toBe("script-1");
      await cloned.tick(context);
      expect(blackboard.get("value")).toBe(300);
    });

    it("should handle multiple tick executions", async () => {
      blackboard.set("counter", 0);

      const node = new Script({
        id: "script-1",
        code: "$bb.counter = $bb.counter + 1;",
      });

      await node.tick(context);
      expect(blackboard.get("counter")).toBe(1);

      await node.tick(context);
      expect(blackboard.get("counter")).toBe(2);

      await node.tick(context);
      expect(blackboard.get("counter")).toBe(3);
    });
  });

  describe("Workflow input access via $input", () => {
    it("should read workflow input parameters", async () => {
      context.input = Object.freeze({ orderId: "ORD-123", customerId: "CUST-456" });

      const node = new Script({
        id: "script-1",
        code: `
          $bb.capturedOrderId = $input.orderId;
          $bb.capturedCustomerId = $input.customerId;
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("capturedOrderId")).toBe("ORD-123");
      expect(blackboard.get("capturedCustomerId")).toBe("CUST-456");
    });

    it("should handle complex input objects", async () => {
      context.input = Object.freeze({
        user: { name: "Alice", age: 30, roles: ["admin", "user"] },
        settings: { theme: "dark", notifications: true },
      });

      const node = new Script({
        id: "script-1",
        code: `
          const { user, settings } = $input;
          $bb.userName = user.name;
          $bb.userAge = user.age;
          $bb.firstRole = user.roles[0];
          $bb.theme = settings.theme;
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("userName")).toBe("Alice");
      expect(blackboard.get("userAge")).toBe(30);
      expect(blackboard.get("firstRole")).toBe("admin");
      expect(blackboard.get("theme")).toBe("dark");
    });

    it("should return undefined for missing input keys", async () => {
      context.input = Object.freeze({ existingKey: "value" });

      const node = new Script({
        id: "script-1",
        code: `
          $bb.exists = $input.existingKey;
          $bb.missing = $input.nonExistent;
          $bb.isMissing = $input.nonExistent === undefined;
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("exists")).toBe("value");
      expect(blackboard.get("missing")).toBeUndefined();
      expect(blackboard.get("isMissing")).toBe(true);
    });

    it("should prevent writes to $input (read-only)", async () => {
      context.input = Object.freeze({ value: 100 });

      const node = new Script({
        id: "script-1",
        code: "$input.value = 200;",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("read-only");
    });

    it("should work with empty input", async () => {
      // context.input is undefined

      const node = new Script({
        id: "script-1",
        code: `
          $bb.hasInput = $input.anyKey !== undefined;
          $bb.result = 'success';
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("hasInput")).toBe(false);
      expect(blackboard.get("result")).toBe("success");
    });

    it("should handle input arrays", async () => {
      context.input = Object.freeze({
        items: [1, 2, 3, 4, 5],
        tags: ["urgent", "high-priority"],
      });

      const node = new Script({
        id: "script-1",
        code: `
          const sum = $input.items.reduce((a, b) => a + b, 0);
          $bb.itemSum = sum;
          $bb.itemCount = $input.items.length;
          $bb.firstTag = $input.tags[0];
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("itemSum")).toBe(15);
      expect(blackboard.get("itemCount")).toBe(5);
      expect(blackboard.get("firstTag")).toBe("urgent");
    });

    it("should combine $input with $bb operations", async () => {
      context.input = Object.freeze({ multiplier: 10 });
      blackboard.set("baseValue", 5);

      const node = new Script({
        id: "script-1",
        code: "$bb.result = $bb.baseValue * $input.multiplier;",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("result")).toBe(50);
    });
  });

  describe("Environment variable access via $env", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Set up test environment variables
      process.env = {
        ...originalEnv,
        TEST_API_KEY: "secret-key-123",
        TEST_API_URL: "https://api.example.com",
        TEST_DEBUG_MODE: "true",
        TEST_RETRY_COUNT: "3",
        SENSITIVE_VAR: "should-not-be-accessible",
      };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should read allowed environment variables", async () => {
      const node = new Script({
        id: "script-1",
        code: `
          $bb.apiKey = $env.TEST_API_KEY;
          $bb.apiUrl = $env.TEST_API_URL;
        `,
        allowedEnvVars: ["TEST_API_KEY", "TEST_API_URL"],
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("apiKey")).toBe("secret-key-123");
      expect(blackboard.get("apiUrl")).toBe("https://api.example.com");
    });

    it("should not expose non-allowed environment variables", async () => {
      const node = new Script({
        id: "script-1",
        code: `
          $bb.allowed = $env.TEST_API_KEY;
          $bb.notAllowed = $env.SENSITIVE_VAR;
          $bb.isUndefined = $env.SENSITIVE_VAR === undefined;
        `,
        allowedEnvVars: ["TEST_API_KEY"], // SENSITIVE_VAR not in list
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("allowed")).toBe("secret-key-123");
      expect(blackboard.get("notAllowed")).toBeUndefined();
      expect(blackboard.get("isUndefined")).toBe(true);
    });

    it("should return undefined for non-existent env vars even if allowed", async () => {
      const node = new Script({
        id: "script-1",
        code: `
          $bb.missing = $env.NON_EXISTENT_VAR;
          $bb.isMissing = $env.NON_EXISTENT_VAR === undefined;
        `,
        allowedEnvVars: ["NON_EXISTENT_VAR"],
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("missing")).toBeUndefined();
      expect(blackboard.get("isMissing")).toBe(true);
    });

    it("should prevent writes to $env (read-only)", async () => {
      const node = new Script({
        id: "script-1",
        code: "$env.TEST_API_KEY = 'hacked';",
        allowedEnvVars: ["TEST_API_KEY"],
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("read-only");
    });

    it("should have empty $env when no allowedEnvVars specified", async () => {
      const node = new Script({
        id: "script-1",
        code: `
          $bb.apiKey = $env.TEST_API_KEY;
          $bb.isUndefined = $env.TEST_API_KEY === undefined;
        `,
        // No allowedEnvVars - defaults to empty array
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("apiKey")).toBeUndefined();
      expect(blackboard.get("isUndefined")).toBe(true);
    });

    it("should use env vars for configuration", async () => {
      const node = new Script({
        id: "script-1",
        code: `
          const debugMode = $env.TEST_DEBUG_MODE === 'true';
          const retryCount = parseInt($env.TEST_RETRY_COUNT || '1', 10);
          $bb.debugMode = debugMode;
          $bb.retryCount = retryCount;
        `,
        allowedEnvVars: ["TEST_DEBUG_MODE", "TEST_RETRY_COUNT"],
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("debugMode")).toBe(true);
      expect(blackboard.get("retryCount")).toBe(3);
    });

    it("should work with default values for missing env vars", async () => {
      const node = new Script({
        id: "script-1",
        code: `
          const timeout = $env.TIMEOUT || '5000';
          $bb.timeout = parseInt(timeout, 10);
        `,
        allowedEnvVars: ["TIMEOUT"], // This env var doesn't exist
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("timeout")).toBe(5000);
    });
  });

  describe("Combined $bb, $input, and $env usage", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = {
        ...originalEnv,
        TAX_RATE: "0.08",
        DISCOUNT_CODE_VALID: "SUMMER2024",
      };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should combine all three sources for calculation", async () => {
      context.input = Object.freeze({
        orderId: "ORD-999",
        discountCode: "SUMMER2024",
      });
      blackboard.set("subtotal", 100);
      blackboard.set("quantity", 3);

      const node = new Script({
        id: "calculate-order",
        code: `
          const subtotal = $bb.subtotal * $bb.quantity;
          const taxRate = parseFloat($env.TAX_RATE || '0');
          const validCode = $env.DISCOUNT_CODE_VALID;

          let discount = 0;
          if ($input.discountCode === validCode) {
            discount = subtotal * 0.1; // 10% discount
          }

          $bb.orderId = $input.orderId;
          $bb.subtotal = subtotal;
          $bb.tax = subtotal * taxRate;
          $bb.discount = discount;
          $bb.total = subtotal + (subtotal * taxRate) - discount;
        `,
        allowedEnvVars: ["TAX_RATE", "DISCOUNT_CODE_VALID"],
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("orderId")).toBe("ORD-999");
      expect(blackboard.get("subtotal")).toBe(300);
      expect(blackboard.get("tax")).toBe(24); // 300 * 0.08
      expect(blackboard.get("discount")).toBe(30); // 300 * 0.1
      expect(blackboard.get("total")).toBe(294); // 300 + 24 - 30
    });

    it("should handle real-world API configuration scenario", async () => {
      context.input = Object.freeze({
        endpoint: "/users",
        userId: "user-123",
      });
      blackboard.set("baseUrl", "https://api.example.com");

      process.env.API_VERSION = "v2";
      process.env.API_TIMEOUT = "30000";

      const node = new Script({
        id: "build-api-request",
        code: `
          const version = $env.API_VERSION || 'v1';
          const timeout = parseInt($env.API_TIMEOUT || '5000', 10);

          $bb.fullUrl = $bb.baseUrl + '/' + version + $input.endpoint + '/' + $input.userId;
          $bb.timeout = timeout;
          $bb.requestConfig = {
            url: $bb.fullUrl,
            timeout: timeout,
            userId: $input.userId,
          };
        `,
        allowedEnvVars: ["API_VERSION", "API_TIMEOUT"],
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("fullUrl")).toBe("https://api.example.com/v2/users/user-123");
      expect(blackboard.get("timeout")).toBe(30000);
      expect(blackboard.get("requestConfig")).toEqual({
        url: "https://api.example.com/v2/users/user-123",
        timeout: 30000,
        userId: "user-123",
      });
    });

    it("should maintain isolation: $input cannot modify $bb or $env", async () => {
      context.input = Object.freeze({ value: 100 });
      blackboard.set("originalValue", "unchanged");

      const node = new Script({
        id: "script-1",
        code: `
          // This should work
          $bb.newValue = $input.value * 2;

          // These should not affect original sources
          const inputCopy = { ...$input };
          inputCopy.value = 999;

          $bb.inputStillOriginal = $input.value === 100;
          $bb.bbStillOriginal = $bb.originalValue === 'unchanged';
        `,
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(blackboard.get("newValue")).toBe(200);
      expect(blackboard.get("inputStillOriginal")).toBe(true);
      expect(blackboard.get("bbStillOriginal")).toBe(true);
    });
  });
});
