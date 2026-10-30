import type { z } from 'zod';

import { type StructuredToolInterface, tool } from '@langchain/core/tools';

import { getAppLogger } from '../../../logger';

interface ToolDefinition<Schema extends z.ZodObject, Result> {
    name: string;
    description: string;
    schema: Schema;
    run: (args: z.infer<Schema>) => Result | Promise<Result>;
    digest: (args: z.infer<Schema>, result: Result) => z.core.util.JSONType | null;
}

// run() may have side effects, so a failure after it must not surface as a failed tool call.
function stringifyResult(toolName: string, result: unknown): string {
    if (typeof result === 'string') {
        return result;
    }

    try {
        return JSON.stringify(result);
    } catch (error) {
        getAppLogger('defineTool').error({ err: error, toolName }, 'Could not stringify tool result');
        return String(result);
    }
}

function safeDigest<Schema extends z.ZodObject, Result>(
    definition: ToolDefinition<Schema, Result>,
    args: z.infer<Schema>,
    result: Result
): z.core.util.JSONType | null {
    try {
        return definition.digest(args, result);
    } catch (error) {
        getAppLogger('defineTool').error({ err: error, toolName: definition.name }, 'Tool digest failed');
        return null;
    }
}

export function defineTool<Schema extends z.ZodObject, Result>(
    definition: ToolDefinition<Schema, Result>
): StructuredToolInterface {
    return tool(
        async (args: z.infer<Schema>) => {
            const result = await definition.run(args);
            return [stringifyResult(definition.name, result), safeDigest(definition, args, result)];
        },
        {
            name: definition.name,
            description: definition.description,
            schema: definition.schema,
            responseFormat: 'content_and_artifact',
        }
    ) as unknown as StructuredToolInterface;
}
