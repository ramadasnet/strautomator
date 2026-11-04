// Strautomator Admin API: auth middleware

import {useAuthStore} from "~/store/auth"

export default defineNuxtRouteMiddleware((to) => {
    const {authenticated} = storeToRefs(useAuthStore())
    const token = useCookie("auth", {maxAge: 7200})
    authenticated.value = token.value ? true : false

    if (token.value && to?.name == "login") {
        return navigateTo("/")
    }

    if (!token.value && to?.name != "login") {
        abortNavigation()
        return navigateTo("/login")
    }
})
