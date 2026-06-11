/**
 * F1 验收测试：schedulingV5Api
 *
 * 断言：
 * 1. 所有 API 函数使用相对路径（无硬编码 host）
 * 2. DEFAULT_SOLVER_CONFIG_V5 默认值断言（§1.6 冻结）
 * 3. getRunProgressSseUrl 返回正确相对路径
 */

import {
  solveV5,
  precheckV5,
  previewProposalV5,
  getRunsV5,
  getRunStatusV5,
  getRunResultV5,
  stopRunV5,
  applyRunResultV5,
  getRunProgressSseUrl,
} from './schedulingV5Api';

import { DEFAULT_SOLVER_CONFIG_V5 } from '../types/solverV5';

// ── Mock fetch ────────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockOkResponse(body: unknown = { success: true }) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => body,
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  // Mock localStorage
  Object.defineProperty(window, 'localStorage', {
    value: { getItem: jest.fn(() => null) },
    writable: true,
  });
});

// ── 1. 所有 API 使用相对路径，无硬编码 host ───────────────────────────────────

describe('all API calls use relative paths (no hardcoded host)', () => {
  const BASE = '/api/v5/scheduling';

  it('solveV5 uses relative path', async () => {
    mockOkResponse({ success: true, run_id: 1 });
    await solveV5({ batch_ids: [1], solve_start_date: '2026-06-01', solve_end_date: '2026-06-30' });
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toBe(`${BASE}/solve`);
    expect(url).not.toMatch(/^https?:\/\//);
    expect(url).not.toContain('localhost');
    expect(url).not.toContain('3001');
  });

  it('precheckV5 uses relative path', async () => {
    mockOkResponse({ success: true });
    await precheckV5({ batch_ids: [1], solve_start_date: '2026-06-01', solve_end_date: '2026-06-30' });
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toBe(`${BASE}/precheck`);
    expect(url).not.toMatch(/^https?:\/\//);
  });

  it('previewProposalV5 uses relative path', async () => {
    mockOkResponse({ success: true });
    await previewProposalV5({ batch_ids: [1], solve_start_date: '2026-06-01', solve_end_date: '2026-06-30' });
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toBe(`${BASE}/preview-proposal`);
    expect(url).not.toMatch(/^https?:\/\//);
  });

  it('getRunsV5 uses relative path', async () => {
    mockOkResponse({ success: true, data: [] });
    await getRunsV5();
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toBe(`${BASE}/runs`);
    expect(url).not.toMatch(/^https?:\/\//);
  });

  it('getRunStatusV5 uses relative path', async () => {
    mockOkResponse({ success: true, status: 'RUNNING' });
    await getRunStatusV5(42);
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toBe(`${BASE}/runs/42/status`);
    expect(url).not.toMatch(/^https?:\/\//);
  });

  it('getRunResultV5 uses relative path', async () => {
    mockOkResponse({ success: true });
    await getRunResultV5(42);
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toBe(`${BASE}/runs/42/result`);
    expect(url).not.toMatch(/^https?:\/\//);
  });

  it('stopRunV5 uses relative path', async () => {
    mockOkResponse({ success: true });
    await stopRunV5(42);
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toBe(`${BASE}/runs/42/stop`);
    expect(url).not.toMatch(/^https?:\/\//);
  });

  it('applyRunResultV5 uses relative path', async () => {
    mockOkResponse({ success: true });
    await applyRunResultV5(42);
    const url: string = mockFetch.mock.calls[0][0];
    expect(url).toBe(`${BASE}/runs/42/apply`);
    expect(url).not.toMatch(/^https?:\/\//);
  });

  it('getRunProgressSseUrl returns relative path (SSE URL helper)', () => {
    const url = getRunProgressSseUrl(99);
    expect(url).toBe(`${BASE}/runs/99/progress`);
    expect(url).not.toMatch(/^https?:\/\//);
    expect(url).not.toContain('localhost');
    // SSE URL helper must not trigger a fetch call
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── 2. HTTP 方法正确 ──────────────────────────────────────────────────────────

describe('HTTP methods', () => {
  it('solveV5 uses POST', async () => {
    mockOkResponse({ success: true, run_id: 1 });
    await solveV5({ batch_ids: [1], solve_start_date: '2026-06-01', solve_end_date: '2026-06-30' });
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });

  it('getRunsV5 uses GET (no explicit method = default GET)', async () => {
    mockOkResponse({ success: true, data: [] });
    await getRunsV5();
    const method = mockFetch.mock.calls[0][1]?.method;
    expect(!method || method === 'GET').toBe(true);
  });

  it('stopRunV5 uses POST', async () => {
    mockOkResponse({ success: true });
    await stopRunV5(1);
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });

  it('applyRunResultV5 uses POST', async () => {
    mockOkResponse({ success: true });
    await applyRunResultV5(1);
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });
});

// ── 3. DEFAULT_SOLVER_CONFIG_V5 默认值（§1.6 冻结）──────────────────────────

describe('DEFAULT_SOLVER_CONFIG_V5 default values (§1.6)', () => {
  it('enable_solution_hint defaults to true', () => {
    expect(DEFAULT_SOLVER_CONFIG_V5.enable_solution_hint).toBe(true);
  });

  it('enable_lexicographic_l4 defaults to false', () => {
    expect(DEFAULT_SOLVER_CONFIG_V5.enable_lexicographic_l4).toBe(false);
  });

  it('enable_objective_breakdown defaults to true', () => {
    expect(DEFAULT_SOLVER_CONFIG_V5.enable_objective_breakdown).toBe(true);
  });

  // V4 字段默认值不变（抽检几个关键字段）
  it('V4 fields retain original defaults', () => {
    expect(DEFAULT_SOLVER_CONFIG_V5.enable_share_group).toBe(true);
    expect(DEFAULT_SOLVER_CONFIG_V5.enable_standard_hours).toBe(true);
    expect(DEFAULT_SOLVER_CONFIG_V5.strict_locked_shifts).toBe(false);
    expect(DEFAULT_SOLVER_CONFIG_V5.max_time_seconds).toBe(300);
    expect(DEFAULT_SOLVER_CONFIG_V5.stagnation_limit).toBe(300);
    expect(DEFAULT_SOLVER_CONFIG_V5.allow_position_vacancy).toBe(false);
    expect(DEFAULT_SOLVER_CONFIG_V5.leader_ops_policy_group_leader).toBe('soft');
    expect(DEFAULT_SOLVER_CONFIG_V5.leader_ops_policy_team_leader).toBe('ban');
    expect(DEFAULT_SOLVER_CONFIG_V5.leader_ops_policy_dept_manager).toBe('ban');
    expect(DEFAULT_SOLVER_CONFIG_V5.objective_weight_vacancy).toBe(10000);
  });
});

// ── 4. 错误处理 ───────────────────────────────────────────────────────────────

describe('error handling', () => {
  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    });
    await expect(getRunsV5()).rejects.toThrow('Forbidden');
  });

  it('throws with HTTP status when no error body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error('no body'); },
    });
    await expect(getRunsV5()).rejects.toThrow('HTTP 500');
  });
});
