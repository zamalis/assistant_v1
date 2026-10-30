import { Hono } from 'hono';

export abstract class BaseRouter {
    protected readonly app: Hono;

    constructor(private readonly path: string) {
        this.app = new Hono();
    }

    getPath(): string {
        return this.path;
    }

    getApp(): Hono {
        return this.app;
    }

    protected abstract setupRoutes(): void;
}
