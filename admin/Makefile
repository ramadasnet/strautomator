TSC:= ./node_modules/.bin/tsc
SETMEUP:= ./node_modules/.bin/setmeup

# Clean compiled resources and dependencies
clean:
	rm -rf ./node_modules
	rm -f package-lock.json

# Compile TypeScript to JS
build:
	$(TSC)

# Update dependencies and set new version
update:
	-ncu -u
	npm version $(shell date '+%y.%-V%u.1%H%M') --force --allow-same-version --no-git-tag-version
	npm install
	$(TSC)

# Run it! Copies the latest compiled core first.
run: build
	-cp -r ../core/settings*.json ./node_modules/strautomator-core/
	-cp -r ../core/lib/. ./node_modules/strautomator-core/lib/
	@NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev

# Serve the production build (nuxt build / npm run build), loading .env if present.
serve:
	node --env-file-if-exists=.env .output/server/index.mjs

# Encrypt settings
encrypt:
	$(SETMEUP) encrypt ./settings.secret.json

# Decrypt settings
decrypt:
	$(SETMEUP) decrypt ./settings.secret.json
