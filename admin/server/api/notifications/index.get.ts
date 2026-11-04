// Strautomator Admin API: get notifications (most recent, optionally filtered by user)

import {BaseNotification} from "strautomator-core"
import {getUserSummaries, pagedSearch, parsePage} from "../../utils/admin"
import logger from "anyhow"

export default defineEventHandler(async (e) => {
    const query = getQuery(e)
    const userId = query.userId?.toString().trim()
    const page = parsePage(query.page)

    try {
        if (userId && !/^\d+$/.test(userId)) {
            throw createError({statusCode: 400, message: "Invalid user ID"})
        }

        const where = userId ? [["userId", "==", userId]] : []
        const result = await pagedSearch("notifications", where, ["dateCreated", "desc"], page)

        const userSummaries = await getUserSummaries(result.items.map((n: BaseNotification) => n.userId))
        for (let notification of result.items) {
            notification.user = userSummaries[notification.userId] || null
        }

        logger.info("Route.notifications", userId || "all", `Page ${page}`, `${result.total} total`)
        return result
    } catch (ex) {
        logger.error("Route.notifications", userId || "all", ex)
        throw ex
    }
})
