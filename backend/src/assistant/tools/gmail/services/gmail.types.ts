export type MessageSummary = {
    id: string;
    threadId: string;
    from: string;
    to: string;
    subject: string;
    date: string;
    snippet: string;
    unread: boolean;
};

export type MessageDetail = MessageSummary & {
    cc: string;
    replyTo: string;
    messageIdHeader: string;
    references: string;
    body: string;
    truncated: boolean;
};

export type CreatedDraft = { draftId: string; messageId: string };
