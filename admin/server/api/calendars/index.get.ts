// Strautomator Admin API: get calendars (search or paged list)

import {CalendarData, database} from "strautomator-core"
import {getUserSummaries, pagedSearch, parsePage, PAGE_SIZE} from "../../utils/admin"
import {prefixQuery, MAX_RESULTS} from "../../utils/prefixSearch"
import logger from "anyhow"
import _ from "lodash"

/**
 * Search calendars by ID or user ID (prefix matching).
 * @param search The search term.
 */
const searchCalendars = async (search: string): Promise<CalendarData[]> => {
    // Calendar IDs are hashed strings, matched by prefix (as typed and lowercase).
    if (isNaN(search as any)) {
        const searches = await Promise.all([database.search("calendars", prefixQuery("id", search), undefined, MAX_RESULTS), database.search("calendars", prefixQuery("id", search.toLowerCase()), undefined, MAX_RESULTS)])
        return _.uniqBy(_.concat(...searches), "id")
    }
    return database.search("calendars", prefixQuery("userId", search), undefined, MAX_RESULTS)
}

export default defineEventHandler(async (e) => {
    const query = getQuery(e)
    const search = query.search?.toString().trim()
    const page = parsePage(query.page)

    try {
        let result: {items: CalendarData[]; total: number; page: number; pageSize: number; truncated?: boolean}

        if (search) {
            const calendars = await searchCalendars(search)
            result = {items: calendars.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: calendars.length, page, pageSize: PAGE_SIZE, truncated: calendars.length >= MAX_RESULTS}
        } else {
            result = await pagedSearch("calendars", [], ["dateAccess", "desc"], page)
        }

        const userSummaries = await getUserSummaries(result.items.map((c) => c.userId))
        for (let cal of result.items) {
            cal["user"] = userSummaries[cal.userId] || null
            delete cal.clubIds
        }

        logger.info("Route.calendars", search || "all", `Page ${page}`, `${result.total} total`)
        return result
    } catch (ex) {
        logger.error("Route.calendars", search, ex)
        throw ex
    }
})
