/**
 * @filename: lint-staged.config.js
 * @type {import('lint-staged').Configuration}
 */
const lintStagedConfig = {
    '*': 'bunx biome check --staged --write --no-errors-on-unmatched --error-on-warnings',
};

export default lintStagedConfig;
