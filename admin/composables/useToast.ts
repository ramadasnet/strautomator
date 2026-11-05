// Global toast (snackbar) messages, rendered by the admin layout.

/**
 * Show toast messages, for example the result of an admin action.
 */
export const useToast = () => {
    const toast = useState("toast", () => ({show: false, text: "", color: "success"}))

    const notify = (text: string, color: string = "success") => {
        toast.value = {show: true, text: text, color: color}
    }

    return {toast, notify}
}
