// Strautomator Admin API: auth store

import {defineStore} from "pinia"
import {CredentialResponse, decodeCredential} from "vue3-google-signin"

export const useAuthStore = defineStore("auth", {
    state: () => ({
        authenticated: false
    }),
    actions: {
        async authenticateUser(response: CredentialResponse) {
            // Allowed admin emails, supports override via NUXT_ADMIN_EMAILS (comma-separated).
            const rawEmails = useRuntimeConfig().public.authEmails as string[] | string
            const authEmails = (Array.isArray(rawEmails) ? rawEmails : String(rawEmails).split(",")).map((e) => e.trim()).filter(Boolean)
            const user = decodeCredential(response.credential)
            if (user.email && user.email_verified && authEmails.includes(user.email)) {
                const token = useCookie("auth", {expires: new Date(user.exp * 1000), sameSite: "strict", secure: location.protocol == "https:"})
                token.value = `${user.email}//${response.credential}`
                this.authenticated = true
            }
        }
    }
})
