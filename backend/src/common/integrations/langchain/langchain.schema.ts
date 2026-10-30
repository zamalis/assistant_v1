import { z } from 'zod';

import { LlmModel } from '../../enums';

export const ChatTurnRoleSchema = z.enum(['user', 'assistant']);

export const ToolCallDigestSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    args: z.record(z.string(), z.unknown()),
    digest: z.json(),
});

export const ChatTurnSchema = z.object({
    role: ChatTurnRoleSchema,
    content: z.string().min(1),
    toolCalls: z.array(ToolCallDigestSchema).optional(),
});

export const AgentResultSchema = z.object({
    text: z.string(),
    toolCalls: z.array(ToolCallDigestSchema),
});

export const LlmInputSchema = z.object({
    model: z.enum(LlmModel).optional(),
    systemPrompt: z.string().optional(),
    messages: z.array(ChatTurnSchema).min(1),
});

export type ToolCallDigest = z.infer<typeof ToolCallDigestSchema>;
export type AgentResult = z.infer<typeof AgentResultSchema>;
export type ChatTurn = z.infer<typeof ChatTurnSchema>;
export type LlmInput = z.infer<typeof LlmInputSchema>;
