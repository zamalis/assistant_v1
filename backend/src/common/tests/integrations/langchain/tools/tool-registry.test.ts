import type { User } from '../../../../entities/user.entity';

import { container } from 'tsyringe';
import { z } from 'zod';

import { ErrorMessage } from '../../../../enums';
import { InternalServerError } from '../../../../errors';
import {
    defineTool,
    type ToolContext,
    type ToolProvider,
    ToolRegistry,
} from '../../../../integrations/langchain/tools';
import { createLogger } from '../../../../logger';
import { LOGGER } from '../../../../tokens';
import { createTestEnv } from '../../../test-env';

import { beforeEach, describe, expect, it, mock } from 'bun:test';

const ctx: ToolContext = {
    user: { id: 'u1' } as User,
    now: new Date('2026-10-28T20:15:00Z'),
    timezone: 'UTC',
    outbox: [],
};

function makeTool(name: string) {
    return defineTool({
        name,
        description: name,
        schema: z.object({}),
        run: () => 'ok',
        digest: () => null,
    });
}

function makeProvider(...names: string[]): ToolProvider & { getTools: ReturnType<typeof mock> } {
    return { getTools: mock(() => names.map(makeTool)) };
}

describe('ToolRegistry', () => {
    beforeEach(() => {
        container.registerInstance(LOGGER, createLogger(createTestEnv()));
    });

    it('merges tools from every provider and passes ctx', () => {
        const first = makeProvider('a');
        const second = makeProvider('b', 'c');

        const tools = new ToolRegistry([first, second]).buildTools(ctx);

        expect(tools).toHaveLength(3);
        expect(first.getTools).toHaveBeenCalledWith(ctx);
        expect(second.getTools).toHaveBeenCalledWith(ctx);
    });

    it('throws on duplicate tool names', () => {
        const registry = new ToolRegistry([makeProvider('dup'), makeProvider('dup')]);

        expect(() => registry.buildTools(ctx)).toThrow(new InternalServerError(ErrorMessage.DUPLICATE_TOOL_NAME));
    });
});
