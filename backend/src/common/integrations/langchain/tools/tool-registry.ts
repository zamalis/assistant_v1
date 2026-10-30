import type { StructuredToolInterface } from '@langchain/core/tools';
import type { ToolContext, ToolProvider } from './tool.types';

import { injectAll, injectable } from 'tsyringe';

import { ErrorMessage } from '../../../enums';
import { type AppLogger, getAppLogger } from '../../../logger';
import { TOOL_PROVIDERS } from '../../../tokens';

@injectable()
export class ToolRegistry {
    private readonly logger: AppLogger = getAppLogger(ToolRegistry.name);

    constructor(@injectAll(TOOL_PROVIDERS) private readonly providers: ToolProvider[]) {}

    buildTools(ctx: ToolContext): StructuredToolInterface[] {
        const tools = this.providers.flatMap((provider) => provider.getTools(ctx));

        const names = new Set<string>();
        for (const { name } of tools) {
            if (names.has(name)) {
                this.logger.error(`Duplicate tool name "${name}"`);
                throw new Error(ErrorMessage.DUPLICATE_TOOL_NAME);
            }
            names.add(name);
        }

        return tools;
    }
}
