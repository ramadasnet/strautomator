// Strautomator Admin API: grant or revoke PRO for a user

import {BaseSubscription, database, subscriptions, users} from "strautomator-core"
import {audited, isRenewingSubscription, requireUser, parseDate, userView} from "../../../utils/admin"
import dayjs from "dayjs"
import logger from "anyhow"

const FREQUENCIES = ["monthly", "yearly", "lifetime"]

export default defineEventHandler(async (e) => {
    const userId = getRouterParam(e, "id")
    const body = await readBody(e)

    try {
        const user = await requireUser(userId)
        const current: BaseSubscription = user.subscriptionId ? await database.get("subscriptions", user.subscriptionId) : null

        // Check all subscriptions of the user, as a paid one might not be linked via user.subscriptionId.
        const userSubscriptions: BaseSubscription[] = await database.search("subscriptions", ["userId", "==", user.id])
        const renewing = userSubscriptions.find(isRenewingSubscription)

        // Grant PRO via a new "friend" subscription, optionally with an expiry date.
        if (body?.action == "grant") {
            if (user.isPro && !user.isTrial) {
                throw createError({statusCode: 409, message: "User is already PRO"})
            }
            if (renewing) {
                throw createError({statusCode: 409, message: `User has an ongoing ${renewing.source} subscription ${renewing.id}`})
            }

            const frequency = FREQUENCIES.includes(body.frequency) ? body.frequency : "lifetime"
            const dateExpiry = parseDate(body.dateExpiry, "expiry date")
            if (dateExpiry && dateExpiry <= new Date()) {
                throw createError({statusCode: 400, message: "Expiry date must be in the future"})
            }

            const subscription: Partial<BaseSubscription> = {
                id: `F-${user.id}-${dayjs().format("YYMMDDHHmmss")}`,
                userId: user.id,
                source: "friend",
                status: "ACTIVE",
                frequency: frequency,
                price: 0
            }
            if (dateExpiry) {
                subscription.dateExpiry = dateExpiry
            }

            await audited(e, "user.pro.grant", user.id, {subscriptionId: subscription.id, frequency, dateExpiry}, async () => {
                await subscriptions.create(subscription)
                await users.switchToPro(user, subscription as BaseSubscription)
            })
        }

        // Revoke PRO, expiring the current subscription (paid subscriptions must be cancelled at the provider first).
        else if (body?.action == "revoke") {
            if (!user.isPro) {
                throw createError({statusCode: 409, message: "User is not PRO"})
            }
            if (renewing) {
                throw createError({statusCode: 409, message: `Cancel the ${renewing.source} subscription ${renewing.id} at the provider first`})
            }

            await audited(e, "user.pro.revoke", user.id, {subscriptionId: current?.id || null}, () => users.switchToFree(user, current || undefined))
        } else {
            throw createError({statusCode: 400, message: "Action must be grant or revoke"})
        }

        return {user: userView(await users.getById(user.id))}
    } catch (ex) {
        logger.error("Route.users.id.pro", userId, body?.action, ex)
        throw ex
    }
})
