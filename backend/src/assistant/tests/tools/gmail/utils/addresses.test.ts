import { parseAddresses } from '../../../../tools/gmail/utils';

import { describe, expect, it } from 'bun:test';

describe('parseAddresses', () => {
    it('returns lowercased bare addresses, even when a display name contains a comma', () => {
        expect(parseAddresses('"Doe, Jane" <Jane@X.com>, bob@y.com')).toEqual(['jane@x.com', 'bob@y.com']);
    });

    it('returns an empty list for an empty header', () => {
        expect(parseAddresses('')).toEqual([]);
    });

    it('drops anything that is not a valid email address', () => {
        expect(parseAddresses('<a@x.com OR in:anywhere>')).toEqual([]);
        expect(parseAddresses('not an address, ok@x.com')).toEqual(['ok@x.com']);
    });

    it('reads the real address after a quoted display name that contains an address', () => {
        expect(parseAddresses('"Boss <boss@co.com>" <real@evil.com>')).toEqual(['real@evil.com']);
    });

    it('handles escaped quotes inside a display name', () => {
        expect(parseAddresses('"O\\"Brien, Pat" <p@x.com>, b@y.com')).toEqual(['p@x.com', 'b@y.com']);
    });
});
