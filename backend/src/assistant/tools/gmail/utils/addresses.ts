import addressparser from 'nodemailer/lib/addressparser';
import { z } from 'zod';

const EmailSchema = z.email();

/** Bare lowercased addresses from a To/Cc/From header; display names are ignored, invalid addresses dropped. */
export function parseAddresses(header: string): string[] {
    return addressparser(header, { flatten: true })
        .map(({ address }) => address.trim().toLowerCase())
        .filter((address) => EmailSchema.safeParse(address).success);
}
