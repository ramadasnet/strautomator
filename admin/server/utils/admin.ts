// Shared helpers for the admin API: audit log, user sanitizing, paging and input parsing.

import {H3Event} from "h3"
import {UserData, database} from "strautomator-core"
import crypto from "crypto"
import dayjs from "dayjs"
import logger from "anyhow"
import _ from "lodash"

/**
 * Collection where admin actions are logged.
 */
export const AUDIT_COLLECTION: string = "admin-audit"

/**
 * Default page size for paged lists.
 */
export const PAGE_SIZE: number = 25

/**
 * User fields that must never leave the server (tokens, auth states, confirmation tokens).
 */
const SENSITIVE_USER_FIELDS: string[] = ["stravaTokens", "garmin.tokens", "wahoo.tokens", "spotify.tokens", "lastfm.tokens", "spotifyAuthState", "garminAuthState", "wahooAuthState", "urlToken", "confirmEmail"]

/**
 * Run an admin action and log it to the audit collection, with a pending / succeeded / failed status.
 * @param e The request event, used to get the admin email.
 * @param action Action name, for example "user.update".
 * @param target Target ID (user, subscription, gear, etc).
 * @param details Extra details to be logged.
 * @param work The actual action to be executed.
 */
export async function audited<T>(e: H3Event, action: string, target: string, details: any, work: () => Promise<T>): Promise<T> {
    const id = `${Date.now().toString(16)}${crypto.randomBytes(3).toString("hex")}`
    const entry: any = {id: id, actor: e.context.adminEmail || "unknown", action: action, target: target, details: sanitizeDetails(details), status: "pending", dateCreated: new Date()}

    try {
        // The database returns nothing when writes are disabled, which means no audit entry was stored.
        if (!(await database.set(AUDIT_COLLECTION, entry, id))) {
            throw new Error("Audit entry was not written (database writes disabled?)")
        }
    } catch (ex) {
        logger.error("Admin.audited", action, target, "Failed to write audit entry", ex)
        throw createError({statusCode: 503, message: "Could not write the audit log, the action was not executed"})
    }

    try {
        const result = await work()
        await database.merge(AUDIT_COLLECTION, {id: id, status: "succeeded", dateFinished: new Date()}).catch((ex) => logger.error("Admin.audited", action, target, ex))
        logger.info("Admin.audited", entry.actor, action, target, "Succeeded")
        return result
    } catch (ex) {
        const error = ex.data?.message || ex.statusMessage || ex.message || ex.toString()
        await database.merge(AUDIT_COLLECTION, {id: id, status: "failed", error: error, dateFinished: new Date()}).catch((innerEx) => logger.error("Admin.audited", action, target, innerEx))
        logger.error("Admin.audited", entry.actor, action, target, ex)
        throw ex
    }
}

/**
 * Remove undefined values from audit details (as Firestore can't store them), dates become ISO strings.
 * @param details Details to be sanitized.
 */
const sanitizeDetails = (details: any): any => {
    if (_.isNil(details)) return null
    return JSON.parse(JSON.stringify(details))
}

/**
 * Return a copy of the user without tokens and other sensitive fields, safe to be sent to the browser.
 * @param user The user data.
 */
export const userView = (user: UserData): Partial<UserData> => {
    if (!user) return null
    const result = _.cloneDeep(user)
    for (let field of SENSITIVE_USER_FIELDS) {
        _.unset(result, field)
    }
    return result
}

/**
 * Compact user summary used on lists (subscriptions, gear, calendars, notifications).
 * @param user The user data.
 */
export const userSummary = (user: UserData): any => {
    if (!user) return null
    return {
        id: user.id,
        displayName: user.displayName,
        name: _.compact([user.profile?.firstName, user.profile?.lastName]).join(" ") || user.displayName,
        email: user.email,
        countryCode: user.countryCode,
        isPro: user.isPro || false,
        suspended: user.suspended || false,
        units: user.profile?.units || "metric"
    }
}

/**
 * Get a user by ID, throws a 404 if not found.
 * @param id The user ID.
 */
export const requireUser = async (id: string): Promise<UserData> => {
    if (!id || !/^\d+$/.test(id)) {
        throw createError({statusCode: 400, message: "Invalid user ID"})
    }
    const user: UserData = await database.get("users", id)
    if (!user) {
        throw createError({statusCode: 404, message: `User ${id} not found`})
    }
    return user
}

/**
 * Get a document by ID, throws a 404 if not found.
 * @param collection The collection name.
 * @param id The document ID.
 */
export const requireDoc = async (collection: string, id: string): Promise<any> => {
    if (!id || typeof id != "string") {
        throw createError({statusCode: 400, message: "Invalid ID"})
    }
    const doc = await database.get(collection, id)
    if (!doc) {
        throw createError({statusCode: 404, message: `${_.capitalize(collection)} ${id} not found`})
    }
    return doc
}

/**
 * Get a list of user summaries indexed by ID, fetched in parallel.
 * @param ids List of user IDs.
 */
export const getUserSummaries = async (ids: string[]): Promise<{[id: string]: any}> => {
    const uniqueIds = _.uniq(ids.filter((id) => id && /^\d+$/.test(id)))
    const result = {}
    const users = await Promise.all(uniqueIds.map((id) => database.get("users", id).catch(() => null)))
    for (let user of users) {
        if (user) result[user.id] = userSummary(user)
    }
    return result
}

/**
 * Paged query using offset / limit, returning the items of the page and the total count.
 * Filtered queries should not pass a different orderBy field, as Firestore would require a composite index.
 * @param collection The collection name.
 * @param where List of [field, operator, value] queries.
 * @param orderBy Optional order by [field, direction].
 * @param page The page number, starting at 1.
 * @param pageSize Page size, defaults to PAGE_SIZE.
 */
export const pagedSearch = async (collection: string, where: any[][], orderBy: [string, "asc" | "desc"], page: number, pageSize?: number): Promise<{items: any[]; total: number; page: number; pageSize: number}> => {
    pageSize = pageSize || PAGE_SIZE
    page = Math.max(1, page || 1)

    let query: any = database.firestore.collection(`${collection}${database.collectionSuffix}`)
    for (let w of where || []) {
        query = query.where(w[0], w[1], w[2])
    }

    if (orderBy) {
        query = query.orderBy(orderBy[0], orderBy[1])
    }
    const countQuery = query

    const [snapshot, countSnapshot] = await Promise.all([
        query
            .offset((page - 1) * pageSize)
            .limit(pageSize)
            .get(),
        countQuery.count().get()
    ])

    const items = snapshot.docs.map((doc) => {
        const data = doc.data()
        database.transformData(data)
        data.id = doc.id
        return data
    })

    return {items: items, total: countSnapshot.data().count, page: page, pageSize: pageSize}
}

/**
 * Parse the page number from the query.
 * @param value Query value.
 */
export const parsePage = (value: any): number => {
    const page = parseInt(value)
    return isNaN(page) || page < 1 ? 1 : Math.min(page, 1000)
}

/**
 * Parse an optional date from the request body. Returns null for empty values, throws on invalid dates.
 * @param value The date value (ISO string or timestamp).
 * @param field Field name, used on the error message.
 */
export const parseDate = (value: any, field: string): Date => {
    if (_.isNil(value) || value === "") return null
    const date = dayjs(value)
    if (!date.isValid()) {
        throw createError({statusCode: 400, message: `Invalid date for ${field}`})
    }
    return date.toDate()
}

/**
 * Parse and validate a trimmed string from the request body.
 * @param value The string value.
 * @param field Field name, used on the error message.
 * @param maxLength Maximum length.
 * @param required Is it required?
 */
export const parseString = (value: any, field: string, maxLength: number, required?: boolean): string => {
    if (_.isNil(value)) value = ""
    if (typeof value != "string") {
        throw createError({statusCode: 400, message: `Invalid ${field}`})
    }
    value = value.trim()
    if (required && !value) {
        throw createError({statusCode: 400, message: `Missing ${field}`})
    }
    if (value.length > maxLength) {
        throw createError({statusCode: 400, message: `The ${field} must have up to ${maxLength} characters`})
    }
    return value
}

/**
 * Check if the subscription is a paid one (Paddle or PayPal) that can still charge the user.
 * @param subscription The subscription.
 */
export const isRenewingSubscription = (subscription: any): boolean => {
    return !!subscription && ["paddle", "paypal"].includes(subscription.source) && ["ACTIVE", "TRIAL", "APPROVED"].includes(subscription.status)
}

/**
 * Validate a link (href) used on notifications and announcements: internal paths or https URLs.
 * @param value The link.
 */
export const parseHref = (value: any): string => {
    const href = parseString(value, "link", 500)
    if (href && !/^\/(?![\/\\])/.test(href) && !/^https:\/\/[^\s]+$/i.test(href)) {
        throw createError({statusCode: 400, message: "Link must be an internal path (starting with /) or a https:// URL"})
    }
    return href
}
