# Unified entry points for a repo where each package has its own toolchain:
# three uv projects and one npm workspace, previously four different
# incantations to remember depending on what you had just touched.
#
# These targets run exactly what CI runs, so a green `make check` locally
# means a green pipeline.

PY_PACKAGES := packages/data-adapters packages/mcp-core packages/hf-space
WEB := packages/web

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: hooks ## Install every package's dependencies
	@for p in $(PY_PACKAGES); do echo "→ $$p"; (cd $$p && uv sync --extra dev); done
	npm ci

# core.hooksPath est une config locale, donc absente d'un clone frais : sans
# cette cible, chaque nouveau clone recommence à produire des commits non
# signés. Accrochée à `install` pour qu'on n'ait jamais à y penser.
.PHONY: hooks
hooks: ## Activer les hooks du dépôt (signature DCO automatique)
	git config core.hooksPath .githooks
	@echo "hooks actifs : .githooks (Signed-off-by ajouté automatiquement)"

.PHONY: test
test: test-py test-web ## Run every test suite

.PHONY: test-py
test-py: ## Python suites (data-adapters, mcp-core, hf-space)
	@for p in $(PY_PACKAGES); do echo "→ $$p"; (cd $$p && uv run pytest -q) || exit 1; done

.PHONY: test-web
test-web: ## Web suite
	cd $(WEB) && npm run test

.PHONY: lint
lint: lint-py lint-web ## Lint everything

.PHONY: lint-py
lint-py: ## ruff check + format check
	uvx ruff check $(PY_PACKAGES)
	uvx ruff format --check $(PY_PACKAGES)

.PHONY: lint-web
lint-web: ## Typecheck + the lint budget CI enforces
	cd $(WEB) && npm run typecheck && npm run lint:budget

.PHONY: fmt
fmt: ## Apply Python formatting
	uvx ruff format $(PY_PACKAGES)
	uvx ruff check --fix $(PY_PACKAGES)

.PHONY: build
build: ## Production build of the web app
	cd $(WEB) && npm run build

.PHONY: check
check: lint test build ## Everything CI runs, in one command

.PHONY: dev
dev: ## Vite dev server
	cd $(WEB) && npm run dev

.PHONY: mcp
mcp: ## Local MCP server over stdio, for a client on this machine
	cd packages/mcp-core && uv run python scripts/run_local.py
