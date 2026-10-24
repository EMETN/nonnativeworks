import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const MAX_REDIRECTS = 5;

const blocked = new BlockList();
for (const [net, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
    ['224.0.0.0', 3],
] as const) {
    blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
    ['::', 128],
    ['::1', 128],
    ['fc00::', 7],
    ['fe80::', 10],
    ['ff00::', 8],
] as const) {
    blocked.addSubnet(net, prefix, 'ipv6');
}

function isBlockedAddress(address: string): boolean {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    return blocked.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');
}

async function assertPublicUrl(url: URL): Promise<void> {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`Refusing non-HTTP URL ${url.href}`);
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host)
        ? [host]
        : (await lookup(host, { all: true })).map((a) => a.address);
    if (addresses.some(isBlockedAddress)) {
        throw new Error(`Refusing non-public host ${url.hostname}`);
    }
}

export async function fetchPublic(
    url: string,
    init: RequestInit = {},
): Promise<Response> {
    let current = new URL(url);
    for (let hop = 0; ; hop++) {
        await assertPublicUrl(current);
        const res = await fetch(current.href, { ...init, redirect: 'manual' });
        const location = res.headers.get('location');
        if (res.status < 300 || res.status >= 400 || !location) return res;
        if (hop >= MAX_REDIRECTS) {
            throw new Error(`Too many redirects from ${url}`);
        }
        current = new URL(location, current);
    }
}
