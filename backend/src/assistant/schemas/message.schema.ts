import { z } from 'zod';

export const SendChatMessageBodySchema = z.object({
    content: z.string().min(1),
});

export type SendChatMessageBody = z.infer<typeof SendChatMessageBodySchema>;

export const ChatReplySchema = z.object({
    reply: z.string().min(1),
});

export const ChatResetResponseSchema = z.object({
    ok: z.literal(true),
});
