export const MessageRole = {
    USER: 'user',
    ASSISTANT: 'assistant',
} as const;

export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];
