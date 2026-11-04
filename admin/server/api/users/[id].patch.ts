// Strautomator Admin API: update user details

import {UserData, users} from "strautomator-core"
import {FieldValue} from "@google-cloud/firestore"
import {audited, requireUser, parseString, userView} from "../../utils/admin"
import logger from "anyhow"
import _ from "lodash"

const LANGUAGES = ["en", "de", "es", "fr", "it", "lt", "nl", "pl", "pt", "se", "sk"]
const BOOLEAN_FIELDS = ["debug", "writeSuspended"]
const BOOLEAN_PREFERENCES = ["privacyMode", "delayedProcessing", "aiEnabled", "ftpAutoUpdate", "activityHashtag", "noSuffixes", "showAds"]

export default defineEventHandler(async (e) => {
    const userId = getRouterParam(e, "id")
    const body = await readBody(e)

    try {
        if (!_.isPlainObject(body)) {
            throw createError({statusCode: 400, message: "Invalid request body"})
        }

        const user = await requireUser(userId)
        const data: Partial<UserData> = {id: user.id, displayName: user.displayName}
        const before = {}
        const after = {}

        // Track a changed field (before / after) for the audit log.
        const change = (field: string, value: any, current: any) => {
            before[field] = current ?? null
            after[field] = value === (FieldValue.delete() as any) ? null : value
        }

        // Email: must be unique, an empty value removes it.
        if (!_.isNil(body.email)) {
            const email = parseString(body.email, "email", 200).toLowerCase()
            if (email != (user.email || "")) {
                if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    throw createError({statusCode: 400, message: "Invalid email address"})
                }
                if (email) {
                    const existing = await users.getByEmail(email)
                    if (existing && existing.id != user.id) {
                        throw createError({statusCode: 409, message: `Email already used by user ${existing.id}`})
                    }
                }
                change("email", email, user.email)
                data.email = email || (FieldValue.delete() as any)
                data.confirmEmail = FieldValue.delete() as any
                data.emailFailures = FieldValue.delete() as any
            }
        }

        // Country code: 2 letters, an empty value removes it.
        if (!_.isNil(body.countryCode)) {
            const countryCode = parseString(body.countryCode, "country code", 2).toUpperCase()
            if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
                throw createError({statusCode: 400, message: "Invalid country code"})
            }
            if (countryCode != (user.countryCode || "")) {
                change("countryCode", countryCode, user.countryCode)
                data.countryCode = countryCode || (FieldValue.delete() as any)
            }
        }

        // Simple boolean flags.
        for (let field of BOOLEAN_FIELDS) {
            if (_.isNil(body[field])) continue
            if (typeof body[field] != "boolean") {
                throw createError({statusCode: 400, message: `Invalid ${field}`})
            }
            if (body[field] != (user[field] || false)) {
                change(field, body[field], user[field])
                data[field] = body[field] ? true : (FieldValue.delete() as any)
            }
        }

        // Suspension: when a reason is given, users.suspend() is used, which also emails the user.
        let suspendReason: string = null
        if (!_.isNil(body.suspended)) {
            if (typeof body.suspended != "boolean") {
                throw createError({statusCode: 400, message: "Invalid suspended"})
            }
            if (body.suspended != (user.suspended || false)) {
                change("suspended", body.suspended, user.suspended)
                if (body.suspended && body.suspendReason) {
                    suspendReason = parseString(body.suspendReason, "suspension reason", 500)
                    after["suspendReason"] = suspendReason
                } else {
                    data.suspended = body.suspended ? true : (FieldValue.delete() as any)
                }
            }
        }

        // Reset failure counters.
        if (body.resetAuthFailures === true && (user.authFailures || user.dateAuthFailed)) {
            change("authFailures", null, user.authFailures)
            data.authFailures = FieldValue.delete() as any
            data.dateAuthFailed = FieldValue.delete() as any
        }
        if (body.resetEmailFailures === true && user.emailFailures) {
            change("emailFailures", null, user.emailFailures)
            data.emailFailures = FieldValue.delete() as any
        }

        // Selected user preferences.
        if (_.isPlainObject(body.preferences)) {
            const prefs = body.preferences
            const currentPrefs = user.preferences || {}
            const newPrefs = {}

            for (let field of BOOLEAN_PREFERENCES) {
                if (_.isNil(prefs[field])) continue
                if (typeof prefs[field] != "boolean") {
                    throw createError({statusCode: 400, message: `Invalid preference ${field}`})
                }
                if (prefs[field] != (currentPrefs[field] || false)) {
                    change(`preferences.${field}`, prefs[field], currentPrefs[field])
                    newPrefs[field] = prefs[field]
                }
            }
            if (!_.isNil(prefs.language) && prefs.language != (currentPrefs.language || "en")) {
                if (!LANGUAGES.includes(prefs.language)) {
                    throw createError({statusCode: 400, message: "Invalid language"})
                }
                change("preferences.language", prefs.language, currentPrefs.language)
                newPrefs["language"] = prefs.language
            }
            if (!_.isNil(prefs.linksOn) && prefs.linksOn !== currentPrefs.linksOn) {
                const linksOn = parseInt(prefs.linksOn)
                if (isNaN(linksOn) || linksOn < 0 || linksOn > 100) {
                    throw createError({statusCode: 400, message: "Invalid linksOn, must be between 0 and 100"})
                }
                if (linksOn == 0 && !user.isPro) {
                    throw createError({statusCode: 400, message: "Only PRO users can disable the linkback"})
                }
                change("preferences.linksOn", linksOn, currentPrefs.linksOn)
                newPrefs["linksOn"] = linksOn
            }
            if (!_.isNil(prefs.gearwearDelayDays) && prefs.gearwearDelayDays !== currentPrefs.gearwearDelayDays) {
                const days = parseInt(prefs.gearwearDelayDays)
                if (isNaN(days) || days < 0 || days > 10) {
                    throw createError({statusCode: 400, message: "Invalid gearwearDelayDays, must be between 0 and 10"})
                }
                change("preferences.gearwearDelayDays", days, currentPrefs.gearwearDelayDays)
                newPrefs["gearwearDelayDays"] = days
            }

            if (Object.keys(newPrefs).length > 0) {
                data.preferences = newPrefs
            }
        }

        if (Object.keys(after).length == 0) {
            return {user: userView(user), changed: false}
        }

        await audited(e, "user.update", user.id, {before, after}, async () => {
            if (Object.keys(data).length > 2) {
                await users.update(data)
            }
            if (suspendReason !== null) {
                await users.suspend(user, suspendReason || "Suspended by the admin")
            }
        })

        return {user: userView(await users.getById(user.id)), changed: true}
    } catch (ex) {
        logger.error("Route.users.id PATCH", userId, ex)
        throw ex
    }
})
