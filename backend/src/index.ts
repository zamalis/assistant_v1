import 'reflect-metadata';

import { container } from 'tsyringe';

import { AssistantService } from './assistant/services';
import { bootstrap } from './bootstrap';
import { createServer } from './server';

async function main(): Promise<void> {
    const { env, logger, dataSource } = await bootstrap();

    const app = createServer();
    const server = Bun.serve({ port: env.PORT, fetch: app.fetch });

    logger.info(`Listening on http://localhost:${server.port}`);

    const assistantService = container.resolve(AssistantService);
    await assistantService.start();

    const shutdown = async (signal: string): Promise<void> => {
        logger.info(`Received ${signal}, shutting down gracefully`);
        await assistantService.stop();
        server.stop();
        if (dataSource.isInitialized) {
            await dataSource.destroy();
        }
        process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
    console.error('Fatal error during startup', error);
    process.exit(1);
});
