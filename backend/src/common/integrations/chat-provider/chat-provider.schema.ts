import { z } from 'zod';

const ProviderIncomingBaseSchema = z.object({
    providerUserId: z.string(),
    chatId: z.string(),
});

export const ProviderIncomingSchema = z.discriminatedUnion('kind', [
    ProviderIncomingBaseSchema.extend({ kind: z.literal('text'), text: z.string() }),
    ProviderIncomingBaseSchema.extend({ kind: z.literal('command'), command: z.string(), args: z.string() }),
]);

export const ProviderOutgoingSchema = z.object({
    reply: z.string().nullable(),
});

export type MessageFormat = 'plain' | 'html' | 'markdown';

export interface SendMessageOptions {
    format?: MessageFormat;
}

export interface OutgoingMessage {
    text: string;
    format: MessageFormat;
    onDelivered?: () => Promise<void>;
}

export type ProviderIncoming = z.infer<typeof ProviderIncomingSchema>;
export type ProviderOutgoing = z.infer<typeof ProviderOutgoingSchema>;
export type IncomingMessageHandler = (incoming: ProviderIncoming) => Promise<void>;
