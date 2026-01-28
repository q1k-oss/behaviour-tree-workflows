/**
 * DataStore Interface
 *
 * Provides an abstraction for storing and retrieving large data payloads
 * outside the workflow execution context. This keeps the Temporal workflow
 * history lean while allowing workflows to process large datasets.
 *
 * Implementations:
 * - MemoryDataStore: In-memory storage for tests
 * - GCSDataStore: Google Cloud Storage for production (in controlplane)
 * - RedisDataStore: Redis storage for caching (future)
 */

/**
 * Reference to data stored in a DataStore
 * This lightweight reference can be passed through workflows/activities
 */
export interface DataRef {
  /** Storage backend identifier */
  store: "gcs" | "s3" | "redis" | "memory";
  /** Unique key for retrieving the data */
  key: string;
  /** Size of stored data in bytes (for monitoring/optimization) */
  sizeBytes?: number;
  /** Unix timestamp when data expires (optional TTL) */
  expiresAt?: number;
}

/**
 * Options for storing data
 */
export interface PutOptions {
  /** Time-to-live in seconds (data auto-deleted after expiry) */
  ttlSeconds?: number;
  /** Content type hint for serialization */
  contentType?: "json" | "csv" | "binary";
  /** Associated workflow ID for grouping/cleanup */
  workflowId?: string;
}

/**
 * DataStore interface for storing and retrieving large payloads
 */
export interface DataStore {
  /**
   * Store data and return a reference
   * @param key - Unique identifier for the data
   * @param data - Data to store (will be JSON serialized)
   * @param options - Storage options (TTL, content type, etc.)
   * @returns Reference to the stored data
   */
  put(key: string, data: unknown, options?: PutOptions): Promise<DataRef>;

  /**
   * Retrieve data by reference
   * @param ref - Reference returned from put()
   * @returns The stored data (JSON deserialized)
   * @throws Error if data not found or expired
   */
  get(ref: DataRef): Promise<unknown>;

  /**
   * Delete data by reference
   * @param ref - Reference to delete
   */
  delete(ref: DataRef): Promise<void>;

  /**
   * Check if data exists
   * @param ref - Reference to check
   * @returns true if data exists and hasn't expired
   */
  exists(ref: DataRef): Promise<boolean>;
}

/**
 * Type guard to check if a value is a DataRef
 * @param value - Value to check
 * @returns true if value is a DataRef
 */
export function isDataRef(value: unknown): value is DataRef {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.store === "string" &&
    ["gcs", "s3", "redis", "memory"].includes(obj.store) &&
    typeof obj.key === "string" &&
    obj.key.length > 0
  );
}
