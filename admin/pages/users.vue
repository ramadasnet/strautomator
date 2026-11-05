<script lang="ts" setup>
definePageMeta({
    layout: "admin",
    middleware: "auth"
})

const route = useRoute()
const {items, total, page, pageCount, truncated, loading, fetch, setQuery} = usePagedList("/api/users", ["filter", "sort"])

const filters = [
    {title: "All users", value: ""},
    {title: "PRO", value: "pro"},
    {title: "Trial", value: "trial"},
    {title: "Suspended", value: "suspended"},
    {title: "Write suspended", value: "writeSuspended"},
    {title: "Debug enabled", value: "debug"},
    {title: "Garmin linked", value: "garmin"},
    {title: "Wahoo linked", value: "wahoo"},
    {title: "Spotify linked", value: "spotify"},
    {title: "AI enabled", value: "ai"}
]
const sorts = [
    {title: "Last login", value: "dateLogin"},
    {title: "Registration date", value: "dateRegistered"},
    {title: "Last activity", value: "dateLastActivity"}
]

const filter = computed(() => (route.query.filter as string) || "")
const sort = computed(() => (route.query.sort as string) || "dateLogin")
const search = computed(() => (route.query.search as string) || "")
const selectedUser = computed(() => (route.query.user as string) || "")

// Open or close the user dialog, keeping the list query intact.
const openUser = (id: string) => setQuery({user: id, page: route.query.page})
const closeUser = () => setQuery({user: undefined, page: route.query.page})

// Refresh the matching row after the user was updated in the dialog.
const onUserUpdated = (user: any) => {
    const row = items.value.find((u) => u.id == user.id)
    if (!row) return
    Object.assign(row, {
        email: user.email,
        countryCode: user.countryCode,
        isPro: user.isPro || false,
        isTrial: user.isTrial || false,
        suspended: user.suspended || false,
        writeSuspended: user.writeSuspended || false,
        debug: user.debug || false,
        subscriptionId: user.subscriptionId
    })
}

const onUserDeleted = () => {
    closeUser()
    fetch()
}
</script>

<template>
    <div>
        <v-card>
            <div class="d-flex flex-wrap ga-2 pa-3">
                <SearchField class="toolbar-search" placeholder="ID, email, username, name or subscription ID" />
                <v-select :model-value="filter" :items="filters" :disabled="!!search" label="Filter" density="compact" hide-details class="toolbar-select" @update:model-value="setQuery({filter: $event})"></v-select>
                <v-select
                    :model-value="sort"
                    :items="sorts"
                    :disabled="!!search || !!filter"
                    label="Sort by"
                    density="compact"
                    hide-details
                    class="toolbar-select"
                    @update:model-value="setQuery({sort: $event == 'dateLogin' ? undefined : $event})"
                ></v-select>
                <v-btn icon="mdi-refresh" variant="text" :loading="loading" aria-label="Refresh" @click="fetch"></v-btn>
            </div>
            <div v-if="filter && !search" class="text-body-small text-medium-emphasis px-4 pb-2">Filtered lists are not sorted.</div>
            <v-progress-linear :active="loading" indeterminate color="primary"></v-progress-linear>
            <v-divider></v-divider>

            <v-table hover density="comfortable">
                <thead>
                    <tr>
                        <th>User</th>
                        <th class="d-none d-md-table-cell">Email</th>
                        <th>Status</th>
                        <th class="d-none d-lg-table-cell text-center">Recipes</th>
                        <th class="d-none d-lg-table-cell text-center">Gear</th>
                        <th class="d-none d-sm-table-cell">Last login</th>
                        <th class="d-none d-xl-table-cell">Registered</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="user in items" :key="user.id" class="clickable" @click="openUser(user.id)">
                        <td>
                            <div class="font-weight-medium">{{ user.name || user.displayName || user.id }}</div>
                            <div class="text-body-small text-medium-emphasis">
                                {{ user.id }}<template v-if="user.countryCode"> · {{ user.countryCode.toUpperCase() }}</template>
                            </div>
                        </td>
                        <td class="d-none d-md-table-cell text-truncate cell-email">{{ user.email || "-" }}</td>
                        <td>
                            <div class="d-flex flex-wrap ga-1">
                                <v-chip v-if="user.isPro" color="primary" size="x-small" label>{{ user.isTrial ? "Trial" : "PRO" }}</v-chip>
                                <v-chip v-if="user.suspended" color="error" size="x-small" label>Suspended</v-chip>
                                <v-chip v-if="user.writeSuspended" color="warning" size="x-small" label>Write susp.</v-chip>
                                <v-chip v-if="user.authFailures" color="warning" size="x-small" variant="outlined" label>Auth fails: {{ user.authFailures }}</v-chip>
                                <v-icon v-if="user.garmin" icon="mdi-alpha-g-circle-outline" size="small" title="Garmin"></v-icon>
                                <v-icon v-if="user.wahoo" icon="mdi-alpha-w-circle-outline" size="small" title="Wahoo"></v-icon>
                                <v-icon v-if="user.spotify" icon="mdi-spotify" size="small" title="Spotify"></v-icon>
                            </div>
                        </td>
                        <td class="d-none d-lg-table-cell text-center">{{ user.recipeCount || "-" }}</td>
                        <td class="d-none d-lg-table-cell text-center">{{ user.bikeCount + user.shoeCount || "-" }}</td>
                        <td class="d-none d-sm-table-cell text-no-wrap" :title="formatDate(user.dateLogin)">{{ fromNow(user.dateLogin) }}</td>
                        <td class="d-none d-xl-table-cell text-no-wrap">{{ formatDate(user.dateRegistered, false) }}</td>
                        <td class="text-right">
                            <v-btn size="small" variant="tonal" color="primary" @click.stop="openUser(user.id)">Manage</v-btn>
                        </td>
                    </tr>
                    <tr v-if="!loading && !items.length">
                        <td colspan="8" class="text-center text-medium-emphasis py-8">No users found.</td>
                    </tr>
                </tbody>
            </v-table>

            <v-divider></v-divider>
            <ListPager :page="page" :page-count="pageCount" :total="total" :truncated="truncated" @change="setQuery({page: $event})" />
        </v-card>

        <UserDialog :user-id="selectedUser" @close="closeUser" @updated="onUserUpdated" @deleted="onUserDeleted" />
    </div>
</template>

<style lang="scss" scoped>
.toolbar-search {
    flex: 1 1 280px;
}

.toolbar-select {
    flex: 0 1 200px;
    min-width: 160px;
}

.cell-email {
    max-width: 240px;
}

.clickable {
    cursor: pointer;
}
</style>
