<template>
    <div :class="{'site-page': !loggedIn}">
        <div class="site-glow site-glow-top" v-if="!loggedIn"></div>
        <v-container class="text-center" fluid>
            <div :class="{'home-wrapper': !loggedIn, 'text-left': loggedIn}">
                <site-header v-if="!loggedIn" header=" Help" lead="Ask our AI assistant anything about Strautomator, or browse the FAQ." />
                <h1 v-else>Help</h1>

                <div :class="{'site-card pa-0 overflow-hidden': !loggedIn}">
                    <iframe v-if="chatUrl" frameborder="0" :src="chatUrl" allow="clipboard-write" title="Chat" style="display: block; width: 100%; min-height: 650px"></iframe>
                    <div class="pa-6" v-else>
                        The chat is not available at the moment. Please check the <nuxt-link to="/help/faq" title="Frequently asked questions">FAQ</nuxt-link> or drop an email to
                        <a href="mailto:info@strautomator.com" title="Email support">info@strautomator.com</a>.
                    </div>
                </div>

                <feature-links />
            </div>
        </v-container>
    </div>
</template>

<script setup lang="ts">
definePageMeta({
    layout: "landing",
    middleware: [
        () => {
            const store = useMainStore()
            setPageLayout(store.oauth && store.user ? "default" : "landing")
        }
    ]
})
useHead({title: "Help"})

const store = useMainStore()
const loggedIn = computed(() => !!(store.oauth && store.user))
const chatUrl = computed(() => (store.ragpulse?.projectId ? `${store.ragpulse.baseUrl}chat/${store.ragpulse.projectId}` : ""))
</script>
