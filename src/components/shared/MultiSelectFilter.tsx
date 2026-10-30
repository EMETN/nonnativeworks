import {
    useState,
    useRef,
    useEffect,
    useLayoutEffect,
    useMemo,
} from 'preact/hooks';
import { foldText, formatCount } from '../../lib/text';
import type { FacetOption } from '../../lib/position-filters';

interface Props {
    id: string;
    label: string;
    plural: string;
    summary: string;
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
    plural,
    summary,
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

    return (
        <div
            ref={rootRef}
            class="inline-block sm:relative"
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
                class="text-left font-bold text-[#0F7A4F] cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12956B] focus-visible:ring-offset-2"
            >
                <span class="icon-link">
                    {summary}
                    <svg
                        aria-hidden="true"
                        class={`inline-block w-[0.7em] h-[0.7em] ml-1 align-baseline ${open ? '-scale-y-100' : ''}`}
                        width="12"
                        height="12"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width={3}
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M6 9l6 6 6-6"
                        />
                    </svg>
                </span>
            </button>
            <div
                ref={panelRef}
                id={panelId}
                hidden={!open}
                class={`absolute left-0 right-0 sm:w-64 ${alignRight ? 'sm:left-auto' : 'sm:right-auto'} top-full mt-2 z-20 overflow-hidden bg-white border border-gray-200 rounded-lg shadow-[0_8px_24px_rgba(17,24,39,0.12)] font-normal`}
            >
                {options.length >= SEARCHABLE_FROM && (
                    <div class="flex items-center gap-2 px-3 border-b border-gray-200 focus-within:border-[#12956B] transition-colors">
                        <svg
                            aria-hidden="true"
                            class="w-4 h-4 shrink-0 text-gray-500"
                            width="16"
                            height="16"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            stroke-width={2}
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
                            />
                        </svg>
                        <input
                            type="text"
                            aria-label={`Search ${plural}`}
                            placeholder={`Search ${plural}`}
                            value={query}
                            onInput={(e) =>
                                setQuery((e.target as HTMLInputElement).value)
                            }
                            class="flex-1 min-w-0 py-2 text-base sm:text-sm text-gray-900 placeholder:text-gray-500 bg-transparent outline-none"
                            style={numFont}
                        />
                    </div>
                )}
                <fieldset class="max-h-52 overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin]">
                    <legend class="sr-only">Filter by {label}</legend>
                    {visible.length === 0 && (
                        <p
                            class="text-sm text-gray-500 px-2 py-2"
                            style={numFont}
                        >
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
                                class={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${disabled ? 'text-gray-400' : `cursor-pointer hover:bg-[#0F7A4F]/5 ${checked ? 'text-[#0F7A4F] font-semibold' : 'text-gray-900'}`}`}
                                style={numFont}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={() => toggle(o.value)}
                                    class="filter-check shrink-0"
                                />
                                <span class="min-w-0 truncate">{o.label}</span>
                                <span
                                    class={`shrink-0 -ml-1 font-normal ${disabled ? 'text-gray-400' : 'text-gray-500'}`}
                                >
                                    ({formatCount(count)})
                                </span>
                            </label>
                        );
                    })}
                </fieldset>
                {selected.length > 0 && (
                    <div class="p-1 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={() => {
                                onChange([]);
                                // The button unmounts, which would drop focus out of the panel.
                                buttonRef.current?.focus();
                            }}
                            class="w-full text-left text-sm font-medium px-2 py-1 rounded-md text-gray-500 hover:text-[#0F7A4F] hover:bg-[#0F7A4F]/5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12956B]"
                            style={numFont}
                        >
                            Clear all
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
