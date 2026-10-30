import type { Context } from 'hono';

import { mock } from 'bun:test';

export interface MockContext {
    json: ReturnType<typeof mock>;
    body: ReturnType<typeof mock>;
}

export function createMockContext(): MockContext {
    return {
        json: mock((payload: unknown, status = 200) => ({ payload, status })),
        body: mock((payload: unknown, status = 200) => ({ payload, status })),
    };
}

export function asContext(context: MockContext): Context {
    return context as unknown as Context;
}
