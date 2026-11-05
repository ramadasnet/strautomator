// Healthcheck route used by the Docker HEALTHCHECK (exempt from the IP allowlist on loopback, see the auth middleware).
export default defineEventHandler(() => "ok")
