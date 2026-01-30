/**
 * WaitForApproval Node
 *
 * Pauses workflow execution until human approval is received.
 * This node creates an approval request in the database and waits for
 * a Temporal signal indicating approval or rejection.
 *
 * Features:
 * - Human-in-the-loop workflow control
 * - Configurable timeout with default behavior
 * - Approval metadata storage in blackboard
 * - Integration with existing approval API
 * - Support for role-based approvers
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  type CreateApprovalRequest,
  type CreateApprovalResponse,
  type WaitForApprovalRequest,
  type WaitForApprovalResponse,
  NodeStatus,
} from "../types.js";

/**
 * Configuration for WaitForApproval node
 */
export interface WaitForApprovalConfig extends NodeConfiguration {
  /** Email address of the approver */
  approverEmail: string;
  /** Optional role requirement for approver */
  approverRole?: string;
  /** Title/subject of the approval request */
  title: string;
  /** Detailed description of what needs approval */
  description?: string;
  /** Additional metadata to store with approval */
  metadata?: Record<string, unknown>;
  /** Timeout in milliseconds (default: 24 hours) */
  timeoutMs?: number;
  /** Behavior on timeout: 'approve' or 'reject' (default: 'reject') */
  onTimeout?: "approve" | "reject";
}

/**
 * WaitForApproval Node
 *
 * Pauses workflow until human approval/rejection via API.
 * Requires Temporal workflow signal handling to resume execution.
 *
 * @example YAML - Simple approval
 * ```yaml
 * type: WaitForApproval
 * id: manager-approval
 * props:
 *   approverEmail: "manager@company.com"
 *   title: "Expense Report Approval"
 *   description: "Approve expense report for $${input.amount}"
 *   timeoutMs: 86400000  # 24 hours
 *   onTimeout: reject
 * ```
 *
 * @example YAML - With notification step
 * ```yaml
 * - type: WaitForApproval
 *   id: deployment-approval
 *   props:
 *     approverEmail: "devops@company.com"
 *     title: "Production Deployment Approval"
 *     description: "Deploy version ${input.version} to production"
 *
 * - type: IntegrationAction  # Send notification separately
 *   id: notify-approver
 *   props:
 *     pieceName: "slack"
 *     actionName: "send_message"
 *     input:
 *       channel: "approvals"
 *       text: "Approval needed: ${bb.approvalUrl}"
 * ```
 *
 * @example Blackboard after approval
 * ```typescript
 * {
 *   approvalId: "uuid-123",
 *   approvalUrl: "https://app.wayfarer.ai/approvals/uuid-123",
 *   approvalStatus: "approved",
 *   approvalComments: "LGTM",
 *   approvedBy: "user-456",
 *   approvedAt: "2024-01-15T10:30:00Z"
 * }
 * ```
 */
export class WaitForApproval extends ActionNode {
  private approverEmail: string;
  private approverRole?: string;
  private title: string;
  private description?: string;
  private metadata: Record<string, unknown>;
  private timeoutMs: number;
  private onTimeout: "approve" | "reject";

  constructor(config: WaitForApprovalConfig) {
    super(config);

    // Validate required fields
    if (!config.approverEmail) {
      throw new ConfigurationError("WaitForApproval requires approverEmail");
    }

    if (!config.title) {
      throw new ConfigurationError("WaitForApproval requires title");
    }

    this.approverEmail = config.approverEmail;
    this.approverRole = config.approverRole;
    this.title = config.title;
    this.description = config.description;
    this.metadata = config.metadata || {};
    this.timeoutMs = config.timeoutMs || 86400000; // 24 hours default
    this.onTimeout = config.onTimeout || "reject";
  }

  protected async executeTick(context: TemporalContext): Promise<NodeStatus> {
    // Validate required activities are available
    if (!context.activities?.createApproval || !context.activities?.waitForApproval) {
      this._lastError =
        "WaitForApproval requires createApproval and waitForApproval activities. " +
        "These activities handle approval lifecycle in the Temporal workflow.";
      this.log(`Error: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }

    try {
      // Step 1: Create approval record in database
      const createRequest: CreateApprovalRequest = {
        nodeId: this.id,
        approverEmail: this.approverEmail,
        approverRole: this.approverRole,
        title: this.title,
        description: this.description,
        metadata: this.metadata,
        timeoutMs: this.timeoutMs,
        workflowId: context.workflowInfo?.workflowId,
      };

      this.log(`Creating approval request: ${this.title}`);
      const approval = await context.activities.createApproval(createRequest);

      this.log(`Approval request created: ${approval.approvalId}`);

      // Store approval ID and URL in blackboard for reference
      // (e.g., for notification steps that follow this node)
      context.blackboard.set("approvalId", approval.approvalId);
      context.blackboard.set("approvalUrl", approval.approvalUrl);

      // Step 2: Wait for approval signal (uses Temporal condition in workflow)
      const waitRequest: WaitForApprovalRequest = {
        nodeId: this.id,
        timeoutMs: this.timeoutMs,
        onTimeout: this.onTimeout,
      };

      this.log(`Waiting for approval (timeout: ${this.timeoutMs}ms)`);
      const response = await context.activities.waitForApproval(waitRequest);

      // Step 3: Store approval response in blackboard
      context.blackboard.set("approvalStatus", response.approved ? "approved" : "rejected");
      context.blackboard.set("approvalComments", response.comments);
      context.blackboard.set("approvedBy", response.approverId);
      context.blackboard.set("approvedAt", response.respondedAt);

      this.log(
        response.approved
          ? `Approved by ${response.approverId || "unknown"}`
          : `Rejected by ${response.approverId || "unknown"}`
      );

      // Return SUCCESS if approved, FAILURE if rejected
      return response.approved ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
    } catch (error) {
      this._lastError = error instanceof Error ? error.message : String(error);
      this.log(`Approval workflow failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
