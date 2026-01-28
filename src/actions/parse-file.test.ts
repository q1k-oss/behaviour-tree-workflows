/**
 * ParseFile Node Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScopedBlackboard } from "../blackboard.js";
import { Registry } from "../registry.js";
import { type TemporalContext, type BtreeActivities, NodeStatus } from "../types.js";
import { ParseFile, type ParseFileConfig } from "./parse-file.js";

describe("ParseFile Node", () => {
  let blackboard: ScopedBlackboard;
  let registry: Registry;

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    registry = new Registry();
    vi.clearAllMocks();
  });

  describe("Construction and validation", () => {
    it("should create node with valid config", () => {
      const node = new ParseFile({
        id: "test",
        file: "/path/to/file.csv",
        outputKey: "parsedData",
      });

      expect(node).toBeDefined();
      expect(node.id).toBe("test");
    });

    it("should require file", () => {
      expect(() => {
        new ParseFile({
          id: "test",
          outputKey: "data",
        } as ParseFileConfig);
      }).toThrow(/requires file/i);
    });

    it("should require outputKey", () => {
      expect(() => {
        new ParseFile({
          id: "test",
          file: "/path/to/file.csv",
        } as ParseFileConfig);
      }).toThrow(/requires outputKey/i);
    });

    it("should accept optional format, sheetName, and options", () => {
      const node = new ParseFile({
        id: "test",
        file: "/path/to/file.xlsx",
        format: "xlsx",
        sheetName: "Orders",
        outputKey: "data",
        options: {
          skipRows: 1,
          trim: true,
        },
      });

      expect(node).toBeDefined();
    });
  });

  describe("Activity requirement", () => {
    it("should fail without parseFile activity", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: undefined,
      };

      const node = new ParseFile({
        id: "test",
        file: "/data/orders.csv",
        outputKey: "orders",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.parseFile");
    });

    it("should fail when activities object exists but parseFile is missing", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          // parseFile is not provided
        } as BtreeActivities,
      };

      const node = new ParseFile({
        id: "test",
        file: "/data/orders.csv",
        outputKey: "orders",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.parseFile");
    });
  });

  describe("Execution with activity", () => {
    it("should parse CSV file via activity", async () => {
      const mockParseActivity = vi.fn().mockResolvedValue({
        data: [
          { orderId: "1", product: "Widget", quantity: 5 },
          { orderId: "2", product: "Gadget", quantity: 3 },
        ],
        rowCount: 2,
        columns: ["orderId", "product", "quantity"],
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          parseFile: mockParseActivity,
        },
      };

      const node = new ParseFile({
        id: "test",
        file: "/data/orders.csv",
        format: "csv",
        outputKey: "orders",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(mockParseActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          file: "/data/orders.csv",
          format: "csv",
        })
      );
    });

    it("should store parsed data in blackboard", async () => {
      const parsedData = [
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
      ];

      const mockParseActivity = vi.fn().mockResolvedValue({
        data: parsedData,
        rowCount: 2,
        columns: ["id", "name"],
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          parseFile: mockParseActivity,
        },
      };

      const node = new ParseFile({
        id: "test",
        file: "/data/users.csv",
        outputKey: "users",
      });

      await node.tick(context);

      expect(blackboard.get("users")).toEqual(parsedData);
    });

    it("should resolve file path from input", async () => {
      const mockParseActivity = vi.fn().mockResolvedValue({
        data: [],
        rowCount: 0,
        columns: [],
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        input: { dataFile: "/uploads/report-2024.csv" },
        activities: {
          executePieceAction: vi.fn(),
          parseFile: mockParseActivity,
        },
      };

      const node = new ParseFile({
        id: "test",
        file: "${input.dataFile}",
        outputKey: "report",
      });

      await node.tick(context);

      expect(mockParseActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          file: "/uploads/report-2024.csv",
        })
      );
    });

    it("should resolve file path from blackboard", async () => {
      blackboard.set("uploadedFile", "/tmp/data.xlsx");

      const mockParseActivity = vi.fn().mockResolvedValue({
        data: [],
        rowCount: 0,
        columns: [],
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          parseFile: mockParseActivity,
        },
      };

      const node = new ParseFile({
        id: "test",
        file: "${bb.uploadedFile}",
        outputKey: "data",
      });

      await node.tick(context);

      expect(mockParseActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          file: "/tmp/data.xlsx",
        })
      );
    });

    it("should pass column mapping to activity", async () => {
      const mockParseActivity = vi.fn().mockResolvedValue({
        data: [],
        rowCount: 0,
        columns: [],
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          parseFile: mockParseActivity,
        },
      };

      const node = new ParseFile({
        id: "test",
        file: "/data/orders.csv",
        outputKey: "orders",
        columnMapping: {
          "Order ID": "orderId",
          "Customer Name": "customerName",
          "Total Amount": "amount",
        },
      });

      await node.tick(context);

      expect(mockParseActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          columnMapping: {
            "Order ID": "orderId",
            "Customer Name": "customerName",
            "Total Amount": "amount",
          },
        })
      );
    });

    it("should pass parse options to activity", async () => {
      const mockParseActivity = vi.fn().mockResolvedValue({
        data: [],
        rowCount: 0,
        columns: [],
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          parseFile: mockParseActivity,
        },
      };

      const node = new ParseFile({
        id: "test",
        file: "/data/orders.csv",
        outputKey: "orders",
        options: {
          skipRows: 2,
          trim: true,
          emptyAsNull: true,
          dateColumns: ["orderDate", "shipDate"],
          dateFormat: "YYYY-MM-DD",
        },
      });

      await node.tick(context);

      expect(mockParseActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            skipRows: 2,
            trim: true,
            emptyAsNull: true,
            dateColumns: ["orderDate", "shipDate"],
            dateFormat: "YYYY-MM-DD",
          },
        })
      );
    });

    it("should pass sheet name for Excel files", async () => {
      const mockParseActivity = vi.fn().mockResolvedValue({
        data: [],
        rowCount: 0,
        columns: [],
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          parseFile: mockParseActivity,
        },
      };

      const node = new ParseFile({
        id: "test",
        file: "/data/report.xlsx",
        format: "xlsx",
        sheetName: "Q4 Sales",
        outputKey: "sales",
      });

      await node.tick(context);

      expect(mockParseActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "xlsx",
          sheetName: "Q4 Sales",
        })
      );
    });

    it("should handle activity errors", async () => {
      const mockParseActivity = vi.fn().mockRejectedValue(
        new Error("File not found: /data/missing.csv")
      );

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          parseFile: mockParseActivity,
        },
      };

      const node = new ParseFile({
        id: "test",
        file: "/data/missing.csv",
        outputKey: "data",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("File not found");
    });
  });

  describe("Node lifecycle", () => {
    it("should clone correctly", () => {
      const node = new ParseFile({
        id: "original",
        file: "/data/file.csv",
        format: "csv",
        outputKey: "data",
      });

      const cloned = node.clone() as ParseFile;

      expect(cloned.id).toBe("original");
    });

    it("should reset status correctly", async () => {
      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        // No activities - will fail
      };

      const node = new ParseFile({
        id: "test",
        file: "/data/file.csv",
        outputKey: "data",
      });

      await node.tick(context);
      expect(node.status()).toBe(NodeStatus.FAILURE);

      node.reset();
      expect(node.status()).toBe(NodeStatus.IDLE);
      expect(node.lastError).toBeUndefined();
    });
  });
});
