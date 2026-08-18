import { useEffect, useState } from 'preact/hooks';

interface PublishStatus {
    buildTime: string;
    lastTriggeredAt: string | null;
    buildInFlight: boolean;
    hasUnpublishedChanges: boolean;
}

type Phase = 'loading' | 'idle' | 'publishing' | 'failed';

function relativeTime(iso: string): string {
    const seconds = Math.floor((Date.now() - Date.parse(iso)) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

export default function PublishButton() {
    const [status, setStatus] = useState<PublishStatus | null>(null);
    const [phase, setPhase] = useState<Phase>('loading');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/admin/publish')
            .then((response) => (response.ok ? response.json() : null))
            .then((data: PublishStatus | null) => {
                setStatus(data);
                setPhase(data?.buildInFlight ? 'publishing' : 'idle');
            })
            .catch(() => setPhase('idle'));
    }, []);

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
            }
        } catch {
            setError('Could not reach the server. Please try again.');
            setPhase('failed');
        }
    }

    const pending = status?.hasUnpublishedChanges ?? false;
    const disabled = phase === 'loading' || phase === 'publishing';

    return (
        <div class="flex items-center gap-3">
            <span class="text-xs text-gray-500">
                {phase === 'publishing'
                    ? 'Publishing — live in a few minutes'
                    : status
                      ? `Published ${relativeTime(status.buildTime)}`
                      : ''}
            </span>
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
                    : pending
                      ? 'Publish changes'
                      : 'Publish'}
            </button>
            {error && (
                <span class="text-xs text-red-600" role="alert">
                    {error}
                </span>
            )}
        </div>
    );
}
