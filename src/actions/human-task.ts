/**
 * HumanTask Node
 *
 * Pauses workflow execution to present an A2UI surface to a human user
 * and waits for their response. This node requires the `createHumanTask`
 * and `waitForHumanTask` activities to be configured in the context.
 *
 * Features:
 * - A2UI component-based UI definition (frozen at design time)
 * - Data bindings from workflow context (blackboard/input) to A2UI data model
 * - Variable resolution in title, description, and assignee
 * - Configurable timeout with onTimeout behavior
 * - Response data stored in blackboard
 *
 * The actual waiting is handled by the Temporal workflow layer using
 * condition() + signals, not by blocking the activity.
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  type A2UIComponent,
  type CreateHumanTaskRequest,
  NodeStatus,
} from "../types.js";
import {
  resolveValue,
  type VariableContext,
} from "../utilities/variable-resolver.js";

/**
 * Configuration for HumanTask node
 */
export interface HumanTaskConfig extends NodeConfiguration {
  /** Task title (supports ${bb.x} / ${input.x} resolution) */
  title: string;
  /** Task description (supports variable resolution) */
  description?: string;
  /** Assignee email (supports variable resolution) */
  assignee?: string;
  /** Role-based assignment */
  assigneeRole?: string;
  /** A2UI surface definition */
  a2ui: {
    /** Component tree definitions */
    components: A2UIComponent[];
    /** Maps A2UI JSON Pointer paths to btree expressions */
    dataBindings?: Record<string, string>;
  };
  /** Timeout in milliseconds (default: 24h) */
  timeoutMs?: number;
  /** Behavior on timeout: 'expire' | 'approve' | 'reject' */
  onTimeout?: string;
  /** Blackboard key prefix for response data (default: node id) */
  outputKey?: string;
}

/**
 * HumanTask Node
 *
 * Creates a human task with an A2UI surface and waits for the user to respond.
 *
 * @example YAML
 * ```yaml
 * type: HumanTask
 * id: expense-approval
 * props:
 *   title: "Expense Approval"
 *   description: "Review expense request from ${input.employeeName}"
 *   assignee: "${input.managerEmail}"
 *   a2ui:
 *     components:
 *       - id: root
 *         component:
 *           Column:
 *             children:
 *               explicitList: [header, amount-field, actions]
 *       - id: header
 *         component:
 *           Text:
 *             text: { path: '/title' }
 *       - id: amount-field
 *         component:
 *           TextField:
 *             text: { path: '/form/amount' }
 *             label: { literalString: 'Amount ($)' }
 *       - id: actions
 *         component:
 *           Row:
 *             children:
 *               explicitList: [approve-btn, reject-btn]
 *       - id: approve-btn
 *         component:
 *           Button:
 *             child: approve-text
 *             primary: true
 *             action:
 *               name: submit
 *               context:
 *                 - key: decision
 *                   value: { literalString: approved }
 *       - id: approve-text
 *         component:
 *           Text:
 *             text: { literalString: Approve }
 *       - id: reject-btn
 *         component:
 *           Button:
 *             child: reject-text
 *             action:
 *               name: submit
 *               context:
 *                 - key: decision
 *                   value: { literalString: rejected }
 *       - id: reject-text
 *         component:
 *           Text:
 *             text: { literalString: Reject }
 *     dataBindings:
 *       /title: "Expense Request from ${input.employeeName}"
 *       /form/amount: "${input.requestedAmount}"
 *   timeoutMs: 86400000
 *   onTimeout: expire
 *   outputKey: approval
 * ```
 */
export class HumanTask extends ActionNode {
  private title: string;
  private description?: string;
  private assignee?: string;
  private assigneeRole?: string;
  private a2ui: {
    components: A2UIComponent[];
    dataBindings?: Record<string, string>;
  };
  private timeoutMs: number;
  private onTimeout: string;
  private outputKey?: string;

  constructor(config: HumanTaskConfig) {
    super(config);

    if (!config.title) {
      throw new ConfigurationError("HumanTask requires title");
    }

    if (!config.a2ui?.components || config.a2ui.components.length === 0) {
      throw new ConfigurationError(
        "HumanTask requires a2ui.components with at least one component"
      );
    }

    this.title = config.title;
    this.description = config.description;
    this.assignee = config.assignee;
    this.assigneeRole = config.assigneeRole;
    this.a2ui = config.a2ui;
    this.timeoutMs = config.timeoutMs ?? 86400000; // 24h default
    this.onTimeout = config.onTimeout ?? "expire";
    this.outputKey = config.outputKey;
  }

  protected async executeTick(
    context: TemporalContext
  ): Promise<NodeStatus> {
    // 1. Validate activities
    if (!context.activities?.createHumanTask) {
      this._lastError =
        "HumanTask requires activities.createHumanTask to be configured. " +
        "This activity creates a task record in the database.";
      this.log(`Error: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }

    if (!context.activities?.waitForHumanTask) {
      this._lastError =
        "HumanTask requires activities.waitForHumanTask to be configured. " +
        "This activity waits for the user to complete the task.";
      this.log(`Error: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }

    try {
      // 2. Build variable context
      const varCtx: VariableContext = {
        blackboard: context.blackboard,
        input: context.input,
        testData: context.testData,
      };

      // 3. Resolve data bindings into A2UI data model
      const a2uiDataModel: Record<string, unknown> = {};
      if (this.a2ui.dataBindings) {
        for (const [a2uiPath, expression] of Object.entries(
          this.a2ui.dataBindings
        )) {
          const resolved = resolveValue(expression, varCtx);
          setNestedPath(a2uiDataModel, a2uiPath, resolved);
        }
      }

      // 4. Resolve title, description, assignee
      const resolvedTitle = resolveValue(this.title, varCtx) as string;
      const resolvedDescription = this.description
        ? (resolveValue(this.description, varCtx) as string)
        : undefined;
      const resolvedAssignee = this.assignee
        ? (resolveValue(this.assignee, varCtx) as string)
        : undefined;

      // 5. Get tenant/execution context from blackboard
      const tenantId =
        (context.blackboard.get("__tenantId") as string) || "";
      const executionId =
        (context.blackboard.get("__executionId") as string) ||
        context.workflowInfo?.workflowId ||
        "";

      // 6. Create task via activity
      const request: CreateHumanTaskRequest = {
        nodeId: this.id,
        tenantId,
        executionId,
        title: resolvedTitle,
        description: resolvedDescription,
        assigneeEmail: resolvedAssignee,
        assigneeRole: this.assigneeRole,
        a2uiComponents: this.a2ui.components,
        a2uiDataModel,
        timeoutMs: this.timeoutMs,
        onTimeout: this.onTimeout,
      };

      this.log(
        `Creating human task: "${resolvedTitle}" (timeout: ${this.timeoutMs}ms)`
      );
      const createResult = await context.activities.createHumanTask(request);
      this.log(`Task created: ${createResult.taskId}`);

      // 7. Wait for task completion via activity
      // (implemented as Temporal condition in workflow)
      this.log(
        `Waiting for human task ${createResult.taskId} on node ${this.id}`
      );
      const waitResult = await context.activities.waitForHumanTask({
        taskId: createResult.taskId,
        nodeId: this.id,
        timeoutMs: this.timeoutMs,
        onTimeout: this.onTimeout,
      });

      // 8. Store results in blackboard
      const prefix = this.outputKey || this.id;
      context.blackboard.set(`${prefix}.taskId`, createResult.taskId);
      context.blackboard.set(`${prefix}.completed`, waitResult.completed);
      context.blackboard.set(`${prefix}.decision`, waitResult.decision);
      context.blackboard.set(
        `${prefix}.submittedData`,
        waitResult.submittedData
      );
      context.blackboard.set(`${prefix}.completedBy`, waitResult.completedBy);
      context.blackboard.set(`${prefix}.timedOut`, waitResult.timedOut);

      // 9. Return status based on outcome
      if (waitResult.timedOut) {
        this._lastError = `Task timed out after ${this.timeoutMs}ms`;
        this.log(`Task timed out, onTimeout=${this.onTimeout}`);
        return this.onTimeout === "approve"
          ? NodeStatus.SUCCESS
          : NodeStatus.FAILURE;
      }

      this.log(
        `Task completed: decision=${waitResult.decision}, completedBy=${waitResult.completedBy}`
      );
      return waitResult.completed ? NodeStatus.SUCCESS : NodeStatus.FAILURE;
    } catch (error) {
      this._lastError =
        error instanceof Error ? error.message : String(error);
      this.log(`HumanTask failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}

/**
 * Set a value at a JSON Pointer path in a nested object.
 * e.g., setNestedPath(obj, "/form/amount", 1500)
 *   → obj = { form: { amount: 1500 } }
 */
function setNestedPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const parts = path.split("/").filter(Boolean);
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  if (parts.length > 0) {
    const lastKey = parts[parts.length - 1]!;
    current[lastKey] = value;
  }
}
