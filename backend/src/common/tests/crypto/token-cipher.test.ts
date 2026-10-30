import { randomBytes } from 'node:crypto';

import { decodeEncryptionKey, decrypt, encrypt } from '../../crypto';

import { describe, expect, it } from 'bun:test';

const flipChar = (part: string): string => `${part[0] === 'A' ? 'B' : 'A'}${part.slice(1)}`;

describe('token cipher', () => {
    const key = randomBytes(32);

    it('round-trips plaintext', () => {
        expect(decrypt(encrypt('refresh-123', key), key)).toBe('refresh-123');
    });

    it('uses a fresh IV per call', () => {
        const first = encrypt('refresh-123', key);
        const second = encrypt('refresh-123', key);

        expect(first).not.toBe(second);
        expect(first.startsWith('v1:')).toBe(true);
        expect(second.startsWith('v1:')).toBe(true);
    });

    it('rejects tampered ciphertext', () => {
        const [version, iv, tag, ciphertext] = encrypt('refresh-123', key).split(':');
        const tampered = [version, iv, tag, flipChar(ciphertext as string)].join(':');

        expect(() => decrypt(tampered, key)).toThrow();
    });

    it('rejects tampered tag', () => {
        const [version, iv, tag, ciphertext] = encrypt('refresh-123', key).split(':');
        const tampered = [version, iv, flipChar(tag as string), ciphertext].join(':');

        expect(() => decrypt(tampered, key)).toThrow();
    });

    it('rejects a wrong key', () => {
        expect(() => decrypt(encrypt('refresh-123', key), randomBytes(32))).toThrow();
    });

    it('rejects malformed or unknown-version payloads', () => {
        expect(() => decrypt('garbage', key)).toThrow();
        expect(() => decrypt('v2:a:b:c', key)).toThrow();
    });

    it('decodeEncryptionKey rejects non-32-byte keys', () => {
        expect(() => decodeEncryptionKey(randomBytes(16).toString('base64'))).toThrow();
    });

    it('decodeEncryptionKey returns the 32-byte key', () => {
        expect(decodeEncryptionKey(key.toString('base64')).equals(key)).toBe(true);
    });
});
