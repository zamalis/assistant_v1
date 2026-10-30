import { buildDraftPreview, type DraftPreviewInput, type RecipientCheck } from '../../../../tools/gmail/utils';

import { describe, expect, it } from 'bun:test';

const LAST_LINE = 'Send /send to send it, or tell me what to change.';

function input(overrides: Partial<DraftPreviewInput> = {}): DraftPreviewInput {
    return { to: ['a@x.com'], cc: [], subject: 'Hello', body: 'Body text', ...overrides };
}

const known: RecipientCheck[] = [{ address: 'a@x.com', status: 'known' }];

describe('buildDraftPreview', () => {
    it('has the To line, an expandable body and the closing instruction', () => {
        const preview = buildDraftPreview(input(), known);

        expect(preview).toContain('<b>To:</b> a@x.com');
        expect(preview).toContain('<blockquote expandable>');
        expect(preview.endsWith(LAST_LINE)).toBe(true);
    });

    it('escapes html in the subject', () => {
        const preview = buildDraftPreview(input({ subject: '<script>x</script>' }), known);

        expect(preview).toContain('&lt;script&gt;');
        expect(preview).not.toContain('<script>');
    });

    it('keeps non-ASCII characters while escaping html', () => {
        expect(buildDraftPreview(input({ body: 'مرحبا & 👋' }), known)).toContain('مرحبا &amp; 👋');
    });

    it('flags first-time and unchecked recipients', () => {
        const first = buildDraftPreview(input(), [{ address: 'a@x.com', status: 'first_time' }]);
        const unknown = buildDraftPreview(input(), [{ address: 'a@x.com', status: 'unknown' }]);

        expect(first).toContain('⚠️ first time emailing a@x.com');
        expect(unknown).toContain("⚠️ couldn't check history for a@x.com");
        expect(buildDraftPreview(input(), known)).not.toContain('⚠️');
    });

    it('shows what the draft replies to', () => {
        const preview = buildDraftPreview(
            input({
                inReplyTo: { subject: 'Invoice', from: 'Alice <a@x.com>', date: 'Mon, 27 Oct 2026 10:00:00 +0000' },
            }),
            known
        );

        expect(preview).toContain('In reply to: "Invoice" (Alice, Oct 27)');
    });

    it('cuts a long body at 3000 chars and says how much is missing', () => {
        const preview = buildDraftPreview(input({ body: 'a'.repeat(10000) }), known);

        expect(preview).toContain(`${'a'.repeat(3000)}… (7000 more characters, open in Gmail to see all)`);
        expect(preview).not.toContain('a'.repeat(3001));
    });

    it('stays within the Telegram limit in the worst case', () => {
        const to = Array.from({ length: 20 }, (_, i) => `recipient${i}@example.com`);
        const checks = to.map((address): RecipientCheck => ({ address, status: 'first_time' }));

        const preview = buildDraftPreview(input({ to, subject: 's'.repeat(250), body: '&'.repeat(20000) }), checks);

        expect(preview.length).toBeLessThanOrEqual(4096);
        expect(preview.endsWith(LAST_LINE)).toBe(true);
    });

    it('shortens a very long subject and reply header so the preview still fits', () => {
        const preview = buildDraftPreview(
            input({
                subject: '&'.repeat(2000),
                inReplyTo: { subject: '&'.repeat(2000), from: `${'&'.repeat(2000)} <a@x.com>`, date: '' },
            }),
            known
        );

        expect(preview.length).toBeLessThanOrEqual(4096);
        expect(preview.endsWith(LAST_LINE)).toBe(true);
        expect(preview).toContain('…');
    });

    it('refuses to build a preview that cannot show every recipient within the limit', () => {
        const to = Array.from({ length: 40 }, (_, i) => `${'a'.repeat(240)}${i}@example.com`);

        expect(() => buildDraftPreview(input({ to }), [])).toThrow('Draft preview is too long');
    });
});
