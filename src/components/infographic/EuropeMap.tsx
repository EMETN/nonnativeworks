import { useEffect, useRef, useState } from 'preact/hooks';
import rawSvg from '../../assets/europe-map.svg?raw';
import type { CountryStats } from '../../lib/types';

interface Props {
  countries: CountryStats[];
}

interface Tooltip {
  visible: boolean;
  x: number;
  y: number;
  name: string;
  englishPositions: number;
  totalPositions: number;
  percentage: number;
}

function pctToColor(pct: number): string {
  // Interpolate from green-100 (#dcfce7) to green-800 (#166534)
  const r = Math.round(220 + (22 - 220) * pct);
  const g = Math.round(252 + (101 - 252) * pct);
  const b = Math.round(231 + (52 - 231) * pct);
  return `rgb(${r},${g},${b})`;
}

export default function EuropeMap({ countries }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip>({
    visible: false,
    x: 0,
    y: 0,
    name: '',
    englishPositions: 0,
    totalPositions: 0,
    percentage: 0,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const svg = container.querySelector('svg');
    if (!svg) return;

    svg.setAttribute('width', '100%');
    svg.removeAttribute('height');
    svg.style.display = 'block';

    const statsMap = new Map(countries.map((c) => [c.code.toUpperCase(), c]));
    const cleanups: (() => void)[] = [];

    svg.querySelectorAll<SVGPathElement>('path[id]').forEach((path) => {
      const code = path.id.toUpperCase();
      const stats = statsMap.get(code);
      const baseFill = stats ? pctToColor(stats.english_percentage / 100) : '#e5e7eb';

      path.setAttribute('fill', baseFill);
      if (stats) path.style.cursor = 'pointer';

      const onEnter = (e: MouseEvent) => {
        if (!stats) return;
        const rect = container.getBoundingClientRect();
        path.setAttribute('fill', pctToColor(Math.min(1, stats.english_percentage / 100 + 0.2)));
        path.setAttribute('stroke-width', '1');
        setTooltip({
          visible: true,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          name: stats.name,
          englishPositions: stats.english_positions,
          totalPositions: stats.total_positions,
          percentage: stats.english_percentage,
        });
      };

      const onMove = (e: MouseEvent) => {
        if (!stats) return;
        const rect = container.getBoundingClientRect();
        setTooltip((prev) => ({ ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top }));
      };

      const onLeave = () => {
        path.setAttribute('fill', baseFill);
        path.setAttribute('stroke-width', '.1');
        setTooltip((prev) => ({ ...prev, visible: false }));
      };

      const onClick = () => {
        if (stats) window.location.href = `/${stats.slug}`;
      };

      path.addEventListener('mouseenter', onEnter);
      path.addEventListener('mousemove', onMove);
      path.addEventListener('mouseleave', onLeave);
      if (stats) path.addEventListener('click', onClick);

      cleanups.push(() => {
        path.removeEventListener('mouseenter', onEnter);
        path.removeEventListener('mousemove', onMove);
        path.removeEventListener('mouseleave', onLeave);
        if (stats) path.removeEventListener('click', onClick);
      });
    });

    return () => cleanups.forEach((fn) => fn());
  }, [countries]);

  return (
    <div ref={containerRef} class="relative w-full">
      <div dangerouslySetInnerHTML={{ __html: rawSvg }} />
      {tooltip.visible && (
        <div
          class="absolute pointer-events-none z-10 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm"
          style={{ left: `${tooltip.x + 14}px`, top: `${tooltip.y - 60}px` }}
        >
          <div class="font-semibold text-gray-900">{tooltip.name}</div>
          <div class="text-[#166534] font-medium">
            {tooltip.englishPositions.toLocaleString()} English-friendly
          </div>
          <div class="text-gray-400 text-xs">
            {Math.round(tooltip.percentage)}% of {tooltip.totalPositions.toLocaleString()} total
          </div>
        </div>
      )}
    </div>
  );
}
