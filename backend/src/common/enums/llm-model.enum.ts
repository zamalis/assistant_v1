export const LlmModel = {
    GPT_4O: 'gpt-4o',
} as const;

export type LlmModel = (typeof LlmModel)[keyof typeof LlmModel];
