// Strautomator Admin API: server auth middleware (IP allowlist + Google token verification)

import {OAuth2Client} from "google-auth-library"
import cache from "bitecache"
import logger from "anyhow"

if (!cache.store.auth) {
    cache.setup("auth", 3600)
}

export default defineEventHandler(async (e) => {
    const config = useRuntimeConfig(e)

    // Security headers: admin pages should never be indexed or framed, and API data never cached.
    if (e.path.toLowerCase().startsWith("/api")) {
        setResponseHeader(e, "Cache-Control", "no-store")
    }
    setResponseHeaders(e, {
        "X-Robots-Tag": "noindex, nofollow",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Content-Security-Policy": "frame-ancestors 'none'",
        "X-Frame-Options": "DENY"
    })

    // IP allowlist, restricts access to all pages and endpoints. Empty list disables the check.
    // The client IP is taken from X-Forwarded-For, so the app must sit behind a trusted reverse proxy.
    const allowedIps = (Array.isArray(config.adminAllowedIps) ? config.adminAllowedIps : String(config.adminAllowedIps).split(",")).map((ip) => ip.trim()).filter(Boolean)
    const clientIp = (getRequestIP(e, {xForwardedFor: true}) || "").replace("::ffff:", "")

    if (allowedIps.length > 0 && !allowedIps.includes(clientIp)) {
        logger.warn("Auth", clientIp || "unknown", "IP not allowed")

        // The SPA has no server-rendered error page, so pages get a direct 403 response instead of a thrown error,
        // which would otherwise end up in Nuxt's static error template showing a misleading "500 undefined" title.
        if (e.path.toLowerCase().startsWith("/api")) {
            throw createError({statusCode: 403, message: "IP not allowed"})
        }
        setResponseStatus(e, 403, "Forbidden")
        setResponseHeader(e, "content-type", "text/html; charset=utf-8")
        return send(
            e,
            `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>403 - IP not allowed</title></head><body style="font-family:sans-serif;text-align:center;padding-top:60px"><h1>403 - IP not allowed</h1><p>Your IP ${clientIp || "unknown"} is not allowed to access this application.</p></body></html>`
        )
    }

    if (e.path.toLowerCase().startsWith("/api")) {
        const cookie = getCookie(e, "auth")
        if (!cookie) {
            throw createError({statusCode: 401, message: "Not authorized"})
        }

        // Cross-site forms can't send JSON without a CORS preflight, so this blocks CSRF.
        if (!["GET", "HEAD"].includes(e.method) && !getRequestHeader(e, "content-type")?.toLowerCase().startsWith("application/json")) {
            throw createError({statusCode: 415, message: "Only JSON requests are accepted"})
        }

        const [email, token] = cookie.split("//")
        if (!token) {
            throw createError({statusCode: 401, message: "Invalid token"})
        }

        // Allowed admin emails, supports override via NUXT_ADMIN_EMAILS (comma-separated).
        const authEmails = (Array.isArray(config.public.authEmails) ? config.public.authEmails : String(config.public.authEmails).split(",")).map((e) => e.trim()).filter(Boolean)
        if (!authEmails.includes(email)) {
            throw createError({statusCode: 403, message: "Email not authorized"})
        }

        const cachedEmail = cache.get("auth", token)
        if (!cachedEmail) {
            try {
                const audience = config.public.googleSignIn.clientId
                if (!audience) {
                    throw new Error("Missing googleSignIn.clientId")
                }

                const client = new OAuth2Client()
                const ticket = await client.verifyIdToken({idToken: token, audience: audience})
                const payload = ticket.getPayload()

                if (!payload.email_verified || payload.email != email || !authEmails.includes(payload.email)) {
                    throw new Error("Email not authorized")
                }

                const expiresIn = Math.max(1, Math.min(3600, payload.exp - Math.floor(Date.now() / 1000)))
                cache.set("auth", token, email, expiresIn)
                logger.info("Auth", "Cached login", email)
            } catch (ex) {
                logger.error("Auth", email, "Failed to verify token", ex)
                setCookie(e, "auth", "", {maxAge: 0})
                throw createError({statusCode: 401, message: "Failed to verify token"})
            }
        } else if (cachedEmail != email) {
            throw createError({statusCode: 401, message: "Email mismatch"})
        }

        // Authenticated admin email, used by the audit log.
        e.context.adminEmail = email
    }
})
