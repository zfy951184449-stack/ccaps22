"""
Time Utilities for Solver V4

IMPORTANT: 
- Operation times (planned_start, planned_end) are stored in UTC (ISO 8601 with Z or +00:00)
- Shift times (start_time, end_time) are defined in LOCAL time (Beijing, UTC+8)
- All comparisons must use Unix timestamps for consistency
"""

from datetime import datetime, timezone, timedelta
import logging

logger = logging.getLogger("Utils.Time")

# Beijing timezone (UTC+8)
BEIJING_TZ = timezone(timedelta(hours=8))
UTC_TZ = timezone.utc

def parse_iso_to_unix(iso_str: str) -> int:
    """
    Parse ISO 8601 string to Unix timestamp (seconds).
    Assumes string format: YYYY-MM-DDTHH:MM:SS (or similar compatible with fromisoformat)
    
    Args:
        iso_str: Date string (e.g., "2023-10-27T08:00:00")
        
    Returns:
        int: Unix timestamp in seconds
    """
    try:
        # Handle cases with Z or offset if necessary, keeping it simple for now as per V4 context
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return int(dt.timestamp())
    except Exception as e:
        logger.error(f"Failed to parse time string '{iso_str}': {e}")
        return 0

def get_date_range(start_date: str, end_date: str) -> list[str]:
    """
    Get list of date strings (YYYY-MM-DD) between start and end (inclusive).
    """
    from datetime import timedelta
    dates = []
    try:
        s = datetime.fromisoformat(start_date.split('T')[0])
        e = datetime.fromisoformat(end_date.split('T')[0])
        curr = s
        while curr <= e:
            dates.append(curr.strftime("%Y-%m-%d"))
            curr += timedelta(days=1)
    except Exception as e:
        logger.error(f"Error generating date range: {e}")
    return dates

def combine_date_time_to_unix(date_str: str, time_str: str, next_day=False) -> int:
    """
    Combine date (YYYY-MM-DD) and time (HH:MM or HH:MM:SS) to Unix timestamp.
    
    IMPORTANT: The time is assumed to be in LOCAL time (Beijing, UTC+8).
    This function converts it to UTC for correct comparison with operation times.
    
    If next_day is True, adds 1 day to the date (for night shifts crossing midnight).
    
    Args:
        date_str: Date in YYYY-MM-DD format
        time_str: Time in HH:MM or HH:MM:SS format (LOCAL/Beijing time)
        next_day: If True, add 1 day (for shifts crossing midnight)
        
    Returns:
        int: Unix timestamp in seconds (UTC-based)
    """
    try:
        dt_str = f"{date_str}T{time_str}"
        # Handle simple formats
        if len(time_str) == 5: # HH:MM
            dt_str += ":00"
            
        # Parse as naive datetime first
        dt_naive = datetime.fromisoformat(dt_str)
        
        # Apply next_day offset before timezone conversion
        if next_day:
            dt_naive += timedelta(days=1)
        
        # Attach Beijing timezone (the time is defined in local time)
        dt_beijing = dt_naive.replace(tzinfo=BEIJING_TZ)
        
        # Convert to Unix timestamp (which is always UTC-based)
        return int(dt_beijing.timestamp())
    except Exception as e:
        logger.error(f"Error combining date {date_str} + time {time_str}: {e}")
        return 0
