/**
 * Schedule Validation Utilities (Client-side)
 * 
 * Basic constraint validation for manual shift editing.
 * Only covers checks that can be done without backend data:
 * - Same-day shift conflict
 * - Max consecutive work days
 * 
 * Advanced checks (qualification, leave) require backend API.
 */

export interface ShiftAssignment {
    employee_id: number;
    date: string;
    shift_id: number;
    shift_name?: string;
    shift_code?: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    type: 'CONFLICT' | 'CONSECUTIVE_LIMIT';
    message: string;
}

export interface ValidationWarning {
    type: 'WEEKEND_OVERLOAD' | 'NIGHT_CONSECUTIVE';
    message: string;
}

/**
 * Validate a proposed shift change against existing assignments.
 * 
 * @param proposed - The new shift assignment to validate
 * @param existingShifts - All current shift assignments for the same employee
 * @param options - Validation options
 */
export function validateShiftChange(
    proposed: { employee_id: number; date: string; shift_id: number },
    existingShifts: ShiftAssignment[],
    options: {
        maxConsecutiveWorkDays?: number;
        restShiftIds?: number[];  // Shift IDs that represent REST
    } = {}
): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const { maxConsecutiveWorkDays = 7, restShiftIds = [0, 99] } = options;
    const isRestShift = restShiftIds.includes(proposed.shift_id);

    // 1. Check same-day conflict (excluding the date being changed)
    const sameDayShifts = existingShifts.filter(
        s => s.date === proposed.date && s.employee_id === proposed.employee_id
    );

    // If there's already a different shift on the same day (shouldn't happen in normal data,
    // but guard against it)
    if (sameDayShifts.length > 0 && !isRestShift) {
        const existing = sameDayShifts[0];
        if (existing.shift_id !== proposed.shift_id && existing.shift_id !== 0 && existing.shift_id !== 99) {
            // This is a replacement, not a conflict — that's fine
            // Only flag if there are multiple shifts on the same day
            if (sameDayShifts.length > 1) {
                errors.push({
                    type: 'CONFLICT',
                    message: `${proposed.date}: 该员工已有 ${sameDayShifts.length} 个班次，无法新增`
                });
            }
        }
    }

    // 2. Check consecutive work days
    if (!isRestShift) {
        const empShifts = existingShifts
            .filter(s => s.employee_id === proposed.employee_id && !restShiftIds.includes(s.shift_id))
            .map(s => s.date);

        // Add the proposed date
        const allWorkDates = new Set([...empShifts, proposed.date]);
        const sortedDates = Array.from(allWorkDates).sort();

        // Find the consecutive streak that includes the proposed date
        let streak = 1;
        const proposedIndex = sortedDates.indexOf(proposed.date);

        // Count backwards
        for (let i = proposedIndex - 1; i >= 0; i--) {
            const curr = new Date(sortedDates[i + 1]);
            const prev = new Date(sortedDates[i]);
            const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
            if (diffDays === 1) {
                streak++;
            } else {
                break;
            }
        }

        // Count forwards
        for (let i = proposedIndex + 1; i < sortedDates.length; i++) {
            const curr = new Date(sortedDates[i]);
            const prev = new Date(sortedDates[i - 1]);
            const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
            if (diffDays === 1) {
                streak++;
            } else {
                break;
            }
        }

        if (streak > maxConsecutiveWorkDays) {
            errors.push({
                type: 'CONSECUTIVE_LIMIT',
                message: `修改后将导致连续工作 ${streak} 天，超过上限 ${maxConsecutiveWorkDays} 天`
            });
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Get available shifts for a given date (from the result data's shift definitions).
 */
export function getAvailableShifts(
    shiftDefinitions: { shift_id: number; shift_name: string; shift_code: string }[]
): { value: number; label: string }[] {
    return shiftDefinitions.map(s => ({
        value: s.shift_id,
        label: `${s.shift_name} (${s.shift_code})`
    }));
}
