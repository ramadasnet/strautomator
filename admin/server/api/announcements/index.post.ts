// Strautomator Admin API: create or update an announcement

import {Announcement, announcements, database} from "strautomator-core"
import {audited, parseDate, parseHref, parseString} from "../../utils/admin"
import logger from "anyhow"
import _ from "lodash"

const BOOLEAN_FIELDS = ["newFeature", "affiliate", "isFree", "isPro", "hasGarminWahoo"]
const TRISTATE_FIELDS = ["hasBikes", "hasShoes"]

export default defineEventHandler(async (e) => {
    const body = await readBody(e)

    try {
        if (!_.isPlainObject(body)) {
            throw createError({statusCode: 400, message: "Invalid request body"})
        }

        // Existing announcement? Otherwise a new ID is generated.
        let existing: Announcement = null
        if (body.id) {
            if (typeof body.id != "string" || !/^ann[\w-]+$/.test(body.id)) {
                throw createError({statusCode: 400, message: "Invalid announcement ID"})
            }
            existing = await database.get("announcements", body.id)
            if (!existing) {
                throw createError({statusCode: 404, message: `Announcement ${body.id} not found`})
            }
        }

        const announcement: Announcement = {
            id: existing?.id || `ann${Date.now().toString(16)}`,
            title: parseString(body.title, "title", 100, true),
            body: parseString(body.body, "body", 1000, true),
            dateStart: parseDate(body.dateStart, "start date"),
            dateExpiry: parseDate(body.dateExpiry, "expiry date")
        }

        if (!announcement.dateStart || !announcement.dateExpiry) {
            throw createError({statusCode: 400, message: "Start and expiry dates are required"})
        }
        if (announcement.dateExpiry <= announcement.dateStart) {
            throw createError({statusCode: 400, message: "Expiry date must be after the start date"})
        }

        const href = parseHref(body.href)
        if (href) announcement.href = href

        const dateRegisteredBefore = parseDate(body.dateRegisteredBefore, "registered before date")
        if (dateRegisteredBefore) announcement.dateRegisteredBefore = dateRegisteredBefore

        for (let field of BOOLEAN_FIELDS) {
            if (body[field] === true) announcement[field] = true
        }
        for (let field of TRISTATE_FIELDS) {
            if (typeof body[field] == "boolean") announcement[field] = body[field]
        }
        if (announcement.isFree && announcement.isPro) {
            throw createError({statusCode: 400, message: "Announcement can't target only Free and only PRO users at the same time"})
        }

        if (Array.isArray(body.countries) && body.countries.length > 0) {
            const countries = _.uniq(body.countries.map((c) => String(c).trim().toUpperCase()).filter(Boolean))
            if (countries.some((c: string) => !/^[A-Z]{2}$/.test(c))) {
                throw createError({statusCode: 400, message: "Countries must be 2-letter codes"})
            }
            announcement.countries = countries as string[]
        }

        const action = existing ? "announcement.update" : "announcement.create"
        await audited(e, action, announcement.id, {title: announcement.title, dateStart: announcement.dateStart, dateExpiry: announcement.dateExpiry}, () => announcements.upsert(announcement))

        return await database.get("announcements", announcement.id)
    } catch (ex) {
        logger.error("Route.announcements POST", body?.id || "new", ex)
        throw ex
    }
})
