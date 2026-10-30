import { AIMessage, type BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { container } from 'tsyringe';
import { z } from 'zod';

import { ErrorMessage } from '../../../enums';
import { LangchainService, type LlmProviderService } from '../../../integrations';
import { defineTool } from '../../../integrations/langchain/tools';
import { createLogger } from '../../../logger';
import { LOGGER } from '../../../tokens';
import { createTestEnv } from '../../test-env';

import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

type Scripted = { invoke: ReturnType<typeof mock>; snapshots: BaseMessage[][] };

function toolCallMessage(...calls: Array<{ id: string; name: string; args?: Record<string, unknown> }>): AIMessage {
    return new AIMessage({
        content: '',
        tool_calls: calls.map((call) => ({ ...call, args: call.args ?? {}, type: 'tool_call' as const })),
    });
}

function scripted(responses: AIMessage[] | (() => AIMessage)): Scripted {
    const snapshots: BaseMessage[][] = [];
    let index = 0;
    const invoke = mock((messages: BaseMessage[]) => {
        snapshots.push([...messages]);
        return Promise.resolve(typeof responses === 'function' ? responses() : responses[index++]);
    });
    return { invoke, snapshots };
}

function echoTool(digest: () => z.core.util.JSONType | null = () => ({ seen: true })) {
    return defineTool({
        name: 'echo',
        description: 'Echo',
        schema: z.object({ q: z.string().optional() }),
        run: ({ q }) => `echo ${q ?? ''}`.trim(),
        digest,
    });
}

describe('LangchainService.runAgent', () => {
    let bound: Scripted;
    let unbound: ReturnType<typeof mock>;
    let model: { invoke: ReturnType<typeof mock>; bindTools?: ReturnType<typeof mock> };
    let service: LangchainService;

    function setup(responses: AIMessage[] | (() => AIMessage), finalText = 'final') {
        bound = scripted(responses);
        unbound = mock(() => Promise.resolve(new AIMessage(finalText)));
        model = { invoke: unbound, bindTools: mock(() => ({ invoke: bound.invoke })) };
        service = new LangchainService({ getModel: () => model } as unknown as LlmProviderService);
    }

    const input = { messages: [{ role: 'user' as const, content: 'hi' }] };

    beforeEach(() => {
        container.registerInstance(LOGGER, createLogger(createTestEnv()));
    });

    it('returns text when the model calls no tools', async () => {
        setup([new AIMessage('hi')]);

        await expect(service.runAgent(input, [echoTool()])).resolves.toEqual({ text: 'hi', toolCalls: [] });
        expect(bound.invoke).toHaveBeenCalledTimes(1);
    });

    it('runs a tool round and records its digest', async () => {
        setup([toolCallMessage({ id: 'call_1', name: 'echo', args: { q: 'a' } }), new AIMessage('done')]);

        const result = await service.runAgent(input, [echoTool()]);

        expect(result).toEqual({
            text: 'done',
            toolCalls: [{ id: 'call_1', name: 'echo', args: { q: 'a' }, digest: { seen: true } }],
        });
        const second = bound.snapshots[1];
        expect(second.at(-2)).toBeInstanceOf(AIMessage);
        const toolMessage = second.at(-1) as ToolMessage;
        expect(toolMessage).toBeInstanceOf(ToolMessage);
        expect(toolMessage.tool_call_id).toBe('call_1');
        expect(toolMessage.content).toBe('echo a');
    });

    it('handles several tool calls in one response', async () => {
        setup([
            toolCallMessage(
                { id: 'call_1', name: 'echo', args: { q: 'a' } },
                { id: 'call_2', name: 'echo', args: { q: 'b' } }
            ),
            new AIMessage('done'),
        ]);

        const result = await service.runAgent(input, [echoTool()]);

        const [first, second] = bound.snapshots[1].slice(-2);
        expect((first as ToolMessage).tool_call_id).toBe('call_1');
        expect((second as ToolMessage).tool_call_id).toBe('call_2');
        expect(result.toolCalls.map((call) => call.id)).toEqual(['call_1', 'call_2']);
    });

    it('tells the model when its tool call arguments were invalid and continues', async () => {
        setup([
            new AIMessage({
                content: '',
                invalid_tool_calls: [
                    { id: 'call_1', name: 'echo', args: '{bad', error: 'bad json', type: 'invalid_tool_call' },
                ],
            }),
            new AIMessage('done'),
        ]);

        const result = await service.runAgent(input, [echoTool()]);

        expect(result).toEqual({ text: 'done', toolCalls: [] });
        expect(bound.invoke).toHaveBeenCalledTimes(2);
        expect(String(bound.snapshots[1].at(-1)?.content)).toContain('echo');
    });

    it('does not record null digests', async () => {
        setup([toolCallMessage({ id: 'call_1', name: 'echo' }), new AIMessage('done')]);

        const result = await service.runAgent(input, [echoTool(() => null)]);

        expect(result.toolCalls).toEqual([]);
    });

    it('reports unknown tools to the model', async () => {
        setup([toolCallMessage({ id: 'call_1', name: 'nope' }), new AIMessage('done')]);

        const result = await service.runAgent(input, [echoTool()]);

        const toolMessage = bound.snapshots[1].at(-1) as ToolMessage;
        expect(toolMessage.status).toBe('error');
        expect(toolMessage.content).toBe('Unknown tool "nope"');
        expect(result).toEqual({ text: 'done', toolCalls: [] });
    });

    it('reports throwing tools to the model', async () => {
        setup([toolCallMessage({ id: 'call_1', name: 'echo' }), new AIMessage('done')]);
        const boom = defineTool({
            name: 'echo',
            description: 'Echo',
            schema: z.object({}),
            run: () => {
                throw new Error('boom');
            },
            digest: () => ({ never: true }),
        });

        const result = await service.runAgent(input, [boom]);

        const toolMessage = bound.snapshots[1].at(-1) as ToolMessage;
        expect(toolMessage.status).toBe('error');
        expect(toolMessage.content).toBe('Tool "echo" failed: boom');
        expect(result).toEqual({ text: 'done', toolCalls: [] });
    });

    it("does not log a failing tool call's error object, which can carry the call arguments", async () => {
        setup([toolCallMessage({ id: 'call_1', name: 'echo' }), new AIMessage('done')]);
        const leaky = defineTool({
            name: 'echo',
            description: 'Echo',
            schema: z.object({}),
            run: () => {
                throw Object.assign(new Error('bad input'), { output: '{"body":"SECRET BODY"}' });
            },
            digest: () => null,
        });
        const logger = (service as unknown as { logger: { error(...args: unknown[]): void } }).logger;
        const logError = spyOn(logger, 'error').mockImplementation(() => undefined);

        await service.runAgent(input, [leaky]);

        expect(logError).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(logError.mock.calls)).not.toContain('SECRET BODY');
        expect(JSON.stringify(logError.mock.calls)).toContain('bad input');
    });

    it('stops after MAX_AGENT_STEPS and answers without tools', async () => {
        setup(() => toolCallMessage({ id: 'call_1', name: 'echo' }), 'wrapped up');

        const result = await service.runAgent(input, [echoTool(() => null)]);

        expect(bound.invoke).toHaveBeenCalledTimes(5);
        expect(unbound).toHaveBeenCalledTimes(1);
        expect(result.text).toBe('wrapped up');
    });

    it('throws when the model cannot bind tools', async () => {
        setup([new AIMessage('hi')]);
        model.bindTools = undefined;

        await expect(service.runAgent(input, [echoTool()])).rejects.toThrow(ErrorMessage.MODEL_TOOLS_UNSUPPORTED);
    });

    it('rebuilds stored tool calls from history', async () => {
        setup([new AIMessage('ok')]);

        await service.runAgent(
            {
                systemPrompt: 'sys',
                messages: [
                    { role: 'user', content: 'first' },
                    {
                        role: 'assistant',
                        content: 'answer',
                        toolCalls: [{ id: 'call_9', name: 's', args: {}, digest: [1] }],
                    },
                    { role: 'user', content: 'second' },
                ],
            },
            [echoTool()]
        );

        const messages = bound.snapshots[0];
        expect(messages.map((message) => message.constructor)).toEqual([
            SystemMessage,
            HumanMessage,
            AIMessage,
            ToolMessage,
            AIMessage,
            HumanMessage,
        ]);
        expect((messages[2] as AIMessage).tool_calls?.[0]?.id).toBe('call_9');
        expect(messages[2].content).toBe('');
        expect((messages[3] as ToolMessage).tool_call_id).toBe('call_9');
        expect(messages[3].content).toBe('[1]');
        expect(messages[4].content).toBe('answer');
    });
});
