// Strautomator Web: Affiliate links (Country Linkify)

import {getQuery, getRequestHeader, sendRedirect, type RequestEvent} from "nuxt/server"
import type {CountryManager} from "country-linkify/lib/countrymanager"
import type {LinkManager} from "country-linkify/lib/linkmanager"
import {createRequire} from "node:module"
import {getClientIP} from "./web"
import _ from "lodash"
import fs from "node:fs"
import path from "node:path"
import logger from "anyhow"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Country Linkify modules, loaded via its own require so they share its own settings (setmeup v1).
 */
interface Linkify {
    /** Country manager (IP to country). */
    countryManager: CountryManager
    /** Link manager (link ID to target URL). */
    linkManager: LinkManager
    /** Resolved settings, as used by Country Linkify. */
    settings: any
    /** HTML templates. */
    templates: {styles: string; notFound: string; redir: string}
}

/**
 * Global affiliates state, kept on globalThis to survive hot reloads during development.
 */
interface AffiliatesState {
    /** Init promise. */
    ready?: Promise<Linkify>
}

const state: AffiliatesState = ((globalThis as any).__strautomatorAffiliates = (globalThis as any).__strautomatorAffiliates || {})

/**
 * Content types of the affiliate images.
 */
const imageTypes = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp"}

/**
 * Hostname of the affiliate links server (for example links.strautomator.com), or null if disabled.
 */
export const getAffiliatesHostname = (): string => {
    const url = settings.affiliates?.server?.url
    return url ? URL.parse(url)?.hostname?.toLowerCase() || null : null
}

/**
 * Load the Country Linkify settings, links and countries. Returns the same promise if called multiple times,
 * and resolves to null if it failed to load.
 */
const getLinkify = (): Promise<Linkify> => {
    if (!state.ready) {
        state.ready = init()
    }
    return state.ready
}

/**
 * Init routine.
 */
const init = async (): Promise<Linkify> => {
    try {
        const linkifyRequire = createRequire(createRequire(import.meta.url).resolve("country-linkify"))
        const dir = path.join(path.dirname(linkifyRequire.resolve("./index")), "..")

        const linkifySetmeup = linkifyRequire("setmeup")
        linkifySetmeup.load(path.join(dir, "settings.default.json"), {overwrite: false})
        linkifySetmeup.loadJson({countryLinkify: settings.affiliates})

        const countryManager: CountryManager = linkifyRequire("./countrymanager").default
        const linkManager: LinkManager = linkifyRequire("./linkmanager").default
        await countryManager.init()
        await linkManager.init()

        const readAsset = (filename: string) => fs.readFileSync(path.join(dir, "assets", filename), "utf8")
        const templates = {styles: readAsset("styles.css"), notFound: readAsset("404.html"), redir: readAsset("redir.html")}

        logger.info("Affiliates.init", `Affiliate links available at ${settings.affiliates.server.url}`)
        return {countryManager, linkManager, settings: linkifySetmeup.settings.countryLinkify, templates}
    } catch (ex) {
        logger.error("Affiliates.init", ex)
        return null
    }
}

/**
 * Handle a request to the affiliate links server. Same routes as the Country Linkify server:
 * home, 404 page, link (/l/:id), search (/s/:search), images (/images/:filename) and the admin list API.
 * @param event The request event.
 */
export const handleAffiliatesRequest = async (event: RequestEvent): Promise<any> => {
    const linkify = await getLinkify()
    if (!linkify) {
        return new Response("Affiliate links not available", {status: 503})
    }

    const lsettings = linkify.settings
    const notFoundUrl = "/404"
    const imagesPath = lsettings.server.imagesPath
    const pathname = event.url.pathname
    const [, route, param, extra] = pathname.split("/")

    if (pathname == "/") {
        return sendRedirect(event, lsettings.app.homeUrl || notFoundUrl)
    }
    if (pathname == notFoundUrl) {
        return renderTemplate(linkify.templates.notFound, {title: lsettings.app.title, styles: linkify.templates.styles}, 404)
    }
    if (extra === undefined && param) {
        if (route == "l" || route == "s") {
            return linkRoute(event, linkify, safeDecode(param), route == "s")
        }
        if (`/${route}/` == imagesPath) {
            return imageRoute(linkify, safeDecode(param))
        }
        if (lsettings.server.apiKey && route == lsettings.server.apiKey && param == "list") {
            return apiListRoute(event, linkify)
        }
    }

    return sendRedirect(event, notFoundUrl)
}

/**
 * Redirect to the target link, or show the redirection notice if the "rn" query is set.
 */
const linkRoute = async (event: RequestEvent, linkify: Linkify, linkId: string, search: boolean): Promise<any> => {
    const lsettings = linkify.settings
    const query = getQuery(event)
    const ip = getClientIP(event)

    let country = await getClientCountry(event, linkify, ip)
    let countryLog = country
    if (!country) {
        country = lsettings.country.default
        countryLog = `default ${lsettings.country.default}`
    }

    const sources = query.sources ? query.sources.toString().split(",") : null
    const target = linkId ? linkify.linkManager.urlFor(linkId, country, sources, search) : null
    if (!target) {
        logger.debug("Affiliates.linkRoute", linkId, "404")
        return sendRedirect(event, "/404")
    }

    if (query.rn != "1") {
        logger.info("Affiliates.linkRoute", linkId, `IP: ${ip}`, `Country: ${countryLog}`, target.source, target.url)
        return sendRedirect(event, target.url)
    }

    const logoPath = getImagesDirectory(linkify)
    const tags = {
        from: _.escape(String(query.from || lsettings.app.title)),
        title: lsettings.app.title,
        styles: linkify.templates.styles,
        target: target.source,
        url: target.url,
        imagesPath: lsettings.server.imagesPath,
        logo: fs.existsSync(path.join(logoPath, `${target.source}.png`)) ? target.source : "nologo"
    }

    logger.info("Affiliates.linkRoute", linkId, `IP: ${ip}`, `Country: ${countryLog}`, "Redirection notice", target.source, target.url)
    return renderTemplate(linkify.templates.redir, tags)
}

/**
 * Serve an affiliate image (logo).
 */
const imageRoute = async (linkify: Linkify, filename: string): Promise<Response> => {
    const contentType = imageTypes[path.extname(filename).toLowerCase()]
    if (!contentType || filename != path.basename(filename) || filename.startsWith(".")) {
        return new Response(null, {status: 404})
    }

    try {
        const data = await fs.promises.readFile(path.join(getImagesDirectory(linkify), filename))
        return new Response(data, {headers: {"Content-Type": contentType, "Cache-Control": "public, max-age=86400"}})
    } catch (ex) {
        logger.debug("Affiliates.imageRoute", filename, "404")
        return new Response(null, {status: 404})
    }
}

/**
 * Admin API to list all loaded links, requires the apiToken as a bearer token.
 */
const apiListRoute = (event: RequestEvent, linkify: Linkify): Response => {
    const header = getRequestHeader(event, "authorization") || ""
    const token = header.indexOf(" ") > 0 ? header.split(" ")[1] : null
    const jsonHeaders = {"Content-Type": "application/json; charset=utf-8"}

    if (!linkify.settings.server.apiToken || token != linkify.settings.server.apiToken) {
        logger.warn("Affiliates.apiListRoute", event.url.pathname, "Access denied")
        return new Response(JSON.stringify({message: "Access denied"}), {status: 401, headers: jsonHeaders})
    }

    return new Response(JSON.stringify(linkify.linkManager.links), {headers: jsonHeaders})
}

/**
 * Get the client country, from the Cloudflare header (if behind a trusted proxy) or via the IP address.
 */
const getClientCountry = async (event: RequestEvent, linkify: Linkify, ip: string): Promise<string> => {
    if (!ip || ip.includes("127.0.0.1")) {
        return linkify.settings.country.default
    }

    const trustProxy = settings.app.trustProxy
    const cfHeader = getRequestHeader(event, "cf-ipcountry")
    if (cfHeader && (trustProxy === true || (_.isNumber(trustProxy) && trustProxy > 0))) {
        return cfHeader.toLowerCase()
    }

    return await linkify.countryManager.getForIP(ip)
}

/**
 * Absolute path to the affiliate images directory.
 */
const getImagesDirectory = (linkify: Linkify): string => {
    const imagesPath = linkify.settings.images.path
    return imagesPath.substring(0, 1) == "/" ? imagesPath : path.join(process.cwd(), imagesPath)
}

/**
 * Render a Country Linkify HTML template, replacing the ${tag} placeholders.
 */
const renderTemplate = (template: string, tags: Record<string, string>, status?: number): Response => {
    const html = template.replace(/\$\{(\w+)\}/g, (_match, key) => tags[key] ?? "")
    return new Response(html, {status: status || 200, headers: {"Content-Type": "text/html; charset=utf-8"}})
}

/**
 * Decode a URI component, returning an empty string if malformed.
 */
const safeDecode = (value: string): string => {
    try {
        return decodeURIComponent(value)
    } catch (ex) {
        return ""
    }
}
