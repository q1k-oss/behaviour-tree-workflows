/**
 * In-Memory DataStore Implementation
 *
 * Simple in-memory storage for testing and development.
 * Data is lost when the process terminates.
 *
 * Features:
 * - TTL support with automatic cleanup
 * - Size tracking
 * - Thread-safe for single Node.js process
 */

import type { DataStore, DataRef, PutOptions } from "./types.js";

interface StoredEntry {
  data: unknown;
  sizeBytes: number;
  expiresAt?: number;
}

/**
 * In-memory DataStore implementation
 * Suitable for tests and local development
 */
export class MemoryDataStore implements DataStore {
  private storage = new Map<string, StoredEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options?: { cleanupIntervalMs?: number }) {
    // Start periodic cleanup for expired entries
    const cleanupMs = options?.cleanupIntervalMs ?? 60000; // 1 minute default
    if (cleanupMs > 0) {
      this.cleanupInterval = setInterval(() => this.cleanup(), cleanupMs);
      // Don't prevent process exit
      if (this.cleanupInterval.unref) {
        this.cleanupInterval.unref();
      }
    }
  }

  async put(key: string, data: unknown, options?: PutOptions): Promise<DataRef> {
    const serialized = JSON.stringify(data);
    const sizeBytes = Buffer.byteLength(serialized, "utf8");

    const entry: StoredEntry = {
      data,
      sizeBytes,
    };

    if (options?.ttlSeconds) {
      entry.expiresAt = Date.now() + options.ttlSeconds * 1000;
    }

    this.storage.set(key, entry);

    return {
      store: "memory",
      key,
      sizeBytes,
      expiresAt: entry.expiresAt,
    };
  }

  async get(ref: DataRef): Promise<unknown> {
    if (ref.store !== "memory") {
      throw new Error(`MemoryDataStore cannot retrieve from store: ${ref.store}`);
    }

    const entry = this.storage.get(ref.key);

    if (!entry) {
      throw new Error(`Data not found for key: ${ref.key}`);
    }

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.storage.delete(ref.key);
      throw new Error(`Data expired for key: ${ref.key}`);
    }

    // Return a deep clone to prevent accidental mutation
    return structuredClone(entry.data);
  }

  async delete(ref: DataRef): Promise<void> {
    if (ref.store !== "memory") {
      throw new Error(`MemoryDataStore cannot delete from store: ${ref.store}`);
    }

    this.storage.delete(ref.key);
  }

  async exists(ref: DataRef): Promise<boolean> {
    if (ref.store !== "memory") {
      return false;
    }

    const entry = this.storage.get(ref.key);

    if (!entry) {
      return false;
    }

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.storage.delete(ref.key);
      return false;
    }

    return true;
  }

  /**
   * Clear all stored data
   * Useful for test cleanup
   */
  clear(): void {
    this.storage.clear();
  }

  /**
   * Get the number of stored entries
   */
  size(): number {
    return this.storage.size;
  }

  /**
   * Get total bytes stored
   */
  totalBytes(): number {
    let total = 0;
    for (const entry of this.storage.values()) {
      total += entry.sizeBytes;
    }
    return total;
  }

  /**
   * Stop the cleanup interval
   * Call this when done with the store to prevent memory leaks in tests
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.storage.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.storage.delete(key);
      }
    }
  }
}
