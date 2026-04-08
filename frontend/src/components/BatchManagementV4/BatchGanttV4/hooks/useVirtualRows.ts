import { RefObject, useEffect, useState, useRef } from 'react';

interface VirtualRowsOptions {
    overscan?: number;
    topOffset?: number;
}

export interface VirtualRowsWindow {
    startIndex: number;
    endIndex: number;
}

const DEFAULT_WINDOW: VirtualRowsWindow = {
    startIndex: 0,
    endIndex: 0,
};

export const useVirtualRows = (
    containerRef: RefObject<HTMLElement>,
    totalRows: number,
    rowHeight: number,
    options: VirtualRowsOptions = {}
): VirtualRowsWindow => {
    const { overscan = 12, topOffset = 0 } = options;
    const [windowState, setWindowState] = useState<VirtualRowsWindow>(DEFAULT_WINDOW);
    // ⚡ 性能优化：使用 RAF + ref 避免每次 scroll 都触发 setState
    const rafRef = useRef<number | null>(null);
    const pendingWindowRef = useRef<VirtualRowsWindow>(DEFAULT_WINDOW);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const recalculate = () => {
            if (totalRows <= 0) {
                pendingWindowRef.current = DEFAULT_WINDOW;
                setWindowState(DEFAULT_WINDOW);
                return;
            }

            const availableHeight = Math.max(container.clientHeight - topOffset, rowHeight);
            const bodyScrollTop = Math.max(container.scrollTop - topOffset, 0);
            const startIndex = Math.max(Math.floor(bodyScrollTop / rowHeight) - overscan, 0);
            const visibleCount = Math.ceil(availableHeight / rowHeight) + overscan * 2;
            const endIndex = Math.min(totalRows - 1, startIndex + visibleCount - 1);

            const current = pendingWindowRef.current;
            if (current.startIndex === startIndex && current.endIndex === endIndex) {
                return; // 没有变化，不更新
            }

            const next = { startIndex, endIndex };
            pendingWindowRef.current = next;
            setWindowState(next);
        };

        // 初次计算
        recalculate();

        // ⚡ 滚动事件使用 RAF 节流：减少 scroll 高频触发时的 setState 次数
        const handleScroll = () => {
            if (rafRef.current !== null) {
                return; // 已经有一个 RAF 在等待，跳过本次
            }
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;
                recalculate();
            });
        };

        container.addEventListener('scroll', handleScroll, { passive: true });

        const resizeObserver = new ResizeObserver(recalculate);
        resizeObserver.observe(container);

        return () => {
            container.removeEventListener('scroll', handleScroll);
            resizeObserver.disconnect();
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [containerRef, overscan, rowHeight, topOffset, totalRows]);

    return totalRows > 0 ? windowState : DEFAULT_WINDOW;
};
