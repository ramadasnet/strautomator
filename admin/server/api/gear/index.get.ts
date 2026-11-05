// Strautomator Admin API: get gearwear (search or paged list)

import {GearWearConfig, database} from "strautomator-core"
import {getUserSummaries, pagedSearch, parsePage, PAGE_SIZE} from "../../utils/admin"
import {prefixQuery, MAX_RESULTS} from "../../utils/prefixSearch"
import logger from "anyhow"
import _ from "lodash"

/**
 * Search gear by ID (prefix), user ID (prefix) or gear name (prefix, as typed and capitalized).
 * @param search The search term.
 */
const searchGear = async (search: string): Promise<GearWearConfig[]> => {
    // Gear IDs are lowercase Strava IDs.
    if (/^[a-z][0-9]*$/i.test(search)) {
        return database.search("gearwear", prefixQuery("id", search.toLowerCase()), undefined, MAX_RESULTS)
    }
    if (!isNaN(search as any)) {
        return database.search("gearwear", prefixQuery("userId", search), undefined, MAX_RESULTS)
    }
    const capitalized = search.charAt(0).toUpperCase() + search.slice(1)
    const searches = await Promise.all([database.search("gearwear", prefixQuery("name", search), undefined, MAX_RESULTS), database.search("gearwear", prefixQuery("name", capitalized), undefined, MAX_RESULTS)])
    return _.uniqBy(_.concat(...searches), "id")
}

export default defineEventHandler(async (e) => {
    const query = getQuery(e)
    const search = query.search?.toString().trim()
    const page = parsePage(query.page)

    try {
        let result: {items: GearWearConfig[]; total: number; page: number; pageSize: number; truncated?: boolean}

        if (search) {
            const gear = await searchGear(search)
            result = {items: gear.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: gear.length, page, pageSize: PAGE_SIZE, truncated: gear.length >= MAX_RESULTS}
        } else {
            // Sorting by last update skips gear that was never updated, so the "id" sort lists everything.
            const where = query.filter == "disabled" ? [["disabled", "==", true]] : []
            const orderBy: [string, "desc"] = where.length == 0 && query.sort != "id" ? ["lastUpdate.date", "desc"] : null
            result = await pagedSearch("gearwear", where, orderBy, page)
        }

        const userSummaries = await getUserSummaries(result.items.map((g) => g.userId))
        for (let gear of result.items) {
            gear.disabled = gear.disabled || false
            gear["user"] = userSummaries[gear.userId] || null
            delete gear.recentActivities
        }

        logger.info("Route.gearwear", search || query.filter || "all", `Page ${page}`, `${result.total} total`)
        return result
    } catch (ex) {
        logger.error("Route.gearwear", search, ex)
        throw ex
    }
})
