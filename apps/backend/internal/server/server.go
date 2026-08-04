package server

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/auth"
	"github.com/charafzellou/buddy-ssh/apps/backend/internal/config"
	"github.com/charafzellou/buddy-ssh/apps/backend/internal/middleware"
	"github.com/charafzellou/buddy-ssh/apps/backend/internal/websocket"
)

//go:embed web/*
var embeddedWeb embed.FS

type healthResponse struct {
	Status string `json:"status"`
}

// New creates the Buddy-SSH HTTP server with middleware, routes, and static assets.
func New(cfg config.Config, logger *slog.Logger, staticFS fs.FS) (*http.Server, error) {
	gateway := newGateway(cfg)
	handler, err := newHandler(cfg, logger, staticFS, gateway)
	if err != nil {
		return nil, err
	}

	httpServer := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
	httpServer.RegisterOnShutdown(gateway.CloseAll)

	return httpServer, nil
}

// NewHandler constructs the HTTP handler tree for the Buddy-SSH backend.
func NewHandler(cfg config.Config, logger *slog.Logger, staticFS fs.FS) (http.Handler, error) {
	return newHandler(cfg, logger, staticFS, newGateway(cfg))
}

func newHandler(cfg config.Config, logger *slog.Logger, staticFS fs.FS, gateway *websocket.Gateway) (http.Handler, error) {
	if logger == nil {
		logger = slog.Default()
	}

	spaHandler, err := newSPAHandler(staticFS)
	if err != nil {
		return nil, err
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(writer).Encode(healthResponse{Status: "ok"}); err != nil {
			http.Error(writer, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		}
	})
	mux.Handle("/ws", gateway)
	mux.Handle("/", spaHandler)

	handler := middleware.Recovery(logger)(middleware.Logging(logger)(middleware.Headers(mux)))

	return handler, nil
}

func newGateway(cfg config.Config) *websocket.Gateway {
	gateway := websocket.NewGateway(
		auth.NewTokenValidator(cfg.Token),
		auth.NewOriginValidator(cfg.AllowedOrigins),
		cfg.ReadLimit,
	)
	gateway.KeepaliveInterval = cfg.Keepalive
	gateway.IdleTimeout = cfg.IdleTimeout

	return gateway
}

func newSPAHandler(staticFS fs.FS) (http.Handler, error) {
	if staticFS == nil {
		sub, err := fs.Sub(embeddedWeb, "web")
		if err != nil {
			return nil, err
		}
		staticFS = sub
	}

	fileServer := http.FileServer(http.FS(staticFS))

	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requestedPath := path.Clean(strings.TrimPrefix(request.URL.Path, "/"))
		if requestedPath == "." || requestedPath == "" {
			requestedPath = "index.html"
		}

		servePath := requestedPath
		if _, err := fs.Stat(staticFS, servePath); err != nil {
			servePath = "index.html"
		}

		if servePath == "index.html" {
			body, err := fs.ReadFile(staticFS, servePath)
			if err != nil {
				http.Error(writer, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}

			writer.Header().Set("Content-Type", "text/html; charset=utf-8")
			http.ServeContent(writer, request, servePath, time.Time{}, bytes.NewReader(body))
			return
		}

		cloned := request.Clone(request.Context())
		cloned.URL.Path = "/" + servePath
		fileServer.ServeHTTP(writer, cloned)
	}), nil
}
