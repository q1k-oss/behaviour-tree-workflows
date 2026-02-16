/**
 * Template Loader Tests
 * TDD: Write tests first, then implement to make them pass
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Registry } from "../registry.js";
import { registerStandardNodes } from "../registry-utils.js";
import {
  loadTemplatesFromDirectory,
  loadTemplate,
} from "./template-loader.js";

describe("Template Loader", () => {
  let registry: Registry;
  let tempDir: string;

  beforeEach(() => {
    // Create fresh registry with standard nodes
    registry = new Registry();
    registerStandardNodes(registry);

    // Create temp directory for test templates
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "behaviour-tree-templates-"));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loadTemplatesFromDirectory", () => {
    it("should load all YAML files from directory", async () => {
      // Create test template files
      const template1 = `
type: Sequence
id: template-one
children:
  - type: LogMessage
    id: log1
    props:
      message: "Template 1"
`;
      const template2 = `
type: Sequence
id: template-two
children:
  - type: LogMessage
    id: log2
    props:
      message: "Template 2"
`;

      fs.writeFileSync(path.join(tempDir, "template-one.yaml"), template1);
      fs.writeFileSync(path.join(tempDir, "template-two.yaml"), template2);

      const loadedIds = await loadTemplatesFromDirectory(registry, {
        templatesDir: tempDir,
      });

      expect(loadedIds).toHaveLength(2);
      expect(loadedIds).toContain("template-one");
      expect(loadedIds).toContain("template-two");
    });

    it("should register templates in the registry", async () => {
      const template = `
type: Sequence
id: my-template
children:
  - type: LogMessage
    id: log
    props:
      message: "Hello"
`;
      fs.writeFileSync(path.join(tempDir, "my-template.yaml"), template);

      await loadTemplatesFromDirectory(registry, { templatesDir: tempDir });

      expect(registry.hasTree("my-template")).toBe(true);
    });

    it("should use filename as template ID", async () => {
      const template = `
type: Sequence
id: internal-id
children:
  - type: LogMessage
    id: log
    props:
      message: "Test"
`;
      fs.writeFileSync(path.join(tempDir, "external-name.yaml"), template);

      await loadTemplatesFromDirectory(registry, { templatesDir: tempDir });

      // Template ID should be filename, not internal id
      expect(registry.hasTree("external-name")).toBe(true);
    });

    it("should support .yml extension", async () => {
      const template = `
type: Sequence
id: yml-template
children:
  - type: LogMessage
    id: log
    props:
      message: "YML extension"
`;
      fs.writeFileSync(path.join(tempDir, "yml-template.yml"), template);

      const loadedIds = await loadTemplatesFromDirectory(registry, {
        templatesDir: tempDir,
      });

      expect(loadedIds).toContain("yml-template");
    });

    it("should apply ID prefix when provided", async () => {
      const template = `
type: Sequence
id: test
children:
  - type: LogMessage
    id: log
    props:
      message: "Prefixed"
`;
      fs.writeFileSync(path.join(tempDir, "my-template.yaml"), template);

      await loadTemplatesFromDirectory(registry, {
        templatesDir: tempDir,
        idPrefix: "tpl:",
      });

      expect(registry.hasTree("tpl:my-template")).toBe(true);
    });

    it("should return empty array for empty directory", async () => {
      const loadedIds = await loadTemplatesFromDirectory(registry, {
        templatesDir: tempDir,
      });

      expect(loadedIds).toHaveLength(0);
    });

    it("should ignore non-YAML files", async () => {
      fs.writeFileSync(path.join(tempDir, "readme.md"), "# README");
      fs.writeFileSync(path.join(tempDir, "config.json"), "{}");

      const template = `
type: Sequence
id: only-yaml
children:
  - type: LogMessage
    id: log
    props:
      message: "Only YAML"
`;
      fs.writeFileSync(path.join(tempDir, "valid.yaml"), template);

      const loadedIds = await loadTemplatesFromDirectory(registry, {
        templatesDir: tempDir,
      });

      expect(loadedIds).toHaveLength(1);
      expect(loadedIds).toContain("valid");
    });

    it("should throw error for invalid YAML syntax", async () => {
      fs.writeFileSync(path.join(tempDir, "invalid.yaml"), "invalid: yaml: content:");

      await expect(
        loadTemplatesFromDirectory(registry, { templatesDir: tempDir })
      ).rejects.toThrow();
    });

    it("should throw error for invalid tree structure", async () => {
      const invalidTemplate = `
type: UnknownNodeType
id: invalid
`;
      fs.writeFileSync(path.join(tempDir, "invalid.yaml"), invalidTemplate);

      await expect(
        loadTemplatesFromDirectory(registry, { templatesDir: tempDir })
      ).rejects.toThrow();
    });
  });

  describe("loadTemplate", () => {
    it("should load a single template file", () => {
      const template = `
type: Sequence
id: single
children:
  - type: LogMessage
    id: log
    props:
      message: "Single template"
`;
      const filePath = path.join(tempDir, "single.yaml");
      fs.writeFileSync(filePath, template);

      const id = loadTemplate(registry, filePath);

      expect(id).toBe("single");
      expect(registry.hasTree("single")).toBe(true);
    });

    it("should use custom ID when provided", () => {
      const template = `
type: Sequence
id: default
children:
  - type: LogMessage
    id: log
    props:
      message: "Custom ID"
`;
      const filePath = path.join(tempDir, "default.yaml");
      fs.writeFileSync(filePath, template);

      const id = loadTemplate(registry, filePath, "custom-id");

      expect(id).toBe("custom-id");
      expect(registry.hasTree("custom-id")).toBe(true);
    });

    it("should throw error for non-existent file", () => {
      expect(() => {
        loadTemplate(registry, "/non/existent/path.yaml");
      }).toThrow();
    });
  });

  describe("Template execution via SubTree", () => {
    it("should allow SubTree to reference loaded template", async () => {
      // Create and load a template
      const template = `
type: Sequence
id: reusable
children:
  - type: LogMessage
    id: log
    props:
      message: "Reusable template executed"
`;
      const filePath = path.join(tempDir, "reusable.yaml");
      fs.writeFileSync(filePath, template);
      loadTemplate(registry, filePath);

      // Verify template can be cloned (as SubTree would do)
      const clonedTree = registry.cloneTree("reusable");
      expect(clonedTree).toBeDefined();
      expect(clonedTree.getRoot()).toBeDefined();
    });

    it("should track source file for templates", () => {
      const template = `
type: Sequence
id: tracked
children:
  - type: LogMessage
    id: log
    props:
      message: "Tracked"
`;
      const filePath = path.join(tempDir, "tracked.yaml");
      fs.writeFileSync(filePath, template);
      loadTemplate(registry, filePath);

      const sourceFile = registry.getTreeSourceFile("tracked");
      expect(sourceFile).toBe(filePath);
    });
  });
});
