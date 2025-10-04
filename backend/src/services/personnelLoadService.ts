import pool from '../config/database';
import { RowDataPacket } from 'mysql2';

export interface PersonnelLoadPoint {
  hourIndex: number;
  absoluteHour: number;
  requiredPeople: number;
}

export interface PersonnelLoadSummary {
  points: PersonnelLoadPoint[];
  peak: {
    hourIndex: number;
    absoluteHour: number;
    requiredPeople: number;
  } | null;
}

export const computePersonnelLoad = async (templateId: number): Promise<PersonnelLoadSummary> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 
       sos.id AS schedule_id,
       ps.start_day,
       sos.operation_day,
       sos.recommended_time,
       COALESCE(op.standard_time, 1) AS duration,
       COALESCE(op.required_people, 1) AS required_people
     FROM stage_operation_schedules sos
     JOIN process_stages ps ON sos.stage_id = ps.id
     JOIN operations op ON sos.operation_id = op.id
     WHERE ps.template_id = ?`,
    [templateId]
  );

  if (!rows.length) {
    return { points: [], peak: null };
  }

  const hourBuckets = new Map<number, number>();
  let peakHour = 0;
  let peakPeople = 0;

  for (const row of rows) {
    const startAbsoluteHour = (Number(row.start_day) + Number(row.operation_day)) * 24 + Number(row.recommended_time);
    const durationHours = Math.max(Number(row.duration) || 1, 0.5);
    const requiredPeople = Math.max(Number(row.required_people) || 1, 1);

    const startHourIndex = Math.floor(startAbsoluteHour);
    const endAbsoluteHour = startAbsoluteHour + durationHours;
    // 包含结束小时：例如 9.5-10.5 计入 9/10/11 三个小时
    const endInclusive = Math.ceil(endAbsoluteHour);

    for (let hour = startHourIndex; hour <= endInclusive; hour++) {
      const existing = hourBuckets.get(hour) || 0;
      const updated = existing + requiredPeople;
      hourBuckets.set(hour, updated);

      if (updated > peakPeople) {
        peakPeople = updated;
        peakHour = hour;
      }
    }
  }

  const points: PersonnelLoadPoint[] = Array.from(hourBuckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hourIndex, people]) => ({
      hourIndex,
      absoluteHour: hourIndex,
      requiredPeople: people
    }));

  const peak = points.length
    ? {
        hourIndex: peakHour,
        absoluteHour: peakHour,
        requiredPeople: peakPeople
      }
    : null;

  return { points, peak };
};
