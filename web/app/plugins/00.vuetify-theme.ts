// Strautomator Web: Vuetify theme tweaks

// The app is dark only, so drop Vuetify's built-in light theme from the inline theme stylesheet.
export default defineNuxtPlugin({
    enforce: "pre",
    setup(nuxtApp) {
        nuxtApp.hook("vuetify:ready", (vuetify) => {
            delete vuetify.theme.themes.value.light
        })
    }
})
