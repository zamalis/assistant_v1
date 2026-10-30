import { type Env, EnvSchema } from '../schemas';

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
    return EnvSchema.parse(source);
}
