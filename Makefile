.PHONY: help dev build start lint typecheck test test-e2e format clean

help:
	@echo "Athena frontend commands:"
	@echo "  make dev        — next dev (hot reload)"
	@echo "  make build      — next build"
	@echo "  make start      — next start (after build)"
	@echo "  make lint       — eslint"
	@echo "  make typecheck  — tsc --noEmit"
	@echo "  make test       — vitest"
	@echo "  make test-e2e   — playwright"
	@echo "  make format     — prettier --write ."

dev:       ; pnpm dev
build:     ; pnpm build
start:     ; pnpm start
lint:      ; pnpm lint
typecheck: ; pnpm typecheck
test:      ; pnpm test:unit
test-e2e:  ; pnpm test:e2e
format:    ; pnpm format
clean:     ; rm -rf .next node_modules
