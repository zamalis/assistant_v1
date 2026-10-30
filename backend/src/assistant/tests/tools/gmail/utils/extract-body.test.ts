import type { gmail_v1 } from '@googleapis/gmail';

import { extractBody } from '../../../../tools/gmail/utils';

import { describe, expect, it } from 'bun:test';

function encode(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
}

function part(mimeType: string, content?: string, parts?: gmail_v1.Schema$MessagePart[]): gmail_v1.Schema$MessagePart {
    return { mimeType, body: content === undefined ? {} : { data: encode(content) }, parts };
}

describe('extractBody', () => {
    it('prefers text/plain in multipart/alternative', () => {
        const payload = part('multipart/alternative', undefined, [
            part('text/html', '<p>html version</p>'),
            part('text/plain', 'plain version'),
        ]);

        expect(extractBody(payload, 1000)).toEqual({ text: 'plain version', truncated: false });
    });

    it('converts text/html to text, keeping links and skipping images', () => {
        const payload = part(
            'text/html',
            '<p>Hi <a href="https://x.y">link</a></p><img src="https://x.y/p.png" alt="pic">'
        );

        const { text } = extractBody(payload, 1000);

        expect(text).toContain('https://x.y');
        expect(text).not.toContain('img');
        expect(text).not.toContain('p.png');
    });

    it('finds text in nested multipart/mixed then alternative', () => {
        const payload = part('multipart/mixed', undefined, [
            part('multipart/alternative', undefined, [part('text/plain', 'nested body')]),
            { mimeType: 'application/pdf', filename: 'a.pdf', body: { attachmentId: 'att1' } },
        ]);

        expect(extractBody(payload, 1000).text).toBe('nested body');
    });

    it('decodes base64url with - and _ characters', () => {
        const content = 'x>>>???~~~ ÿÿÿ';
        expect(encode(content)).toMatch(/[-_]/);

        expect(extractBody(part('text/plain', content), 1000).text).toBe('x>>>???~~~ ÿÿÿ');
    });

    it('strips the quoted reply and drops > lines', () => {
        const content = [
            'Sounds good.',
            '> earlier line',
            'Thanks',
            '',
            'On Mon, Oct 27, 2026 at 10:00 Alice <a@x.com> wrote:',
            '> original message',
            'more quoted stuff',
        ].join('\n');

        expect(extractBody(part('text/plain', content), 1000).text).toBe('Sounds good.\nThanks');
    });

    it('truncates to the cap and marks it', () => {
        const result = extractBody(part('text/plain', 'a'.repeat(50)), 10);

        expect(result.truncated).toBe(true);
        expect(result.text).toBe(`${'a'.repeat(10)} (truncated)`);
    });

    it('returns a placeholder when there is no text part', () => {
        const attachmentOnly = part('multipart/mixed', undefined, [
            { mimeType: 'application/pdf', filename: 'a.pdf', body: { attachmentId: 'att1' } },
        ]);

        expect(extractBody(attachmentOnly, 1000)).toEqual({ text: '(no text content)', truncated: false });
        expect(extractBody(part('text/plain', '  \n'), 1000)).toEqual({ text: '(no text content)', truncated: false });
        expect(extractBody(undefined, 1000)).toEqual({ text: '(no text content)', truncated: false });
    });
});
