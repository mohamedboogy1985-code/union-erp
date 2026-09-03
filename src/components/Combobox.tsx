import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

export interface ComboboxOption<T = string> {
  id: T;
  label: string;
  sub?: string;
}

interface ComboboxProps<T = string> {
  value: string;
  onChange: (text: string) => void;
  onSelect?: (option: ComboboxOption<T>) => void;
  options: ComboboxOption<T>[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  emptyText?: string;
}

export function Combobox<T = string>({
  value,
  onChange,
  onSelect,
  options,
  placeholder,
  className,
  inputClassName,
  emptyText = 'لا توجد نتائج مطابقة',
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options.slice(0, 10);
    return options
      .filter((o) => o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q))
      .slice(0, 10);
  }, [options, value]);

  useEffect(() => {
    setActive(0);
  }, [value, options, open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const pick = (option: ComboboxOption<T>) => {
    onChange(option.label);
    onSelect?.(option);
    setOpen(false);
  };

  const hasOptions = options.length > 0;

  return (
    <div ref={boxRef} className={`relative ${className ?? ''}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={!hasOptions}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            setOpen(true);
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, visible.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open) {
            e.preventDefault();
            const target = visible[active];
            if (target) pick(target);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className={inputClassName}
      />
      {hasOptions && (
        <Search
          className={`w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors ${open ? 'text-emerald-400' : ''}`}
        />
      )}
      {open && (
        <div className="absolute top-full right-0 left-0 z-40 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/60 py-1.5">
          {visible.length === 0 ? (
            <div className="px-3 py-2.5 text-[11px] text-slate-500 font-bold">{emptyText}</div>
          ) : (
            visible.map((o, i) => (
              <button
                key={`${String(o.id)}-${i}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-right transition-colors ${
                  i === active ? 'bg-emerald-600/10' : 'hover:bg-slate-900'
                }`}
              >
                <span className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-200 truncate">{o.label}</span>
                  {o.sub && <span className="text-[11px] text-slate-500 truncate">{o.sub}</span>}
                </span>
                <Search className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}