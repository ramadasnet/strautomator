// Strautomator Admin API: get user details, with subscriptions, gear, calendars and notifications

import {database} from "strautomator-core"
import {requireUser, userView} from "../../utils/admin"
import logger from "anyhow"
import _ from "lodash"

export default defineEventHandler(async (e) => {
    const userId = getRouterParam(e, "id")

    try {
        const user = await requireUser(userId)
        const where = ["userId", "==", user.id]

        const [subscriptions, gearwear, calendars, notifications] = await Promise.all([
            database.search("subscriptions", where),
            database.search("gearwear", where),
            database.search("calendars", where),
            database.search("notifications", where, ["dateCreated", "desc"], 50)
        ])

        logger.info("Route.users.id", user.id, user.displayName)

        return {
            user: userView(user),
            subscriptions: _.orderBy(subscriptions, (s) => s.dateUpdated?.valueOf() || 0, "desc"),
            gearwear: gearwear,
            calendars: calendars,
            notifications: notifications,
            recipes: Object.values(user.recipes || {}).map((r: any) => ({id: r.id, title: r.title, disabled: r.disabled || false, killSwitch: r.killSwitch || false, conditionCount: r.conditions?.length || 0, actionCount: r.actions?.length || 0}))
        }
    } catch (ex) {
        logger.error("Route.users.id", userId, ex)
        throw ex
    }
})
