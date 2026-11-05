<script lang="ts" setup>
import {debounce} from "lodash"

defineProps<{placeholder?: string}>()

const route = useRoute()
const router = useRouter()
const value = ref((route.query.search as string) || "")

// Push the search term to the URL (resetting the page), so searches are linkable.
const apply = () => {
    const search = value.value.trim()
    if (search == ((route.query.search as string) || "")) return
    router.push({query: {...route.query, search: search || undefined, page: undefined}})
}

const applyDebounced = debounce(apply, 600)
onBeforeUnmount(() => applyDebounced.cancel())

// Clear the field and apply right away.
const clear = () => {
    value.value = ""
    apply()
}

watch(
    () => route.query.search,
    (search) => {
        value.value = (search as string) || ""
    }
)
</script>

<template>
    <v-text-field
        v-model="value"
        :placeholder="placeholder || 'Search'"
        prepend-inner-icon="mdi-magnify"
        density="compact"
        clearable
        single-line
        hide-details
        @update:model-value="applyDebounced"
        @keydown.enter="apply"
        @click:clear="clear"
    ></v-text-field>
</template>
