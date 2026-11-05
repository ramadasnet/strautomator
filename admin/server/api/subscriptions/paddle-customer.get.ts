// Strautomator Admin API: check the user linked to a Paddle customer

import {database, paddle} from "strautomator-core"
import logger from "anyhow"

export default defineEventHandler(async (e) => {
    const query = getQuery(e)
    const id = query.id?.toString().trim()

    try {
        if (!id) {
            throw createError({statusCode: 400, message: "Subscription ID is required"})
        }

        const sub = await database.get("subscriptions", id)
        if (!sub) {
            throw createError({statusCode: 404, message: `Subscription ${id} not found`})
        }
        if (sub.source != "paddle" || !sub.customerId) {
            throw createError({statusCode: 400, message: `Subscription ${sub.id} is not linked to a Paddle customer`})
        }

        const customer = await paddle.api.client.customers.get(sub.customerId)
        const customerUserId = customer?.customData?.userId?.toString() || null

        logger.info("Route.subscriptions.paddleCustomer", `Subscription ${sub.id}: Paddle customer ${sub.customerId} points to user ${customerUserId}, subscription points to user ${sub.userId}`)

        return {id: sub.id, customerId: sub.customerId, userId: sub.userId || null, customerUserId: customerUserId, mismatch: customerUserId != sub.userId}
    } catch (ex) {
        logger.error("Route.subscriptions.paddleCustomer", id, ex)
        throw ex
    }
})
