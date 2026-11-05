<script lang="ts" setup>
defineProps<{userId: string; user?: any}>()
</script>

<template>
    <NuxtLink v-if="userId && userId != 'notfound'" :to="{path: '/users', query: {user: userId}}" class="user-link">
        <span>{{ user?.name || user?.displayName || userId }}</span>
        <span v-if="user" class="text-body-small text-medium-emphasis ml-1">{{ userId }}</span>
        <v-icon v-if="user?.isPro" icon="mdi-star" size="x-small" color="primary" class="ml-1" title="PRO"></v-icon>
        <v-icon v-if="user?.suspended" icon="mdi-cancel" size="x-small" color="error" class="ml-1" title="Suspended"></v-icon>
    </NuxtLink>
    <span v-else class="text-medium-emphasis">-</span>
</template>

<style lang="scss" scoped>
.user-link {
    color: inherit;
    text-decoration: none;
    white-space: nowrap;

    &:hover span:first-child {
        text-decoration: underline;
    }
}
</style>
