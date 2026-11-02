TSC:= ./node_modules/.bin/tsc
SETMEUP:= ./node_modules/.bin/setmeup

# Clean compiled resources and dependencies
clean:
	rm -rf ./lib
	rm -rf ./node_modules
	rm -f package-lock.json

# Compile and build resources
build:
	$(TSC)

# Update dependencies and set new version
update:
	-rm -rf ./node_modules/strautomator-core
	-ncu -u -x chalk,strautomator-core
	-ncu -u --target minor -x strautomator-core
	npm version $(shell date '+%y.%-V%u.1%H%M') --force --allow-same-version --no-git-tag-version
	npm install
	$(TSC)

# Test the functions locally
run: build
	-cp -r ../core/settings*.json ./node_modules/strautomator-core/
	-cp -r ../core/lib/. ./node_modules/strautomator-core/lib/
	node index.js

# Encrypt settings.
encrypt:
	$(SETMEUP) encrypt ./settings.secret.json

# Decrypt settings.
decrypt:
	$(SETMEUP) decrypt ./settings.secret.json

.PHONY: build
