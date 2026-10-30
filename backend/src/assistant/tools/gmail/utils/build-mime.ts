import MailComposer from 'nodemailer/lib/mail-composer';

export type MimeInput = {
    to: string[];
    cc: string[];
    subject: string;
    body: string;
    inReplyTo?: string;
    references?: string;
};

export function replySubject(original: string): string {
    return /^re:/i.test(original.trim()) ? original : `Re: ${original}`;
}

/** Builds the raw message Gmail's drafts.create expects, as base64url. */
export async function buildMime(input: MimeInput): Promise<string> {
    const message = new MailComposer({
        to: input.to,
        cc: input.cc.length > 0 ? input.cc : undefined,
        subject: input.subject,
        text: input.body,
        textEncoding: 'base64',
        inReplyTo: input.inReplyTo,
        references: input.references,
    });

    const raw = await message.compile().build();
    return raw.toString('base64url');
}
