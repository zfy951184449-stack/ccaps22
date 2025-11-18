// 人员排班界面日历API使用示例
// 前端如何使用 /api/calendar/workdays 接口返回的数据

interface CalendarDay {
  calendar_date: string;
  is_workday: number;
  holiday_name: string | null;
  holiday_type: string | null;
  source: string | null;
  is_weekend: boolean;
  is_triple_salary: boolean;
  salary_multiplier: number;
  config_source: string | null;
  display_info: {
    is_holiday: boolean;
    is_legal_holiday: boolean;
    is_makeup_work: boolean;
    is_weekend_adjustment: boolean;
    requires_triple_salary: boolean;
    day_of_week: number;
    day_name: string;
  };
}

// 前端获取日历数据
async function fetchCalendarData(startDate: string, endDate: string): Promise<CalendarDay[]> {
  const response = await fetch(`/api/calendar/workdays?start_date=${startDate}&end_date=${endDate}`);
  if (!response.ok) {
    throw new Error('Failed to fetch calendar data');
  }
  return response.json();
}

// 根据日期信息生成CSS类名
function getDayClasses(day: CalendarDay): string[] {
  const classes: string[] = [];

  // 基础工作日状态
  if (day.is_workday === 0) {
    classes.push('non-workday');
  } else {
    classes.push('workday');
  }

  // 周末标识
  if (day.is_weekend) {
    classes.push('weekend');
  }

  // 节假日类型
  if (day.display_info.is_holiday) {
    classes.push('holiday');

    if (day.display_info.is_legal_holiday) {
      classes.push('legal-holiday');
    } else if (day.display_info.is_makeup_work) {
      classes.push('makeup-work');
    } else if (day.display_info.is_weekend_adjustment) {
      classes.push('weekend-adjustment');
    }
  }

  // 3倍工资标识
  if (day.display_info.requires_triple_salary) {
    classes.push('triple-salary');
  }

  return classes;
}

// 根据日期信息生成显示文本
function getDayDisplayText(day: CalendarDay): string {
  const parts: string[] = [];

  // 节假日名称
  if (day.holiday_name) {
    parts.push(day.holiday_name);
  }

  // 3倍工资标识
  if (day.display_info.requires_triple_salary) {
    parts.push('💰3倍');
  }

  // 周末标识
  if (day.is_weekend && !day.display_info.is_holiday) {
    parts.push('周末');
  }

  return parts.join(' ');
}

// React组件示例
function CalendarDayComponent({ day }: { day: CalendarDay }) {
  const classes = getDayClasses(day);
  const displayText = getDayDisplayText(day);

  return (
    <div className={`calendar-day ${classes.join(' ')}`}>
      <div className="day-number">
        {day.calendar_date.split('-')[2]}
      </div>
      <div className="day-info">
        {displayText && <span className="day-label">{displayText}</span>}
      </div>
      <div className="day-week">
        周{day.display_info.day_name}
      </div>
    </div>
  );
}

// CSS样式示例
const calendarStyles = `
.calendar-day {
  padding: 8px;
  border: 1px solid #ddd;
  min-height: 80px;
  position: relative;
}

/* 工作日状态 */
.calendar-day.workday {
  background-color: #ffffff;
}

.calendar-day.non-workday {
  background-color: #f8f9fa;
}

/* 周末标识 */
.calendar-day.weekend {
  background-color: #fff3cd;
}

/* 节假日类型 */
.calendar-day.holiday {
  font-weight: bold;
}

.calendar-day.legal-holiday {
  background-color: #d1ecf1;
  border-left: 4px solid #17a2b8;
}

.calendar-day.makeup-work {
  background-color: #d4edda;
  border-left: 4px solid #28a745;
}

.calendar-day.weekend-adjustment {
  background-color: #f8d7da;
  border-left: 4px solid #dc3545;
}

/* 3倍工资标识 */
.calendar-day.triple-salary {
  position: relative;
}

.calendar-day.triple-salary::after {
  content: '💰';
  position: absolute;
  top: 2px;
  right: 2px;
  font-size: 12px;
}

.day-label {
  font-size: 10px;
  color: #666;
  display: block;
  margin-top: 2px;
}

.day-week {
  font-size: 9px;
  color: #999;
  position: absolute;
  bottom: 2px;
  right: 2px;
}
`;

// 使用示例
async function renderCalendar() {
  try {
    const calendarData = await fetchCalendarData('2024-01-01', '2024-01-31');

    const calendarElement = document.getElementById('calendar');
    calendarElement.innerHTML = '';

    calendarData.forEach(day => {
      const dayElement = document.createElement('div');
      dayElement.className = `calendar-day ${getDayClasses(day).join(' ')}`;

      dayElement.innerHTML = `
        <div class="day-number">${day.calendar_date.split('-')[2]}</div>
        <div class="day-info">
          ${getDayDisplayText(day) ? `<span class="day-label">${getDayDisplayText(day)}</span>` : ''}
        </div>
        <div class="day-week">周${day.display_info.day_name}</div>
      `;

      calendarElement.appendChild(dayElement);
    });
  } catch (error) {
    console.error('Failed to render calendar:', error);
  }
}

export {
  fetchCalendarData,
  getDayClasses,
  getDayDisplayText,
  CalendarDayComponent,
  calendarStyles,
  renderCalendar
};
