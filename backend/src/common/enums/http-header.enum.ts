export const HttpHeader = {
    CONTENT_TYPE: 'Content-Type',
    AUTHORIZATION: 'Authorization',
} as const;

export type HttpHeader = (typeof HttpHeader)[keyof typeof HttpHeader];
