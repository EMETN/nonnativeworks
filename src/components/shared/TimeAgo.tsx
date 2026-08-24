import { useState, useEffect } from 'preact/hooks';
import { timeAgo } from '../../lib/time';

interface Props {
    date: string;
    class?: string;
}

// Computes the relative label in the browser at view time. On SSG the page is
// built once, so rendering timeAgo() server-side would freeze the label at
// build time instead of the visitor's actual view time.
export default function TimeAgo({ date, class: className }: Props) {
    const [label, setLabel] = useState(() => timeAgo(date));

    useEffect(() => {
        setLabel(timeAgo(date));
    }, [date]);

    const title = new Date(date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });

    return (
        <p class={className} title={title}>
            Updated {label}
        </p>
    );
}
