import { spawn } from 'node:child_process';

const PORT = 4399; // deliberately not 4321, so a running dev server is untouched

/**
 * Boots the built Node-adapter server on an isolated port and resolves once it
 * answers. Callers must await stop() — it kills only this child's PID.
 */
export async function startServer(): Promise<{
    baseUrl: string;
    stop: () => Promise<void>;
}> {
    const child = spawn('node', ['dist/server/entry.mjs'], {
        env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT) },
        stdio: 'ignore',
    });

    const baseUrl = `http://127.0.0.1:${PORT}`;

    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            await fetch(baseUrl, { signal: AbortSignal.timeout(1000) });
            return {
                baseUrl,
                stop: () =>
                    new Promise<void>((resolve) => {
                        child.once('exit', () => resolve());
                        child.kill('SIGTERM');
                    }),
            };
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }

    child.kill('SIGTERM');
    throw new Error(`Server did not become ready on ${baseUrl}`);
}
