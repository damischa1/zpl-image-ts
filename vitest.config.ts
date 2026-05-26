import {defineConfig} from 'vitest/config';
import {playwright} from '@vitest/browser-playwright';

export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: 'node',
                    include: ['test/**/*.test.ts'],
                    environment: 'node',
                },
            },
            {
                test: {
                    name: 'browser',
                    include: ['test/**/*.test.ts'],
                    browser: {
                        enabled: true,
                        provider: playwright(),
                        headless: true,
                        screenshotFailures: false,
                        instances: [{browser: 'chromium'}],
                    },
                },
            },
        ],
    },
});
