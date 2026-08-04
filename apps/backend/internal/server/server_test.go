package server

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	ws "github.com/coder/websocket"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/config"
	"github.com/charafzellou/buddy-ssh/apps/backend/internal/websocket"
)

func TestNewHandlerServesHealthWebsocketAndSPA(t *testing.T) {
	t.Parallel()

	handler, err := NewHandler(config.Config{
		Token:          "dev-token",
		AllowedOrigins: []string{"http://localhost:5173"},
		ReadLimit:      1 << 20,
	}, nil, fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<!doctype html><html><body>Buddy-SSH</body></html>")},
	})
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}

	server := httptest.NewServer(handler)
	defer server.Close()

	response, err := http.Get(server.URL + "/healthz")
	if err != nil {
		t.Fatalf("GET /healthz error = %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("/healthz status = %d, want %d", response.StatusCode, http.StatusOK)
	}

	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read /healthz body: %v", err)
	}
	if !strings.Contains(string(body), `"status":"ok"`) {
		t.Fatalf("/healthz body = %q, want JSON status ok", string(body))
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, upgradeResponse, err := ws.Dial(ctx, "ws"+server.URL[len("http"):]+"/ws", &ws.DialOptions{
		HTTPHeader: http.Header{
			"Authorization": []string{"Bearer dev-token"},
			"Origin":        []string{"http://localhost:5173"},
		},
		Subprotocols: []string{websocket.SubprotocolMessagePack},
	})
	if err != nil {
		t.Fatalf("dial /ws error = %v", err)
	}
	defer conn.Close(ws.StatusNormalClosure, "test complete")

	if upgradeResponse.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("/ws status = %d, want %d", upgradeResponse.StatusCode, http.StatusSwitchingProtocols)
	}

	spaResponse, err := http.Get(server.URL + "/")
	if err != nil {
		t.Fatalf("GET / error = %v", err)
	}
	defer spaResponse.Body.Close()

	spaBody, err := io.ReadAll(spaResponse.Body)
	if err != nil {
		t.Fatalf("read / body: %v", err)
	}

	if spaResponse.StatusCode != http.StatusOK {
		t.Fatalf("/ status = %d, want %d", spaResponse.StatusCode, http.StatusOK)
	}
	if !strings.Contains(string(spaBody), "Buddy-SSH") {
		t.Fatalf("/ body = %q, want Buddy-SSH HTML", string(spaBody))
	}
}
