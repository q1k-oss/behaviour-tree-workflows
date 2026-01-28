/**
 * Integrations Module
 * Third-party service integrations via Active Pieces
 */

// Main integration action node
export {
  IntegrationAction,
  type IntegrationActionConfig,
  type IntegrationContext,
  type TokenProvider,
  envTokenProvider,
} from "./integration-action.js";

// Piece executor
export {
  executePieceAction,
  listPieceActions,
  isPieceInstalled,
  clearPieceCache,
} from "./piece-executor.js";

// Re-export types from types.ts for convenience
export type {
  PieceAuth,
  PieceActivityRequest,
} from "../types.js";

// Backward compatibility alias
export type { PieceActivityRequest as PieceActionRequest } from "../types.js";
