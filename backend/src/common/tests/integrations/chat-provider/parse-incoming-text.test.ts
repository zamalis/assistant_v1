import { parseIncomingText } from '../../../integrations/chat-provider/parse-incoming-text';

import { describe, expect, it } from 'bun:test';

describe('parseIncomingText', () => {
    it('parses a bare command', () => {
        expect(parseIncomingText('/connect')).toEqual({ kind: 'command', command: 'connect', args: '' });
    });

    it('strips the bot mention and keeps args', () => {
        expect(parseIncomingText('/Connect@TempoBot foo bar')).toEqual({
            kind: 'command',
            command: 'connect',
            args: 'foo bar',
        });
    });

    it('lowercases the command name', () => {
        expect(parseIncomingText('/RESET')).toEqual({ kind: 'command', command: 'reset', args: '' });
    });

    it('treats a newline as the args separator', () => {
        expect(parseIncomingText('/reset\nmore')).toEqual({ kind: 'command', command: 'reset', args: 'more' });
    });

    it.each(['hello', 'hi /connect', '/'])('treats %p as plain text', (text) => {
        expect(parseIncomingText(text)).toEqual({ kind: 'text', text });
    });
});
