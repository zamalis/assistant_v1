import { z } from 'zod';

export const IdParamsSchema = z.object({
    id: z.uuid(),
});

export type IdParams = z.infer<typeof IdParamsSchema>;
