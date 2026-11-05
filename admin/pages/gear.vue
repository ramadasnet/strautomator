<script lang="ts" setup>
import {useDisplay} from "vuetify"

definePageMeta({
    layout: "admin",
    middleware: "auth"
})

const route = useRoute()
const {mobile} = useDisplay()
const {items, total, page, pageCount, truncated, loading, fetch, setQuery} = usePagedList("/api/gear", ["filter", "sort"])

const filters = [
    {title: "All gear", value: ""},
    {title: "Disabled", value: "disabled"}
]
const sorts = [
    {title: "Last update", value: ""},
    {title: "Gear ID (includes never updated)", value: "id"}
]

const search = computed(() => (route.query.search as string) || "")
const editing = ref<any>(null)
const editOpen = ref(false)

const units = (gear: any) => (gear?.user?.units == "imperial" ? "mi" : "km")

const openEdit = (gear: any) => {
    editing.value = gear
    editOpen.value = true
}

// Replace the edited row with the updated gear, keeping the user summary.
const onUpdated = (gear: any) => {
    const index = items.value.findIndex((g) => g.id == gear.id)
    const updated = {...gear, user: editing.value?.user}
    delete updated.recentActivities
    if (index >= 0) items.value[index] = updated
    editing.value = updated
}

const onDeleted = () => {
    editOpen.value = false
    fetch()
}
</script>

<template>
    <div>
        <v-card>
            <div class="d-flex flex-wrap ga-2 pa-3">
                <SearchField class="toolbar-search" placeholder="Gear ID, user ID or gear name" />
                <v-select :model-value="(route.query.filter as string) || ''" :items="filters" :disabled="!!search" label="Filter" density="compact" hide-details class="toolbar-select" @update:model-value="setQuery({filter: $event})"></v-select>
                <v-select
                    :model-value="(route.query.sort as string) || ''"
                    :items="sorts"
                    :disabled="!!search || !!route.query.filter"
                    label="Sort by"
                    density="compact"
                    hide-details
                    class="toolbar-select"
                    @update:model-value="setQuery({sort: $event})"
                ></v-select>
                <v-btn icon="mdi-refresh" variant="text" :loading="loading" aria-label="Refresh" @click="fetch"></v-btn>
            </div>
            <v-progress-linear :active="loading" indeterminate color="primary"></v-progress-linear>
            <v-divider></v-divider>

            <v-table hover density="comfortable">
                <thead>
                    <tr>
                        <th>Gear</th>
                        <th>User</th>
                        <th class="d-none d-md-table-cell">Components</th>
                        <th class="d-none d-lg-table-cell">Last update</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="gear in items" :key="gear.id">
                        <td>
                            <div class="d-flex align-center ga-1">
                                <v-icon :icon="gear.id.startsWith('g') ? 'mdi-shoe-sneaker' : 'mdi-bike'" size="small"></v-icon>
                                <span class="font-weight-medium">{{ gear.name || gear.id }}</span>
                                <v-chip v-if="gear.disabled" color="error" size="x-small" label>Disabled</v-chip>
                                <v-chip v-if="gear.updating" color="info" size="x-small" label>Updating</v-chip>
                            </div>
                            <div class="text-body-small text-medium-emphasis">{{ gear.id }}</div>
                        </td>
                        <td><UserLink :user-id="gear.userId" :user="gear.user" /></td>
                        <td class="d-none d-md-table-cell">
                            <div class="d-flex flex-wrap ga-1">
                                <v-chip
                                    v-for="comp in gear.components"
                                    :key="comp.name"
                                    size="x-small"
                                    :color="comp.disabled ? undefined : comp.alertDistance && comp.currentDistance >= comp.alertDistance ? 'error' : undefined"
                                    :variant="comp.disabled ? 'outlined' : 'tonal'"
                                    label
                                >
                                    {{ comp.name }}: {{ formatNumber(Math.round(comp.currentDistance || 0)) }}{{ comp.alertDistance ? ` / ${formatNumber(comp.alertDistance)}` : "" }} {{ units(gear) }}
                                </v-chip>
                            </div>
                        </td>
                        <td class="d-none d-lg-table-cell text-no-wrap">
                            <template v-if="gear.lastUpdate">
                                <span :title="formatDate(gear.lastUpdate.date)">{{ fromNow(gear.lastUpdate.date) }}</span>
                                <div class="text-body-small text-medium-emphasis">
                                    {{ gear.lastUpdate.rollback ? "Rollback, " : "" }}{{ gear.lastUpdate.activities?.length || 0 }} activities, {{ formatNumber(Math.round(gear.lastUpdate.distance || 0)) }} {{ units(gear) }}
                                </div>
                            </template>
                            <span v-else class="text-medium-emphasis">Never</span>
                        </td>
                        <td class="text-right">
                            <v-btn size="small" variant="tonal" color="primary" @click="openEdit(gear)">Edit</v-btn>
                        </td>
                    </tr>
                    <tr v-if="!loading && !items.length">
                        <td colspan="5" class="text-center text-medium-emphasis py-8">No gear found.</td>
                    </tr>
                </tbody>
            </v-table>

            <v-divider></v-divider>
            <ListPager :page="page" :page-count="pageCount" :total="total" :truncated="truncated" @change="setQuery({page: $event})" />
        </v-card>

        <v-dialog v-model="editOpen" :fullscreen="mobile" max-width="1000" scrollable>
            <v-card v-if="editing">
                <v-card-title class="d-flex align-center ga-2 pt-4">
                    <div class="min-width-0">
                        <div class="text-truncate">{{ editing.name || editing.id }}</div>
                        <div class="text-body-small text-medium-emphasis">{{ editing.id }} · distances in {{ units(editing) }}</div>
                    </div>
                    <v-spacer></v-spacer>
                    <UserLink :user-id="editing.userId" :user="editing.user" class="text-body-medium" />
                    <v-btn icon="mdi-close" variant="text" aria-label="Close" @click="editOpen = false"></v-btn>
                </v-card-title>
                <v-divider></v-divider>
                <v-card-text>
                    <GearEditor :key="editing.id" :gear="editing" :units="editing.user?.units" @updated="onUpdated" @deleted="onDeleted" />
                </v-card-text>
            </v-card>
        </v-dialog>
    </div>
</template>

<style lang="scss" scoped>
.toolbar-search {
    flex: 1 1 280px;
}

.toolbar-select {
    flex: 0 1 220px;
    min-width: 160px;
}

.min-width-0 {
    min-width: 0;
}
</style>
