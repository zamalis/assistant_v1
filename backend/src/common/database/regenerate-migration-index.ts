import type { AppLogger } from '../logger';

const MIGRATIONS_DIR = './src/migrations';
const INDEX_FILE = `${MIGRATIONS_DIR}/index.ts`;

async function listMigrationFiles(): Promise<string[]> {
    const glob = new Bun.Glob('*.ts');
    const files: string[] = [];

    for await (const file of glob.scan(MIGRATIONS_DIR)) {
        if (file !== 'index.ts') {
            files.push(file);
        }
    }

    return files.sort((left, right) => Number(left.split('-')[0]) - Number(right.split('-')[0]));
}

async function extractClassName(fileName: string): Promise<string> {
    const content = await Bun.file(`${MIGRATIONS_DIR}/${fileName}`).text();
    const match = content.match(/export class (\w+) implements MigrationInterface/);

    if (!match) {
        throw new Error(`Could not find migration class in ${fileName}`);
    }

    return match[1];
}

export async function regenerateMigrationIndex(logger: AppLogger): Promise<void> {
    const files = await listMigrationFiles();
    const exports: string[] = [];

    for (const file of files) {
        const className = await extractClassName(file);
        const moduleName = file.replace(/\.ts$/, '');
        exports.push(`export { ${className} } from './${moduleName}';`);
    }

    await Bun.write(INDEX_FILE, exports.length > 0 ? `${exports.join('\n')}\n` : '');
    logger.info(`Updated ${INDEX_FILE}`);
}
