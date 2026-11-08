// Strautomator API: Event map geocode

import {maps} from "strautomator-core"
import {defineEventHandler, getQuery} from "nuxt/server"
import {requestValidator} from "../../../utils/auth"
import {WebError, renderError, renderJson} from "../../../utils/web"

/**
 * Resolve event addresses with Google, without adding a country bias.
 */
export default defineEventHandler(async (event) => {
    try {
        await requestValidator(event)
        const query = getQuery(event)
        if (typeof query.address != "string" || query.address.trim() == "") {
            throw new WebError("Invalid or missing address", 400)
        }
        const results = await maps.getGeocode(query.address, undefined, "google")
        return renderJson(event, results)
    } catch (ex) {
        return renderError(event, ex)
    }
})
