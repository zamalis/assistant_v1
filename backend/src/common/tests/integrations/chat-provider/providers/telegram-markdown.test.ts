import { markdownToTelegramHtml } from '../../../../integrations/chat-provider/providers/telegram-markdown';

import { describe, expect, it } from 'bun:test';

const LIMIT = 4096;

function convert(markdown: string): string {
    const chunks = markdownToTelegramHtml(markdown, LIMIT);
    expect(chunks).toHaveLength(1);
    return chunks[0] ?? '';
}

describe('markdownToTelegramHtml', () => {
    it('converts bold, italic, strikethrough and inline code', () => {
        expect(convert('**From:** a *b* ~~c~~ `d`')).toBe('<b>From:</b> a <i>b</i> <s>c</s> <code>d</code>');
    });

    it('escapes HTML before formatting, including inside code', () => {
        expect(convert('Google <no-reply@google.com> & `<b>`')).toBe(
            'Google &lt;no-reply@google.com&gt; &amp; <code>&lt;b&gt;</code>'
        );
    });

    it('turns bullets into dots and headings into bold lines', () => {
        expect(convert('## Inbox\n- one\n  * two\n1. three')).toBe('<b>Inbox</b>\n• one\n  • two\n1. three');
    });

    it('keeps link targets visible instead of hiding them behind text', () => {
        expect(convert('[docs](https://example.com/a?x=1&y=2)')).toBe('docs (https://example.com/a?x=1&amp;y=2)');
    });

    it('leaves snake_case, lone asterisks and arithmetic untouched', () => {
        expect(convert('user_id and 2 * 3 * 4')).toBe('user_id and 2 * 3 * 4');
    });

    it('never produces crossing tags for overlapping markers', () => {
        expect(convert('**a *b** c*')).toBe('<b>a *b</b> c*');
    });

    it('wraps fenced code blocks in pre without formatting them', () => {
        expect(convert('```ts\nconst **x** = 1 < 2;\n```')).toBe('<pre>const **x** = 1 &lt; 2;</pre>');
    });

    it('splits on line boundaries so every chunk fits the limit', () => {
        const markdown = Array.from({ length: 50 }, (_, i) => `line ${i} ${'y'.repeat(100)}`).join('\n');

        const chunks = markdownToTelegramHtml(markdown, 1000);

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((chunk) => chunk.length <= 1000)).toBe(true);
        expect(chunks.join('\n')).toBe(markdown);
    });

    it('splits a single oversized line, even when escaping inflates it', () => {
        const chunks = markdownToTelegramHtml('&'.repeat(5000), LIMIT);

        expect(chunks.every((chunk) => chunk.length <= LIMIT)).toBe(true);
        expect(chunks.join('').replaceAll('\n', '')).toBe('&amp;'.repeat(5000));
    });

    it('returns no chunks for blank input', () => {
        expect(markdownToTelegramHtml('  \n ', LIMIT)).toEqual([]);
    });
});
