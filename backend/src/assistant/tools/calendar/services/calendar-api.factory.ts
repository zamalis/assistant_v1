import type { OAuth2Client } from 'google-auth-library';

import { calendar, type calendar_v3 } from '@googleapis/calendar';
import { injectable } from 'tsyringe';

@injectable()
export class CalendarApiFactory {
    create(auth: OAuth2Client): calendar_v3.Calendar {
        return calendar({ version: 'v3', auth });
    }
}
