import axios from 'axios';
import {
  RosterLeadershipCockpitSnapshot,
  buildMockCockpitInput,
  buildRosterLeadershipCockpitSnapshot,
} from './rosterLeadershipCockpitModel';

const toWindowDays = (value: number) => {
  if (!Number.isFinite(value)) return 365;
  return Math.max(1, Math.min(366, Math.round(value)));
};

const normalizeSnapshot = (snapshot: RosterLeadershipCockpitSnapshot): RosterLeadershipCockpitSnapshot => {
  const mode = snapshot.dataMode ?? snapshot.dataSource ?? 'LIVE_READONLY';
  return {
    ...snapshot,
    dataMode: mode,
    dataSource: mode,
  };
};

const buildMockFallbackSnapshot = (windowDays: number, reason: unknown) => {
  const message = reason instanceof Error ? reason.message : 'unknown error';
  const mockInput = buildMockCockpitInput(windowDays);
  return buildRosterLeadershipCockpitSnapshot({
    ...mockInput,
    dataQualityWarnings: [
      ...mockInput.dataQualityWarnings,
      `DATA GAP: 后端只读 API 暂不可用，当前显示 MOCK_FALLBACK。原因：${message}。`,
    ],
    dataSource: 'MOCK_FALLBACK',
  });
};

export async function loadRosterLeadershipCockpit(windowDays = 365, windowStart?: string) {
  const normalizedWindowDays = toWindowDays(windowDays);

  try {
    const response = await axios.get<RosterLeadershipCockpitSnapshot>('/api/roster-leadership-cockpit', {
      params: {
        window_start: windowStart,
        window_days: normalizedWindowDays,
      },
    });
    return normalizeSnapshot(response.data);
  } catch (error) {
    return buildMockFallbackSnapshot(normalizedWindowDays, error);
  }
}
