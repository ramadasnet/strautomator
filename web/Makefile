TSC:= ./node_modules/.bin/tsc

# Clean compiled resources and dependencies
clean:
	rm -rf ./.nuxt
	rm -rf ./.output
	rm -rf ./node_modules
	rm -f package-lock.json

# Compile and build resources
build:
	npm run build

# Update dependencies and set new version
update:
	-rm -rf ./node_modules/strautomator-core
	-ncu -u -x nuxt
	npm version $(shell date '+%y.%-V%u.1%H%M') --force --allow-same-version --no-git-tag-version
	npm install
	-npm audit fix

# Run the app locally (dev server with hot reload)
run:
	-cp -r ../core/settings*.json ./node_modules/strautomator-core/
	-cp -r ../core/lib/. ./node_modules/strautomator-core/lib/
	npm run dev

.PHONY: build
