package main

import (
	"context"
	"io"
	"net"
	"os"
	"syscall"
	"testing"
	"time"

	ws "github.com/coder/websocket"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/config"
	backendlogging "github.com/charafzellou/buddy-ssh/apps/backend/internal/logging"
	"github.com/charafzellou/buddy-ssh/apps/backend/internal/server"
	"github.com/charafzellou/buddy-ssh/apps/backend/internal/websocket"
)

func TestServeWithShutdownClosesWebsocketAndReturns(t *testing.T) {
	t.Parallel()

	logger, err := backendlogging.New("error", io.Discard)
	if err != nil {
		t.Fatalf("logging.New() error = %v", err)
	}

	httpServer, err := server.New(config.Config{
		Port:            0,
		Token:           "dev-token",
		AllowedOrigins:  []string{"http://localhost:5173"},
		ReadLimit:       1 << 20,
		ShutdownTimeout: 250 * time.Millisecond,
	}, logger, nil)
	if err != nil {
		t.Fatalf("server.New() error = %v", err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen() error = %v", err)
	}

	signals := make(chan os.Signal, 1)
	serveDone := make(chan error, 1)
	go func() {
		serveDone <- serveWithShutdown(httpServer, listener, 250*time.Millisecond, signals, logger)
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := ws.Dial(ctx, "ws://"+listener.Addr().String()+"/ws", &ws.DialOptions{
		HTTPHeader: map[string][]string{
			"Authorization": {"Bearer dev-token"},
			"Origin":        {"http://localhost:5173"},
		},
		Subprotocols: []string{websocket.SubprotocolMessagePack},
	})
	if err != nil {
		t.Fatalf("ws.Dial() error = %v", err)
	}
	defer conn.Close(ws.StatusNormalClosure, "test complete")

	signals <- syscall.SIGTERM

	readContext, readCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer readCancel()
	if _, _, err := conn.Read(readContext); err == nil {
		t.Fatal("expected websocket read to fail after shutdown")
	}

	select {
	case err := <-serveDone:
		if err != nil {
			t.Fatalf("serveWithShutdown() error = %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for graceful shutdown")
	}
}