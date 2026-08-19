import { useEffect, useRef, useState } from 'preact/hooks';
import {
    buildPublishLabel,
    changeLineText,
    type ChangeGroup,
} from '../../lib/publish-status';

interface PublishStatus {
    buildTime: string;
    lastTriggeredAt: string | null;
    buildInFlight: boolean;
    hasUnpublishedChanges: boolean;
    changeCount: number;
    changes: ChangeGroup[];
}

type Phase = 'loading' | 'idle' | 'publishing' | 'failed';

const POLL_INTERVAL_MS = 20_000;

function relativeTime(iso: string): string {
    const seconds = Math.floor((Date.now() - Date.parse(iso)) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function fetchStatus(): Promise<PublishStatus | null> {
    return fetch('/api/admin/publish')
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
}

export default function PublishButton() {
    const [status, setStatus] = useState<PublishStatus | null>(null);
    const [phase, setPhase] = useState<Phase>('loading');
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchStatus().then((data) => {
            setStatus(data);
            setPhase('idle');
        });
    }, []);

    // Poll while a build is running so the button re-enables once it finishes.
    useEffect(() => {
        if (!status?.buildInFlight) return;

        const interval = setInterval(() => {
            fetchStatus().then((data) => {
                if (data) setStatus(data);
            });
        }, POLL_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [status?.buildInFlight]);

    // Close the breakdown popover on Escape or a click/tap outside it.
    useEffect(() => {
        if (!open) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false);
        }
        function handlePointerDown(event: PointerEvent) {
            if (
                popoverRef.current &&
                !popoverRef.current.contains(event.target as Node)
            ) {
                setOpen(false);
            }
        }

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('pointerdown', handlePointerDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('pointerdown', handlePointerDown);
        };
    }, [open]);

    async function publish() {
        setPhase('publishing');
        setError(null);

        try {
            const response = await fetch('/api/admin/publish', {
                method: 'POST',
            });

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                setError(body.error ?? `Request failed (${response.status})`);
                setPhase('failed');
            } else {
                setPhase('idle');
                const data = await fetchStatus();
                if (data) setStatus(data);
            }
        } catch {
            setError('Could not reach the server. Please try again.');
            setPhase('failed');
        }
    }

    const changeCount = status?.changeCount ?? 0;
    const pending = changeCount > 0;
    const buildInFlight = status?.buildInFlight ?? false;
    const disabled =
        phase === 'loading' || phase === 'publishing' || buildInFlight;

    return (
        <div class="flex items-center gap-3">
            <span class="text-xs text-gray-500">
                {phase === 'publishing'
                    ? 'Publishing — live in a few minutes'
                    : status
                      ? `Published ${relativeTime(status.buildTime)}`
                      : ''}
            </span>
            {pending && (
                <div class="relative" ref={popoverRef}>
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        onPointerEnter={(event) => {
                            if (event.pointerType === 'mouse') setOpen(true);
                        }}
                        onPointerLeave={(event) => {
                            if (event.pointerType === 'mouse') setOpen(false);
                        }}
                        aria-expanded={open}
                        aria-controls="publish-breakdown"
                        aria-label="Show unpublished changes breakdown"
                        class="flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#12956B]"
                    >
                        ⓘ
                    </button>
                    {open && (
                        <div
                            id="publish-breakdown"
                            role="group"
                            aria-label="Unpublished changes"
                            class="absolute right-0 top-full z-10 mt-1 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-700 shadow-lg"
                        >
                            <ul class="space-y-0.5">
                                {status?.changes.map((group) => (
                                    <li
                                        key={`${group.entity_type}-${group.action}`}
                                    >
                                        {changeLineText(group)}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
            <button
                type="button"
                onClick={publish}
                disabled={disabled}
                class={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#12956B] disabled:opacity-50 disabled:cursor-not-allowed ${
                    pending
                        ? 'bg-[#0B5E3C] text-white hover:bg-[#12956B]'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                aria-label={
                    pending
                        ? 'Publish unpublished changes to the live site'
                        : 'Publish to live site'
                }
            >
                {phase === 'publishing'
                    ? 'Publishing…'
                    : buildInFlight
                      ? 'Build in progress…'
                      : buildPublishLabel(changeCount)}
            </button>
            {error && (
                <span class="text-xs text-red-600" role="alert">
                    {error}
                </span>
            )}
        </div>
    );
}
