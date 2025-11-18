import axios from 'axios';
import dayjs from 'dayjs';

/**
 * 工作日历服务
 * 负责从外部API获取工作日和节假日信息
 */
export class CalendarService {
  private calendarCache: Map<string, CalendarDay[]> = new Map();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时缓存

  /**
   * 获取指定时间范围的工作日历
   */
  async getCalendarDays(startDate: string, endDate: string): Promise<CalendarDay[]> {
    const cacheKey = `${startDate}-${endDate}`;
    const cached = this.calendarCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      // 调用外部工作日历API
      const response = await axios.get('https://api.example.com/calendar', {
        params: {
          start_date: startDate,
          end_date: endDate
        }
      });

      const days: CalendarDay[] = response.data.map((day: any) => ({
        date: day.date,
        isWorkday: day.is_workday,
        isHoliday: day.is_holiday,
        holidayName: day.holiday_name
      }));

      // 缓存结果
      this.calendarCache.set(cacheKey, days);

      return days;
    } catch (error) {
      console.error('获取工作日历失败:', error);
      // 返回默认工作日历（周一到周五为工作日）
      return this.generateDefaultCalendar(startDate, endDate);
    }
  }

  /**
   * 计算指定时间范围内的标准工时
   * 标准工时 = 工作日数量 × 8小时
   */
  async calculateStandardHours(startDate: string, endDate: string): Promise<number> {
    const calendarDays = await this.getCalendarDays(startDate, endDate);
    const workdays = calendarDays.filter(day => day.isWorkday).length;
    return workdays * 8; // 每工作日8小时
  }

  /**
   * 获取季度标准工时
   */
  async getQuarterStandardHours(year: number, quarter: number): Promise<number> {
    const quarterStart = dayjs(`${year}-01-01`).quarter(quarter).startOf('quarter');
    const quarterEnd = dayjs(`${year}-01-01`).quarter(quarter).endOf('quarter');

    return this.calculateStandardHours(
      quarterStart.format('YYYY-MM-DD'),
      quarterEnd.format('YYYY-MM-DD')
    );
  }

  /**
   * 获取月度标准工时
   */
  async getMonthStandardHours(year: number, month: number): Promise<number> {
    const monthStart = dayjs(`${year}-${month.toString().padStart(2, '0')}-01`).startOf('month');
    const monthEnd = dayjs(`${year}-${month.toString().padStart(2, '0')}-01`).endOf('month');

    return this.calculateStandardHours(
      monthStart.format('YYYY-MM-DD'),
      monthEnd.format('YYYY-MM-DD')
    );
  }

  /**
   * 生成默认工作日历（当API不可用时）
   */
  private generateDefaultCalendar(startDate: string, endDate: string): CalendarDay[] {
    const days: CalendarDay[] = [];
    const start = dayjs(startDate);
    const end = dayjs(endDate);

    let current = start;
    while (current.isSameOrBefore(end)) {
      const dayOfWeek = current.day(); // 0=周日, 1=周一, ..., 6=周六
      const isWorkday = dayOfWeek >= 1 && dayOfWeek <= 5; // 周一到周五为工作日

      days.push({
        date: current.format('YYYY-MM-DD'),
        isWorkday,
        isHoliday: !isWorkday,
        holidayName: isWorkday ? null : '周末'
      });

      current = current.add(1, 'day');
    }

    return days;
  }

  /**
   * 检查指定日期是否为工作日
   */
  async isWorkday(date: string): Promise<boolean> {
    const calendarDays = await this.getCalendarDays(date, date);
    return calendarDays.length > 0 ? calendarDays[0].isWorkday : false;
  }

  /**
   * 获取指定时间范围的工作日数量
   */
  async getWorkdayCount(startDate: string, endDate: string): Promise<number> {
    const calendarDays = await this.getCalendarDays(startDate, endDate);
    return calendarDays.filter(day => day.isWorkday).length;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.calendarCache.clear();
  }
}

/**
 * 日历日信息
 */
export interface CalendarDay {
  date: string;
  isWorkday: boolean;
  isHoliday: boolean;
  holidayName: string | null;
}
