import { z } from 'zod';

export const IdSchema = z.uuid();
export const StringArraySchema = z.string().transform((value) =>
    value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
);
