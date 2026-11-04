import vuetify, {transformAssetUrls} from "vite-plugin-vuetify"

export default defineNuxtConfig({
    css: ["vuetify/lib/styles/main.sass", "@mdi/font/css/materialdesignicons.min.css"],

    devtools: {
        enabled: false
    },

    ssr: false,

    modules: [
        "@pinia/nuxt",
        "nuxt-vue3-google-signin",
        (_options, nuxt) => {
            nuxt.hooks.hook("vite:extendConfig", (config) => {
                config?.plugins?.push(vuetify({autoImport: true}))
            })
        }
    ],

    vite: {
        server: {
            watch: {
                usePolling: true
            }
        },
        vue: {
            template: {
                transformAssetUrls
            }
        }
    },

    runtimeConfig: {
        adminAllowedIps: [],
        public: {
            authEmails: ["admin@example.com"],
            googleSignIn: {
                clientId: "dummy-client-id.apps.googleusercontent.com"
            }
        }
    },

    compatibilityDate: "2024-09-15"
})
