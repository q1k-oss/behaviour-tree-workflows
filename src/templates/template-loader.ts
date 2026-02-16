/**
 * Template Loader
 * Load YAML template files from a directory and register them in the behaviour-tree Registry.
 * Templates can then be referenced by SubTree nodes using their template ID.
 */

import * as fs from "fs";
import * as path from "path";
import { Registry } from "../registry.js";
import { loadTreeFromYaml } from "../yaml/index.js";
import { BehaviorTree } from "../behavior-tree.js";

/**
 * Options for loading templates from a directory
 */
export interface TemplateLoaderOptions {
  /** Path to the templates directory */
  templatesDir: string;
  /** Optional prefix to add to all template IDs (e.g., "tpl:") */
  idPrefix?: string;
}

/**
 * Load all template YAML files from a directory and register them in the registry.
 *
 * Each YAML file becomes a registered BehaviorTree that can be referenced
 * by SubTree nodes using the filename (without extension) as the tree ID.
 *
 * @param registry - The Registry instance to register templates in
 * @param options - Configuration options
 * @returns Array of template IDs that were loaded
 *
 * @example
 * ```typescript
 * const registry = new Registry();
 * registerStandardNodes(registry);
 *
 * const loadedIds = await loadTemplatesFromDirectory(registry, {
 *   templatesDir: './templates',
 *   idPrefix: 'tpl:'
 * });
 *
 * // Templates can now be used via SubTree:
 * // type: SubTree
 * //   props:
 * //     treeId: "tpl:order-validation"
 * ```
 */
export async function loadTemplatesFromDirectory(
  registry: Registry,
  options: TemplateLoaderOptions
): Promise<string[]> {
  const { templatesDir, idPrefix = "" } = options;
  const loadedIds: string[] = [];

  // Ensure directory exists
  if (!fs.existsSync(templatesDir)) {
    console.warn(
      `[TemplateLoader] Templates directory not found: ${templatesDir}`
    );
    return loadedIds;
  }

  // Find all YAML files in directory
  const files = fs
    .readdirSync(templatesDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  // Load each file
  for (const file of files) {
    const filePath = path.join(templatesDir, file);

    try {
      // Read and parse YAML content
      const yamlContent = fs.readFileSync(filePath, "utf-8");
      const rootNode = loadTreeFromYaml(yamlContent, registry);
      const tree = new BehaviorTree(rootNode);

      // Derive template ID from filename (without extension)
      const baseName = path.basename(file, path.extname(file));
      const templateId = idPrefix + baseName;

      // Register in registry
      registry.registerTree(templateId, tree, filePath);
      loadedIds.push(templateId);

      console.log(`[TemplateLoader] Registered template: ${templateId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to load template '${file}': ${errorMessage}`
      );
    }
  }

  console.log(
    `[TemplateLoader] Loaded ${loadedIds.length} template(s) from ${templatesDir}`
  );
  return loadedIds;
}

/**
 * Load a single template file and register it in the registry.
 *
 * @param registry - The Registry instance to register the template in
 * @param filePath - Path to the YAML template file
 * @param templateId - Optional custom ID for the template (defaults to filename)
 * @returns The template ID that was registered
 *
 * @example
 * ```typescript
 * const id = loadTemplate(registry, './templates/order-validation.yaml');
 * // Template is now available as "order-validation"
 *
 * const customId = loadTemplate(registry, './special.yaml', 'my-custom-id');
 * // Template is now available as "my-custom-id"
 * ```
 */
export function loadTemplate(
  registry: Registry,
  filePath: string,
  templateId?: string
): string {
  // Read and parse YAML content
  const yamlContent = fs.readFileSync(filePath, "utf-8");
  const rootNode = loadTreeFromYaml(yamlContent, registry);
  const tree = new BehaviorTree(rootNode);

  // Derive template ID from filename if not provided
  const id = templateId || path.basename(filePath, path.extname(filePath));

  // Register in registry
  registry.registerTree(id, tree, filePath);

  console.log(`[TemplateLoader] Registered template: ${id} from ${filePath}`);
  return id;
}

/**
 * Check if a template exists in the registry
 */
export function hasTemplate(registry: Registry, templateId: string): boolean {
  return registry.hasTree(templateId);
}

/**
 * Get all registered template IDs
 */
export function getTemplateIds(registry: Registry): string[] {
  return registry.getAllTreeIds();
}
