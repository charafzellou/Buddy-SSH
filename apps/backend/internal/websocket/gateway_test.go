package websocket

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	ws "github.com/coder/websocket"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/auth"
	"github.com/charafzellou/buddy-ssh/apps/backend/internal/middleware"
)

func TestGatewayRejectsMissingToken(t *testing.T) {
	t.Parallel()

	response, _, err := dialGateway(t, dialGatewayOptions{})
	if err == nil {
		t.Fatal("expected missing token dial to fail")
	}

	if response == nil || response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %v, want %d", statusCode(response), http.StatusUnauthorized)
	}
}

func TestGatewayRejectsWrongToken(t *testing.T) {
	t.Parallel()

	response, _, err := dialGateway(t, dialGatewayOptions{authorization: "Bearer wrong-token"})
	if err == nil {
		t.Fatal("expected wrong token dial to fail")
	}

	if response == nil || response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %v, want %d", statusCode(response), http.StatusUnauthorized)
	}
}

func TestGatewayRejectsDisallowedOrigin(t *testing.T) {
	t.Parallel()

	response, _, err := dialGateway(t, dialGatewayOptions{
		authorization: "Bearer dev-token",
		origin:        "https://evil.example",
	})
	if err == nil {
		t.Fatal("expected disallowed origin dial to fail")
	}

	if response == nil || response.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %v, want %d", statusCode(response), http.StatusForbidden)
	}
}

func TestGatewayAcceptsValidUpgrade(t *testing.T) {
	t.Parallel()

	response, conn, err := dialGateway(t, dialGatewayOptions{
		authorization: "Bearer dev-token",
		origin:        "http://localhost:5173",
		subprotocols:  []string{SubprotocolMessagePack},
	})
	if err != nil {
		t.Fatalf("dial gateway: %v", err)
	}
	defer conn.Close(ws.StatusNormalClosure, "test complete")

	if response == nil || response.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("status = %v, want %d", statusCode(response), http.StatusSwitchingProtocols)
	}

	if negotiated := conn.Subprotocol(); negotiated != SubprotocolMessagePack {
		t.Fatalf("subprotocol = %q, want %q", negotiated, SubprotocolMessagePack)
	}
}

func TestGatewayAcceptsTokenInSubprotocol(t *testing.T) {
	t.Parallel()

	response, conn, err := dialGateway(t, dialGatewayOptions{
		origin:       "http://localhost:5173",
		subprotocols: []string{SubprotocolMessagePack, authSubprotocolPrefix + "dev-token"},
	})
	if err != nil {
		t.Fatalf("dial gateway: %v", err)
	}
	defer conn.Close(ws.StatusNormalClosure, "test complete")

	if response == nil || response.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("status = %v, want %d", statusCode(response), http.StatusSwitchingProtocols)
	}

	if negotiated := conn.Subprotocol(); negotiated != SubprotocolMessagePack {
		t.Fatalf("subprotocol = %q, want %q", negotiated, SubprotocolMessagePack)
	}
}

type dialGatewayOptions struct {
	authorization string
	origin        string
	subprotocols  []string
}

func dialGateway(t *testing.T, options dialGatewayOptions) (*http.Response, *ws.Conn, error) {
	t.Helper()

	handler := middleware.Logging(nil)(NewGateway(
		auth.NewTokenValidator("dev-token"),
		auth.NewOriginValidator([]string{"http://localhost:5173"}),
		1<<20,
	))

	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)

	headers := http.Header{}
	if options.authorization != "" {
		headers.Set("Authorization", options.authorization)
	}
	if options.origin != "" {
		headers.Set("Origin", options.origin)
	}

	conn, response, err := ws.Dial(ctx, "ws"+server.URL[len("http"):]+"/ws", &ws.DialOptions{
		HTTPHeader:   headers,
		Subprotocols: options.subprotocols,
	})

	return response, conn, err
}

func statusCode(response *http.Response) int {
	if response == nil {
		return 0
	}

	return response.StatusCode
}
