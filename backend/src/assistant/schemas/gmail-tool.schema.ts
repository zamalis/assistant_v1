import { z } from 'zod';

const SEARCH_DEFAULT_RESULTS = 10;
const SEARCH_MAX_RESULTS = 20;
const SEARCH_QUERY_MAX_LENGTH = 500;
const SUBJECT_MAX_LENGTH = 250;
const DRAFT_BODY_MAX_LENGTH = 20_000;

export const GMAIL_MAX_RECIPIENTS = 20;

export const GmailSearchSchema = z.object({
    query: z
        .string()
        .min(1)
        .max(SEARCH_QUERY_MAX_LENGTH)
        .describe('Gmail search query, e.g. "from:alice newer_than:7d"'),
    maxResults: z.number().int().min(1).max(SEARCH_MAX_RESULTS).default(SEARCH_DEFAULT_RESULTS),
});

export const GmailReadSchema = z.object({
    messageId: z.string().min(1).describe('Message id from gmail_search'),
    includeThread: z.boolean().default(false).describe('Also read the earlier messages of the thread'),
});

export const GmailCreateDraftSchema = z
    .object({
        replyToMessageId: z.string().min(1).optional().describe('Reply to this message id (reply mode)'),
        to: z.array(z.email()).min(1).max(GMAIL_MAX_RECIPIENTS).optional().describe('Recipients (new email mode)'),
        cc: z.array(z.email()).max(GMAIL_MAX_RECIPIENTS).optional(),
        subject: z.string().min(1).max(SUBJECT_MAX_LENGTH).optional().describe('Subject (new email mode)'),
        body: z.string().min(1).max(DRAFT_BODY_MAX_LENGTH),
    })
    .superRefine((value, ctx) => {
        if (Boolean(value.replyToMessageId) === Boolean(value.to)) {
            ctx.addIssue({ code: 'custom', message: 'Provide either replyToMessageId or to, not both or neither' });
        }
        if (value.to && !value.subject) {
            ctx.addIssue({ code: 'custom', path: ['subject'], message: 'subject is required with to' });
        }
    });

export type GmailSearchArgs = z.infer<typeof GmailSearchSchema>;
export type GmailReadArgs = z.infer<typeof GmailReadSchema>;
export type GmailCreateDraftArgs = z.infer<typeof GmailCreateDraftSchema>;
