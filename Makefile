.PHONY: dev build test lint fmt

dev:
	npm run tauri dev

build:
	npm run tauri build

test:
	cargo test --workspace && npm run test

lint:
	cargo clippy --workspace -- -D warnings && npm run lint

fmt:
	cargo fmt --all && npm run format
