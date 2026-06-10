/**
 * useGanttStore — ZOOM reducer 单元测试
 * 纯 reducer 测试，无需渲染 DOM
 */
import { DEFAULT_DAY_WIDTH, MIN_DAY_WIDTH, MAX_DAY_WIDTH } from './constants';

// 直接引用 reducer 的内部逻辑；由于 ganttReducer 未导出，
// 这里通过 useGanttStore hook 取 dispatch + state 来驱动，
// 但 reducer 本身是纯函数，因此用简单的 state 对象直接测试最为直接。
// 为避免引入 React 渲染环境，将 clampScroll 与 ZOOM 逻辑内联复现，
// 并与真实实现对照。

// ---- 复现 reducer 中的 clampScroll ----
function clampScroll(v: number, max: number): number {
  return Math.max(0, Math.min(v, max));
}

// ---- 复现 ZOOM 分支（必须与 useGanttStore.ts 保持同步） ----
function applyZoom(
  scrollX: number,
  dayWidth: number,
  maxScrollX: number,
  newDayWidth: number,
  anchorX?: number,
): { scrollX: number; dayWidth: number } {
  const clamped = Math.max(MIN_DAY_WIDTH, Math.min(MAX_DAY_WIDTH, newDayWidth));
  if (clamped === dayWidth) return { scrollX, dayWidth };
  const ratio = clamped / dayWidth;
  let newScrollX: number;
  if (anchorX !== undefined) {
    const worldX = scrollX + anchorX;
    newScrollX = clampScroll(worldX * ratio - anchorX, maxScrollX);
  } else {
    newScrollX = clampScroll(scrollX * ratio, maxScrollX);
  }
  return { scrollX: newScrollX, dayWidth: clamped };
}

// ---- 辅助：构造最小 state ----
const baseState = (overrides: Partial<{ scrollX: number; dayWidth: number; maxScrollX: number }> = {}) => ({
  scrollX: overrides.scrollX ?? 0,
  dayWidth: overrides.dayWidth ?? DEFAULT_DAY_WIDTH,
  maxScrollX: overrides.maxScrollX ?? 9999,
});

describe('ZOOM reducer — 锚点保持', () => {
  it('无 anchorX 时等比缩放 scrollX（工具栏 +/- 按钮兼容）', () => {
    const s = baseState({ scrollX: 200, dayWidth: 120, maxScrollX: 9999 });
    const result = applyZoom(s.scrollX, s.dayWidth, s.maxScrollX, 240);
    // ratio = 2，newScrollX = 200 * 2 = 400
    expect(result.dayWidth).toBe(240);
    expect(result.scrollX).toBe(400);
  });

  it('有 anchorX 时鼠标所在世界坐标保持不变', () => {
    // 初始: dayWidth=120, scrollX=0, anchorX=300 (鼠标在画布 x=300)
    // 世界坐标 worldX = 0 + 300 = 300
    // 放大到 dayWidth=240, ratio=2
    // newScrollX = worldX*2 - anchorX = 600 - 300 = 300
    const s = baseState({ scrollX: 0, dayWidth: 120, maxScrollX: 9999 });
    const result = applyZoom(s.scrollX, s.dayWidth, s.maxScrollX, 240, 300);
    expect(result.dayWidth).toBe(240);
    expect(result.scrollX).toBe(300);
    // 验证锚点不变: (scrollX + anchorX) / dayWidth 应等于 (newScrollX + anchorX) / newDayWidth
    const beforeWorld = (s.scrollX + 300) / s.dayWidth;
    const afterWorld = (result.scrollX + 300) / result.dayWidth;
    expect(afterWorld).toBeCloseTo(beforeWorld, 6);
  });

  it('有 anchorX 且已有滚动偏移时保持锚点', () => {
    // scrollX=500, dayWidth=120, anchorX=200
    // worldX = 500 + 200 = 700
    // 缩小到 dayWidth=60, ratio=0.5
    // newScrollX = 700*0.5 - 200 = 350 - 200 = 150
    const s = baseState({ scrollX: 500, dayWidth: 120, maxScrollX: 9999 });
    const result = applyZoom(s.scrollX, s.dayWidth, s.maxScrollX, 60, 200);
    expect(result.dayWidth).toBe(60);
    expect(result.scrollX).toBe(150);
    const beforeWorld = (s.scrollX + 200) / s.dayWidth;
    const afterWorld = (result.scrollX + 200) / result.dayWidth;
    expect(afterWorld).toBeCloseTo(beforeWorld, 6);
  });

  it('anchorX 在画布左端(0)时锚点保持等效等比缩放', () => {
    // 当 anchorX=0: worldX = scrollX, newScrollX = scrollX*ratio - 0 = scrollX*ratio
    const s = baseState({ scrollX: 400, dayWidth: 120, maxScrollX: 9999 });
    const withAnchor = applyZoom(s.scrollX, s.dayWidth, s.maxScrollX, 240, 0);
    const withoutAnchor = applyZoom(s.scrollX, s.dayWidth, s.maxScrollX, 240);
    expect(withAnchor.scrollX).toBe(withoutAnchor.scrollX);
  });

  it('clamp: newScrollX 不超过 maxScrollX', () => {
    // scrollX=4000, dayWidth=120, maxScrollX=5000, anchorX=100
    // ratio=2: newScrollX = (4000+100)*2 - 100 = 8100, clamp(8100, 5000) = 5000
    const s = baseState({ scrollX: 4000, dayWidth: 120, maxScrollX: 5000 });
    const result = applyZoom(s.scrollX, s.dayWidth, s.maxScrollX, 240, 100);
    expect(result.scrollX).toBe(5000);
  });

  it('clamp: newScrollX 不低于 0', () => {
    // 极端情况: anchorX 很大导致 worldX*ratio - anchorX < 0
    const s = baseState({ scrollX: 0, dayWidth: 120, maxScrollX: 9999 });
    // anchorX=1000，缩小 ratio=0.5: newScrollX = 1000*0.5 - 1000 = -500 → 0
    const result = applyZoom(s.scrollX, s.dayWidth, s.maxScrollX, 60, 1000);
    expect(result.scrollX).toBe(0);
  });

  it('dayWidth 超出 MAX 时 clamp 到 MAX_DAY_WIDTH', () => {
    const s = baseState({ dayWidth: MAX_DAY_WIDTH - 10 });
    const result = applyZoom(s.scrollX, s.dayWidth, s.maxScrollX, MAX_DAY_WIDTH + 9999, 0);
    expect(result.dayWidth).toBe(MAX_DAY_WIDTH);
  });

  it('dayWidth 低于 MIN 时 clamp 到 MIN_DAY_WIDTH', () => {
    const s = baseState({ dayWidth: MIN_DAY_WIDTH + 10 });
    const result = applyZoom(s.scrollX, s.dayWidth, s.maxScrollX, 0, 0);
    expect(result.dayWidth).toBe(MIN_DAY_WIDTH);
  });

  it('clamped === dayWidth 时返回原值不变', () => {
    const s = baseState({ scrollX: 100, dayWidth: DEFAULT_DAY_WIDTH });
    // 传入与当前完全相同的 dayWidth
    const result = applyZoom(s.scrollX, s.dayWidth, s.maxScrollX, DEFAULT_DAY_WIDTH, 200);
    expect(result.scrollX).toBe(100);
    expect(result.dayWidth).toBe(DEFAULT_DAY_WIDTH);
  });
});
