# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.14 AS frontend-builder
WORKDIR /workspace

COPY package.json bun.lock biome.json ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN bun install --frozen-lockfile

COPY apps/frontend ./apps/frontend
COPY packages/shared ./packages/shared
COPY scripts ./scripts

RUN bun run --filter @buddy-ssh/shared build
RUN bun run --filter @buddy-ssh/frontend build

FROM golang:1.26.5-alpine AS backend-builder
WORKDIR /workspace/apps/backend

COPY apps/backend/go.mod ./go.mod
COPY apps/backend/go.sum ./go.sum
RUN go mod download

COPY apps/backend ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/buddy-ssh ./cmd/buddy-ssh

FROM gcr.io/distroless/base-debian12:nonroot AS runtime
WORKDIR /app

COPY --from=backend-builder /out/buddy-ssh /app/buddy-ssh
COPY --from=frontend-builder /workspace/apps/frontend/dist /app/web

EXPOSE 8443

ENTRYPOINT ["/app/buddy-ssh"]
