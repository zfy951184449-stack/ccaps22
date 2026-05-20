import {
  buildMockCockpitInput,
  buildRosterLeadershipCockpitSnapshot,
  classifyQualificationRisk,
} from './rosterLeadershipCockpitModel';

const forbiddenLeadershipCockpitTerms = [
  'GxP',
  'QA release',
  'electronic signature',
  'approval workflow',
  'deviation',
  'nonconformance',
];

describe('rosterLeadershipCockpitModel', () => {
  it('does not mark high-frequency broad-supply qualification as Critical', () => {
    const snapshot = buildRosterLeadershipCockpitSnapshot(buildMockCockpitInput(14));
    const base = snapshot.qualifications.find((item) => item.name === '基础上岗');

    expect(base).toBeDefined();
    expect(base?.demandCount).toBeGreaterThanOrEqual(5);
    expect(base?.riskLevel).not.toBe('CRITICAL');
  });

  it('marks scarce high-demand concurrent qualification as high risk', () => {
    const snapshot = buildRosterLeadershipCockpitSnapshot(buildMockCockpitInput(14));
    const viralFilter = snapshot.qualifications.find((item) => item.name === '病毒过滤 L3');

    expect(viralFilter).toBeDefined();
    expect(['CRITICAL', 'BOTTLENECK']).toContain(viralFilter?.riskLevel);
    expect(viralFilter?.peakConcurrentDemand).toBeGreaterThan(viralFilter?.peakQualifiedAvailable ?? 0);
    expect(viralFilter?.candidateCoverageDepth).toBeLessThanOrEqual(2);
  });

  it('combines gap, depth, dependency, competition, and absence sensitivity into the risk level', () => {
    const result = classifyQualificationRisk(
      {
        absenceSensitivity: 0.8,
        candidateCoverageDepth: 1.2,
        competingHotSkillCount: 3,
        demandHours: 20,
        dependencyScore: 0.8,
        lowCoverageTaskCount: 4,
        peakConcurrentDemand: 3,
        peakQualifiedAvailable: 2,
        qualifiedEmployeeCount: 2,
      },
      {
        maxCompetingHotSkillCount: 3,
        maxDemandHours: 20,
        maxLowCoverageTaskCount: 4,
        maxPeakGapPeople: 1,
      },
    );

    expect(result.riskLevel).toBe('CRITICAL');
    expect(result.riskScore).toBeGreaterThanOrEqual(75);
  });

  it('generates leadership insights and excludes out-of-bound system semantics', () => {
    const snapshot = buildRosterLeadershipCockpitSnapshot(buildMockCockpitInput(14));
    const text = [
      ...snapshot.insights,
      ...snapshot.recommendations,
      ...snapshot.dataQualityWarnings,
    ].join(' ');

    expect(snapshot.insights.length).toBeGreaterThanOrEqual(3);
    expect(snapshot.insights.length).toBeLessThanOrEqual(6);
    forbiddenLeadershipCockpitTerms.forEach((term) => {
      expect(text.toLowerCase()).not.toContain(term.toLowerCase());
    });
  });
});
