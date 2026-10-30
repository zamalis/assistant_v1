import type { StructuredToolInterface } from '@langchain/core/tools';

import { injectable } from 'tsyringe';
import { z } from 'zod';

import { defineTool, type ToolContext, type ToolProvider } from '../../common/integrations';
import { formatLocalDateTime } from '../prompts';

@injectable()
export class CoreToolProvider implements ToolProvider {
    getTools(ctx: ToolContext): StructuredToolInterface[] {
        return [
            defineTool({
                name: 'get_current_time',
                description: "Get the current date and time in the user's timezone.",
                schema: z.object({}),
                run: () => formatLocalDateTime(ctx.now, ctx.timezone),
                digest: () => null,
            }),
        ];
    }
}
