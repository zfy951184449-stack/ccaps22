import dayjs from 'dayjs';
import HolidayService from '../services/holidayService';

class HolidayScheduler {
  private static lastRunToken: string | null = null;
  private static timer: NodeJS.Timeout | null = null;
  private static running = false;

  static start() {
    if (HolidayScheduler.timer) {
      return;
    }

    HolidayScheduler.runForCurrentMonth();
    HolidayScheduler.timer = setInterval(() => {
      HolidayScheduler.runForCurrentMonth();
    }, 1000 * 60 * 60 * 24);

    if (HolidayScheduler.timer.unref) {
      HolidayScheduler.timer.unref();
    }
  }

  private static async runForCurrentMonth() {
    if (HolidayScheduler.running) {
      return;
    }

    const now = dayjs();
    const token = now.format('YYYY-MM');
    if (HolidayScheduler.lastRunToken === token) {
      return;
    }

    HolidayScheduler.running = true;
    try {
      await HolidayService.ensureCalendarCoverage(now.startOf('month').format('YYYY-MM-DD'), now.endOf('month').format('YYYY-MM-DD'));
      HolidayScheduler.lastRunToken = token;
    } catch (error) {
      console.error('Monthly holiday import failed:', error);
    } finally {
      HolidayScheduler.running = false;
    }
  }
}

export default HolidayScheduler;
