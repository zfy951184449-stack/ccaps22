import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import RosterLeadershipCockpitPage from './RosterLeadershipCockpitPage';
import { loadRosterLeadershipCockpit } from './rosterLeadershipCockpitService';
import { buildMockRosterLeadershipCockpitSnapshot } from './rosterLeadershipCockpitModel';

jest.mock('./rosterLeadershipCockpitService', () => ({
  loadRosterLeadershipCockpit: jest.fn(),
}));

const mockLoadRosterLeadershipCockpit = loadRosterLeadershipCockpit as jest.MockedFunction<typeof loadRosterLeadershipCockpit>;

const setInputValue = (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const waitForCondition = async (condition: () => boolean, timeoutMs = 3500) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  }
  throw new Error('waitForCondition timeout');
};

describe('RosterLeadershipCockpitPage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        addListener: jest.fn(),
        dispatchEvent: jest.fn(),
        removeEventListener: jest.fn(),
        removeListener: jest.fn(),
      })),
    });

    class ResizeObserverMock {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
    }
    (window as any).ResizeObserver = ResizeObserverMock;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  const renderPage = async () => {
    await act(async () => {
      root.render(<RosterLeadershipCockpitPage />);
    });
    await waitForCondition(() => document.body.textContent?.includes('工厂人力韧性驾驶舱') ?? false);
  };

  it('renders live read-only cockpit data without a mock fallback marker', async () => {
    const liveSnapshot = {
      ...buildMockRosterLeadershipCockpitSnapshot(14),
      dataMode: 'LIVE_READONLY' as const,
      dataSource: 'LIVE_READONLY' as const,
      dataQualityWarnings: ['DATA GAP: 当前为 proxy calculation'],
    };
    mockLoadRosterLeadershipCockpit.mockResolvedValue(liveSnapshot);

    await renderPage();

    const text = document.body.textContent ?? '';
    expect(text).toContain('工厂人力韧性驾驶舱');
    expect(text).toContain('Read-only，不会自动修改排班');
    expect(text).toContain('LIVE_READONLY');
    expect(text).not.toContain('MOCK_FALLBACK');
    expect(text).toContain('Roster Readiness Score');
    expect(text).toContain('管理层洞察');
    expect(text).toContain('人力供需趋势');
    expect(text).toContain('工时供需趋势');
    expect(text).toContain('资质瓶颈分析');
    expect(text).toContain('资质四象限');
    expect(text).toContain('关键人员依赖');
    expect(text).toContain('异常韧性摘要');
    expect(text).toContain('Data Quality Warning');
    expect(text).toContain('未来一年');
    expect(text).not.toContain('30 天');
    expect(mockLoadRosterLeadershipCockpit).toHaveBeenCalledWith(
      365,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it('clearly marks mock fallback snapshots', async () => {
    mockLoadRosterLeadershipCockpit.mockResolvedValue(buildMockRosterLeadershipCockpitSnapshot(14));

    await renderPage();

    expect(document.body.textContent).toContain('MOCK_FALLBACK');
  });

  it('reloads live data when a custom annual window is entered', async () => {
    const liveSnapshot = {
      ...buildMockRosterLeadershipCockpitSnapshot(365),
      dataMode: 'LIVE_READONLY' as const,
      dataSource: 'LIVE_READONLY' as const,
    };
    mockLoadRosterLeadershipCockpit.mockResolvedValue(liveSnapshot);

    await renderPage();

    const customButton = Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === '自定义');
    expect(customButton).toBeTruthy();

    await act(async () => {
      customButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitForCondition(() => Boolean(document.querySelector('input[aria-label="自定义开始日期"]')));

    const startInput = document.querySelector('input[aria-label="自定义开始日期"]') as HTMLInputElement;
    const endInput = document.querySelector('input[aria-label="自定义结束日期"]') as HTMLInputElement;

    await act(async () => {
      setInputValue(startInput, '2026-01-01');
    });
    await act(async () => {
      setInputValue(endInput, '2026-12-31');
    });

    await waitForCondition(() =>
      mockLoadRosterLeadershipCockpit.mock.calls.some(([days, start]) =>
        days === 365 && start === '2026-01-01',
      ),
    );
  });
});
