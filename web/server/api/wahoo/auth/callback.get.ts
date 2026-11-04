// Strautomator API: Wahoo auth callback

import {wahoo} from "strautomator-core"
import {defineEventHandler, sendRedirect} from "nuxt/server"
import {loadSession} from "../../../utils/session"
import {WebError, renderError, toCoreRequest} from "../../../utils/web"

/**
 * Validate authentication and try getting an access token from Wahoo.
 */
export default defineEventHandler(async (event) => {
    try {
        const request = toCoreRequest(event)

        // The auth state is prefixed with the user ID, which must match the user logged in this browser session.
        // This prevents an auth URL created by another account from being completed in someone else's browser.
        const stateUserId = typeof request.query.state == "string" ? request.query.state.split("-")[0] : null
        const sessionUserId = loadSession(event).content.userId
        if (!stateUserId || !sessionUserId || stateUserId != sessionUserId) {
            throw new WebError("Wahoo authorization must be completed in the same browser session that started it", 403)
        }

        await wahoo.processAuthCode(request as any)
        return sendRedirect(event, "/account?wahoo=linked", 302)
    } catch (ex) {
        return renderError(event, ex)
    }
})
