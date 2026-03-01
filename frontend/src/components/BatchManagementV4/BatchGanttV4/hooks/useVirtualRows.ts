import { RefObject, useEffect, useState } from 'react';

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

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const recalculate = () => {
            if (totalRows <= 0) {
                setWindowState(DEFAULT_WINDOW);
                return;
            }

            const availableHeight = Math.max(container.clientHeight - topOffset, rowHeight);
            const bodyScrollTop = Math.max(container.scrollTop - topOffset, 0);
            const startIndex = Math.max(Math.floor(bodyScrollTop / rowHeight) - overscan, 0);
            const visibleCount = Math.ceil(availableHeight / rowHeight) + overscan * 2;
            const endIndex = Math.min(totalRows - 1, startIndex + visibleCount - 1);

            setWindowState((previous) => {
                if (previous.startIndex === startIndex && previous.endIndex === endIndex) {
                    return previous;
                }
                return { startIndex, endIndex };
            });
        };

        recalculate();
        container.addEventListener('scroll', recalculate, { passive: true });

        const resizeObserver = new ResizeObserver(recalculate);
        resizeObserver.observe(container);

        return () => {
            container.removeEventListener('scroll', recalculate);
            resizeObserver.disconnect();
        };
    }, [containerRef, overscan, rowHeight, topOffset, totalRows]);

    return totalRows > 0 ? windowState : DEFAULT_WINDOW;
};
