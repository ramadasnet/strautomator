// Strautomator Admin API: get dashboard (live counts, app state and recent admin activity)

import {database} from "strautomator-core"
import {AUDIT_COLLECTION} from "../../utils/admin"
import dayjs from "dayjs"
import logger from "anyhow"
import _ from "lodash"

const SUBSCRIPTION_STATUSES = ["APPROVAL_PENDING", "APPROVED", "TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"]
const SUBSCRIPTION_SOURCES = ["paddle", "paypal", "github", "friend", "amex", "revolut", "traderepublic"]

/**
 * Count documents, returning null instead of failing the whole dashboard (missing indexes, timeouts etc).
 * @param collection The collection name.
 * @param where Optional list of queries.
 */
const safeCount = async (collection: string, where?: any[]): Promise<number> => {
    try {
        return await database.count(collection, where)
    } catch (ex) {
        logger.warn("Route.dashboard", collection, JSON.stringify(where || []), ex.message || ex)
        return null
    }
}

export default defineEventHandler(async () => {
    try {
        const now = dayjs()
        const day = now.subtract(1, "day").toDate()
        const week = now.subtract(7, "days").toDate()
        const month = now.subtract(30, "days").toDate()

        const [users, subscriptionsByStatus, subscriptionsBySource, content, integrations] = await Promise.all([
            Promise.all([
                safeCount("users"),
                safeCount("users", ["isPro", "==", true]),
                safeCount("users", ["isTrial", "==", true]),
                safeCount("users", ["suspended", "==", true]),
                safeCount("users", ["dateRegistered", ">=", day]),
                safeCount("users", ["dateRegistered", ">=", week]),
                safeCount("users", ["dateRegistered", ">=", month]),
                safeCount("users", ["dateLogin", ">=", week]),
                safeCount("users", ["dateLogin", ">=", month]),
                safeCount("users", ["dateLastActivity", ">=", day]),
                safeCount("users", ["dateLastActivity", ">=", month])
            ]),
            Promise.all(SUBSCRIPTION_STATUSES.map((status) => safeCount("subscriptions", ["status", "==", status]))),
            Promise.all(SUBSCRIPTION_SOURCES.map((source) => safeCount("subscriptions", ["source", "==", source]))),
            Promise.all([
                safeCount("gearwear"),
                safeCount("gearwear", ["disabled", "==", true]),
                safeCount("calendars"),
                safeCount("notifications", ["dateCreated", ">=", week]),
                safeCount("notifications", ["read", "==", false]),
                safeCount("activities", ["dateProcessed", ">=", day])
            ]),
            Promise.all([
                safeCount("users", ["garmin.tokens.accessToken", "!=", ""]),
                safeCount("users", ["wahoo.tokens.accessToken", "!=", ""]),
                safeCount("users", ["spotify.tokens.accessToken", "!=", ""]),
                safeCount("users", ["preferences.aiEnabled", "==", true])
            ])
        ])

        const [stats, gearwear, strava, paddle, announcements, audit] = await Promise.all([
            database.appState.get("stats"),
            database.appState.get("gearwear"),
            database.appState.get("strava"),
            database.appState.get("paddle"),
            database.search("announcements", ["dateExpiry", ">", now.toDate()]),
            database.search(AUDIT_COLLECTION, null, ["dateCreated", "desc"], 15).catch((ex) => {
                logger.warn("Route.dashboard", "Failed to load the audit entries", ex.message || ex)
                return []
            })
        ])

        const activeAnnouncements = announcements.filter((a) => !a.dateStart || a.dateStart <= now.toDate())

        return {
            dateUpdated: now.toDate(),
            users: {
                total: users[0],
                pro: users[1],
                trial: users[2],
                suspended: users[3],
                new24h: users[4],
                new7d: users[5],
                new30d: users[6],
                login7d: users[7],
                login30d: users[8],
                active24h: users[9],
                active30d: users[10]
            },
            subscriptions: {
                byStatus: _.zipObject(SUBSCRIPTION_STATUSES, subscriptionsByStatus),
                bySource: _.zipObject(SUBSCRIPTION_SOURCES, subscriptionsBySource)
            },
            content: {
                gearwear: content[0],
                gearwearDisabled: content[1],
                calendars: content[2],
                notifications7d: content[3],
                notificationsUnread: content[4],
                activities24h: content[5]
            },
            integrations: {
                garmin: integrations[0],
                wahoo: integrations[1],
                spotify: integrations[2],
                ai: integrations[3]
            },
            announcements: {
                active: activeAnnouncements.length,
                scheduled: announcements.length - activeAnnouncements.length
            },
            stats: stats || null,
            gearwear: gearwear ? _.pick(gearwear, ["dateLastProcessed", "recentUserCount", "recentActivityCount", "processing"]) : null,
            strava: strava ? _.pick(strava, ["incident", "dateIncidentCheck"]) : null,
            paddle: paddle ? _.pick(paddle, ["yearlyPrice", "lifetimePrice"]) : null,
            audit: audit
        }
    } catch (ex) {
        logger.error("Route.dashboard", ex)
        throw ex
    }
})
