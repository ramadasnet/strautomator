<script lang="ts" setup>
import {useDisplay} from "vuetify"

const route = useRoute()
const {mobile} = useDisplay()
const {toast} = useToast()
const authCookie = useCookie("auth")
const drawer = ref(!mobile.value)

const navItems = [
    {title: "Overview", to: "/", icon: "mdi-view-dashboard-outline"},
    {title: "Users", to: "/users", icon: "mdi-account-group-outline"},
    {title: "Subscriptions", to: "/subscriptions", icon: "mdi-credit-card-outline"},
    {title: "Gear", to: "/gear", icon: "mdi-bike"},
    {title: "Calendars", to: "/calendars", icon: "mdi-calendar-month-outline"},
    {title: "Announcements", to: "/announcements", icon: "mdi-bullhorn-outline"},
    {title: "Notifications", to: "/notifications", icon: "mdi-bell-outline"},
    {title: "Mailer", to: "/mailer", icon: "mdi-email-fast-outline"},
    {title: "Audit log", to: "/audit", icon: "mdi-history"}
]

const adminEmail = computed(() => (authCookie.value || "").split("//")[0])
const pageTitle = computed(() => navItems.find((item) => item.to == route.path)?.title || "Admin")

useHead({titleTemplate: () => `${pageTitle.value} - Strautomator Admin`})

// Close the temporary drawer after navigating on small screens.
watch(
    () => route.path,
    () => {
        if (mobile.value) drawer.value = false
    }
)

const signOut = async () => {
    authCookie.value = null
    await navigateTo("/login")
}
</script>

<template>
    <v-app>
        <v-navigation-drawer v-model="drawer" :temporary="mobile" width="240">
            <NuxtLink to="/" class="brand d-flex align-center pa-4">
                <img src="https://strautomator.com/images/logo-round.svg" width="36" height="36" alt="" />
                <div class="ml-3">
                    <div class="font-weight-bold">Strautomator</div>
                    <div class="text-body-small text-medium-emphasis">Admin</div>
                </div>
            </NuxtLink>
            <v-divider></v-divider>
            <v-list nav density="comfortable" color="primary">
                <v-list-item v-for="item in navItems" :key="item.to" :to="item.to" :prepend-icon="item.icon" :title="item.title" :exact="item.to == '/'" rounded="lg"></v-list-item>
            </v-list>
            <template #append>
                <v-divider></v-divider>
                <div class="pa-3">
                    <div class="text-body-small text-medium-emphasis text-truncate mb-2" :title="adminEmail">{{ adminEmail }}</div>
                    <v-btn block variant="tonal" prepend-icon="mdi-logout" @click="signOut">Sign out</v-btn>
                </div>
            </template>
        </v-navigation-drawer>

        <v-app-bar flat border="b" density="comfortable">
            <v-app-bar-nav-icon aria-label="Toggle navigation" @click="drawer = !drawer"></v-app-bar-nav-icon>
            <v-app-bar-title>{{ pageTitle }}</v-app-bar-title>
        </v-app-bar>

        <v-main>
            <v-container fluid class="admin-page">
                <slot />
            </v-container>
        </v-main>

        <v-snackbar v-model="toast.show" :color="toast.color" timeout="5000" location="bottom right">
            {{ toast.text }}
            <template #actions>
                <v-btn variant="text" icon="mdi-close" aria-label="Close" @click="toast.show = false"></v-btn>
            </template>
        </v-snackbar>
    </v-app>
</template>

<style lang="scss" scoped>
.brand {
    color: inherit;
    text-decoration: none;
}

.admin-page {
    max-width: 1600px;
    padding: 16px;

    @media (min-width: 960px) {
        padding: 24px;
    }
}
</style>
