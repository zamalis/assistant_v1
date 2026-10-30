import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const decodeEncryptionKey = (base64: string): Buffer => {
    const key = Buffer.from(base64, 'base64');

    if (key.length !== KEY_BYTES) {
        throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes');
    }

    return key;
};

export const encrypt = (plain: string, key: Buffer): string => {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
};

export const decrypt = (payload: string, key: Buffer): string => {
    const parts = payload.split(':');

    if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new Error('Unsupported secret payload format');
    }

    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ciphertext = Buffer.from(parts[3], 'base64');

    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
        throw new Error('Malformed secret payload');
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};
