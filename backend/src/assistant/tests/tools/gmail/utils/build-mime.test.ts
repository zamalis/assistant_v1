import { buildMime, type MimeInput, replySubject } from '../../../../tools/gmail/utils';

import { describe, expect, it } from 'bun:test';

function input(overrides: Partial<MimeInput> = {}): MimeInput {
    return { to: ['a@x.com'], cc: [], subject: 'Hello', body: 'Body text', ...overrides };
}

function decode(raw: string): { headers: string; body: string } {
    const message = Buffer.from(raw, 'base64url').toString('utf8');
    const [headers = '', body = ''] = message.split('\r\n\r\n');
    const isBase64 = /Content-Transfer-Encoding: base64/i.test(headers);
    return { headers, body: isBase64 ? Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8') : body };
}

function decodeEncodedWords(value: string): string {
    return value
        .replace(/\r\n /g, '')
        .replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, data: string) => Buffer.from(data, 'base64').toString('utf8'));
}

describe('buildMime', () => {
    it('writes the standard headers and the body', async () => {
        const { headers, body } = decode(await buildMime(input({ cc: ['c@x.com'] })));

        expect(headers).toContain('To: a@x.com');
        expect(headers).toContain('Cc: c@x.com');
        expect(headers).toContain('Subject: Hello');
        expect(headers).toMatch(/Content-Type: text\/plain; charset=utf-8/i);
        expect(headers).toContain('MIME-Version: 1.0');
        expect(body.trim()).toBe('Body text');
    });

    it('omits Cc, In-Reply-To and References unless given', async () => {
        const { headers } = decode(await buildMime(input()));

        expect(headers).not.toContain('Cc:');
        expect(headers).not.toContain('In-Reply-To:');
        expect(headers).not.toContain('References:');
    });

    it('includes In-Reply-To and References when given', async () => {
        const { headers } = decode(
            await buildMime(input({ inReplyTo: '<m1@x.com>', references: '<m0@x.com> <m1@x.com>' }))
        );

        expect(headers).toContain('In-Reply-To: <m1@x.com>');
        expect(headers).toContain('References: <m0@x.com> <m1@x.com>');
    });

    it('encodes a non-ASCII subject as UTF-8 base64 words that decode back', async () => {
        const { headers } = decode(await buildMime(input({ subject: 'مرحبا 👋' })));

        const subjectLine = headers.split('\r\n').find((line) => line.startsWith('Subject:')) ?? '';
        expect(subjectLine).toMatch(/^Subject: =\?UTF-8\?B\?/);
        expect(
            decodeEncodedWords(headers.slice(headers.indexOf('Subject: ') + 9).split('\r\nMIME')[0] ?? '')
        ).toContain('مرحبا 👋');
    });

    it('keeps every header line short for a long non-ASCII subject', async () => {
        const subject = 'م'.repeat(250);
        const { headers } = decode(await buildMime(input({ subject })));

        for (const line of headers.split('\r\n')) {
            expect(line.length).toBeLessThanOrEqual(78);
        }
        const folded = headers.slice(headers.indexOf('Subject: ') + 9);
        expect(decodeEncodedWords(folded.split('\r\nMIME')[0] ?? '').replace(/\r\n/g, '')).toContain(subject);
    });

    it('keeps non-ASCII body characters, base64-encoded', async () => {
        const { headers, body } = decode(await buildMime(input({ body: 'مرحبا & 👋' })));

        expect(headers).toContain('Content-Transfer-Encoding: base64');
        expect(body).toBe('مرحبا & 👋');
    });

    it('replaces line breaks in the subject so headers cannot be injected', async () => {
        const { headers } = decode(await buildMime(input({ subject: 'Hi\r\nBcc: evil@x.com' })));

        expect(headers).not.toContain('\r\nBcc:');
    });

    it('returns base64url', async () => {
        expect(await buildMime(input({ body: '??>>~~ ÿ'.repeat(20) }))).toMatch(/^[A-Za-z0-9_-]+$/);
    });
});

describe('replySubject', () => {
    it('adds a single Re: prefix, case-insensitively', () => {
        expect(replySubject('Invoice')).toBe('Re: Invoice');
        expect(replySubject('RE: Invoice')).toBe('RE: Invoice');
        expect(replySubject('re: Invoice')).toBe('re: Invoice');
        expect(replySubject('Re: Re: Invoice')).toBe('Re: Re: Invoice');
    });
});
