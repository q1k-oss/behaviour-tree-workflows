/**
 * GenerateFile Node Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScopedBlackboard } from "../blackboard.js";
import { Registry } from "../registry.js";
import { type TemporalContext, type BtreeActivities, NodeStatus } from "../types.js";
import { GenerateFile, type GenerateFileConfig } from "./generate-file.js";

describe("GenerateFile Node", () => {
  let blackboard: ScopedBlackboard;
  let registry: Registry;

  beforeEach(() => {
    blackboard = new ScopedBlackboard();
    registry = new Registry();
    vi.clearAllMocks();
  });

  describe("Construction and validation", () => {
    it("should create node with valid config", () => {
      const node = new GenerateFile({
        id: "test",
        format: "csv",
        dataKey: "data",
        filename: "export.csv",
        storage: "temp",
        outputKey: "fileResult",
      });

      expect(node).toBeDefined();
      expect(node.id).toBe("test");
    });

    it("should require format", () => {
      expect(() => {
        new GenerateFile({
          id: "test",
          dataKey: "data",
          filename: "export.csv",
          storage: "temp",
          outputKey: "fileResult",
        } as GenerateFileConfig);
      }).toThrow(/requires format/i);
    });

    it("should require dataKey", () => {
      expect(() => {
        new GenerateFile({
          id: "test",
          format: "csv",
          filename: "export.csv",
          storage: "temp",
          outputKey: "fileResult",
        } as GenerateFileConfig);
      }).toThrow(/requires dataKey/i);
    });

    it("should require filename", () => {
      expect(() => {
        new GenerateFile({
          id: "test",
          format: "csv",
          dataKey: "data",
          storage: "temp",
          outputKey: "fileResult",
        } as GenerateFileConfig);
      }).toThrow(/requires filename/i);
    });

    it("should require storage", () => {
      expect(() => {
        new GenerateFile({
          id: "test",
          format: "csv",
          dataKey: "data",
          filename: "export.csv",
          outputKey: "fileResult",
        } as GenerateFileConfig);
      }).toThrow(/requires storage/i);
    });

    it("should require outputKey", () => {
      expect(() => {
        new GenerateFile({
          id: "test",
          format: "csv",
          dataKey: "data",
          filename: "export.csv",
          storage: "temp",
        } as GenerateFileConfig);
      }).toThrow(/requires outputKey/i);
    });
  });

  describe("Activity requirement", () => {
    it("should fail without generateFile activity", async () => {
      blackboard.set("data", [{ a: 1 }]);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: undefined,
      };

      const node = new GenerateFile({
        id: "test",
        format: "csv",
        dataKey: "data",
        filename: "export.csv",
        storage: "temp",
        outputKey: "fileResult",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.generateFile");
    });

    it("should fail when activities object exists but generateFile is missing", async () => {
      blackboard.set("data", [{ a: 1 }]);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          // generateFile is not provided
        } as BtreeActivities,
      };

      const node = new GenerateFile({
        id: "test",
        format: "csv",
        dataKey: "data",
        filename: "export.csv",
        storage: "temp",
        outputKey: "fileResult",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("requires activities.generateFile");
    });
  });

  describe("Data validation", () => {
    it("should fail if data is not an array", async () => {
      blackboard.set("data", { notAnArray: true });

      const mockGenerateActivity = vi.fn();

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          generateFile: mockGenerateActivity,
        },
      };

      const node = new GenerateFile({
        id: "test",
        format: "csv",
        dataKey: "data",
        filename: "export.csv",
        storage: "temp",
        outputKey: "fileResult",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("is not an array");
      expect(mockGenerateActivity).not.toHaveBeenCalled();
    });

    it("should fail if data key does not exist", async () => {
      // Don't set anything in blackboard

      const mockGenerateActivity = vi.fn();

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          generateFile: mockGenerateActivity,
        },
      };

      const node = new GenerateFile({
        id: "test",
        format: "csv",
        dataKey: "missingData",
        filename: "export.csv",
        storage: "temp",
        outputKey: "fileResult",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("is not an array");
    });
  });

  describe("Execution with activity", () => {
    it("should generate CSV file via activity", async () => {
      blackboard.set("orders", [
        { orderId: "1", amount: 100 },
        { orderId: "2", amount: 200 },
      ]);

      const mockGenerateActivity = vi.fn().mockResolvedValue({
        filename: "export.csv",
        contentType: "text/csv",
        size: 1024,
        path: "/tmp/export.csv",
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          generateFile: mockGenerateActivity,
        },
      };

      const node = new GenerateFile({
        id: "test",
        format: "csv",
        dataKey: "orders",
        filename: "export.csv",
        storage: "temp",
        outputKey: "fileResult",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.SUCCESS);
      expect(mockGenerateActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "csv",
          data: [
            { orderId: "1", amount: 100 },
            { orderId: "2", amount: 200 },
          ],
          filename: "export.csv",
          storage: "temp",
        })
      );
    });

    it("should store file metadata in blackboard", async () => {
      blackboard.set("data", [{ a: 1 }]);

      const fileMetadata = {
        filename: "export-123.csv",
        contentType: "text/csv",
        size: 2048,
        path: "/storage/exports/export-123.csv",
        url: "https://storage.example.com/exports/export-123.csv",
      };

      const mockGenerateActivity = vi.fn().mockResolvedValue(fileMetadata);

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          generateFile: mockGenerateActivity,
        },
      };

      const node = new GenerateFile({
        id: "test",
        format: "csv",
        dataKey: "data",
        filename: "export.csv",
        storage: "persistent",
        outputKey: "exportedFile",
      });

      await node.tick(context);

      expect(blackboard.get("exportedFile")).toEqual(fileMetadata);
    });

    it("should resolve filename from variables", async () => {
      blackboard.set("data", [{ a: 1 }]);
      blackboard.set("timestamp", "2024-01-15");

      const mockGenerateActivity = vi.fn().mockResolvedValue({
        filename: "report-2024-01-15.csv",
        contentType: "text/csv",
        size: 512,
        path: "/tmp/report-2024-01-15.csv",
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        input: { reportType: "sales" },
        activities: {
          executePieceAction: vi.fn(),
          generateFile: mockGenerateActivity,
        },
      };

      const node = new GenerateFile({
        id: "test",
        format: "csv",
        dataKey: "data",
        filename: "${input.reportType}-${bb.timestamp}.csv",
        storage: "temp",
        outputKey: "fileResult",
      });

      await node.tick(context);

      expect(mockGenerateActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: "sales-2024-01-15.csv",
        })
      );
    });

    it("should pass column definitions to activity", async () => {
      blackboard.set("orders", [
        { id: "1", customer: "Alice", total: 100 },
      ]);

      const mockGenerateActivity = vi.fn().mockResolvedValue({
        filename: "orders.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 4096,
        path: "/tmp/orders.xlsx",
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          generateFile: mockGenerateActivity,
        },
      };

      const node = new GenerateFile({
        id: "test",
        format: "xlsx",
        dataKey: "orders",
        columns: [
          { header: "Order ID", key: "id", width: 10 },
          { header: "Customer Name", key: "customer", width: 25 },
          { header: "Total Amount", key: "total", width: 15 },
        ],
        filename: "orders.xlsx",
        storage: "temp",
        outputKey: "fileResult",
      });

      await node.tick(context);

      expect(mockGenerateActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "xlsx",
          columns: [
            { header: "Order ID", key: "id", width: 10 },
            { header: "Customer Name", key: "customer", width: 25 },
            { header: "Total Amount", key: "total", width: 15 },
          ],
        })
      );
    });

    it("should generate JSON file", async () => {
      blackboard.set("data", [{ key: "value" }]);

      const mockGenerateActivity = vi.fn().mockResolvedValue({
        filename: "data.json",
        contentType: "application/json",
        size: 256,
        path: "/tmp/data.json",
      });

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          generateFile: mockGenerateActivity,
        },
      };

      const node = new GenerateFile({
        id: "test",
        format: "json",
        dataKey: "data",
        filename: "data.json",
        storage: "temp",
        outputKey: "fileResult",
      });

      await node.tick(context);

      expect(mockGenerateActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "json",
        })
      );
    });

    it("should handle activity errors", async () => {
      blackboard.set("data", [{ a: 1 }]);

      const mockGenerateActivity = vi.fn().mockRejectedValue(
        new Error("Disk full: cannot write file")
      );

      const context: TemporalContext = {
        blackboard,
        treeRegistry: registry,
        timestamp: Date.now(),
        deltaTime: 0,
        activities: {
          executePieceAction: vi.fn(),
          generateFile: mockGenerateActivity,
        },
      };

      const node = new GenerateFile({
        id: "test",
        format: "csv",
        dataKey: "data",
        filename: "export.csv",
        storage: "temp",
        outputKey: "fileResult",
      });

      const status = await node.tick(context);

      expect(status).toBe(NodeStatus.FAILURE);
      expect(node.lastError).toContain("Disk full");
    });
  });

  describe("Node lifecycle", () => {
    it("should clone correctly", () => {
      const node = new GenerateFile({
        id: "original",
        format: "csv",
        dataKey: "data",
        filename: "export.csv",
        storage: "persistent",
        outputKey: "fileResult",
      });

      const cloned = node.clone() as GenerateFile;

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

      blackboard.set("data", [{ a: 1 }]);

      const node = new GenerateFile({
        id: "test",
        format: "csv",
        dataKey: "data",
        filename: "export.csv",
        storage: "temp",
        outputKey: "fileResult",
      });

      await node.tick(context);
      expect(node.status()).toBe(NodeStatus.FAILURE);

      node.reset();
      expect(node.status()).toBe(NodeStatus.IDLE);
      expect(node.lastError).toBeUndefined();
    });
  });
});
