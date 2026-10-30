import type { CommandContext, CommandHandler } from './command.types';

import { injectable } from 'tsyringe';

import { UserRepository } from '../../common/repositories';
import { canonicalTimezone, toLocalDateTime } from '../tools/calendar';

function currentTime(timezone: string): string {
    return toLocalDateTime(new Date(), timezone).slice(11);
}

@injectable()
export class TimezoneCommand implements CommandHandler {
    public readonly name = 'timezone';
    public readonly description = 'Show or set your timezone (IANA name, e.g. Europe/Paris)';

    constructor(private readonly userRepository: UserRepository) {}

    public async handle({ user, args }: CommandContext): Promise<string> {
        const requested = args.trim();
        if (!requested) {
            if (!canonicalTimezone(user.timezone)) {
                return `Your stored timezone "${user.timezone}" is invalid. Set one with /timezone Area/City.`;
            }
            return `Your timezone is ${user.timezone} (now ${currentTime(user.timezone)}).`;
        }

        const timezone = canonicalTimezone(requested);
        if (!timezone) {
            return `Unknown timezone '${requested}'. Use an IANA name like Europe/Paris.`;
        }

        await this.userRepository.update({ id: user.id }, { timezone });
        return `Timezone set to ${timezone} (now ${currentTime(timezone)}).`;
    }
}
