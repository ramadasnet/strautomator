// Strautomator Admin API: get all announcements

import {announcements} from "strautomator-core"
import logger from "anyhow"
import _ from "lodash"

export default defineEventHandler(async () => {
    try {
        const result = await announcements.getAll()
        return _.orderBy(result, (a) => a.dateStart?.valueOf() || 0, "desc")
    } catch (ex) {
        logger.error("Route.announcements", ex)
        throw ex
    }
})
