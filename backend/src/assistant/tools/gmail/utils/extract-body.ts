import type { gmail_v1 } from '@googleapis/gmail';

import { htmlToText } from 'html-to-text';

const NO_TEXT = '(no text content)';
const QUOTE_INTRO = /^On .+ wrote:\s*$/;

type Part = gmail_v1.Schema$MessagePart;

function findPart(part: Part | undefined, mimeType: string): string | null {
    if (!part) {
        return null;
    }
    if (part.mimeType === mimeType && part.body?.data) {
        return Buffer.from(part.body.data, 'base64url').toString('utf8');
    }
    for (const child of part.parts ?? []) {
        const found = findPart(child, mimeType);
        if (found !== null) {
            return found;
        }
    }
    return null;
}

function stripQuotedReply(text: string): string {
    const kept: string[] = [];
    for (const line of text.split(/\r?\n/)) {
        if (QUOTE_INTRO.test(line.trim())) {
            break;
        }
        if (!line.startsWith('>')) {
            kept.push(line);
        }
    }
    return kept.join('\n').trim();
}

export function extractBody(payload: Part | undefined, maxChars: number): { text: string; truncated: boolean } {
    const plain = findPart(payload, 'text/plain');
    const html = plain === null ? findPart(payload, 'text/html') : null;
    const raw = plain ?? (html === null ? '' : htmlToText(html, { selectors: [{ selector: 'img', format: 'skip' }] }));

    const text = stripQuotedReply(raw);
    if (!text) {
        return { text: NO_TEXT, truncated: false };
    }
    if (text.length > maxChars) {
        return { text: `${text.slice(0, maxChars)} (truncated)`, truncated: true };
    }
    return { text, truncated: false };
}
