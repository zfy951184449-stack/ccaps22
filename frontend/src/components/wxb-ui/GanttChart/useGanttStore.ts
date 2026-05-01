/**
 * WxbGanttChart v2 — Centralized State Management
 * Single useReducer + ref mirror for RAF rendering
 */
import { useReducer, useRef, useCallback, Dispatch } from 'react';
import type { ViewMode, DragState } from './types';
import { DEFAULT_DAY_WIDTH, MIN_DAY_WIDTH, MAX_DAY_WIDTH } from './constants';

// ===== State =====
export interface GanttState {
  scrollX: number;
  scrollY: number;
  dayWidth: number;
  viewMode: ViewMode;
  collapsedGroups: Set<string>;
  expandedDay: number | null;
  hoveredTaskId: string | null;
  selectedTaskId: string | null;
  canvasW: number;
  canvasH: number;
  dirty: boolean;
}

// ===== Actions =====
export type GanttAction =
  | { type: 'SCROLL'; dx: number; dy: number }
  | { type: 'SET_SCROLL'; x?: number; y?: number }
  | { type: 'ZOOM'; dayWidth: number; anchorX?: number }
  | { type: 'SET_VIEW'; mode: ViewMode }
  | { type: 'TOGGLE_GROUP'; groupId: string }
  | { type: 'EXPAND_ALL' }
  | { type: 'COLLAPSE_ALL'; groupIds: string[] }
  | { type: 'EXPAND_DAY'; day: number | null }
  | { type: 'HOVER'; taskId: string | null }
  | { type: 'SELECT'; taskId: string | null }
  | { type: 'RESIZE'; w: number; h: number }
  | { type: 'MARK_DIRTY' }
  | { type: 'MARK_CLEAN' };

function createInitialState(dayWidth?: number): GanttState {
  return {
    scrollX: 0,
    scrollY: 0,
    dayWidth: dayWidth ?? DEFAULT_DAY_WIDTH,
    viewMode: 'day',
    collapsedGroups: new Set<string>(),
    expandedDay: null,
    hoveredTaskId: null,
    selectedTaskId: null,
    canvasW: 800,
    canvasH: 400,
    dirty: true,
  };
}

function ganttReducer(state: GanttState, action: GanttAction): GanttState {
  switch (action.type) {
    case 'SCROLL': {
      const newX = Math.max(0, state.scrollX + action.dx);
      const newY = Math.max(0, state.scrollY + action.dy);
      if (newX === state.scrollX && newY === state.scrollY) return state;
      return { ...state, scrollX: newX, scrollY: newY, dirty: true };
    }
    case 'SET_SCROLL': {
      const newX = action.x !== undefined ? Math.max(0, action.x) : state.scrollX;
      const newY = action.y !== undefined ? Math.max(0, action.y) : state.scrollY;
      if (newX === state.scrollX && newY === state.scrollY) return state;
      return { ...state, scrollX: newX, scrollY: newY, dirty: true };
    }
    case 'ZOOM': {
      const clamped = Math.max(MIN_DAY_WIDTH, Math.min(MAX_DAY_WIDTH, action.dayWidth));
      if (clamped === state.dayWidth) return state;
      // Adjust scrollX to keep anchor point stable
      let newScrollX = state.scrollX;
      if (action.anchorX !== undefined) {
        const ratio = clamped / state.dayWidth;
        newScrollX = Math.max(0, action.anchorX * ratio - (action.anchorX - state.scrollX) * ratio / (state.dayWidth / clamped));
        // Simplified: keep proportional
        newScrollX = Math.max(0, state.scrollX * (clamped / state.dayWidth));
      }
      return { ...state, dayWidth: clamped, scrollX: newScrollX, dirty: true };
    }
    case 'SET_VIEW': {
      const presets: Record<ViewMode, number> = { hour: 600, day: 120, week: 60, month: 40 };
      return { ...state, viewMode: action.mode, dayWidth: presets[action.mode] ?? 120, scrollX: 0, dirty: true };
    }
    case 'TOGGLE_GROUP': {
      const next = new Set(state.collapsedGroups);
      if (next.has(action.groupId)) next.delete(action.groupId);
      else next.add(action.groupId);
      return { ...state, collapsedGroups: next, dirty: true };
    }
    case 'EXPAND_ALL': {
      return { ...state, collapsedGroups: new Set(), dirty: true };
    }
    case 'COLLAPSE_ALL': {
      return { ...state, collapsedGroups: new Set(action.groupIds), dirty: true };
    }
    case 'EXPAND_DAY':
      return { ...state, expandedDay: action.day, dirty: true };
    case 'HOVER':
      if (action.taskId === state.hoveredTaskId) return state;
      return { ...state, hoveredTaskId: action.taskId, dirty: true };
    case 'SELECT':
      return { ...state, selectedTaskId: action.taskId, dirty: true };
    case 'RESIZE':
      return { ...state, canvasW: action.w, canvasH: action.h, dirty: true };
    case 'MARK_DIRTY':
      return state.dirty ? state : { ...state, dirty: true };
    case 'MARK_CLEAN':
      return state.dirty ? { ...state, dirty: false } : state;
    default:
      return state;
  }
}

export interface GanttStore {
  state: GanttState;
  dispatch: Dispatch<GanttAction>;
  stateRef: React.MutableRefObject<GanttState>;
}

export function useGanttStore(initialDayWidth?: number): GanttStore {
  const [state, dispatch] = useReducer(ganttReducer, initialDayWidth, createInitialState);
  const stateRef = useRef(state);
  // Mirror to ref for RAF access (avoid stale closures)
  stateRef.current = state;
  return { state, dispatch, stateRef };
}
