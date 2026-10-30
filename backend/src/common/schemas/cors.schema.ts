import { z } from 'zod';

import { HttpHeader, HttpMethod } from '../enums';

import { StringArraySchema } from './common.schema';

export const CorsAny = '*';
export const CorsAnySchema = z.literal(CorsAny);

export const CorsOptionEnvSchema = z
    .string()
    .default(CorsAny)
    .pipe(StringArraySchema)
    .transform((val) => {
        if (val.length === 1 && val[0] === CorsAny) {
            return CorsAny;
        }

        return val;
    });

export const CorsOriginSchema = z.union([CorsAnySchema, z.array(z.url())]);
export const CorsMethodsSchema = z.union([CorsAnySchema, z.array(z.enum(HttpMethod))]);
export const CorsAllowedHeadersSchema = z.union([CorsAnySchema, z.array(z.enum(HttpHeader))]);
