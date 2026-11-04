// Strautomator Web: Affiliate links server

import {defineEventHandler} from "nuxt/server"
import {getAffiliatesHostname, handleAffiliatesRequest} from "../utils/affiliates"

/**
 * Requests to the affiliate links host (links.strautomator.com) are handled by Country Linkify.
 */
export default defineEventHandler((event) => {
    const hostname = getAffiliatesHostname()
    if (!hostname || event.url.hostname.toLowerCase() != hostname) {
        return
    }

    return handleAffiliatesRequest(event)
})
