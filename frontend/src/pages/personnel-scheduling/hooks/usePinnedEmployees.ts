import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * usePinnedEmployees
 *
 * 维护「置顶员工」列表，仅写入浏览器 localStorage —— 每台浏览器独立，不影响其他用户。
 * 同一浏览器多标签页之间通过 storage 事件保持同步。
 */
const STORAGE_KEY = 'personnel-schedule-pinned-employees:v1';

const readStored = (): number[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // 去重并仅保留合法数字 id
        return Array.from(new Set(parsed.filter((v): v is number => typeof v === 'number')));
    } catch {
        return [];
    }
};

export interface UsePinnedEmployeesResult {
    pinnedIds: number[];
    pinnedSet: Set<number>;
    isPinned: (id: number) => boolean;
    togglePin: (id: number) => void;
    clearPins: () => void;
}

export function usePinnedEmployees(): UsePinnedEmployeesResult {
    const [pinnedIds, setPinnedIds] = useState<number[]>(() => readStored());

    // 写回 localStorage（值未变化时跳过，避免触发多余的 storage 事件回环）
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const serialized = JSON.stringify(pinnedIds);
            if (window.localStorage.getItem(STORAGE_KEY) !== serialized) {
                window.localStorage.setItem(STORAGE_KEY, serialized);
            }
        } catch {
            /* localStorage 不可用（隐私模式 / 配额）时静默降级 */
        }
    }, [pinnedIds]);

    // 跨标签页同步
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handler = (e: StorageEvent) => {
            if (e.key !== STORAGE_KEY) return;
            const next = readStored();
            setPinnedIds(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, []);

    const togglePin = useCallback((id: number) => {
        setPinnedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    }, []);

    const clearPins = useCallback(() => setPinnedIds([]), []);

    const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);
    const isPinned = useCallback((id: number) => pinnedSet.has(id), [pinnedSet]);

    return { pinnedIds, pinnedSet, isPinned, togglePin, clearPins };
}
