// Strautomator Admin API: delete a notification

import {BaseNotification, database} from "strautomator-core"
import {audited, requireDoc} from "../../utils/admin"
import logger from "anyhow"

export default defineEventHandler(async (e) => {
    const id = getRouterParam(e, "id")

    try {
        const notification: BaseNotification = await requireDoc("notifications", id)
        await audited(e, "notification.delete", notification.id, {userId: notification.userId, title: notification.title}, () => database.delete("notifications", notification.id))
        return {ok: true}
    } catch (ex) {
        logger.error("Route.notifications DELETE", id, ex)
        throw ex
    }
})
