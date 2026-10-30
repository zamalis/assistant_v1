export const HttpMethod = {
    GET: 'GET',
    HEAD: 'HEAD',
    PUT: 'PUT',
    PATCH: 'PATCH',
    POST: 'POST',
    DELETE: 'DELETE',
    OPTIONS: 'OPTIONS',
} as const;

export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];
