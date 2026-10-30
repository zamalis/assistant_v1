import type { ToolCall } from '@langchain/core/messages/tool';

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { StructuredToolInterface } from '@langchain/core/tools';
import { injectable } from 'tsyringe';
import { z } from 'zod';

import { ErrorMessage, LlmModel } from '../../enums';
import { InternalServerError } from '../../errors';
import { type AppLogger, getAppLogger } from '../../logger';

import { AgentResult, LlmInput, ToolCallDigest } from './langchain.schema';
import { LlmProviderService } from './llm-provider.service';

const DEFAULT_MODEL = LlmModel.GPT_4O;
const MAX_AGENT_STEPS = 5;

@injectable()
export class LangchainService {
    private readonly logger: AppLogger = getAppLogger(LangchainService.name);

    constructor(private readonly llmProvider: LlmProviderService) {}

    public async generateOutput(input: LlmInput): Promise<string> {
        const response = await this.getModel(input).invoke(this.toMessages(input));
        return this.requireText(response.text);
    }

    public async runAgent(input: LlmInput, tools: StructuredToolInterface[]): Promise<AgentResult> {
        const model = this.getModel(input);
        if (!model.bindTools) {
            throw new InternalServerError(ErrorMessage.MODEL_TOOLS_UNSUPPORTED);
        }

        const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
        const modelWithTools = model.bindTools(tools);
        const messages = this.toMessages(input);
        const toolCalls: ToolCallDigest[] = [];

        for (let step = 0; step < MAX_AGENT_STEPS; step++) {
            const response = await modelWithTools.invoke(messages);
            const requestedCalls = response.tool_calls ?? [];
            const invalidCalls = response.invalid_tool_calls ?? [];
            if (requestedCalls.length === 0 && invalidCalls.length === 0) {
                return { text: this.requireText(response.text), toolCalls };
            }

            if (requestedCalls.length === 0) {
                // Invalid calls are not sent back to the API, so the correction goes in as a user note.
                const names = invalidCalls.map((call) => call.name ?? 'unknown').join(', ');
                this.logger.warn({ toolNames: names }, 'Model produced tool calls with invalid arguments');
                messages.push(
                    new HumanMessage(
                        `Your call to ${names} had invalid arguments (not valid JSON). Retry with valid arguments.`
                    )
                );
                continue;
            }

            messages.push(response);
            for (const toolCall of requestedCalls) {
                const toolMessage = await this.runToolCall(toolCall, toolsByName);
                messages.push(toolMessage);

                if (toolCall.id && toolMessage.status !== 'error' && toolMessage.artifact != null) {
                    toolCalls.push({
                        id: toolCall.id,
                        name: toolCall.name,
                        args: toolCall.args,
                        digest: toolMessage.artifact,
                    });
                }
            }
        }

        this.logger.warn(`Agent reached ${MAX_AGENT_STEPS} tool steps; answering without tools`);
        const finalResponse = await model.invoke(messages);
        return { text: this.requireText(finalResponse.text), toolCalls };
    }

    public async generateStructuredOutput<Schema extends z.ZodType<Record<string, unknown>>>(
        input: LlmInput,
        schema: Schema
    ): Promise<z.output<Schema>> {
        const result = await this.getModel(input).withStructuredOutput(schema).invoke(this.toMessages(input));
        return schema.parse(result);
    }

    private async runToolCall(
        toolCall: ToolCall,
        toolsByName: Map<string, StructuredToolInterface>
    ): Promise<ToolMessage> {
        const toolCallId = toolCall.id ?? '';
        const tool = toolsByName.get(toolCall.name);
        if (!tool) {
            this.logger.warn({ toolName: toolCall.name, toolCallId }, 'Model called an unknown tool');
            return this.toolError(toolCall, `Unknown tool "${toolCall.name}"`);
        }

        try {
            return await tool.invoke(toolCall);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // Argument validation errors carry the call's arguments (draft bodies, addresses), so log the message only.
            this.logger.error({ toolName: toolCall.name, toolCallId, reason: message }, 'Tool call failed');
            return this.toolError(toolCall, `Tool "${toolCall.name}" failed: ${message}`);
        }
    }

    private toolError(toolCall: ToolCall, content: string): ToolMessage {
        return new ToolMessage({
            content,
            tool_call_id: toolCall.id ?? '',
            name: toolCall.name,
            status: 'error',
        });
    }

    private getModel(input: LlmInput): BaseChatModel {
        return this.llmProvider.getModel(input.model ?? DEFAULT_MODEL);
    }

    private toMessages(input: LlmInput): BaseMessage[] {
        const messages: BaseMessage[] = [];

        if (input.systemPrompt) {
            messages.push(new SystemMessage(input.systemPrompt));
        }

        for (const turn of input.messages) {
            if (turn.role === 'user') {
                messages.push(new HumanMessage(turn.content));
                continue;
            }

            if (turn.toolCalls?.length) {
                messages.push(
                    new AIMessage({
                        content: '',
                        tool_calls: turn.toolCalls.map(({ id, name, args }) => ({ id, name, args, type: 'tool_call' })),
                    }),
                    ...turn.toolCalls.map(
                        ({ id, name, digest }) =>
                            new ToolMessage({ content: JSON.stringify(digest), tool_call_id: id, name })
                    )
                );
            }
            messages.push(new AIMessage(turn.content));
        }

        return messages;
    }

    private requireText(text: string): string {
        const trimmed = text.trim();
        if (!trimmed) {
            this.logger.error('Model returned an empty reply');
            throw new InternalServerError(ErrorMessage.EMPTY_MODEL_REPLY);
        }
        return trimmed;
    }
}
