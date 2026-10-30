export type CreateReminderInput = {
    title: string;
    notes?: string;
    startLocal: string;
    endLocal: string;
    timezone: string;
    recurrence: string | null;
};

export type CreatedReminder = { eventId: string; start: string };

export type ReminderSummary = { eventId: string; title: string; start: string; recurrence: string[] | null };
