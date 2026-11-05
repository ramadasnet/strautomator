// Admin API client.

/**
 * Call the admin API, redirecting to the login page if the session is no longer valid.
 * Mutations must always send a JSON body, as the API rejects non-JSON requests (CSRF protection).
 * @param url The API URL.
 * @param options Fetch options.
 */
export const api = async <T = any>(url: string, options: any = {}): Promise<T> => {
    try {
        return (await $fetch(url, options)) as T
    } catch (ex) {
        if (ex?.status == 401 || ex?.statusCode == 401) {
            useCookie("auth").value = null
            await navigateTo("/login")
        }
        throw ex
    }
}
