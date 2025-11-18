import dayjs from 'dayjs';

/**
 * 班次服务
 * 负责班次配置、班次推断和班次选择
 */
export class ShiftService {
  private shifts: ShiftDefinition[] = [];

  constructor() {
    this.initializeDefaultShifts();
  }

  /**
   * 初始化默认班次配置
   */
  private initializeDefaultShifts(): void {
    this.shifts = [
      {
        id: 'normal_day',
        name: '常日班',
        startTime: '08:30',
        endTime: '17:00',
        standardHours: 8, // 折算工时
        actualHours: 8.5, // 实际在岗时间
        breakHours: 0.5, // 不定时休息时间
        priority: 1, // 优先级：数字越小优先级越高
        canWorkOvertime: false,
        isNightShift: false
      },
      {
        id: 'long_day',
        name: '长白班',
        startTime: '08:30',
        endTime: '21:00',
        standardHours: 12,
        actualHours: 12.5,
        breakHours: 0.5,
        priority: 2,
        canWorkOvertime: true,
        isNightShift: false
      },
      {
        id: 'night_shift',
        name: '夜班',
        startTime: '20:00',
        endTime: '08:00', // 次日
        standardHours: 12,
        actualHours: 12.5,
        breakHours: 0.5,
        priority: 3,
        canWorkOvertime: true,
        isNightShift: true
      },
      {
        id: 'short_day',
        name: '短白班',
        startTime: '08:30',
        endTime: '12:00',
        standardHours: 3.5,
        actualHours: 3.5,
        breakHours: 0,
        priority: 4,
        canWorkOvertime: false,
        isNightShift: false
      }
    ];
  }

  /**
   * 获取所有可用班次
   */
  getAvailableShifts(): ShiftDefinition[] {
    return [...this.shifts];
  }

  /**
   * 根据操作时间推断班次
   * @param operations 当天该员工的所有操作
   * @returns 最合适的班次
   */
  inferShiftFromOperations(operations: OperationTimeRange[]): ShiftInference | null {
    if (operations.length === 0) {
      return null; // 没有操作，不需要班次
    }

    // 计算所有操作的时间范围
    const operationTimes = operations.map(op => ({
      start: dayjs(`${op.date} ${op.startTime}`),
      end: dayjs(`${op.date} ${op.endTime}`)
    }));

    // 找到最早开始和最晚结束的时间
    const earliestStart = operationTimes.reduce((min, curr) =>
      curr.start.isBefore(min) ? curr.start : min, operationTimes[0].start);

    const latestEnd = operationTimes.reduce((max, curr) =>
      curr.end.isAfter(max) ? curr.end : max, operationTimes[0].end);

    // 计算需要覆盖的时间窗口
    const requiredWindow = {
      start: earliestStart,
      end: latestEnd,
      duration: latestEnd.diff(earliestStart, 'hour', true)
    };

    console.log(`[班次推断] 操作时间窗口: ${requiredWindow.start.format('HH:mm')} - ${requiredWindow.end.format('HH:mm')} (${requiredWindow.duration.toFixed(1)}h)`);

    // 找到能覆盖该时间窗口的班次
    const suitableShifts = this.findSuitableShifts(requiredWindow);

    if (suitableShifts.length === 0) {
      console.warn(`[班次推断] 未找到能覆盖时间窗口的班次`);
      return null;
    }

    // 按优先级选择最合适的班次
    const bestShift = this.selectBestShift(suitableShifts, requiredWindow);

    return {
      shift: bestShift,
      requiredWindow,
      coverage: this.calculateCoverage(bestShift, requiredWindow),
      alternatives: suitableShifts.filter(s => s.id !== bestShift.id)
    };
  }

  /**
   * 查找能覆盖指定时间窗口的班次
   */
  private findSuitableShifts(window: TimeWindow): ShiftDefinition[] {
    return this.shifts.filter(shift => {
      // 检查班次是否能覆盖所需的时间窗口
      const shiftStart = dayjs(`${window.start.format('YYYY-MM-DD')} ${shift.startTime}`);
      const shiftEnd = dayjs(`${window.start.format('YYYY-MM-DD')} ${shift.endTime}`);

      // 处理跨天班次（如夜班）
      if (shiftEnd.isBefore(shiftStart)) {
        shiftEnd.add(1, 'day');
      }

      // 检查覆盖范围
      const coversStart = shiftStart.isSameOrBefore(window.start);
      const coversEnd = shiftEnd.isSameOrAfter(window.end);

      return coversStart && coversEnd;
    });
  }

  /**
   * 从候选班次中选择最优的
   */
  private selectBestShift(shifts: ShiftDefinition[], window: TimeWindow): ShiftDefinition {
    return shifts.sort((a, b) => {
      // 优先级排序（数字小的优先）
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      // 覆盖范围排序（覆盖更紧凑的优先）
      const aCoverage = this.calculateCoverage(a, window);
      const bCoverage = this.calculateCoverage(b, window);
      const aExtraTime = aCoverage.extraHours;
      const bExtraTime = bCoverage.extraHours;

      if (Math.abs(aExtraTime - bExtraTime) > 0.1) {
        return aExtraTime - bExtraTime; // 覆盖更紧凑的优先
      }

      // 标准工时排序（工时少的优先，减少成本）
      return a.standardHours - b.standardHours;
    })[0];
  }

  /**
   * 计算班次对时间窗口的覆盖情况
   */
  private calculateCoverage(shift: ShiftDefinition, window: TimeWindow): ShiftCoverage {
    const shiftStart = dayjs(`${window.start.format('YYYY-MM-DD')} ${shift.startTime}`);
    const shiftEnd = dayjs(`${window.start.format('YYYY-MM-DD')} ${shift.endTime}`);

    // 处理跨天班次
    let actualShiftEnd = shiftEnd;
    if (shiftEnd.isBefore(shiftStart)) {
      actualShiftEnd = shiftEnd.add(1, 'day');
    }

    const extraBefore = window.start.diff(shiftStart, 'hour', true);
    const extraAfter = actualShiftEnd.diff(window.end, 'hour', true);
    const totalExtra = Math.max(0, extraBefore) + Math.max(0, extraAfter);

    return {
      coversStart: shiftStart.isSameOrBefore(window.start),
      coversEnd: actualShiftEnd.isSameOrAfter(window.end),
      extraHoursBefore: Math.max(0, extraBefore),
      extraHoursAfter: Math.max(0, extraAfter),
      extraHours: totalExtra,
      totalShiftHours: shift.standardHours
    };
  }

  /**
   * 获取指定班次定义
   */
  getShiftById(shiftId: string): ShiftDefinition | undefined {
    return this.shifts.find(s => s.id === shiftId);
  }

  /**
   * 添加自定义班次
   */
  addShift(shift: ShiftDefinition): void {
    // 检查ID是否重复
    if (this.shifts.some(s => s.id === shift.id)) {
      throw new Error(`班次ID ${shift.id} 已存在`);
    }

    this.shifts.push(shift);
  }

  /**
   * 移除班次
   */
  removeShift(shiftId: string): boolean {
    const index = this.shifts.findIndex(s => s.id === shiftId);
    if (index >= 0) {
      this.shifts.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 更新班次配置
   */
  updateShift(shiftId: string, updates: Partial<ShiftDefinition>): boolean {
    const shift = this.shifts.find(s => s.id === shiftId);
    if (shift) {
      Object.assign(shift, updates);
      return true;
    }
    return false;
  }
}

/**
 * 班次定义
 */
export interface ShiftDefinition {
  id: string;
  name: string;
  startTime: string; // HH:mm 格式
  endTime: string;   // HH:mm 格式
  standardHours: number; // 折算工时
  actualHours: number;   // 实际在岗时间
  breakHours: number;    // 不定时休息时间
  priority: number;      // 优先级（数字越小优先级越高）
  canWorkOvertime: boolean;
  isNightShift: boolean;
}

/**
 * 操作时间范围
 */
export interface OperationTimeRange {
  date: string;
  startTime: string;
  endTime: string;
  operationId: number;
}

/**
 * 时间窗口
 */
interface TimeWindow {
  start: dayjs.Dayjs;
  end: dayjs.Dayjs;
  duration: number;
}

/**
 * 班次覆盖情况
 */
interface ShiftCoverage {
  coversStart: boolean;
  coversEnd: boolean;
  extraHoursBefore: number;
  extraHoursAfter: number;
  extraHours: number;
  totalShiftHours: number;
}

/**
 * 班次推断结果
 */
export interface ShiftInference {
  shift: ShiftDefinition;
  requiredWindow: TimeWindow;
  coverage: ShiftCoverage;
  alternatives: ShiftDefinition[];
}
