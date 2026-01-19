/**
 * Unified Variable Resolver
 *
 * Resolves variable references in strings and objects with support for multiple namespaces:
 * - ${input.key}  - Workflow input parameters (immutable)
 * - ${bb.key}     - Blackboard values (mutable runtime state)
 * - ${env.KEY}    - Environment variables
 * - ${param.key}  - Test data parameters
 * - ${key}        - Shorthand for ${bb.key} (backward compatibility)
 *
 * Features:
 * - Nested property access: ${bb.user.profile.name}
 * - Type preservation for full matches: "${bb.user}" returns the user object
 * - String interpolation for partial matches: "Hello ${bb.name}!" returns string
 */

import type { IScopedBlackboard } from "../types.js";

/**
 * Context for variable resolution
 */
export interface VariableContext {
  /** Blackboard for runtime state */
  blackboard: IScopedBlackboard;
  /** Immutable workflow input parameters */
  input?: Readonly<Record<string, unknown>>;
  /** Test data parameters (from CSV, data tables, etc.) */
  testData?: Map<string, unknown>;
}

/**
 * Options for variable resolution
 */
export interface ResolveOptions {
  /** Whether to keep undefined placeholders in output (default: true) */
  preserveUndefined?: boolean;
  /** Custom environment source (default: process.env) */
  envSource?: Record<string, string | undefined>;
}

// Pattern for variable references: ${namespace.key} or ${key}
// Matches: ${input.orderId}, ${bb.user.name}, ${env.API_KEY}, ${param.testId}, ${simpleKey}
const VARIABLE_PATTERN = /\$\{(input|bb|env|param)\.([a-zA-Z0-9_.]+)\}|\$\{([a-zA-Z0-9_.]+)\}/g;

// Same pattern without global flag for testing (avoids lastIndex issues)
const HAS_VARIABLE_PATTERN = /\$\{(input|bb|env|param)\.([a-zA-Z0-9_.]+)\}|\$\{([a-zA-Z0-9_.]+)\}/;

// Pattern for checking if entire string is a single variable reference
const FULL_MATCH_PATTERN = /^\$\{(input|bb|env|param)\.([a-zA-Z0-9_.]+)\}$|^\$\{([a-zA-Z0-9_.]+)\}$/;

/**
 * Resolve a string containing variable references
 *
 * @param str - String potentially containing ${...} references
 * @param ctx - Variable context with blackboard, input, testData
 * @param opts - Resolution options
 * @returns Resolved value (original type if full match, string if interpolation)
 *
 * @example
 * // Full match - returns original type
 * resolveString("${bb.user}", ctx) // returns user object
 *
 * // Interpolation - returns string
 * resolveString("Hello ${bb.name}!", ctx) // returns "Hello John!"
 */
export function resolveString(
  str: string,
  ctx: VariableContext,
  opts: ResolveOptions = {}
): unknown {
  const { preserveUndefined = true, envSource = process.env } = opts;

  // Check if entire string is a single variable reference (for type preservation)
  const fullMatch = str.match(FULL_MATCH_PATTERN);
  if (fullMatch) {
    // Groups: [full, namespace, key] or [full, undefined, undefined, key]
    const namespace = fullMatch[1]; // 'input', 'bb', 'env', 'param', or undefined
    const namespacedKey = fullMatch[2]; // key if namespaced
    const simpleKey = fullMatch[3]; // key if no namespace (shorthand)

    const key = namespacedKey || simpleKey;
    const ns = namespace || "bb"; // Default to blackboard

    if (key) {
      const value = resolveVariable(ns, key, ctx, envSource);
      if (value !== undefined) {
        return value;
      }
      // Return original placeholder if preserveUndefined and value is undefined
      return preserveUndefined ? str : undefined;
    }
  }

  // Template interpolation - replace all variable references in string
  return str.replace(VARIABLE_PATTERN, (match, namespace, namespacedKey, simpleKey) => {
    const key = namespacedKey || simpleKey;
    const ns = namespace || "bb"; // Default to blackboard

    const value = resolveVariable(ns, key, ctx, envSource);

    if (value === undefined) {
      return preserveUndefined ? match : "";
    }

    // Convert to string for interpolation
    if (value === null) {
      return "null";
    }

    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }

    return String(value);
  });
}

/**
 * Resolve variables in any value (string, object, array, or primitive)
 *
 * @param value - Value to resolve
 * @param ctx - Variable context
 * @param opts - Resolution options
 * @returns Resolved value with all variable references replaced
 */
export function resolveValue(
  value: unknown,
  ctx: VariableContext,
  opts: ResolveOptions = {}
): unknown {
  if (typeof value === "string") {
    return resolveString(value, ctx, opts);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, ctx, opts));
  }

  if (value !== null && typeof value === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveValue(val, ctx, opts);
    }
    return resolved;
  }

  // Primitives (number, boolean, null, undefined) pass through unchanged
  return value;
}

/**
 * Resolve a single variable reference
 *
 * @param namespace - Variable namespace (input, bb, env, param)
 * @param key - Variable key, potentially with dots for nested access
 * @param ctx - Variable context
 * @param envSource - Environment variable source
 * @returns Resolved value or undefined
 */
function resolveVariable(
  namespace: string,
  key: string,
  ctx: VariableContext,
  envSource: Record<string, string | undefined>
): unknown {
  switch (namespace) {
    case "input":
      return getNestedValue(ctx.input, key);

    case "bb":
      return getNestedBlackboardValue(ctx.blackboard, key);

    case "env":
      // Environment variables don't support nested access
      return envSource[key];

    case "param":
      // Test data uses Map, check for nested access
      if (ctx.testData) {
        const parts = key.split(".");
        const firstPart = parts[0];
        if (firstPart) {
          let value = ctx.testData.get(firstPart);
          for (let i = 1; i < parts.length && value !== undefined; i++) {
            const part = parts[i];
            if (part && typeof value === "object" && value !== null) {
              value = (value as Record<string, unknown>)[part];
            } else {
              return undefined;
            }
          }
          return value;
        }
      }
      return undefined;

    default:
      // Unknown namespace - treat as blackboard
      return getNestedBlackboardValue(ctx.blackboard, key);
  }
}

/**
 * Get a nested value from a plain object using dot notation
 *
 * @param obj - Object to traverse
 * @param path - Dot-separated path (e.g., "user.profile.name")
 * @returns Value at path or undefined
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (obj === undefined || obj === null) {
    return undefined;
  }

  if (typeof obj !== "object") {
    return undefined;
  }

  const parts = path.split(".");
  let value: unknown = obj;

  for (const part of parts) {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== "object") {
      return undefined;
    }

    value = (value as Record<string, unknown>)[part];
  }

  return value;
}

/**
 * Get a nested value from blackboard using dot notation
 * First part is the blackboard key, rest is object traversal
 *
 * @param blackboard - Scoped blackboard
 * @param path - Dot-separated path (e.g., "user.profile.name")
 * @returns Value at path or undefined
 */
function getNestedBlackboardValue(
  blackboard: IScopedBlackboard,
  path: string
): unknown {
  const parts = path.split(".");
  const firstPart = parts[0];

  if (!firstPart) {
    return undefined;
  }

  // First part is the blackboard key
  let value: unknown = blackboard.get(firstPart);

  // Navigate through nested properties
  for (let i = 1; i < parts.length && value !== undefined; i++) {
    const part = parts[i];
    if (part && typeof value === "object" && value !== null) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return value;
}

/**
 * Check if a string contains any variable references
 *
 * @param str - String to check
 * @returns True if string contains ${...} patterns
 */
export function hasVariables(str: string): boolean {
  return HAS_VARIABLE_PATTERN.test(str);
}

/**
 * Extract all variable references from a string
 *
 * @param str - String to analyze
 * @returns Array of {namespace, key} objects
 */
export function extractVariables(
  str: string
): Array<{ namespace: string; key: string }> {
  const variables: Array<{ namespace: string; key: string }> = [];
  const pattern = /\$\{(input|bb|env|param)\.([a-zA-Z0-9_.]+)\}|\$\{([a-zA-Z0-9_.]+)\}/g;

  let match;
  while ((match = pattern.exec(str)) !== null) {
    const namespace = match[1] || "bb";
    const key = match[2] || match[3];
    if (key) {
      variables.push({ namespace, key });
    }
  }

  return variables;
}
