import { escapeHtml } from './escape-html';

const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;
const PREVIEW_BODY_MAX_LENGTH = 3000;
const SUBJECT_PREVIEW_MAX_LENGTH = 250;
const REPLY_FIELD_PREVIEW_MAX_LENGTH = 100;
const CLOSING_LINE = 'Send /send to send it, or tell me what to change.';

export type RecipientCheck = { address: string; status: 'known' | 'first_time' | 'unknown' };

export type DraftPreviewInput = {
    to: string[];
    cc: string[];
    subject: string;
    body: string;
    inReplyTo?: { subject: string; from: string; date: string };
};

function shorten(value: string, maxLength: number): string {
    return value.length > maxLength ? `${cutBody(value, maxLength - 1)}…` : value;
}

function senderName(from: string): string {
    const name = /^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/.exec(from)?.[1]?.trim();
    return name || from.trim();
}

function shortDate(date: string): string | null {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function describeReply(inReplyTo: NonNullable<DraftPreviewInput['inReplyTo']>): string {
    const date = shortDate(inReplyTo.date);
    const who = shorten([senderName(inReplyTo.from), date].filter(Boolean).join(', '), REPLY_FIELD_PREVIEW_MAX_LENGTH);
    const subject = shorten(inReplyTo.subject, REPLY_FIELD_PREVIEW_MAX_LENGTH);
    return `In reply to: "${escapeHtml(subject)}" (${escapeHtml(who)})`;
}

function describeFlag(check: RecipientCheck): string | null {
    const address = escapeHtml(check.address);
    if (check.status === 'first_time') {
        return `⚠️ first time emailing ${address}`;
    }
    if (check.status === 'unknown') {
        return `⚠️ couldn't check history for ${address}`;
    }
    return null;
}

function cutBody(body: string, length: number): string {
    const last = body.charCodeAt(length - 1);
    const safeLength = last >= 0xd800 && last <= 0xdbff ? length - 1 : length;
    return body.slice(0, safeLength);
}

export function buildDraftPreview(input: DraftPreviewInput, checks: RecipientCheck[]): string {
    const header = [`<b>To:</b> ${escapeHtml(input.to.join(', '))}`];
    if (input.cc.length > 0) {
        header.push(`<b>Cc:</b> ${escapeHtml(input.cc.join(', '))}`);
    }
    header.push(`<b>Subject:</b> ${escapeHtml(shorten(input.subject, SUBJECT_PREVIEW_MAX_LENGTH))}`);
    if (input.inReplyTo) {
        header.push(describeReply(input.inReplyTo));
    }
    for (const check of checks) {
        const flag = describeFlag(check);
        if (flag) {
            header.push(flag);
        }
    }

    const assemble = (length: number): string => {
        const shown = cutBody(input.body, length);
        const missing = input.body.length - shown.length;
        const notice = missing > 0 ? `… (${missing} more characters, open in Gmail to see all)` : '';
        return [...header, `<blockquote expandable>${escapeHtml(shown)}${notice}</blockquote>`, CLOSING_LINE].join(
            '\n'
        );
    };

    // Escaping lengthens the text, so shrink the body slice until the whole message fits.
    let low = 0;
    let high = Math.min(input.body.length, PREVIEW_BODY_MAX_LENGTH);
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (assemble(mid).length <= TELEGRAM_MESSAGE_MAX_LENGTH) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    const preview = assemble(low);
    if (preview.length > TELEGRAM_MESSAGE_MAX_LENGTH) {
        // Recipients are never abbreviated, so a header that cannot fit means the draft cannot be reviewed here.
        throw new Error('Draft preview is too long to show every recipient');
    }
    return preview;
}
