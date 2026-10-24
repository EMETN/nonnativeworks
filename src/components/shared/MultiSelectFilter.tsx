import {
    useState,
    useRef,
    useEffect,
    useLayoutEffect,
    useMemo,
} from 'preact/hooks';
import { foldText } from '../../lib/text';
import type { FacetOption } from '../../lib/position-filters';

interface Props {
    id: string;
    label: string;
    options: FacetOption[];
    counts: Map<string, number>;
    selected: string[];
    onChange: (values: string[]) => void;
}

const numFont = { fontFamily: "'Inter', 'Inter Fallback', sans-serif" };
const SEARCHABLE_FROM = 8;

export default function MultiSelectFilter({
    id,
    label,
    options,
    counts,
    selected,
    onChange,
}: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [alignRight, setAlignRight] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const panelId = `${id}-panel`;

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    useLayoutEffect(() => {
        if (!open) return setAlignRight(false);
        const panel = panelRef.current!.getBoundingClientRect();
        if (panel.right > document.documentElement.clientWidth - 16)
            setAlignRight(true);
    }, [open]);

    const visible = useMemo(() => {
        const q = foldText(query).trim();
        const matching = q
            ? options.filter((o) => foldText(o.label).includes(q))
            : options;
        const available = (o: FacetOption) =>
            selected.includes(o.value) || (counts.get(o.value) ?? 0) > 0;
        return [
            ...matching.filter(available),
            ...matching.filter((o) => !available(o)),
        ];
    }, [options, query, counts, selected]);

    const toggle = (value: string) =>
        onChange(
            selected.includes(value)
                ? selected.filter((v) => v !== value)
                : [...selected, value],
        );

    const active = selected.length > 0;

    return (
        <div
            ref={rootRef}
            class="sm:relative"
            onKeyDown={(e) => {
                if (e.key === 'Escape' && open) {
                    // BaseLayout blurs the focused element on Escape; keep focus on the trigger.
                    e.stopPropagation();
                    setOpen(false);
                    buttonRef.current?.focus();
                }
            }}
        >
            <button
                ref={buttonRef}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen(!open)}
                class={`inline-flex items-center gap-1 text-xs sm:text-sm font-medium px-3 py-1 rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12956B] focus-visible:ring-offset-2 ${active ? 'border-[#0F7A4F] text-[#0F7A4F] bg-[#0F7A4F]/5' : 'border-gray-300 text-gray-700 hover:border-gray-400'}`}
                style={numFont}
            >
                {label}
                {active && <span>({selected.length})</span>}
                <svg
                    aria-hidden="true"
                    class={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
                    width="12"
                    height="12"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width={2.5}
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M6 9l6 6 6-6"
                    />
                </svg>
            </button>
            <div
                ref={panelRef}
                id={panelId}
                hidden={!open}
                class={`absolute left-0 right-0 sm:w-72 ${alignRight ? 'sm:left-auto' : 'sm:right-auto'} top-full mt-2 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2`}
            >
                {options.length >= SEARCHABLE_FROM && (
                    <input
                        type="text"
                        aria-label={`Search ${label.toLowerCase()}`}
                        placeholder={`Search ${label.toLowerCase()}...`}
                        value={query}
                        onInput={(e) =>
                            setQuery((e.target as HTMLInputElement).value)
                        }
                        class="w-full text-xs sm:text-sm border-b border-gray-200 px-1 py-1.5 mb-1 outline-none focus-visible:border-[#12956B]"
                        style={numFont}
                    />
                )}
                <fieldset class="max-h-64 overflow-y-auto overscroll-contain">
                    <legend class="sr-only">Filter by {label}</legend>
                    {visible.length === 0 && (
                        <p class="text-xs sm:text-sm text-gray-500 px-1 py-2">
                            No matches
                        </p>
                    )}
                    {visible.map((o) => {
                        const checked = selected.includes(o.value);
                        const count = counts.get(o.value) ?? 0;
                        const disabled = !checked && count === 0;
                        return (
                            <label
                                key={o.value}
                                class={`flex items-center gap-2 px-1 py-1.5 rounded text-xs sm:text-sm ${disabled ? 'text-gray-400' : 'text-gray-900 hover:bg-gray-50 cursor-pointer'}`}
                                style={numFont}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={() => toggle(o.value)}
                                    class="accent-[#0F7A4F] shrink-0"
                                />
                                <span class="flex-1 min-w-0 truncate">
                                    {o.label}
                                </span>
                                <span
                                    class={
                                        disabled
                                            ? 'text-gray-400'
                                            : 'text-gray-500'
                                    }
                                >
                                    {count}
                                </span>
                            </label>
                        );
                    })}
                </fieldset>
            </div>
        </div>
    );
}
