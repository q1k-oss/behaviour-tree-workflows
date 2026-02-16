/**
 * Schema registry and validation exports
 * Central registry mapping node types to their validation schemas
 */

import { z } from "zod";
import { nodeConfigurationSchema } from "./base.schema.js";

// Import decorator schemas
import { timeoutConfigurationSchema } from "../decorators/timeout.schema.js";
import { delayConfigurationSchema } from "../decorators/delay.schema.js";
import { repeatConfigurationSchema } from "../decorators/repeat.schema.js";
import { invertConfigurationSchema } from "../decorators/invert.schema.js";
import {
  forceSuccessConfigurationSchema,
  forceFailureConfigurationSchema,
} from "../decorators/force-result.schema.js";
import { preconditionConfigurationSchema } from "../decorators/precondition.schema.js";
import { runOnceConfigurationSchema } from "../decorators/run-once.schema.js";
import { keepRunningUntilFailureConfigurationSchema } from "../decorators/keep-running.schema.js";
import { softAssertConfigurationSchema } from "../decorators/soft-assert.schema.js";

// Import composite schemas
import { parallelConfigurationSchema } from "../composites/parallel.schema.js";
import { forEachConfigurationSchema } from "../composites/for-each.schema.js";
import { whileConfigurationSchema } from "../composites/while.schema.js";
import { subTreeConfigurationSchema } from "../composites/sub-tree.schema.js";
import { sequenceConfigurationSchema } from "../composites/sequence.schema.js";
import { selectorConfigurationSchema } from "../composites/selector.schema.js";
import { conditionalConfigurationSchema } from "../composites/conditional.schema.js";
import { reactiveSequenceConfigurationSchema } from "../composites/reactive-sequence.schema.js";
import { memorySequenceConfigurationSchema } from "../composites/memory-sequence.schema.js";
import { recoveryConfigurationSchema } from "../composites/recovery.schema.js";

// AI-native action schemas
import { llmChatSchema } from "../actions/llm-chat.schema.js";
import { browserAgentSchema } from "../actions/browser-agent.schema.js";
import { humanTaskSchema } from "../actions/human-task.schema.js";

// Action schemas - Script removed, use CodeExecution instead

/**
 * Central registry mapping node types to their validation schemas
 *
 * Responsibilities:
 * - Register Zod schemas for each node type
 * - Provide schema lookup by node type
 * - Validate configurations against registered schemas
 * - Fallback to base schema for unregistered types
 *
 * Usage:
 * ```typescript
 * // Register a schema
 * schemaRegistry.register('Timeout', timeoutConfigurationSchema);
 *
 * // Get a schema
 * const schema = schemaRegistry.getSchema('Timeout');
 *
 * // Validate configuration
 * const config = schemaRegistry.validate('Timeout', { id: 'test', timeoutMs: 1000 });
 * ```
 */
export class SchemaRegistry {
  private schemas = new Map<string, z.ZodSchema>();

  constructor() {
    this.registerAllSchemas();
  }

  /**
   * Register all node schemas
   * Called automatically on construction
   */
  private registerAllSchemas(): void {
    // Register decorator schemas
    this.register("Timeout", timeoutConfigurationSchema);
    this.register("Delay", delayConfigurationSchema);
    this.register("Repeat", repeatConfigurationSchema);
    this.register("Invert", invertConfigurationSchema);
    this.register("ForceSuccess", forceSuccessConfigurationSchema);
    this.register("ForceFailure", forceFailureConfigurationSchema);
    this.register("Precondition", preconditionConfigurationSchema);
    this.register("RunOnce", runOnceConfigurationSchema);
    this.register(
      "KeepRunningUntilFailure",
      keepRunningUntilFailureConfigurationSchema,
    );
    this.register("SoftAssert", softAssertConfigurationSchema);

    // Register composite schemas
    this.register("Parallel", parallelConfigurationSchema);
    this.register("ForEach", forEachConfigurationSchema);
    this.register("While", whileConfigurationSchema);
    this.register("SubTree", subTreeConfigurationSchema);
    this.register("Sequence", sequenceConfigurationSchema);
    this.register("Selector", selectorConfigurationSchema);
    this.register("Conditional", conditionalConfigurationSchema);
    this.register("ReactiveSequence", reactiveSequenceConfigurationSchema);
    this.register("MemorySequence", memorySequenceConfigurationSchema);
    this.register("Recovery", recoveryConfigurationSchema);

    // AI-native action schemas
    this.register("LLMChat", llmChatSchema);
    this.register("BrowserAgent", browserAgentSchema);

    // Human-in-the-loop
    this.register("HumanTask", humanTaskSchema);

    // Action schemas - Script removed, use CodeExecution instead
  }

  /**
   * Register a validation schema for a node type
   *
   * @param nodeType - Name of the node type (e.g., 'Timeout', 'Sequence')
   * @param schema - Zod schema for validating this node type's configuration
   * @throws Error if node type is already registered
   *
   * @example
   * ```typescript
   * schemaRegistry.register('Timeout', timeoutConfigurationSchema);
   * ```
   */
  register(nodeType: string, schema: z.ZodSchema): void {
    if (this.schemas.has(nodeType)) {
      throw new Error(`Schema for node type '${nodeType}' already registered`);
    }
    this.schemas.set(nodeType, schema);
  }

  /**
   * Get schema for a node type
   * Returns base schema if no specific schema registered
   *
   * @param nodeType - Name of the node type
   * @returns Zod schema for the node type (or base schema if not found)
   *
   * @example
   * ```typescript
   * const schema = schemaRegistry.getSchema('Timeout');
   * const validated = schema.parse({ id: 'test', timeoutMs: 1000 });
   * ```
   */
  getSchema(nodeType: string): z.ZodSchema {
    return this.schemas.get(nodeType) || nodeConfigurationSchema;
  }

  /**
   * Check if a schema is registered for a node type
   *
   * @param nodeType - Name of the node type
   * @returns True if schema is registered, false otherwise
   */
  hasSchema(nodeType: string): boolean {
    return this.schemas.has(nodeType);
  }

  /**
   * Get all registered node types
   *
   * @returns Array of registered node type names
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Validate configuration for a specific node type
   * Throws ZodError if validation fails
   *
   * @param nodeType - Name of the node type
   * @param config - Configuration object to validate
   * @returns Validated and parsed configuration
   * @throws ZodError if validation fails
   *
   * @example
   * ```typescript
   * const config = schemaRegistry.validate('Timeout', {
   *   id: 'test',
   *   timeoutMs: 1000
   * });
   * ```
   */
  validate<T>(nodeType: string, config: unknown): T {
    const schema = this.getSchema(nodeType);
    return schema.parse(config) as T;
  }

  /**
   * Safe validation that returns success/error result
   * Does not throw errors
   *
   * @param nodeType - Name of the node type
   * @param config - Configuration object to validate
   * @returns Result with success/error
   *
   * @example
   * ```typescript
   * const result = schemaRegistry.safeParse('Timeout', { id: 'test', timeoutMs: -100 });
   * if (result.success) {
   *   console.log(result.data);
   * } else {
   *   console.error(result.error);
   * }
   * ```
   */
  safeParse(
    nodeType: string,
    config: unknown,
  ):
    | { success: true; data: unknown }
    | { success: false; error: z.ZodError<unknown> } {
    const schema = this.getSchema(nodeType);
    return schema.safeParse(config);
  }

  /**
   * Clear all registered schemas
   * Useful for testing
   */
  clear(): void {
    this.schemas.clear();
  }
}

/**
 * Global singleton schema registry instance
 * Used by Registry class for validation
 */
export const schemaRegistry = new SchemaRegistry();

// Re-export for convenience
export * from "./base.schema.js";
export * from "./validation.js";
export * from "./tree-definition.schema.js";
