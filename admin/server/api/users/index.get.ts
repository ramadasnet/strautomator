// Strautomator Admin API: get users (prefix search or paged list with filters)

import {UserData, database} from "strautomator-core"
import {pagedSearch, parsePage, PAGE_SIZE} from "../../utils/admin"
import {prefixQuery, MAX_RESULTS} from "../../utils/prefixSearch"
import logger from "anyhow"
import _ from "lodash"

/**
 * Filters available on the paged list. Filtered lists are not sorted, as Firestore would need composite indexes.
 */
const FILTERS = {
    pro: [["isPro", "==", true]],
    trial: [["isTrial", "==", true]],
    suspended: [["suspended", "==", true]],
    writeSuspended: [["writeSuspended", "==", true]],
    debug: [["debug", "==", true]],
    garmin: [["garmin.tokens.accessToken", "!=", ""]],
    wahoo: [["wahoo.tokens.accessToken", "!=", ""]],
    spotify: [["spotify.tokens.accessToken", "!=", ""]],
    ai: [["preferences.aiEnabled", "==", true]]
}

const SORT_FIELDS = ["dateLogin", "dateRegistered", "dateLastActivity"]

/**
 * Compact user details for lists.
 * @param user The user data.
 */
const listView = (user: UserData) => ({
    id: user.id,
    displayName: user.displayName,
    name: _.compact([user.profile?.firstName, user.profile?.lastName]).join(" "),
    username: user.profile?.username,
    email: user.email,
    countryCode: user.countryCode,
    isPro: user.isPro || false,
    isTrial: user.isTrial || false,
    suspended: user.suspended || false,
    writeSuspended: user.writeSuspended || false,
    debug: user.debug || false,
    subscriptionId: user.subscriptionId,
    recipeCount: user.recipeCount || Object.keys(user.recipes || {}).length,
    activityCount: user.activityCount || 0,
    bikeCount: user.profile?.bikes?.length || 0,
    shoeCount: user.profile?.shoes?.length || 0,
    garmin: !!user.garmin?.id,
    wahoo: !!user.wahoo?.id,
    spotify: !!user.spotify?.id,
    authFailures: user.authFailures || 0,
    dateLogin: user.dateLogin,
    dateRegistered: user.dateRegistered,
    dateLastActivity: user.dateLastActivity
})

/**
 * Search users by ID, subscription ID, email, username or name (prefix matching).
 * @param search The search term.
 */
const searchUsers = async (search: string): Promise<{users: UserData[]; truncated: boolean}> => {
    const term = search.toLowerCase()
    const capitalized = term.charAt(0).toUpperCase() + term.slice(1)

    // Firestore has no case-insensitive or substring operators, so search with prefix ranges on the single-field
    // indexes: usernames and emails are stored lowercase, while profile names are stored capitalized.
    const searches = await Promise.all([
        database.search("users", prefixQuery("email", term), undefined, MAX_RESULTS),
        database.search("users", prefixQuery("profile.username", term), undefined, MAX_RESULTS),
        database.search("users", prefixQuery("profile.firstName", term), undefined, MAX_RESULTS),
        database.search("users", prefixQuery("profile.firstName", capitalized), undefined, MAX_RESULTS),
        database.search("users", prefixQuery("profile.lastName", term), undefined, MAX_RESULTS),
        database.search("users", prefixQuery("profile.lastName", capitalized), undefined, MAX_RESULTS)
    ])
    const truncated = searches.some((s) => s.length >= MAX_RESULTS)

    // Exact ID or subscription ID, listed first so they rank on top of prefix matches.
    const exact = search.includes("-") || search.includes("_") || /[a-z]/i.test(search) ? await database.search("users", ["subscriptionId", "==", search]) : await database.search("users", ["id", "==", search])
    const users: UserData[] = _.uniqBy(_.concat(exact, ...searches), "id").slice(0, MAX_RESULTS)

    return {users, truncated}
}

export default defineEventHandler(async (e) => {
    const query = getQuery(e)
    const search = query.search?.toString().trim()
    const page = parsePage(query.page)

    try {
        if (search) {
            const {users, truncated} = await searchUsers(search)
            const items = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(listView)
            logger.info("Route.users", search, `${users.length} users found${truncated ? " (truncated)" : ""}`)
            return {items, total: users.length, page, pageSize: PAGE_SIZE, truncated}
        }

        const filter = query.filter?.toString() || ""
        const where = FILTERS[filter] || []
        const sort = SORT_FIELDS.includes(query.sort as string) ? (query.sort as string) : "dateLogin"
        const orderBy: [string, "desc"] = where.length == 0 ? [sort, "desc"] : null

        const result = await pagedSearch("users", where, orderBy, page)
        logger.info("Route.users", filter || "all", orderBy ? `Sorted by ${sort}` : "Unsorted", `Page ${page}`, `${result.total} total`)

        return {...result, items: result.items.map(listView), truncated: false}
    } catch (ex) {
        logger.error("Route.users", search || query.filter, ex)
        throw ex
    }
})
