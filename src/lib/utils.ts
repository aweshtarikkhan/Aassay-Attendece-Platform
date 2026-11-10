import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely format any time value (12h format like "09:30 AM", 24h like "09:30:00",
 * ISO string, or Date) without throwing RangeError: Invalid time value.
 */
export function safeFormatTime(timeVal: any, fallback = "-", formatPattern = "hh:mm a"): string {
  if (!timeVal) return fallback;
  if (typeof timeVal === "string") {
    let trimmed = timeVal.trim();
    if (!trimmed) return fallback;
    // Strip duplicated ISO prefixes like "2026-11-05T2026-11-05T09:30:00"
    if (trimmed.includes('T') && trimmed.indexOf('T') !== trimmed.lastIndexOf('T')) {
      trimmed = trimmed.substring(trimmed.lastIndexOf('T') - 10);
    }
    if (/^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(trimmed)) {
      if (formatPattern === "HH:mm") {
        try {
          const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
          if (match) {
            let h = parseInt(match[1], 10);
            const m = match[2];
            const ampm = match[3]?.toUpperCase();
            if (ampm === "PM" && h < 12) h += 12;
            if (ampm === "AM" && h === 12) h = 0;
            return `${String(h).padStart(2, "0")}:${m}`;
          }
        } catch {}
      }
      return trimmed;
    }
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      try {
        const [hh, mm] = trimmed.split(":");
        const h = parseInt(hh, 10);
        if (formatPattern === "HH:mm") {
          return `${String(h).padStart(2, "0")}:${mm}`;
        }
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 || 12;
        return `${String(h12).padStart(2, "0")}:${mm} ${ampm}`;
      } catch {
        return trimmed;
      }
    }
    try {
      const d = parseISO(trimmed);
      if (!isNaN(d.getTime())) {
        return format(d, formatPattern);
      }
    } catch {}
    try {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        return format(d, formatPattern);
      }
    } catch {}
    return fallback;
  }
  if (timeVal instanceof Date && !isNaN(timeVal.getTime())) {
    try {
      return format(timeVal, formatPattern);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Safely format any date value without throwing RangeError: Invalid time value.
 */
export function safeFormatDate(dateVal: any, formatPattern = "MMM dd, yyyy", fallback = "-"): string {
  if (!dateVal) return fallback;
  try {
    if (typeof dateVal === "string") {
      let trimmed = dateVal.trim();
      if (trimmed.includes('T') && trimmed.indexOf('T') !== trimmed.lastIndexOf('T')) {
        trimmed = trimmed.substring(trimmed.lastIndexOf('T') - 10);
      }
      const d = parseISO(trimmed);
      if (!isNaN(d.getTime())) {
        return format(d, formatPattern);
      }
      const d2 = new Date(trimmed);
      if (!isNaN(d2.getTime())) {
        return format(d2, formatPattern);
      }
    } else if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
      return format(dateVal, formatPattern);
    }
  } catch {}
  return fallback;
}

/**
 * Safely parse a date or string into a valid Date object.
 * Returns null if invalid, never throws RangeError: Invalid time value.
 */
export function safeParseDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === 'string') {
    let trimmed = val.trim();
    if (!trimmed) return null;
    if (trimmed.includes('T') && trimmed.indexOf('T') !== trimmed.lastIndexOf('T')) {
      trimmed = trimmed.substring(trimmed.lastIndexOf('T') - 10);
    }
    try {
      const d = parseISO(trimmed);
      if (!isNaN(d.getTime())) return d;
    } catch {}
    try {
      const d2 = new Date(trimmed);
      if (!isNaN(d2.getTime())) return d2;
    } catch {}
  }
  return null;
}

/**
 * Safely format date and time into a valid ISO string.
 * Handles "14:00", "02:pm", "2:00 PM", "14:00:00", ISO strings, etc.
 * Never throws RangeError: Invalid time value.
 */
export function toSafeIsoTime(dateStr: string, timeStr: string | null | undefined): string | null {
  if (!timeStr) return null;
  const cleanTime = String(timeStr).trim();
  if (!cleanTime) return null;

  // If already a valid ISO string with T
  if (cleanTime.includes('T')) {
    const parsed = safeParseDate(cleanTime);
    if (parsed) return parsed.toISOString();
  }

  // Handle 12h or 24h times like "02:pm", "2:30 PM", "14:00", "14:00:00"
  const match = cleanTime.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i) ||
                cleanTime.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = match[2] || '00';
    const ampm = match[3]?.toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const cleanDate = (dateStr || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    const d = new Date(`${cleanDate}T${hh}:${mm}:00`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const fallbackDate = safeParseDate(cleanTime);
  return fallbackDate ? fallbackDate.toISOString() : null;
}

