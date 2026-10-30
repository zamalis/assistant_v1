import type { User } from '../../../common/entities/user.entity';
import type { ToolContext } from '../../../common/integrations';

import { CoreToolProvider } from '../../tools';

import { describe, expect, it } from 'bun:test';

describe('CoreToolProvider', () => {
    it('get_current_time uses ctx.timezone', async () => {
        const ctx: ToolContext = {
            user: { id: 'u1' } as User,
            now: new Date('2026-10-28T20:15:00Z'),
            timezone: 'Europe/Paris',
            outbox: [],
        };
        const tool = new CoreToolProvider().getTools(ctx).find(({ name }) => name === 'get_current_time');

        const message = await tool?.invoke({ id: 'call_1', name: 'get_current_time', args: {}, type: 'tool_call' });

        expect(message?.content).toContain('21:15');
        expect(message?.artifact).toBeNull();
    });
});
