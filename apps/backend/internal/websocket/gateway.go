package websocket

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	ws "github.com/coder/websocket"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/auth"
	"github.com/charafzellou/buddy-ssh/apps/backend/internal/middleware"
	backendssh "github.com/charafzellou/buddy-ssh/apps/backend/internal/ssh"
)

const (
	SubprotocolMessagePack = "buddy-ssh.msgpack"
	SubprotocolJSON        = "buddy-ssh.json"
	authSubprotocolPrefix  = "buddy-ssh.auth."
)

// Gateway handles websocket upgrades for the Buddy-SSH transport endpoint.
type Gateway struct {
	TokenValidator     auth.TokenValidator
	OriginValidator    auth.OriginValidator
	ReadLimit          int64
	KeepaliveInterval  time.Duration
	IdleTimeout        time.Duration
	DialSSH            backendssh.DialFunc

	mutex             sync.Mutex
	activeConnections map[*ws.Conn]struct{}
}

// NewGateway constructs the /ws handler with authentication and upgrade rules.
func NewGateway(tokenValidator auth.TokenValidator, originValidator auth.OriginValidator, readLimit int64) *Gateway {
	return &Gateway{
		TokenValidator:     tokenValidator,
		OriginValidator:    originValidator,
		ReadLimit:          readLimit,
		activeConnections: make(map[*ws.Conn]struct{}),
	}
}

// ServeHTTP validates the websocket upgrade request and negotiates the wire protocol.
func (gateway *Gateway) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	if !gateway.TokenValidator.Validate(bearerToken(request)) {
		http.Error(writer, http.StatusText(http.StatusUnauthorized), http.StatusUnauthorized)
		return
	}

	if !gateway.OriginValidator.Validate(request) {
		http.Error(writer, http.StatusText(http.StatusForbidden), http.StatusForbidden)
		return
	}

	connection, err := ws.Accept(writer, request, &ws.AcceptOptions{
		InsecureSkipVerify: true,
		Subprotocols:       []string{SubprotocolMessagePack, SubprotocolJSON},
	})
	if err != nil {
		middleware.Logger(request.Context()).Warn("websocket accept failed", "error", err)
		return
	}
	defer func() {
		_ = connection.CloseNow()
	}()

	connection.SetReadLimit(gateway.ReadLimit)
	gateway.track(connection)
	defer gateway.untrack(connection)

	session := newGatewaySession(gateway, connection, middleware.Logger(request.Context()), middleware.RequestID(request.Context()))
	if err := session.Run(request.Context()); err != nil && !errors.Is(err, context.Canceled) && !isExpectedClose(err) {
		middleware.Logger(request.Context()).Warn("websocket session ended", "error", err)
	}
}

// CloseAll closes every upgraded websocket so HTTP shutdown can drain live sessions.
func (gateway *Gateway) CloseAll() {
	gateway.mutex.Lock()
	connections := make([]*ws.Conn, 0, len(gateway.activeConnections))
	for connection := range gateway.activeConnections {
		connections = append(connections, connection)
	}
	gateway.mutex.Unlock()

	for _, connection := range connections {
		_ = connection.Close(ws.StatusGoingAway, "server shutdown")
	}
}

func (gateway *Gateway) track(connection *ws.Conn) {
	gateway.mutex.Lock()
	defer gateway.mutex.Unlock()

	if gateway.activeConnections == nil {
		gateway.activeConnections = make(map[*ws.Conn]struct{})
	}

	gateway.activeConnections[connection] = struct{}{}
}

func (gateway *Gateway) untrack(connection *ws.Conn) {
	gateway.mutex.Lock()
	defer gateway.mutex.Unlock()

	delete(gateway.activeConnections, connection)
}

func isExpectedClose(err error) bool {
	status := ws.CloseStatus(err)
	return status == ws.StatusNormalClosure || status == ws.StatusGoingAway
}

func bearerToken(request *http.Request) string {
	authorization := strings.TrimSpace(request.Header.Get("Authorization"))
	if authorization == "" {
		return subprotocolToken(request.Header.Get("Sec-WebSocket-Protocol"))
	}

	scheme, token, found := strings.Cut(authorization, " ")
	if !found || !strings.EqualFold(scheme, "Bearer") {
		return subprotocolToken(request.Header.Get("Sec-WebSocket-Protocol"))
	}

	return strings.TrimSpace(token)
}

func subprotocolToken(header string) string {
	for _, candidate := range strings.Split(header, ",") {
		trimmed := strings.TrimSpace(candidate)
		if strings.HasPrefix(trimmed, authSubprotocolPrefix) {
			return strings.TrimPrefix(trimmed, authSubprotocolPrefix)
		}
	}

	return ""
}
