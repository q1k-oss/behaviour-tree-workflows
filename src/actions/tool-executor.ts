/**
 * ToolExecutor Node
 *
 * Executes tool calls from an LLM response and appends results
 * back to the conversation as tool_result content blocks.
 *
 * Works in tandem with LLMToolCall: LLMToolCall produces tool calls,
 * ToolExecutor runs them and feeds results back to the conversation
 * so the next LLMToolCall iteration can see them.
 */

import { ActionNode } from "../base-node.js";
import { ConfigurationError } from "../errors.js";
import {
  type TemporalContext,
  type NodeConfiguration,
  type AgentMessage,
  type AgentToolCall,
  type AgentContentBlock,
  NodeStatus,
} from "../types.js";

/**
 * Configuration for ToolExecutor node
 */
export interface ToolExecutorConfig extends NodeConfiguration {
  /** Blackboard key for LLMToolCall output (has .toolCalls) */
  responseKey: string;
  /** Blackboard key for AgentMessage[] (appends tool_results) */
  messagesKey: string;
  /** Optional: where to write tool results array */
  outputKey?: string;
}

/**
 * ToolExecutor Node
 *
 * Executes tool calls from the LLM response and appends tool_result
 * messages to the conversation for the next LLM turn.
 *
 * @example YAML
 * ```yaml
 * type: ToolExecutor
 * id: exec-tools
 * props:
 *   responseKey: llmResponse
 *   messagesKey: conversationMessages
 * ```
 */
export class ToolExecutor extends ActionNode {
  private responseKey: string;
  private messagesKey: string;
  private outputKey?: string;

  constructor(config: ToolExecutorConfig) {
    super(config);

    if (!config.responseKey) {
      throw new ConfigurationError("ToolExecutor requires responseKey");
    }
    if (!config.messagesKey) {
      throw new ConfigurationError("ToolExecutor requires messagesKey");
    }

    this.responseKey = config.responseKey;
    this.messagesKey = config.messagesKey;
    this.outputKey = config.outputKey;
  }

  protected async executeTick(
    context: TemporalContext
  ): Promise<NodeStatus> {
    // 1. Validate activity
    if (!context.activities?.executeAgentTool) {
      this._lastError =
        "ToolExecutor requires activities.executeAgentTool to be configured.";
      this.log(`Error: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }

    try {
      // 2. Read tool calls from response
      const response = context.blackboard.get(this.responseKey) as {
        toolCalls?: AgentToolCall[];
      } | undefined;

      const toolCalls = response?.toolCalls;
      if (!toolCalls || toolCalls.length === 0) {
        this.log("No tool calls to execute");
        return NodeStatus.SUCCESS;
      }

      // 3. Execute each tool call
      const toolResults: Array<{
        toolUseId: string;
        toolName: string;
        content: string;
        isError: boolean;
      }> = [];

      for (const tc of toolCalls) {
        this.log(`Executing tool: ${tc.name} (${tc.id})`);

        const result = await context.activities.executeAgentTool({
          toolName: tc.name,
          toolInput: tc.input,
        });

        toolResults.push({
          toolUseId: tc.id,
          toolName: tc.name,
          content: result.content,
          isError: result.isError,
        });

        this.log(
          `Tool ${tc.name} ${result.isError ? "errored" : "completed"}: ${result.content.substring(0, 100)}`
        );
      }

      // 4. Build tool_result content blocks and append to conversation
      const resultBlocks: AgentContentBlock[] = toolResults.map((tr) => ({
        type: "tool_result" as const,
        tool_use_id: tr.toolUseId,
        content: tr.content,
        is_error: tr.isError,
      }));

      const messages = (context.blackboard.get(this.messagesKey) as AgentMessage[]) || [];
      const updatedMessages = [
        ...messages,
        { role: "user" as const, content: resultBlocks },
      ];
      context.blackboard.set(this.messagesKey, updatedMessages);

      // 5. Optionally write results to outputKey
      if (this.outputKey) {
        context.blackboard.set(this.outputKey, toolResults);
      }

      this.log(`Executed ${toolResults.length} tool(s), results appended to conversation`);
      return NodeStatus.SUCCESS;
    } catch (error) {
      this._lastError =
        error instanceof Error ? error.message : String(error);
      this.log(`ToolExecutor failed: ${this._lastError}`);
      return NodeStatus.FAILURE;
    }
  }
}
