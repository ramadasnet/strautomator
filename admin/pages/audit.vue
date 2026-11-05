<script lang="ts" setup>
definePageMeta({
    layout: "admin",
    middleware: "auth"
})

const route = useRoute()
const {items, total, page, pageCount, loading, fetch, setQuery} = usePagedList("/api/audit", ["target"])
const target = ref((route.query.target as string) || "")

const applyTarget = () => setQuery({target: target.value.trim()})

// Clear the field and apply right away.
const clear = () => {
    target.value = ""
    applyTarget()
}

watch(
    () => route.query.target,
    (value) => (target.value = (value as string) || "")
)
</script>

<template>
    <div>
        <v-card>
            <div class="d-flex flex-wrap ga-2 pa-3">
                <v-text-field
                    v-model="target"
                    placeholder="Filter by exact target (user ID, gear ID, subscription ID...)"
                    prepend-inner-icon="mdi-filter-outline"
                    density="compact"
                    clearable
                    single-line
                    hide-details
                    class="toolbar-search"
                    @keydown.enter="applyTarget"
                    @click:clear="clear"
                ></v-text-field>
                <v-btn variant="tonal" @click="applyTarget">Apply</v-btn>
                <v-btn icon="mdi-refresh" variant="text" :loading="loading" aria-label="Refresh" @click="fetch"></v-btn>
            </div>
            <div class="text-body-small text-medium-emphasis px-4 pb-2">Every change made through the admin is logged here. Click an entry to see its details.<template v-if="route.query.target"> Filtered results are not sorted.</template></div>
            <v-progress-linear :active="loading" indeterminate color="primary"></v-progress-linear>
            <v-divider></v-divider>

            <AuditList :items="items" />

            <v-divider></v-divider>
            <ListPager :page="page" :page-count="pageCount" :total="total" @change="setQuery({page: $event})" />
        </v-card>
    </div>
</template>

<style lang="scss" scoped>
.toolbar-search {
    flex: 1 1 320px;
}
</style>
