// Formatting and parsing helpers shared by the admin pages.

import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"

dayjs.extend(relativeTime)

/**
 * Format a date as YYYY-MM-DD HH:mm (or only the date part), returns "-" for empty values.
 * @param value Date, ISO string or timestamp.
 * @param withTime Include the time? Default is true.
 */
export const formatDate = (value: any, withTime: boolean = true): string => {
    if (!value) return "-"
    const date = dayjs(value)
    return date.isValid() ? date.format(withTime ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD") : "-"
}

/**
 * Relative time from now (for example "3 days ago"), returns "-" for empty values.
 * @param value Date, ISO string or timestamp.
 */
export const fromNow = (value: any): string => {
    if (!value) return "-"
    const date = dayjs(value)
    return date.isValid() ? date.fromNow() : "-"
}

/**
 * Format a number with thousands separators, returns "-" for null / undefined.
 * @param value The number.
 */
export const formatNumber = (value: any): string => {
    if (value === null || value === undefined || value === "") return "-"
    return Number(value).toLocaleString("en-US", {maximumFractionDigits: 1})
}

/**
 * Get a readable error message from a failed request.
 * @param ex The exception.
 */
export const errorMessage = (ex: any): string => {
    return ex?.data?.message || ex?.statusMessage || ex?.message || String(ex)
}

/**
 * Convert a date to the value of a date input (YYYY-MM-DD).
 * @param value Date, ISO string or timestamp.
 */
export const toDateInput = (value: any): string => {
    return value ? dayjs(value).format("YYYY-MM-DD") : ""
}

/**
 * Convert a date to the value of a datetime-local input (YYYY-MM-DDTHH:mm).
 * @param value Date, ISO string or timestamp.
 */
export const toDateTimeInput = (value: any): string => {
    return value ? dayjs(value).format("YYYY-MM-DDTHH:mm") : ""
}

/**
 * Convert the value of a date / datetime-local input to an ISO string, or null if empty.
 * @param value Input value.
 */
export const fromDateInput = (value: string): string => {
    return value ? dayjs(value).toISOString() : null
}

/**
 * Color used for subscription statuses.
 * @param status The subscription status.
 */
export const statusColor = (status: string): string => {
    if (status == "ACTIVE") return "success"
    if (status == "TRIAL" || status == "APPROVED") return "info"
    if (status == "APPROVAL_PENDING" || status == "SUSPENDED") return "warning"
    return "grey"
}
