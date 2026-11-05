# Build from the repository root, as the admin depends on the local core:
# docker build -f admin/Dockerfile .

# BUILDER
FROM node:26-alpine AS strautomator-admin-builder
WORKDIR /app
COPY core/ ./core/
COPY admin/ ./admin/
RUN cd core && npm ci --no-audit --no-fund
RUN cd admin && npm ci --no-audit --no-fund && npm run build

# DEPENDENCIES
FROM node:26-alpine AS strautomator-admin-dependencies
ENV NODE_ENV=production
WORKDIR /app
COPY core/ ./core/
COPY admin/package.json admin/package-lock.json admin/.npmrc ./admin/
RUN cd admin && npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# FINAL IMAGE
FROM node:26-alpine AS strautomator-admin-final
ENV NODE_ENV=production
ENV JSON_LOGGING=true
ENV HOST=0.0.0.0
WORKDIR /app
COPY admin/package.json admin/settings.json ./
COPY --from=strautomator-admin-dependencies /app/admin/node_modules ./node_modules
COPY --from=strautomator-admin-builder /app/admin/node_modules/strautomator-core/lib ./node_modules/strautomator-core/lib
COPY --from=strautomator-admin-builder /app/admin/.output ./.output

EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD wget -q --spider http://127.0.0.1:3000/healthz || exit 1

CMD [ "node", "--env-file-if-exists=.env", ".output/server/index.mjs" ]
