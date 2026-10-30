import type { Env } from '../schemas';
import type { SendEmailInput } from './email.schema';

import Handlebars from 'handlebars';
import { htmlToText } from 'html-to-text';
import { createTransport, type Transporter } from 'nodemailer';
import { inject, injectable } from 'tsyringe';

import { Environment } from '../enums';
import { type AppLogger, getAppLogger } from '../logger';
import { ENV } from '../tokens';

interface EmailContent {
    html: string;
    text: string;
}

const SSL_PORT = 465;

@injectable()
export class EmailService {
    private readonly logger: AppLogger = getAppLogger(EmailService.name);
    private readonly transporter: Transporter;

    constructor(@inject(ENV) private readonly env: Env) {
        this.transporter = createTransport({
            host: this.env.EMAIL_HOST,
            port: this.env.EMAIL_PORT,
            secure: this.env.EMAIL_PORT === SSL_PORT,
            auth: {
                user: this.env.EMAIL_USERNAME,
                pass: this.env.EMAIL_PASSWORD,
            },
        });
    }

    async send(input: SendEmailInput): Promise<void> {
        this.logger.info(`Sending email to ${input.to} with subject "${input.subject}"`);

        if (!this.shouldSend()) {
            this.logger.info('Skipping email send because the environment is not production');
            return;
        }

        try {
            const { html, text } = this.renderTemplate(input.template, input.context);

            await this.transporter.sendMail({
                from: input.fromName ? `${input.fromName} <${input.from}>` : input.from,
                to: input.to,
                cc: input.cc,
                replyTo: input.replyTo,
                subject: input.subject,
                html,
                text,
            });

            this.logger.info(`Email sent successfully to ${input.to}`);
        } catch (error) {
            this.logger.error(error, `Failed to send email to ${input.to}`);
            throw error;
        }
    }

    private shouldSend(): boolean {
        return this.env.NODE_ENV === Environment.PRODUCTION;
    }

    private renderTemplate(template: string, context: Record<string, unknown> | undefined): EmailContent {
        const compiledTemplate = Handlebars.compile(template);
        const html = compiledTemplate(context);
        const text = htmlToText(html);
        return { html, text };
    }
}
