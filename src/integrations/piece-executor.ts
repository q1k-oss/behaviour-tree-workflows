/**
 * Piece Executor
 * Dynamically executes Active Pieces actions
 *
 * Active Pieces is an open-source automation platform with 440+ connectors.
 * This module wraps their npm packages for use in btree workflows.
 *
 * @see https://activepieces.com/docs
 */

/**
 * Authentication credentials for a piece
 */
export type PieceAuth =
  | { access_token: string; refresh_token?: string }
  | { api_key: string }
  | Record<string, unknown>;

/**
 * Request to execute a piece action
 */
export interface PieceActionRequest {
  /** Provider name (maps to @activepieces/piece-{name}) */
  provider: string;
  /** Action name within the piece */
  action: string;
  /** Input properties for the action */
  inputs: Record<string, unknown>;
  /** Authentication credentials */
  auth: PieceAuth;
}

/**
 * Mapping from provider names to Active Pieces package names
 * Add entries as needed when integrating new providers
 */
const PROVIDER_TO_PIECE: Record<string, string> = {
  // Google services
  "google": "google-sheets",
  "google-sheets": "google-sheets",
  "google-drive": "google-drive",
  "google-calendar": "google-calendar",
  "gmail": "gmail",

  // Communication
  "slack": "slack",
  "discord": "discord",
  "telegram": "telegram-bot",
  "twilio": "twilio",

  // AI/ML
  "openai": "openai",
  "anthropic": "anthropic",

  // CRM & Sales
  "hubspot": "hubspot",
  "salesforce": "salesforce",

  // Productivity
  "notion": "notion",
  "airtable": "airtable",
  "asana": "asana",
  "trello": "trello",

  // Development
  "github": "github",
  "gitlab": "gitlab",

  // E-commerce
  "shopify": "shopify",
  "stripe": "stripe",

  // Other
  "http": "http",
  "webhook": "http",
};

/**
 * Cache for loaded pieces to avoid repeated dynamic imports
 */
const pieceCache: Map<string, unknown> = new Map();

/**
 * Get the Active Pieces package name for a provider
 */
function getPiecePackageName(provider: string): string {
  const pieceName = PROVIDER_TO_PIECE[provider.toLowerCase()];
  if (pieceName) {
    return `@activepieces/piece-${pieceName}`;
  }
  // Default: assume package name matches provider name
  return `@activepieces/piece-${provider.toLowerCase()}`;
}

/**
 * Mapping from package name to piece export name
 * Active Pieces packages export the piece with a specific name (e.g., googleSheets, slack)
 */
const PIECE_EXPORT_NAMES: Record<string, string> = {
  "@activepieces/piece-google-sheets": "googleSheets",
  "@activepieces/piece-slack": "slack",
  "@activepieces/piece-openai": "openai",
  "@activepieces/piece-discord": "discord",
  "@activepieces/piece-notion": "notion",
  "@activepieces/piece-github": "github",
  "@activepieces/piece-http": "http",
};

/**
 * Dynamically load an Active Pieces package
 */
async function loadPiece(packageName: string): Promise<unknown> {
  // Check cache first
  if (pieceCache.has(packageName)) {
    return pieceCache.get(packageName);
  }

  try {
    // Dynamic import of the piece package
    const pieceModule = await import(packageName);

    // Active Pieces exports vary - try to find the piece object
    // Format 1: { googleSheets: { _actions: {...} } }
    // Format 2: { default: { actions: {...} } }
    let piece: unknown = pieceModule;

    // Check for known export names
    const exportName = PIECE_EXPORT_NAMES[packageName];
    if (exportName && pieceModule[exportName]) {
      piece = pieceModule[exportName];
    } else {
      // Try to find the piece by looking for an object with _actions
      for (const key of Object.keys(pieceModule)) {
        const exported = pieceModule[key];
        if (exported && typeof exported === "object" && "_actions" in exported) {
          piece = exported;
          break;
        }
      }
    }

    pieceCache.set(packageName, piece);
    return piece;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Provide helpful error message
    if (message.includes("Cannot find module")) {
      throw new Error(
        `Active Pieces package '${packageName}' is not installed. ` +
        `Run: npm install ${packageName}`
      );
    }

    throw new Error(`Failed to load piece package '${packageName}': ${message}`);
  }
}

/**
 * Execute an Active Pieces action
 *
 * @param request - Action request with provider, action, inputs, and auth
 * @returns The result from the Active Pieces action
 *
 * @example
 * ```typescript
 * const result = await executePieceAction({
 *   provider: 'google-sheets',
 *   action: 'append_row',
 *   inputs: {
 *     spreadsheetId: 'xxx',
 *     sheetName: 'Sheet1',
 *     values: ['A', 'B', 'C']
 *   },
 *   auth: { access_token: 'ya29.xxx' }
 * });
 * ```
 */
export async function executePieceAction(
  request: PieceActionRequest
): Promise<unknown> {
  const { provider, action, inputs, auth } = request;

  // Get package name and load piece
  const packageName = getPiecePackageName(provider);
  const piece = (await loadPiece(packageName)) as Record<string, unknown>;

  // Find the actions object
  // Active Pieces uses _actions internally, but some may use actions
  let actions: Record<string, unknown> | undefined;

  // Try _actions first (Active Pieces internal format)
  if (piece._actions && typeof piece._actions === "object") {
    actions = piece._actions as Record<string, unknown>;
  }
  // Then try actions (public API format)
  else if (piece.actions && typeof piece.actions === "object") {
    actions = piece.actions as Record<string, unknown>;
  }
  // Try default export
  else if (piece.default && typeof piece.default === "object") {
    const defaultExport = piece.default as Record<string, unknown>;
    actions = (defaultExport._actions || defaultExport.actions) as Record<string, unknown> | undefined;
  }

  if (!actions) {
    throw new Error(
      `Piece '${packageName}' does not export actions. ` +
      `This may not be a valid Active Pieces package.`
    );
  }

  // Find the specific action
  const actionDef = actions[action] as Record<string, unknown> | undefined;

  if (!actionDef) {
    const availableActions = Object.keys(actions).join(", ");
    throw new Error(
      `Action '${action}' not found in piece '${packageName}'. ` +
      `Available actions: ${availableActions}`
    );
  }

  // Verify action has a run method
  if (typeof actionDef.run !== "function") {
    throw new Error(
      `Action '${action}' in piece '${packageName}' does not have a run method`
    );
  }

  // Execute the action
  // Active Pieces actions expect: { auth, propsValue, ... }
  const runFn = actionDef.run as (context: Record<string, unknown>) => Promise<unknown>;

  const result = await runFn({
    auth,
    propsValue: inputs,
    // Additional context that some pieces might need
    store: createMockStore(),
    files: createMockFiles(),
  });

  return result;
}

/**
 * Create a mock store for pieces that use state storage
 * In a real implementation, this could be backed by Redis or the blackboard
 */
function createMockStore(): Record<string, unknown> {
  const storage: Record<string, unknown> = {};

  return {
    async get(key: string): Promise<unknown> {
      return storage[key];
    },
    async put(key: string, value: unknown): Promise<void> {
      storage[key] = value;
    },
    async delete(key: string): Promise<void> {
      delete storage[key];
    },
  };
}

/**
 * Create a mock files helper for pieces that handle file uploads
 */
function createMockFiles(): Record<string, unknown> {
  return {
    async write(params: { fileName: string; data: Buffer }): Promise<string> {
      // In a real implementation, this would upload to a file storage
      console.log(`[PieceExecutor] Mock file write: ${params.fileName}`);
      return `mock://files/${params.fileName}`;
    },
  };
}

/**
 * List available actions for a provider
 * Useful for UI builders and documentation
 */
export async function listPieceActions(
  provider: string
): Promise<{ name: string; displayName?: string; description?: string }[]> {
  const packageName = getPiecePackageName(provider);
  const piece = (await loadPiece(packageName)) as Record<string, unknown>;

  let actions: Record<string, unknown> | undefined;

  // Try _actions first (Active Pieces internal format)
  if (piece._actions && typeof piece._actions === "object") {
    actions = piece._actions as Record<string, unknown>;
  }
  // Then try actions (public API format)
  else if (piece.actions && typeof piece.actions === "object") {
    actions = piece.actions as Record<string, unknown>;
  }
  // Try default export
  else if (piece.default && typeof piece.default === "object") {
    const defaultExport = piece.default as Record<string, unknown>;
    actions = (defaultExport._actions || defaultExport.actions) as Record<string, unknown> | undefined;
  }

  if (!actions) {
    return [];
  }

  return Object.entries(actions).map(([name, def]) => {
    const actionDef = def as Record<string, unknown>;
    return {
      name,
      displayName: actionDef.displayName as string | undefined,
      description: actionDef.description as string | undefined,
    };
  });
}

/**
 * Check if a piece is installed
 */
export async function isPieceInstalled(provider: string): Promise<boolean> {
  const packageName = getPiecePackageName(provider);
  try {
    await loadPiece(packageName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear the piece cache (useful for testing)
 */
export function clearPieceCache(): void {
  pieceCache.clear();
}
