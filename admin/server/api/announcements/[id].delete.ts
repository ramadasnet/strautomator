// Strautomator Admin API: delete an announcement

import {Announcement, database} from "strautomator-core"
import {audited, requireDoc} from "../../utils/admin"
import logger from "anyhow"

export default defineEventHandler(async (e) => {
    const id = getRouterParam(e, "id")

    try {
        const announcement: Announcement = await requireDoc("announcements", id)
        await audited(e, "announcement.delete", announcement.id, {title: announcement.title, readCount: announcement.readCount || 0}, () => database.delete("announcements", announcement.id))
        return {ok: true}
    } catch (ex) {
        logger.error("Route.announcements DELETE", id, ex)
        throw ex
    }
})
