/**
 * WxbGanttChart v2 — Centralized State Management
 * Single useReducer + ref mirror for RAF rendering
 */
import { useReducer, useRef, Dispatch } from 'react';
import type { ViewMode } from './types';
import { DEFAULT_DAY_WIDTH, MIN_DAY_WIDTH, MAX_DAY_WIDTH } from './constants';

// ===== State =====
export interface GanttState {
  scrollX: number;
  scrollY: number;
  maxScrollY: number;        // scroll limit computed from content height
  dayWidth: number;
  viewMode: ViewMode;
  collapsedGroups: Set<string>;
  expandedDay: number | null;
  hoveredTaskId: string | null;
  hoveredRow: number;         // -1 = none
  hoveredColX: number;        // canvas X of mouse, -1 = none
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
  | { type: 'HOVER_ROW'; row: number; colX: number }
  | { type: 'SELECT'; taskId: string | null }
  | { type: 'RESIZE'; w: number; h: number }
  | { type: 'SET_MAX_SCROLL_Y'; maxY: number }
  | { type: 'MARK_DIRTY' }
  | { type: 'MARK_CLEAN' };

function createInitialState(dayWidth?: number): GanttState {
  return {
    scrollX: 0,
    scrollY: 0,
    maxScrollY: 0,
    dayWidth: dayWidth ?? DEFAULT_DAY_WIDTH,
    viewMode: 'day',
    collapsedGroups: new Set<string>(),
    expandedDay: null,
    hoveredTaskId: null,
    hoveredRow: -1,
    hoveredColX: -1,
    selectedTaskId: null,
    canvasW: 800,
    canvasH: 400,
    dirty: true,
  };
}

function clampScrollY(y: number, maxY: number): number {
  return Math.max(0, Math.min(y, maxY));
}

function ganttReducer(state: GanttState, action: GanttAction): GanttState {
  switch (action.type) {
    case 'SCROLL': {
      const newX = Math.max(0, state.scrollX + action.dx);
      const newY = clampScrollY(state.scrollY + action.dy, state.maxScrollY);
      if (newX === state.scrollX && newY === state.scrollY) return state;
      return { ...state, scrollX: newX, scrollY: newY, dirty: true };
    }
    case 'SET_SCROLL': {
      const newX = action.x !== undefined ? Math.max(0, action.x) : state.scrollX;
      const newY = action.y !== undefined ? clampScrollY(action.y, state.maxScrollY) : state.scrollY;
      if (newX === state.scrollX && newY === state.scrollY) return state;
      return { ...state, scrollX: newX, scrollY: newY, dirty: true };
    }
    case 'ZOOM': {
      const clamped = Math.max(MIN_DAY_WIDTH, Math.min(MAX_DAY_WIDTH, action.dayWidth));
      if (clamped === state.dayWidth) return state;
      const newScrollX = Math.max(0, state.scrollX * (clamped / state.dayWidth));
      return { ...state, dayWidth: clamped, scrollX: newScrollX, dirty: true };
    }
    case 'SET_VIEW': {
      const presets: Record<ViewMode, number> = { hour: 600, day: 120, week: 60, month: 40 };
      return { ...state, viewMode: action.mode, dayWidth: presets[action.mode] ?? 120, scrollX: 0, scrollY: 0, dirty: true };
    }
    case 'TOGGLE_GROUP': {
      const next = new Set(state.collapsedGroups);
      if (next.has(action.groupId)) next.delete(action.groupId);
      else next.add(action.groupId);
      // Clamp scrollY since row count may decrease
      const newScrollY = clampScrollY(state.scrollY, state.maxScrollY);
      return { ...state, collapsedGroups: next, scrollY: newScrollY, dirty: true };
    }
    case 'EXPAND_ALL': {
      return { ...state, collapsedGroups: new Set(), scrollY: 0, dirty: true };
    }
    case 'COLLAPSE_ALL': {
      return { ...state, collapsedGroups: new Set(action.groupIds), scrollY: 0, dirty: true };
    }
    case 'EXPAND_DAY':
      return { ...state, expandedDay: action.day, dirty: true };
    case 'HOVER':
      if (action.taskId === state.hoveredTaskId) return state;
      return { ...state, hoveredTaskId: action.taskId, dirty: true };
    case 'HOVER_ROW': {
      if (action.row === state.hoveredRow && action.colX === state.hoveredColX) return state;
      return { ...state, hoveredRow: action.row, hoveredColX: action.colX, dirty: true };
    }
    case 'SELECT':
      return { ...state, selectedTaskId: action.taskId, dirty: true };
    case 'RESIZE':
      return { ...state, canvasW: action.w, canvasH: action.h, dirty: true };
    case 'SET_MAX_SCROLL_Y':
      if (action.maxY === state.maxScrollY) return state;
      return { ...state, maxScrollY: action.maxY };
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
  stateRef.current = state;
  return { state, dispatch, stateRef };
}
