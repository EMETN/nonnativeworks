import { defineConfig } from 'astro/config';
import { liveStaticPathsInDev } from '../../../scripts/live-static-paths-in-dev.mjs';

export default defineConfig({
    vite: { plugins: [liveStaticPathsInDev()] },
});
