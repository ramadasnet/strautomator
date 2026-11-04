/**
 * Paged list bound to the route query, so filters, searches and pages are linkable.
 * @param url The API endpoint returning {items, total, page, pageSize, truncated}.
 * @param keys Extra query keys (besides search and page) forwarded to the API.
 */
export const usePagedList = (url: string, keys: string[] = []) => {
    const route = useRoute()
    const router = useRouter()
    const {notify} = useToast()

    const items = ref<any[]>([])
    const total = ref(0)
    const pageSize = ref(25)
    const truncated = ref(false)
    const loading = ref(false)

    const page = computed(() => parseInt(route.query.page as string) || 1)
    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
    const query = computed(() => {
        const result: Record<string, string> = {}
        for (let key of ["search", "page", ...keys]) {
            if (route.query[key]) result[key] = route.query[key] as string
        }
        return result
    })

    // Fetch the current page. Responses for stale queries are discarded.
    let requestId = 0
    const fetch = async () => {
        const current = ++requestId
        loading.value = true
        try {
            const result = await api(url, {query: query.value})
            if (current != requestId) return
            items.value = result.items
            total.value = result.total
            pageSize.value = result.pageSize || 25
            truncated.value = result.truncated || false
        } catch (ex) {
            if (current == requestId) notify(errorMessage(ex), "error")
        } finally {
            if (current == requestId) loading.value = false
        }
    }

    // Change one or more query values. Changing anything other than the page resets it.
    const setQuery = (patch: Record<string, any>) => {
        const next = {...route.query, ...patch}
        if (!("page" in patch)) delete next.page
        for (let key of Object.keys(next)) {
            if (next[key] === "" || next[key] === null || next[key] === undefined || (key == "page" && next[key] == 1)) delete next[key]
        }
        router.push({query: next})
    }

    watch(() => JSON.stringify(query.value), fetch, {immediate: true})

    return {items, total, page, pageSize, pageCount, truncated, loading, fetch, setQuery}
}
