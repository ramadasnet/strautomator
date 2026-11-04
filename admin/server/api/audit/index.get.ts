// Strautomator Admin API: get the admin audit log

import {AUDIT_COLLECTION, pagedSearch, parsePage} from "../../utils/admin"
import logger from "anyhow"

export default defineEventHandler(async (e) => {
    const query = getQuery(e)
    const page = parsePage(query.page)
    const target = query.target?.toString().trim()

    try {
        const where = target ? [["target", "==", target]] : []
        return await pagedSearch(AUDIT_COLLECTION, where, target ? null : ["dateCreated", "desc"], page)
    } catch (ex) {
        logger.error("Route.audit", target || "all", ex)
        throw ex
    }
})
