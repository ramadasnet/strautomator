// Strautomator Admin API: send a notification to one or more users

import {BaseNotification, UserData, database, notifications} from "strautomator-core"
import {audited, parseDate, parseHref, parseString} from "../../utils/admin"
import logger from "anyhow"
import _ from "lodash"

const MAX_USERS = 1000

export default defineEventHandler(async (e) => {
    const body = await readBody(e)

    try {
        if (!_.isPlainObject(body)) {
            throw createError({statusCode: 400, message: "Invalid request body"})
        }

        const userIds: string[] = _.uniq((Array.isArray(body.userIds) ? body.userIds : String(body.userIds || "").split(/[\s,;]+/)).map((id) => String(id).trim()).filter(Boolean))
        if (userIds.length == 0) {
            throw createError({statusCode: 400, message: "At least one user ID is required"})
        }
        if (userIds.length > MAX_USERS) {
            throw createError({statusCode: 400, message: `Maximum of ${MAX_USERS} users per batch`})
        }
        const invalid = userIds.filter((id) => !/^\d+$/.test(id))
        if (invalid.length > 0) {
            throw createError({statusCode: 400, message: `Invalid user IDs: ${invalid.slice(0, 10).join(", ")}`})
        }

        const notification: Partial<BaseNotification> = {
            title: parseString(body.title, "title", 100, true),
            body: parseString(body.body, "body", 1000, true)
        }
        const href = parseHref(body.href)
        if (href) notification.href = href
        const dateExpiry = parseDate(body.dateExpiry, "expiry date")
        if (dateExpiry) {
            if (dateExpiry <= new Date()) {
                throw createError({statusCode: 400, message: "Expiry date must be in the future"})
            }
            notification.dateExpiry = dateExpiry
        }

        const result = {sent: [], notFound: [], failed: []}
        await audited(e, "notification.send", userIds.length == 1 ? userIds[0] : `${userIds.length} users`, {userIds: userIds.slice(0, 100), title: notification.title}, async () => {
            for (let chunk of _.chunk(userIds, 20)) {
                const users: UserData[] = await Promise.all(
                    chunk.map((id) =>
                        database.get("users", id).catch((lookupEx) => {
                            logger.error("Route.notifications POST", `User ${id}`, lookupEx)
                            return null
                        })
                    )
                )
                for (let i = 0; i < chunk.length; i++) {
                    const user = users[i]
                    if (user === null) {
                        result.failed.push(chunk[i])
                        continue
                    }
                    if (!user) {
                        result.notFound.push(chunk[i])
                        continue
                    }
                    try {
                        await notifications.createNotification(user, {...notification, admin: true} as any)
                        result.sent.push(user.id)
                    } catch (innerEx) {
                        logger.error("Route.notifications POST", `User ${user.id}`, innerEx)
                        result.failed.push(user.id)
                    }
                }
            }
        })

        return result
    } catch (ex) {
        logger.error("Route.notifications POST", ex)
        throw ex
    }
})
