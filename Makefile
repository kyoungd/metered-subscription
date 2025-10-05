.PHONY: help test test-watch test-ui test-coverage lint typecheck format check-format dev build start clean install

# Default target
help:
	@echo "Available targets:"
	@echo "  make install       - Install dependencies"
	@echo "  make dev           - Start development server"
	@echo "  make build         - Build for production"
	@echo "  make start         - Start production server"
	@echo "  make test          - Run tests once"
	@echo "  make test-watch    - Run tests in watch mode"
	@echo "  make test-ui       - Run tests with UI"
	@echo "  make test-coverage - Run tests with coverage"
	@echo "  make lint          - Lint code"
	@echo "  make typecheck     - Type check JavaScript via JSDoc"
	@echo "  make format        - Format code with Prettier"
	@echo "  make check-format  - Check code formatting"
	@echo "  make clean         - Clean build artifacts"

# Install dependencies
install:
	npm install

# Development
dev:
	npm run dev

# Production build
build:
	npm run build

# Production start
start:
	npm run start

# Testing
test:
	npm run test

test-watch:
	npm run test:watch

test-ui:
	npm run test:ui

test-coverage:
	npm run test:coverage

# Code quality
lint:
	npm run lint

typecheck:
	npm run typecheck

format:
	npx prettier --write .

check-format:
	npx prettier --check .

# Clean
clean:
	rm -rf .next
	rm -rf out
	rm -rf build
	rm -rf coverage
	rm -rf node_modules/.cache

# CI target - run all checks
ci: install lint typecheck test
	@echo "All CI checks passed!"
