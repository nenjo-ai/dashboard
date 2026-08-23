# Frontend module recipes

set dotenv-load := true

default:
    @just --list

dev:
    npm run dev

# Start the dashboard with one stable loopback-only development identity.
dev-local-auth:
    npm run dev:local-auth

build:
    npm run build

lint:
    npm run lint

install:
    npm install
