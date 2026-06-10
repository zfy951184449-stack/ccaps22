import { RowDataPacket } from 'mysql2';
import { SqlExecutor } from './operationResourceBindingService';

// 模板最早操作相对天 min_day = MIN(ps.start_day + sos.operation_day)。
// production_batch_plans.planned_start_date 存的是「最早工序日」= Day0 + min_day，
// 含提前投料(min_day<0)时早于 Day0；Day0 与它的互转必须统一经由本模块，
// 不得在前端或各调用点自行加减偏移。
export const TEMPLATE_MIN_DAY_SQL = `
  SELECT
    ps.template_id AS template_id,
    MIN(ps.start_day + sos.operation_day) AS min_day
  FROM process_stages ps
  JOIN stage_operation_schedules sos ON sos.stage_id = ps.id
`;

export const getTemplateMinDays = async (
  executor: SqlExecutor,
  templateIds: number[],
): Promise<Map<number, number>> => {
  const uniqueIds = Array.from(new Set(templateIds.filter((id) => Number.isFinite(id))));
  if (!uniqueIds.length) {
    return new Map();
  }

  const placeholders = uniqueIds.map(() => '?').join(', ');
  const [rows] = await executor.execute<RowDataPacket[]>(
    `${TEMPLATE_MIN_DAY_SQL}
     WHERE ps.template_id IN (${placeholders})
     GROUP BY ps.template_id`,
    uniqueIds,
  );

  return new Map(rows.map((row) => [Number(row.template_id), Number(row.min_day ?? 0)]));
};

export const getTemplateMinDay = async (
  executor: SqlExecutor,
  templateId: number,
): Promise<number> => {
  const minDays = await getTemplateMinDays(executor, [templateId]);
  return minDays.get(Number(templateId)) ?? 0;
};
