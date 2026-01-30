/**
 * Tests for WaitForApproval Node
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WaitForApproval } from '../wait-for-approval';
import { NodeStatus } from '../../types';
import { ScopedBlackboard } from '../../blackboard';
import { NodeEventEmitter } from '../../events';
import type {
  TemporalContext,
  CreateApprovalResponse,
  WaitForApprovalResponse,
} from '../../types';

describe('WaitForApproval', () => {
  let mockActivities: any;
  let context: TemporalContext;

  beforeEach(() => {
    // Mock activities
    mockActivities = {
      createApproval: vi.fn(),
      waitForApproval: vi.fn(),
    };

    // Create context
    context = {
      blackboard: new ScopedBlackboard(),
      treeRegistry: {} as any,
      timestamp: Date.now(),
      activities: mockActivities,
      eventEmitter: new NodeEventEmitter(),
      workflowInfo: {
        workflowId: 'test-workflow-123',
        runId: 'test-run-456',
        namespace: 'default',
      },
    };
  });

  it('should fail if activities are missing', async () => {
    const node = new WaitForApproval({
      id: 'test-approval',
      approverEmail: 'manager@test.com',
      title: 'Test Approval',
    });

    const contextWithoutActivities = {
      ...context,
      activities: undefined,
    };

    const status = await node.tick(contextWithoutActivities);

    expect(status).toBe(NodeStatus.FAILURE);
    expect(node.lastError).toContain('requires createApproval and waitForApproval activities');
  });

  it('should create approval and wait for response', async () => {
    const approvalResponse: CreateApprovalResponse = {
      approvalId: 'approval-123',
      approvalUrl: 'http://localhost:3000/approvals/approval-123',
    };

    const waitResponse: WaitForApprovalResponse = {
      approved: true,
      approverId: 'user-456',
      comments: 'Looks good!',
      respondedAt: new Date().toISOString(),
    };

    mockActivities.createApproval.mockResolvedValue(approvalResponse);
    mockActivities.waitForApproval.mockResolvedValue(waitResponse);

    const node = new WaitForApproval({
      id: 'test-approval',
      approverEmail: 'manager@test.com',
      title: 'Test Approval',
      description: 'Please approve this test',
      timeoutMs: 60000,
      onTimeout: 'reject',
    });

    const status = await node.tick(context);

    // Verify approval was created
    expect(mockActivities.createApproval).toHaveBeenCalledWith({
      nodeId: 'test-approval',
      approverEmail: 'manager@test.com',
      approverRole: undefined,
      title: 'Test Approval',
      description: 'Please approve this test',
      metadata: {},
      timeoutMs: 60000,
      workflowId: 'test-workflow-123',
    });

    // Verify waitForApproval was called
    expect(mockActivities.waitForApproval).toHaveBeenCalledWith({
      nodeId: 'test-approval',
      timeoutMs: 60000,
      onTimeout: 'reject',
    });

    // Verify blackboard was updated
    expect(context.blackboard.get('approvalId')).toBe('approval-123');
    expect(context.blackboard.get('approvalUrl')).toBe('http://localhost:3000/approvals/approval-123');
    expect(context.blackboard.get('approvalStatus')).toBe('approved');
    expect(context.blackboard.get('approvalComments')).toBe('Looks good!');
    expect(context.blackboard.get('approvedBy')).toBe('user-456');

    // Verify node succeeded
    expect(status).toBe(NodeStatus.SUCCESS);
  });

  it('should fail if approval is rejected', async () => {
    const approvalResponse: CreateApprovalResponse = {
      approvalId: 'approval-123',
      approvalUrl: 'http://localhost:3000/approvals/approval-123',
    };

    const waitResponse: WaitForApprovalResponse = {
      approved: false,
      approverId: 'user-456',
      comments: 'Not approved',
      respondedAt: new Date().toISOString(),
    };

    mockActivities.createApproval.mockResolvedValue(approvalResponse);
    mockActivities.waitForApproval.mockResolvedValue(waitResponse);

    const node = new WaitForApproval({
      id: 'test-approval',
      approverEmail: 'manager@test.com',
      title: 'Test Approval',
    });

    const status = await node.tick(context);

    expect(status).toBe(NodeStatus.FAILURE);
    expect(context.blackboard.get('approvalStatus')).toBe('rejected');
    expect(context.blackboard.get('approvalComments')).toBe('Not approved');
  });

  it('should use default timeout and onTimeout values', async () => {
    const approvalResponse: CreateApprovalResponse = {
      approvalId: 'approval-123',
      approvalUrl: 'http://localhost:3000/approvals/approval-123',
    };

    const waitResponse: WaitForApprovalResponse = {
      approved: true,
      respondedAt: new Date().toISOString(),
    };

    mockActivities.createApproval.mockResolvedValue(approvalResponse);
    mockActivities.waitForApproval.mockResolvedValue(waitResponse);

    const node = new WaitForApproval({
      id: 'test-approval',
      approverEmail: 'manager@test.com',
      title: 'Test Approval',
    });

    await node.tick(context);

    // Verify default timeout (24 hours)
    expect(mockActivities.waitForApproval).toHaveBeenCalledWith({
      nodeId: 'test-approval',
      timeoutMs: 86400000,
      onTimeout: 'reject',
    });
  });

  it('should handle activity errors gracefully', async () => {
    mockActivities.createApproval.mockRejectedValue(new Error('Database error'));

    const node = new WaitForApproval({
      id: 'test-approval',
      approverEmail: 'manager@test.com',
      title: 'Test Approval',
    });

    const status = await node.tick(context);

    expect(status).toBe(NodeStatus.FAILURE);
    expect(node.lastError).toBe('Database error');
  });

  it('should include metadata in approval request', async () => {
    const approvalResponse: CreateApprovalResponse = {
      approvalId: 'approval-123',
      approvalUrl: 'http://localhost:3000/approvals/approval-123',
    };

    const waitResponse: WaitForApprovalResponse = {
      approved: true,
      respondedAt: new Date().toISOString(),
    };

    mockActivities.createApproval.mockResolvedValue(approvalResponse);
    mockActivities.waitForApproval.mockResolvedValue(waitResponse);

    const node = new WaitForApproval({
      id: 'test-approval',
      approverEmail: 'manager@test.com',
      title: 'Test Approval',
      metadata: {
        amount: 1000,
        category: 'travel',
      },
    });

    await node.tick(context);

    expect(mockActivities.createApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          amount: 1000,
          category: 'travel',
        },
      })
    );
  });
});
