<script lang="ts" setup>
defineProps<{items: any[]}>()

const statusColors = {succeeded: "success", failed: "error", pending: "warning"}
const expanded = ref<string>("")

// Link to the target of the action, when it's a user.
const targetLink = (entry: any) => (/^\d+$/.test(entry.target) && entry.action.startsWith("user.") ? {path: "/users", query: {user: entry.target}} : null)

const hasDetails = (entry: any) => !!entry.error || (entry.details && Object.keys(entry.details).length > 0)
const toggle = (entry: any) => {
    if (hasDetails(entry)) expanded.value = expanded.value == entry.id ? "" : entry.id
}
</script>

<template>
    <v-table v-if="items?.length" density="compact" class="audit-table">
        <thead>
            <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Target</th>
                <th class="d-none d-sm-table-cell">Admin</th>
                <th>Status</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
            <template v-for="entry in items" :key="entry.id">
                <tr :class="{clickable: hasDetails(entry)}" @click="toggle(entry)">
                    <td class="text-no-wrap" :title="formatDate(entry.dateCreated)">{{ fromNow(entry.dateCreated) }}</td>
                    <td class="text-no-wrap">
                        <code>{{ entry.action }}</code>
                    </td>
                    <td class="text-no-wrap">
                        <NuxtLink v-if="targetLink(entry)" :to="targetLink(entry)" @click.stop>{{ entry.target }}</NuxtLink>
                        <span v-else>{{ entry.target }}</span>
                    </td>
                    <td class="d-none d-sm-table-cell text-truncate">{{ entry.actor }}</td>
                    <td>
                        <v-chip size="x-small" :color="statusColors[entry.status] || 'grey'" variant="tonal" label :title="entry.error || ''">{{ entry.status }}</v-chip>
                    </td>
                    <td class="text-right">
                        <v-icon v-if="hasDetails(entry)" :icon="expanded == entry.id ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="small"></v-icon>
                    </td>
                </tr>
                <tr v-if="expanded == entry.id" class="details-row">
                    <td colspan="6">
                        <div v-if="entry.error" class="text-error text-body-medium mb-1">{{ entry.error }}</div>
                        <pre v-if="entry.details && Object.keys(entry.details).length">{{ JSON.stringify(entry.details, null, 2) }}</pre>
                        <div class="text-body-small text-medium-emphasis">Started {{ formatDate(entry.dateCreated) }}, finished {{ formatDate(entry.dateFinished) }}</div>
                    </td>
                </tr>
            </template>
        </tbody>
    </v-table>
    <v-card-text v-else class="text-medium-emphasis">No admin actions logged yet.</v-card-text>
</template>

<style lang="scss" scoped>
.clickable {
    cursor: pointer;
}

.details-row pre {
    font-size: 0.75rem;
    max-height: 300px;
    overflow: auto;
    padding: 8px 0;
    white-space: pre-wrap;
    word-break: break-all;
}
</style>
