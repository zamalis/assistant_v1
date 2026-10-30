const COMMAND_PATTERN = /^\/([A-Za-z0-9_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/;

export type ParsedIncomingText = { kind: 'text'; text: string } | { kind: 'command'; command: string; args: string };

export function parseIncomingText(text: string): ParsedIncomingText {
    const match = COMMAND_PATTERN.exec(text);
    if (!match?.[1]) {
        return { kind: 'text', text };
    }

    return { kind: 'command', command: match[1].toLowerCase(), args: (match[2] ?? '').trim() };
}
