import type { OAuth2Client } from 'google-auth-library';

import { gmail, type gmail_v1 } from '@googleapis/gmail';
import { injectable } from 'tsyringe';

@injectable()
export class GmailApiFactory {
    create(auth: OAuth2Client): gmail_v1.Gmail {
        return gmail({ version: 'v1', auth });
    }
}
