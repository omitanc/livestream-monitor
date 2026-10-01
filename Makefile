.PHONY: setup build test run lint fmt
setup:
	npm ci
	npm exec install-electron
build:
	npm run build
test:
	npm test
run:
	npm run dev
lint:
	npm run lint
fmt:
	npm run fmt
