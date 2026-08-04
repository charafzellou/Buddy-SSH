// Package main is the Buddy-SSH backend entrypoint.
// M0.3.3 provides a minimal health endpoint; M1.6 will add full server wiring.
package main

import (
	"context"
	"log"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/config"
	backendlogging "github.com/charafzellou/buddy-ssh/apps/backend/internal/logging"
	"github.com/charafzellou/buddy-ssh/apps/backend/internal/server"
)

func runHealthcheck() error {
	client := &http.Client{Timeout: 3 * time.Second}
	response, err := client.Get("http://127.0.0.1:8443/healthz")
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return &net.OpError{Op: "healthcheck", Err: errUnexpectedStatus{statusCode: response.StatusCode}}
	}

	return nil
}

type errUnexpectedStatus struct {
	statusCode int
}

func (error errUnexpectedStatus) Error() string {
	return http.StatusText(error.statusCode)
}

func main() {
	if err := run(os.Args[1:], newSignalChannel()); err != nil {
		log.Fatal(err)
	}
}

func run(args []string, signals <-chan os.Signal) error {
	if len(args) > 0 && args[0] == "healthcheck" {
		return runHealthcheck()
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	logger, err := backendlogging.New(cfg.LogLevel, nil)
	if err != nil {
		return err
	}

	httpServer, err := server.New(cfg, logger, nil)
	if err != nil {
		return err
	}

	listener, err := net.Listen("tcp", httpServer.Addr)
	if err != nil {
		return err
	}

	return serveWithShutdown(httpServer, listener, cfg.ShutdownTimeout, signals, logger)
}

func newSignalChannel() <-chan os.Signal {
	signals := make(chan os.Signal, 2)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)

	return signals
}

func serveWithShutdown(
	httpServer *http.Server,
	listener net.Listener,
	shutdownTimeout time.Duration,
	signals <-chan os.Signal,
	logger *slog.Logger,
) error {
	errorChannel := make(chan error, 1)

	go func() {
		if err := httpServer.Serve(listener); err != nil && err != http.ErrServerClosed {
			errorChannel <- err
			return
		}

		errorChannel <- nil
	}()

	select {
	case err := <-errorChannel:
		return err
	case signalValue := <-signals:
		if logger != nil {
			logger.Info("shutdown signal received", "signal", signalValue.String())
		}

		ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()

		if err := httpServer.Shutdown(ctx); err != nil {
			return err
		}

		return <-errorChannel
	}
}
