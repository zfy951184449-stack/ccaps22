/**
 * 排产资源主数据 —— 校验(纯函数,驱动三层呈现:字段红字 / 图上节点红点 / 顶部汇总条)。
 *
 * 设计:docs/production_scheduling/40_scheduling_layer_spec.md(§5 / C10 / C16)、D20。
 * 口径:每条问题配一句人话原因(GMP 可解释)。防御式校验在编辑/拖拽当下即跑,而非只在保存时拦。
 */
import type {
  PsCipEquipment,
  PsCipStation,
  PsPipeline,
} from '../../types/psResource';

export type PsIssueSeverity = 'error' | 'warn';
export type PsEntityKind = 'pipeline' | 'station' | 'equipment';

export interface PsResourceIssue {
  id: string;
  severity: PsIssueSeverity;
  entityKind: PsEntityKind;
  entityId: string;
  /** 用于顶部汇总条的短码,如 "M3"、"CIP-S2" */
  entityCode: string;
  message: string;
}

/** CIP 家族校验:每条管线必须有主站、主站不得是备站(emergencyOnly)、备站不得等于主站。 */
export function validateCip(
  stations: PsCipStation[],
  pipelines: PsPipeline[],
): PsResourceIssue[] {
  const issues: PsResourceIssue[] = [];
  const stationById = new Map(stations.map((s) => [s.id, s]));

  pipelines.forEach((p) => {
    if (!p.primaryStationId) {
      issues.push({
        id: `${p.id}-no-primary`,
        severity: 'error',
        entityKind: 'pipeline',
        entityId: p.id,
        entityCode: p.code,
        message: `${p.code} 缺主站:每条管线必须有主站`,
      });
    } else {
      const primary = stationById.get(p.primaryStationId);
      if (primary?.emergencyOnly) {
        issues.push({
          id: `${p.id}-primary-emergency`,
          severity: 'error',
          entityKind: 'pipeline',
          entityId: p.id,
          entityCode: p.code,
          message: `${p.code} 主站指向 ${primary.code}(仅作备站):备站不能当主站`,
        });
      }
      if (p.backupStationId && p.backupStationId === p.primaryStationId) {
        issues.push({
          id: `${p.id}-backup-eq-primary`,
          severity: 'error',
          entityKind: 'pipeline',
          entityId: p.id,
          entityCode: p.code,
          message: `${p.code} 备站不能与主站相同`,
        });
      }
    }
  });

  return issues;
}

/** 某 CIP 站被哪些管线引用(用于删除拦截 + 站点反查)。 */
export function stationReferences(
  stationId: string,
  pipelines: PsPipeline[],
): { asPrimary: PsPipeline[]; asBackup: PsPipeline[] } {
  return {
    asPrimary: pipelines.filter((p) => p.primaryStationId === stationId),
    asBackup: pipelines.filter((p) => p.backupStationId === stationId),
  };
}

/** 某管线挂了哪些设备(用于删除拦截 + 管线反查)。 */
export function pipelineEquipment(
  pipelineId: string,
  equipment: PsCipEquipment[],
): PsCipEquipment[] {
  return equipment.filter((e) => e.pipelineId === pipelineId);
}

/** 把问题集索引成 entityId → 该实体上最严重的一条(error 优先),供节点高亮。 */
export function issuesByEntity(issues: PsResourceIssue[]): Map<string, PsResourceIssue> {
  const map = new Map<string, PsResourceIssue>();
  issues.forEach((iss) => {
    const cur = map.get(iss.entityId);
    if (!cur || (cur.severity !== 'error' && iss.severity === 'error')) {
      map.set(iss.entityId, iss);
    }
  });
  return map;
}
