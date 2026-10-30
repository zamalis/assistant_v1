import { z } from 'zod';

export const SendEmailInputSchema = z.object({
    fromName: z.string().optional(),
    from: z.email(),
    to: z.email(),
    cc: z.array(z.email()).optional(),
    replyTo: z.email().optional(),
    subject: z.string().min(1),
    template: z.string().min(1),
    context: z.record(z.string(), z.unknown()).optional(),
});

export type SendEmailInput = z.infer<typeof SendEmailInputSchema>;
