import { execFile } from 'node:child_process';

const MAX_TIME_S = 30;
const MAX_BUFFER = 64 * 1024 * 1024;

let curlMissing = false;

export function parseCurlOutput(raw: Buffer): Response {
    let rest = raw;
    let status = 0;
    let headers = new Headers();
    while (rest.subarray(0, 5).toString('latin1') === 'HTTP/') {
        const end = rest.indexOf('\r\n\r\n');
        if (end === -1) break;
        const [statusLine, ...lines] = rest
            .subarray(0, end)
            .toString('latin1')
            .split('\r\n');
        status = Number(statusLine.split(' ')[1]);
        headers = new Headers();
        for (const line of lines) {
            const sep = line.indexOf(':');
            if (sep > 0) {
                headers.append(
                    line.slice(0, sep).trim(),
                    line.slice(sep + 1).trim(),
                );
            }
        }
        rest = rest.subarray(end + 4);
    }
    if (!status) throw new Error('curl returned no HTTP status line');
    const nullBody = status === 204 || status === 304;
    return new Response(nullBody ? null : new Uint8Array(rest), {
        status,
        headers,
    });
}

function toCurlArgs(url: string, init: RequestInit): string[] {
    const args = [
        '--silent',
        '--show-error',
        '--location',
        '--compressed',
        '--max-time',
        String(MAX_TIME_S),
        '--dump-header',
        '-',
        '--request',
        init.method ?? 'GET',
    ];
    for (const [name, value] of new Headers(init.headers)) {
        args.push('--header', `${name}: ${value}`);
    }
    if (init.body != null) args.push('--data-binary', '@-');
    args.push('--', url);
    return args;
}

// Workday's Cloudflare bot check challenges Node's fetch by client fingerprint but lets curl through.
export async function curlFetch(
    url: string,
    init: RequestInit = {},
): Promise<Response> {
    if (curlMissing) return fetch(url, init);
    if (init.body != null && typeof init.body !== 'string') {
        throw new Error('curlFetch only supports string bodies');
    }
    try {
        const stdout = await new Promise<Buffer>((resolve, reject) => {
            const child = execFile(
                'curl',
                toCurlArgs(url, init),
                { encoding: 'buffer', maxBuffer: MAX_BUFFER },
                (err, out, stderr) => {
                    if (err) {
                        const detail = stderr.toString().trim();
                        reject(
                            Object.assign(
                                new Error(
                                    `curl failed for ${url}: ${detail || err.message}`,
                                ),
                                { code: (err as NodeJS.ErrnoException).code },
                            ),
                        );
                    } else {
                        resolve(out);
                    }
                },
            );
            child.stdin?.end(init.body ?? undefined);
        });
        return parseCurlOutput(stdout);
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
            curlMissing = true;
            return fetch(url, init);
        }
        throw e;
    }
}
