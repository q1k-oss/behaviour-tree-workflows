/**
 * Scoped Blackboard implementation with inheritance
 * Inspired by BehaviorTree.CPP's blackboard
 *
 * Simple mutable API with native deep cloning for snapshots
 */

import stringify from "safe-stable-stringify";
import type { IScopedBlackboard } from "./types.js";

/**
 * Implementation of a hierarchical blackboard with scoped inheritance
 * Uses simple mutable operations with snapshot support via structuredClone
 */
export class ScopedBlackboard implements IScopedBlackboard {
  private data: Record<string, unknown> = {};
  private parent: ScopedBlackboard | null = null;
  private scopeName: string;
  private childScopes: Map<string, ScopedBlackboard> = new Map();

  constructor(
    scopeName: string = "root",
    parent: ScopedBlackboard | null = null,
  ) {
    this.scopeName = scopeName;
    this.parent = parent;
  }

  get(key: string): unknown {
    // First check local scope
    if (key in this.data) {
      return this.data[key];
    }

    // Then check parent scopes
    if (this.parent) {
      return this.parent.get(key);
    }

    return undefined;
  }

  set(key: string, value: unknown): void {
    this.data[key] = value;
  }

  has(key: string): boolean {
    // Check local scope
    if (key in this.data) {
      return true;
    }

    // Check parent scopes
    if (this.parent) {
      return this.parent.has(key);
    }

    return false;
  }

  delete(key: string): void {
    // Only delete from local scope
    delete this.data[key];
  }

  clear(): void {
    this.data = {};
    this.childScopes.clear();
  }

  createScope(name: string): IScopedBlackboard {
    // Check if scope already exists
    if (this.childScopes.has(name)) {
      const scope = this.childScopes.get(name);
      if (!scope) {
        throw new Error(`Scope ${name} not found`);
      }
      return scope;
    }

    // Create new child scope
    const childScope = new ScopedBlackboard(name, this);
    this.childScopes.set(name, childScope);
    return childScope;
  }

  getParentScope(): IScopedBlackboard | null {
    return this.parent;
  }

  getScopeName(): string {
    return this.scopeName;
  }

  getPort<T>(key: string, defaultValue?: T): T {
    const value = this.get(key);
    if (value === undefined && defaultValue !== undefined) {
      return defaultValue;
    }
    return value as T;
  }

  setPort<T>(key: string, value: T): void {
    this.set(key, value);
  }

  keys(): string[] {
    const localKeys = Object.keys(this.data);
    const parentKeys = this.parent ? this.parent.keys() : [];

    // Combine keys, removing duplicates (local keys override parent keys)
    const allKeys = new Set([...localKeys, ...parentKeys]);
    return Array.from(allKeys);
  }

  entries(): [string, unknown][] {
    const result: [string, unknown][] = [];
    const processedKeys = new Set<string>();

    // Add local entries first
    for (const [key, value] of Object.entries(this.data)) {
      result.push([key, value]);
      processedKeys.add(key);
    }

    // Add parent entries that aren't overridden
    if (this.parent) {
      for (const [key, value] of this.parent.entries()) {
        if (!processedKeys.has(key)) {
          result.push([key, value]);
        }
      }
    }

    return result;
  }

  toJSON(): Record<string, unknown> {
    // Only return local entries, not inherited ones
    return { ...this.data };
  }

  /**
   * Create a deep clone of this blackboard for snapshots
   * Uses structured cloning for deep copy
   */
  clone(): IScopedBlackboard {
    // Create a new blackboard instance with the same scope configuration
    const cloned = new ScopedBlackboard(this.scopeName, this.parent);

    // Deep clone the data object using structuredClone (Node 17+)
    // This creates a true deep copy without freezing the original
    cloned.data = structuredClone(this.data);

    // Recursively clone child scopes
    this.childScopes.forEach((childScope, name) => {
      cloned.childScopes.set(name, childScope.clone() as ScopedBlackboard);
    });

    return cloned;
  }

  /**
   * Get the full scope path (e.g., "root.child.grandchild")
   */
  getFullScopePath(): string {
    const path: string[] = [this.scopeName];
    let current = this.parent;

    while (current) {
      path.unshift(current.scopeName);
      current = current.parent;
    }

    return path.join(".");
  }

  /**
   * Debug utility to print the blackboard hierarchy
   */
  debug(indent: number = 0): void {
    const prefix = "  ".repeat(indent);
    console.log(`${prefix}Scope: ${this.scopeName}`);

    for (const [key, value] of Object.entries(this.data)) {
      console.log(`${prefix}  ${key}: ${stringify(value)}`);
    }

    for (const [_name, childScope] of this.childScopes) {
      childScope.debug(indent + 1);
    }
  }
}
