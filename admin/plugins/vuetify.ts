import {createVuetify} from "vuetify"
import * as components from "vuetify/components"
import * as directives from "vuetify/directives"
import "@mdi/font/css/materialdesignicons.css"
import "vuetify/styles"

export default defineNuxtPlugin((nuxtApp) => {
    const vuetify = createVuetify({
        ssr: false,
        icons: {
            defaultSet: "mdi"
        },
        theme: {
            defaultTheme: "light",
            themes: {
                light: {
                    colors: {
                        primary: "#FF8F00",
                        secondary: "#424242",
                        success: "#33691E",
                        warning: "#F9A825",
                        error: "#DD2C00",
                        info: "#0277BD",
                        background: "#F6F6F4"
                    }
                }
            }
        },
        defaults: {
            VTextField: {variant: "outlined", density: "comfortable", color: "primary", hideDetails: "auto"},
            VTextarea: {variant: "outlined", density: "comfortable", color: "primary", hideDetails: "auto"},
            VSelect: {variant: "outlined", density: "comfortable", color: "primary", hideDetails: "auto"},
            VCombobox: {variant: "outlined", density: "comfortable", color: "primary", hideDetails: "auto"},
            VSwitch: {color: "primary", density: "compact", hideDetails: "auto", inset: true},
            VCheckbox: {color: "primary", density: "compact", hideDetails: "auto"},
            VCard: {rounded: "lg"},
            VBtn: {style: "text-transform: none; letter-spacing: normal"}
        },
        components,
        directives
    })

    nuxtApp.vueApp.use(vuetify)
})
