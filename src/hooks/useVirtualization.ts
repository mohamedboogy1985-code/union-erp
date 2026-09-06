/**
 * خطاف virtualization بسيط للجداول الكبيرة — P2
 * بديل خفيف لـ react-window بدون اعتماديات خارجية
 * يحسب العناصر المرئية فقط بناءً على scrollTop وارتفاع الحاوية
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

export interface VirtualizationOptions {
  itemHeight: number; // ارتفاع الصف الواحد بالبكسل
  containerHeight: number; // ارتفاع الحاوية
  overscan?: number; // عدد الصفوف الإضافية قبل وبعد (افتراضي 5)
}

export function useVirtualization<T>(items: T[], options: VirtualizationOptions) {
  const { itemHeight, containerHeight, overscan = 5 } = options;
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalHeight = items.length * itemHeight;

  const { startIndex, endIndex, visibleItems, offsetY } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight) + overscan * 2;
    const end = Math.min(items.length, start + visibleCount);
    return {
      startIndex: start,
      endIndex: end,
      visibleItems: items.slice(start, end).map((item, idx) => ({
        item,
        index: start + idx,
      })),
      offsetY: start * itemHeight,
    };
  }, [items, scrollTop, itemHeight, containerHeight, overscan]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // تتبع scroll عبر ref أيضاً
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return {
    containerRef,
    totalHeight,
    visibleItems,
    startIndex,
    endIndex,
    offsetY,
    handleScroll,
    // مساعد للعرض
    containerProps: {
      ref: containerRef,
      onScroll: handleScroll,
      style: {
        height: containerHeight,
        overflow: 'auto',
        position: 'relative' as const,
      },
    },
    innerProps: {
      style: {
        height: totalHeight,
        position: 'relative' as const,
      },
    },
    contentProps: {
      style: {
        transform: `translateY(${offsetY}px)`,
        position: 'absolute' as const,
        top: '0',
        left: '0',
        right: '0',
      },
    },
  };
}

/**
 * مكون جدول افتراضي جاهز
 */
export function VirtualizedTable<T>({
  items,
  itemHeight = 48,
  containerHeight = 400,
  renderRow,
  header,
}: {
  items: T[];
  itemHeight?: number;
  containerHeight?: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  header?: React.ReactNode;
}) {
  const { containerProps, innerProps, contentProps, visibleItems } = useVirtualization(items, {
    itemHeight,
    containerHeight,
  });

  return (
    <div {...containerProps}>
      {header}
      <div {...innerProps}>
        <div {...contentProps}>
          {visibleItems.map(({ item, index }) => (
            <div key={index} style={{ height: itemHeight }}>
              {renderRow(item, index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
