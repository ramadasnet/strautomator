// Strautomator Admin API: get subscriptions (search or paged list with filters)

import {BaseSubscription, database} from "strautomator-core"
import {getUserSummaries, pagedSearch, parsePage, PAGE_SIZE} from "../../utils/admin"
import {prefixQuery, MAX_RESULTS} from "../../utils/prefixSearch"
import logger from "anyhow"
import _ from "lodash"

const STATUSES = ["APPROVAL_PENDING", "APPROVED", "TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"]
const SOURCES = ["amex", "friend", "github", "paddle", "paypal", "revolut", "traderepublic"]

/**
 * Search subscriptions by ID, source, user ID (prefix matching) or exact price.
 * @param search The search term.
 */
const searchSubscriptions = async (search: string): Promise<BaseSubscription[]> => {
    let result: BaseSubscription[]

    if (isNaN(search as any)) {
        if (search.substring(0, 2).toLowerCase() == "gh") {
            search = `GH${search.substring(2)}`
        }

        // Subscription IDs and source, matched by prefix. IDs are stored in mixed cases (GH, PayPal, Paddle),
        // so they are searched as typed, lowercase and uppercase.
        const searches = await Promise.all([
            database.search("subscriptions", prefixQuery("id", search), undefined, MAX_RESULTS),
            database.search("subscriptions", prefixQuery("id", search.toLowerCase()), undefined, MAX_RESULTS),
            database.search("subscriptions", prefixQuery("id", search.toUpperCase()), undefined, MAX_RESULTS),
            database.search("subscriptions", prefixQuery("source", search.toLowerCase()), undefined, MAX_RESULTS)
        ])
        result = _.uniqBy(_.concat(...searches), "id")
    } else if (search.includes(".")) {
        result = await database.search("subscriptions", ["price", "==", parseFloat(search)])
    } else {
        result = await database.search("subscriptions", prefixQuery("userId", search), undefined, MAX_RESULTS)
    }

    // Order by last update date, most recent first (sorted in memory, as Firestore would require a composite index).
    return _.orderBy(result, (sub) => sub.dateUpdated?.valueOf() || 0, "desc")
}

export default defineEventHandler(async (e) => {
    const query = getQuery(e)
    const search = query.search?.toString().trim()
    const page = parsePage(query.page)

    try {
        let result: {items: BaseSubscription[]; total: number; page: number; pageSize: number; truncated?: boolean}

        if (search) {
            const subs = await searchSubscriptions(search)
            result = {items: subs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: subs.length, page, pageSize: PAGE_SIZE, truncated: subs.length >= MAX_RESULTS}
        } else {
            const where = []
            if (STATUSES.includes(query.status as string)) where.push(["status", "==", query.status])
            if (SOURCES.includes(query.source as string)) where.push(["source", "==", query.source])
            const orderBy: [string, "desc"] = where.length == 0 ? ["dateUpdated", "desc"] : null
            result = await pagedSearch("subscriptions", where, orderBy, page)
        }

        const userSummaries = await getUserSummaries(result.items.map((s) => s.userId))
        for (let sub of result.items) {
            sub["user"] = userSummaries[sub.userId] || null
        }

        logger.info("Route.subscriptions", search || `${query.status || "any status"}, ${query.source || "any source"}`, `Page ${page}`, `${result.total} total`)
        return result
    } catch (ex) {
        logger.error("Route.subscriptions", search, ex)
        throw ex
    }
})
