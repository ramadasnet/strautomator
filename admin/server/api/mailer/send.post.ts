// Strautomator Admin API: post email

import {database, mailer, UserData} from "strautomator-core"
import {audited} from "../../utils/admin"
import logger from "anyhow"
import _ from "lodash"

export default defineEventHandler(async (e) => {
    const body = await readBody(e)

    try {
        if (typeof body?.subject != "string" || body.subject.length < 3) {
            throw createError({statusCode: 400, message: "Subject is required"})
        }
        if (typeof body.body != "string" || body.body.length < 30) {
            throw createError({statusCode: 400, message: "Body with at least 30 chars required"})
        }
        if (!body.users || typeof body.users != "object") {
            throw createError({statusCode: 400, message: "Users filter is required"})
        }

        let users: UserData[] = []

        // Firestore's "!=" skips documents without the field, and free users usually have no isPro set.
        if (body.users.free) {
            const allUsers = await database.search("users")
            users.push(...allUsers.filter((u) => !u.isPro))
        }
        if (body.users.pro) {
            const proUsers = await database.search("users", ["isPro", "==", true])
            users.push(...proUsers)
        }
        if (body.users.exPro) {
            const allSubscriptions = await database.search("subscriptions", ["status", "==", "CANCELLED"])
            const subscriptions = _.uniqBy(allSubscriptions, "userId")
            for (let sub of subscriptions) {
                if (users.find((u) => u.id == sub.userId)) continue
                const user = await database.get("users", sub.userId)
                if (user && !user.isPro) {
                    users.push(user)
                }
            }
        }
        if (body.users.withCalendar) {
            const allCalendars = await database.search("calendars")
            const calendars = _.uniqBy(allCalendars, "userId")
            for (let cal of calendars) {
                if (users.find((u) => u.id == cal.userId)) continue
                const user = await database.get("users", cal.userId)
                if (user) {
                    users.push(user)
                }
            }
        }
        if (body.users.withGear) {
            const allGear = await database.search("gearwear")
            const gear = _.uniqBy(allGear, "userId")
            for (let g of gear) {
                if (users.find((u) => u.id == g.userId)) continue
                const user = await database.get("users", g.userId)
                if (user) {
                    users.push(user)
                }
            }
        }

        if (typeof body.users.country == "string" && body.users.country != "all") {
            const countries = body.users.country.split(",")
            users = users.filter((u) => countries.includes(u.profile?.country || "-") || countries.includes(u.countryCode || "-"))
        }

        if (Array.isArray(body.users.ignored) && body.users.ignored.length > 0) {
            users = users.filter((u) => !body.users.ignored.includes(u.id))
        }

        const testRun = body.testRun === true
        const userIds = []
        const sendToUser = async (user) => {
            try {
                const data = {
                    userId: user.id,
                    userName: user.profile.firstName || user.displayName
                }
                await mailer.send({
                    data: data,
                    to: testRun ? "info@strautomator.com" : user.email,
                    subject: body.subject,
                    body: body.body,
                    loadbalance: true
                })

                userIds.push(user.id)
            } catch (innerEx) {
                logger.error("Route.mailer POST", JSON.stringify(body, null, 0), `User ${user.id}`, user.email, innerEx)
            }
        }

        const totalUsers = users.length
        users = _.uniqBy(users, "id").filter((u) => u.email?.includes("@"))
        logger.info("Route.mailer POST", body.subject, `Got ${users.length} users with email, out of ${totalUsers}`)

        if (testRun) {
            users = users.slice(0, 3)
        }

        const details = {subject: body.subject, filter: body.users, testRun: testRun, recipients: users.length}
        await audited(e, "mailer.send", testRun ? "test" : "users", details, async () => {
            while (users.length) {
                await Promise.allSettled(users.splice(0, 5).map(sendToUser))
            }
        })

        logger.info("Route.mailer POST", body.subject, `Sent email to ${userIds.length} users`)
        return userIds
    } catch (ex) {
        logger.error("Route.mailer POST", JSON.stringify(body, null, 0), ex)
        throw ex
    }
})
