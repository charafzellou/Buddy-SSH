# Buddy-SSH Makefile
# Canonical task entrypoints (ADR-0007). CI uses the same targets.

.PHONY: help dev build test lint format gen-protocol docker-build docker-up docker-down clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

dev: ## Start frontend + backend in dev mode (concurrent)
	bun run dev

build: ## Build shared types, frontend, and backend
	bun run build
	cd apps/backend && go build -o ../../bin/buddy-ssh ./cmd/buddy-ssh

test: ## Run all tests (frontend + backend)
	bun run test
	cd apps/backend && go test ./...

lint: ## Run linters (biome + golangci-lint)
	bun run lint
	cd apps/backend && golangci-lint run

format: ## Format code (biome + gofmt)
	bun run format
	cd apps/backend && gofmt -w .

gen-protocol: ## Regenerate Go protocol types from packages/shared
	bun run gen-protocol

docker-build: ## Build the production Docker image
	docker build -f docker/Dockerfile -t buddy-ssh:dev .

docker-up: ## Start the app via docker-compose
	docker compose up -d --build

docker-down: ## Stop the docker-compose stack
	docker compose down

clean: ## Remove build artifacts
	rm -rf bin apps/frontend/dist packages/shared/dist
