// Strautomator Admin API: delete user

import {database, users} from "strautomator-core"
import {audited, requireUser} from "../../utils/admin"
import logger from "anyhow"

export default defineEventHandler(async (e) => {
    const userId = getRouterParam(e, "id")
    const body = await readBody(e)

    try {
        const user = await requireUser(userId)
        if (body?.confirm !== user.id) {
            throw createError({statusCode: 400, message: "Deletion must be confirmed with the user ID"})
        }

        // Paid subscriptions must be cancelled first, otherwise the user would keep being charged.
        const subscriptions = await database.search("subscriptions", ["userId", "==", user.id])
        const renewing = subscriptions.find((s) => ["paddle", "paypal"].includes(s.source) && ["ACTIVE", "TRIAL", "APPROVED"].includes(s.status))
        if (renewing) {
            throw createError({statusCode: 409, message: `Cancel the ${renewing.source} subscription ${renewing.id} before deleting this user`})
        }

        await audited(e, "user.delete", user.id, {displayName: user.displayName, email: user.email || null, isPro: user.isPro || false}, () => users.delete(user))
        return {ok: true}
    } catch (ex) {
        logger.error("Route.users.id DELETE", userId, ex)
        throw ex
    }
})
