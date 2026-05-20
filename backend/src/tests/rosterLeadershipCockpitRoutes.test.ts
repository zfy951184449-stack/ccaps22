import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../services/rosterLeadershipCockpit/RosterLeadershipCockpitService', () => ({
  RosterLeadershipCockpitService: {
    getSnapshot: vi.fn(),
  },
}));

import app from '../server';
import { RosterLeadershipCockpitService } from '../services/rosterLeadershipCockpit/RosterLeadershipCockpitService';

const mockService = RosterLeadershipCockpitService as unknown as {
  getSnapshot: ReturnType<typeof vi.fn>;
};

describe('Roster Leadership Cockpit Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves the live read-only cockpit API', async () => {
    mockService.getSnapshot.mockResolvedValue({
      dataMode: 'LIVE_READONLY',
      dataQualityWarnings: ['DATA GAP: 当前为 proxy calculation'],
      dataSource: 'LIVE_READONLY',
      generatedAt: '2026-06-01 08:00',
      hourTrend: [],
      insights: ['未来窗口的人力总量没有显示硬性缺口。'],
      keyPeople: [],
      quadrantGroups: {
        '低需求 / 低脆弱': [],
        '低需求 / 高脆弱': [],
        '高需求 / 低脆弱': [],
        '高需求 / 高脆弱': [],
      },
      qualifications: [],
      recommendations: ['保持每日复核。'],
      resilience: {
        averageCandidateDepth: 0,
        maxSingleAbsenceImpact: 0,
        replaceableGapRate: 100,
        rerunLikelyCount: 0,
        supervisorActionCount: 0,
        unrecoverableGapCount: 0,
      },
      summary: {
        absenceSensitiveQualificationCount: 0,
        criticalQualificationCount: 0,
        highDependencyPeopleCount: 0,
        maxHourGap: 0,
        maxPeopleGap: 0,
        readinessScore: 100,
        supervisorIssueCount: 0,
        watchQualificationCount: 0,
      },
      windowDays: 14,
      windowEnd: '2026-06-14',
      windowStart: '2026-06-01',
      workforceTrend: [],
    });

    const response = await request(app).get('/api/roster-leadership-cockpit?window_days=14');

    expect(response.status).toBe(200);
    expect(response.body.dataMode).toBe('LIVE_READONLY');
    expect(response.body.dataSource).toBe('LIVE_READONLY');
    expect(mockService.getSnapshot).toHaveBeenCalledWith({
      windowDays: 14,
      windowStart: undefined,
    });
  });
});
