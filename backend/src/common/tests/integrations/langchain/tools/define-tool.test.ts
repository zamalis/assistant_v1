import { container } from 'tsyringe';
import { z } from 'zod';

import { defineTool } from '../../../../integrations/langchain/tools';
import { createLogger } from '../../../../logger';
import { LOGGER } from '../../../../tokens';
import { createTestEnv } from '../../../test-env';

import { beforeEach, describe, expect, it, mock } from 'bun:test';

function toolCall(name: string, args: Record<string, unknown> = {}) {
    return { id: 'call_1', name, args, type: 'tool_call' as const };
}

describe('defineTool', () => {
    beforeEach(() => {
        container.registerInstance(LOGGER, createLogger(createTestEnv()));
    });

    it('returns string content and digest artifact', async () => {
        const echo = defineTool({
            name: 'echo',
            description: 'Echo',
            schema: z.object({}),
            run: () => 'ok',
            digest: () => ({ id: 'a' }),
        });

        const message = await echo.invoke(toolCall('echo'));

        expect(message.content).toBe('ok');
        expect(message.artifact).toEqual({ id: 'a' });
        expect(message.tool_call_id).toBe('call_1');
    });

    it('stringifies non-string results', async () => {
        const list = defineTool({
            name: 'list',
            description: 'List',
            schema: z.object({}),
            run: () => [{ id: 1 }],
            digest: () => null,
        });

        const message = await list.invoke(toolCall('list'));

        expect(message.content).toBe('[{"id":1}]');
    });

    it('passes args and result to digest', async () => {
        const digest = mock((_args: { q: string }, _result: string) => null);
        const search = defineTool({
            name: 'search',
            description: 'Search',
            schema: z.object({ q: z.string() }),
            run: ({ q }) => `found ${q}`,
            digest,
        });

        await search.invoke(toolCall('search', { q: 'abc' }));

        expect(digest).toHaveBeenCalledWith({ q: 'abc' }, 'found abc');
    });

    it('allows a null digest', async () => {
        const quiet = defineTool({
            name: 'quiet',
            description: 'Quiet',
            schema: z.object({}),
            run: () => 'ok',
            digest: () => null,
        });

        const message = await quiet.invoke(toolCall('quiet'));

        expect(message.artifact).toBeNull();
    });

    it('keeps the result when the digest throws after run', async () => {
        const run = mock(() => 'sent');
        const send = defineTool({
            name: 'send',
            description: 'Send',
            schema: z.object({}),
            run,
            digest: () => {
                throw new Error('digest bug');
            },
        });

        const message = await send.invoke(toolCall('send'));

        expect(run).toHaveBeenCalledTimes(1);
        expect(message.content).toBe('sent');
        expect(message.artifact).toBeNull();
    });

    it('keeps the result when it cannot be stringified', async () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        const odd = defineTool({
            name: 'odd',
            description: 'Odd',
            schema: z.object({}),
            run: () => circular,
            digest: () => null,
        });

        const message = await odd.invoke(toolCall('odd'));

        expect(message.status).not.toBe('error');
        expect(typeof message.content).toBe('string');
    });
});
