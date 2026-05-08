import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { RecipeVersionService } from '../services/aps/RecipeVersionService';

const repoRoot = path.resolve(__dirname, '../../..');

const phase0aPaths = [
  'backend/src/domain/aps',
  'backend/src/domain/governance',
  'backend/src/domain/masterData',
  'backend/src/mappers/aps',
  'backend/src/mappers/governance',
  'backend/src/services/aps',
  'backend/src/services/governance',
  'database/migrations',
  'database/backfill',
  'scripts/phase0a',
];

const collectFiles = (target: string): string[] => {
  const absolute = path.join(repoRoot, target);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [absolute];
  return fs.readdirSync(absolute).flatMap((entry) => collectFiles(path.join(target, entry)));
};

describe('Phase 0A-1 non-GMP planning boundary', () => {
  it('keeps implementation files in governance/admin naming', () => {
    expect(fs.existsSync(path.join(repoRoot, 'backend/src/domain/governance/rbacTypes.ts'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'backend/src/mappers/governance/RbacMapper.ts'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'backend/src/services/governance/RbacDirectoryService.ts'))).toBe(true);
  });

  it('keeps prohibited legacy quality-system terms out of Phase 0A implementation files', () => {
    const tokenG = ['G', 'XP'].join('');
    const tokenSigId = ['sig', 'nature_id'].join('');
    const tokenApproval = ['approval', '_workflow'].join('');
    const tokenCritical = ['g', 'xp_critical'].join('');
    const tokenBatchStatus = ['batch_', 'g', 'xp_status'].join('');
    const tokenOldStatus = ['RE', 'LEASED'].join('');
    const prohibited = [tokenG, tokenSigId, tokenApproval, tokenCritical, tokenBatchStatus, tokenOldStatus];

    const offenders = phase0aPaths.flatMap(collectFiles).filter((file) => {
      if (!/\.(ts|sql)$/.test(file)) return false;
      const content = fs.readFileSync(file, 'utf8');
      return prohibited.some((token) => content.includes(token));
    });

    expect(offenders).toEqual([]);
  });

  it('detects dependency cycles in dry-run dependency validation', () => {
    const result = RecipeVersionService.validateDependencies([
      {
        predecessorSourceStageOperationId: 1,
        successorSourceStageOperationId: 2,
        dependencyType: 'FS',
        lagMinMinutes: null,
        lagMaxMinutes: null,
      },
      {
        predecessorSourceStageOperationId: 2,
        successorSourceStageOperationId: 1,
        dependencyType: 'FS',
        lagMinMinutes: null,
        lagMaxMinutes: null,
      },
    ]);

    expect(result.isValid).toBe(false);
    expect(result.blockers).toContain('DEPENDENCY_CYCLE_DETECTED');
  });
});
