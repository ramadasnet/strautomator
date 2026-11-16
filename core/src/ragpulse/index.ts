// Strautomator Core: RAGPulse

import {UserData} from "../users/types"
import {AxiosConfig, axiosRequest} from "../axios"
import {AxiosResponse} from "axios"
import {HttpResponseWriter} from "../http"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * RAGPulse AI chat bot service.
 */
export class Ragpulse {
    private constructor() {}
    private static _instance: Ragpulse
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the RAGPulse wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.ragpulse.projectId) {
                throw new Error("Missing the ragpulse.projectId setting")
            }
        } catch (ex) {
            logger.error("Ragpulse.init", ex)
        }
    }

    /**
     * Make a request to RAGPulse.
     * @param method HTTP method.
     * @param path URL path.
     * @param body Optional request body.
     * @param headers Optional extra headers (e.g. the chat session token).
     * @param stream Whether to stream the response back to the client (used when passing a server response).
     */
    private makeRequest = async (method: "GET" | "POST", path: string, body?: any, headers?: {[header: string]: string}, stream?: boolean): Promise<AxiosResponse | any> => {
        const options: AxiosConfig = {
            method: method,
            url: `${settings.ragpulse.baseUrl}${path}`,
            headers: headers,
            responseType: stream ? "stream" : "json",
            returnResponse: stream ? true : false
        }

        if (body) {
            options.data = body
        }

        try {
            const result = await axiosRequest(options)
            return result
        } catch (ex) {
            logger.debug("Ragpulse.makeRequest", method, path, body, ex)
            throw ex
        }
    }

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Asks something to the chat bot and return the answer.
     * @param user User asking something.
     * @param message The message from the user.
     * @param res Optional server response used when streaming the answer back to the client.
     * @param clientIp Optional client IP forwarded to RAGPulse for its per-visitor rate limiting.
     */
    getAnswer = async (user: UserData, message: string, res?: HttpResponseWriter, clientIp?: string): Promise<void | string> => {
        const logUser = user ? logHelper.user(user) : "anonymous"
        try {
            const projectId = encodeURIComponent(settings.ragpulse.projectId)
            const ipHeaders = clientIp ? {"x-forwarded-for": clientIp} : {}

            // Start a new chat session for the user.
            const sessionBody: any = {name: user?.displayName || "Strautomator user"}
            if (user?.email) {
                sessionBody.email = user.email
            }
            const session = await this.makeRequest("POST", `api/chat/${projectId}/sessions`, sessionBody, ipHeaders)

            // Send the message, the answer comes back as server-sent events.
            const msgHeaders = {...ipHeaders, "x-session-token": session.token}
            const result = await this.makeRequest("POST", `api/chat/${projectId}/sessions/${session.sessionId}/messages`, {content: message}, msgHeaders, true)

            const decoder = new TextDecoder()
            let pending = ""
            let answer = ""
            let fallback = ""

            // Pick the relevant text from a server-sent event payload.
            const handleEvent = (eventName: string, data: string): void => {
                try {
                    const payload = JSON.parse(data)
                    if (eventName == "delta" && payload.text) {
                        answer += payload.text
                        if (res) res.write(payload.text)
                    } else if (eventName != "meta" && eventName != "human") {
                        const text = typeof payload.message == "string" ? payload.message : payload.message?.content
                        if (text) fallback = text
                    }
                } catch (ex) {
                    logger.debug("Ragpulse.getAnswer", logUser, "Failed to parse chat event", eventName, data)
                }
            }

            // Limit how much data is buffered while waiting for a frame to be completed.
            const maxFrameSize: number = settings.ragpulse.maxFrameSize > 0 ? settings.ragpulse.maxFrameSize : 65536
            const frameTooLarge = () => new Error(`Incomplete chat frame exceeded the ${maxFrameSize} characters limit`)

            // Process complete "event + data" blocks from the stream buffer.
            const consume = (chunk: any): void => {
                pending += decoder.decode(chunk, {stream: true})
                let index = pending.indexOf("\n\n")
                while (index >= 0) {
                    if (index > maxFrameSize) throw frameTooLarge()
                    const block = pending.slice(0, index)
                    pending = pending.slice(index + 2)
                    let eventName = "message"
                    let data = ""
                    for (const line of block.split("\n")) {
                        if (line.startsWith("event:")) {
                            eventName = line.substring(6).trim()
                        } else if (line.startsWith("data:")) {
                            data += line.substring(5).trim()
                        }
                    }
                    if (data) {
                        handleEvent(eventName, data)
                    }
                    index = pending.indexOf("\n\n")
                }
                if (pending.length > maxFrameSize) throw frameTooLarge()
            }

            // Consume the stream to the end. If a response object was passed, the answer is written back
            // to the client as it arrives, but the promise stays pending until the stream is done, so stream
            // failures (even before the first delta) are propagated to the caller.
            await new Promise<void>((resolve, reject) => {
                const stream = result.data
                stream.on("data", (chunk: any) => {
                    try {
                        consume(chunk)
                    } catch (ex) {
                        stream.destroy()
                        reject(ex)
                    }
                })
                stream.on("error", reject)
                stream.on("end", () => resolve())
            })

            if (res) {
                if (!answer && fallback) {
                    res.write(fallback)
                }
                res.end()
                logger.info("Ragpulse.getAnswer", logUser, message, answer || fallback || "no answer", "Streamed")
                return
            }

            const finalAnswer = answer || fallback || null
            logger.info("Ragpulse.getAnswer", logUser, message, finalAnswer || "No answer")

            return finalAnswer
        } catch (ex) {
            logger.error("Ragpulse.getAnswer", logUser, message, ex)
            throw ex
        }
    }
}

// Exports...
export default Ragpulse.Instance
