package server

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	ws "github.com/coder/websocket"
	gossh "golang.org/x/crypto/ssh"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/config"
	backendlogging "github.com/charafzellou/buddy-ssh/apps/backend/internal/logging"
	"github.com/charafzellou/buddy-ssh/apps/backend/internal/protocol"
	buddywebsocket "github.com/charafzellou/buddy-ssh/apps/backend/internal/websocket"
)

func TestNewHandlerRelaysWebsocketSessionToSSH(t *testing.T) {
	t.Parallel()

	sshServer, err := newIntegrationSSHServer("top-secret")
	if err != nil {
		t.Fatalf("newIntegrationSSHServer() error = %v", err)
	}
	defer sshServer.Close()

	handler, err := NewHandler(config.Config{
		Token:          "dev-token",
		AllowedOrigins: []string{"http://localhost:5173"},
		ReadLimit:      1 << 20,
		Keepalive:      250 * time.Millisecond,
		IdleTimeout:    2 * time.Second,
	}, nil, fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<!doctype html><html><body>Buddy-SSH</body></html>")},
	})
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}

	httpServer := httptest.NewServer(handler)
	defer httpServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	connection, _, err := ws.Dial(ctx, "ws"+httpServer.URL[len("http"):]+"/ws", &ws.DialOptions{
		HTTPHeader: http.Header{
			"Authorization": []string{"Bearer dev-token"},
			"Origin":        []string{"http://localhost:5173"},
		},
		Subprotocols: []string{buddywebsocket.SubprotocolMessagePack},
	})
	if err != nil {
		t.Fatalf("ws.Dial() error = %v", err)
	}
	defer connection.Close(ws.StatusNormalClosure, "test complete")

	requestID := "req-1"
	password := "top-secret"
	if err := writeProtocolMessage(ctx, connection, protocol.InitMessage{
		V:    1,
		ID:   &requestID,
		Type: "INIT",
		Payload: protocol.InitPayload{
			AuthMethod: "password",
			HostKey:    protocol.InitPayloadHostKey{Mode: "first-use"},
			Target: protocol.InitPayloadTarget{
				Host:     sshServer.Host(),
				Port:     sshServer.Port(),
				Username: "ops",
			},
			PTY: protocol.InitPayloadPTY{
				Term: "xterm-256color",
				Cols: 80,
				Rows: 24,
			},
		},
	}); err != nil {
		t.Fatalf("write INIT: %v", err)
	}

	if err := writeProtocolMessage(ctx, connection, protocol.AuthMessage{
		V:    1,
		ID:   &requestID,
		Type: "AUTH",
		Payload: protocol.AuthPayload{
			Password: &password,
		},
	}); err != nil {
		t.Fatalf("write AUTH: %v", err)
	}

	if err := writeProtocolMessage(ctx, connection, protocol.ConnectMessage{
		V:    1,
		ID:   &requestID,
		Type: "CONNECT",
		Payload: protocol.ConnectPayload{},
	}); err != nil {
		t.Fatalf("write CONNECT: %v", err)
	}

	var (
		banner    protocol.DataMessage
		connected protocol.ConnectedMessage
	)
	for connected.Type == "" || len(banner.Payload.Data) == 0 {
		message, err := readProtocolMessage(ctx, connection)
		if err != nil {
			t.Fatalf("read initial session message: %v", err)
		}

		switch typed := message.(type) {
		case protocol.ConnectedMessage:
			connected = typed
		case protocol.DataMessage:
			if strings.Contains(string(typed.Payload.Data), "shell ready") {
				banner = typed
			}
		}
	}

	if connected.Payload.SessionID == "" {
		t.Fatal("expected CONNECTED session id to be populated")
	}
	if connected.Payload.ServerID == "" {
		t.Fatal("expected CONNECTED server id to be populated")
	}
	if !strings.Contains(string(banner.Payload.Data), "shell ready") {
		t.Fatalf("banner = %q, want shell ready output", string(banner.Payload.Data))
	}

	echoInput := []byte("echo test\n")
	if err := writeProtocolMessage(ctx, connection, protocol.DataMessage{
		V:    1,
		ID:   &requestID,
		Type: "DATA",
		Payload: protocol.DataPayload{
			Data: echoInput,
		},
	}); err != nil {
		t.Fatalf("write DATA: %v", err)
	}

	echoMessage, err := readUntilMessage(ctx, connection, func(message any) bool {
		data, ok := message.(protocol.DataMessage)
		return ok && strings.Contains(string(data.Payload.Data), string(echoInput))
	})
	if err != nil {
		t.Fatalf("read echoed DATA: %v", err)
	}

	echo, ok := echoMessage.(protocol.DataMessage)
	if !ok {
		t.Fatalf("echoMessage = %T, want protocol.DataMessage", echoMessage)
	}
	if string(echo.Payload.Data) != string(echoInput) {
		t.Fatalf("echo payload = %q, want %q", string(echo.Payload.Data), string(echoInput))
	}

	if err := writeProtocolMessage(ctx, connection, protocol.ResizeMessage{
		V:    1,
		ID:   &requestID,
		Type: "RESIZE",
		Payload: protocol.ResizePayload{
			Cols: 132,
			Rows: 40,
		},
	}); err != nil {
		t.Fatalf("write RESIZE: %v", err)
	}

	select {
	case resize := <-sshServer.windowChanges:
		if resize.Columns != 132 || resize.Rows != 40 {
			t.Fatalf("window change = %dx%d, want 132x40", resize.Columns, resize.Rows)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for window-change request")
	}

	if err := writeProtocolMessage(ctx, connection, protocol.DisconnectMessage{
		V:    1,
		ID:   &requestID,
		Type: "DISCONNECT",
		Payload: protocol.DisconnectPayload{},
	}); err != nil {
		t.Fatalf("write DISCONNECT: %v", err)
	}

	disconnectMessage, err := readUntilMessage(ctx, connection, func(message any) bool {
		_, ok := message.(protocol.DisconnectMessage)
		return ok
	})
	if err != nil {
		t.Fatalf("read DISCONNECT: %v", err)
	}

	disconnect, ok := disconnectMessage.(protocol.DisconnectMessage)
	if !ok {
		t.Fatalf("disconnectMessage = %T, want protocol.DisconnectMessage", disconnectMessage)
	}
	if disconnect.Payload.Reason == nil || *disconnect.Payload.Reason != "client_close" {
		t.Fatalf("disconnect reason = %v, want client_close", disconnect.Payload.Reason)
	}
}

func TestNewHandlerRedactsPasswordFromLogs(t *testing.T) {
	t.Parallel()

	password := "ultra-secret-password"
	sshServer, err := newIntegrationSSHServer(password)
	if err != nil {
		t.Fatalf("newIntegrationSSHServer() error = %v", err)
	}
	defer sshServer.Close()

	var logBuffer bytes.Buffer
	logger, err := backendlogging.New("info", &logBuffer)
	if err != nil {
		t.Fatalf("logging.New() error = %v", err)
	}

	handler, err := NewHandler(config.Config{
		Token:          "dev-token",
		AllowedOrigins: []string{"http://localhost:5173"},
		ReadLimit:      1 << 20,
		Keepalive:      250 * time.Millisecond,
		IdleTimeout:    2 * time.Second,
	}, logger, fstest.MapFS{
		"index.html": &fstest.MapFile{Data: []byte("<!doctype html><html><body>Buddy-SSH</body></html>")},
	})
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}

	httpServer := httptest.NewServer(handler)
	defer httpServer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	connection, _, err := ws.Dial(ctx, "ws"+httpServer.URL[len("http"):]+"/ws", &ws.DialOptions{
		HTTPHeader: http.Header{
			"Authorization": []string{"Bearer dev-token"},
			"Origin":        []string{"http://localhost:5173"},
		},
		Subprotocols: []string{buddywebsocket.SubprotocolMessagePack},
	})
	if err != nil {
		t.Fatalf("ws.Dial() error = %v", err)
	}
	defer connection.Close(ws.StatusNormalClosure, "test complete")

	requestID := "req-2"
	if err := writeProtocolMessage(ctx, connection, protocol.InitMessage{
		V:    1,
		ID:   &requestID,
		Type: "INIT",
		Payload: protocol.InitPayload{
			AuthMethod: "password",
			HostKey:    protocol.InitPayloadHostKey{Mode: "first-use"},
			Target: protocol.InitPayloadTarget{
				Host:     sshServer.Host(),
				Port:     sshServer.Port(),
				Username: "ops",
			},
			PTY: protocol.InitPayloadPTY{
				Term: "xterm-256color",
				Cols: 80,
				Rows: 24,
			},
		},
	}); err != nil {
		t.Fatalf("write INIT: %v", err)
	}

	if err := writeProtocolMessage(ctx, connection, protocol.AuthMessage{
		V:    1,
		ID:   &requestID,
		Type: "AUTH",
		Payload: protocol.AuthPayload{
			Password: &password,
		},
	}); err != nil {
		t.Fatalf("write AUTH: %v", err)
	}

	if err := writeProtocolMessage(ctx, connection, protocol.ConnectMessage{
		V:    1,
		ID:   &requestID,
		Type: "CONNECT",
		Payload: protocol.ConnectPayload{},
	}); err != nil {
		t.Fatalf("write CONNECT: %v", err)
	}

	if _, err := readUntilMessage(ctx, connection, func(message any) bool {
		_, ok := message.(protocol.ConnectedMessage)
		return ok
	}); err != nil {
		t.Fatalf("read CONNECTED: %v", err)
	}

	if err := writeProtocolMessage(ctx, connection, protocol.DisconnectMessage{
		V:    1,
		ID:   &requestID,
		Type: "DISCONNECT",
		Payload: protocol.DisconnectPayload{},
	}); err != nil {
		t.Fatalf("write DISCONNECT: %v", err)
	}

	if _, err := readUntilMessage(ctx, connection, func(message any) bool {
		_, ok := message.(protocol.DisconnectMessage)
		return ok
	}); err != nil {
		t.Fatalf("read DISCONNECT: %v", err)
	}

	output := logBuffer.String()
	if output == "" {
		t.Fatal("expected backend log output to be captured")
	}
	if strings.Contains(output, password) {
		t.Fatalf("expected logs to redact password %q, got %q", password, output)
	}
	if !strings.Contains(output, "accepting first-use host key") && !strings.Contains(output, "http request") {
		t.Fatalf("expected backend connection logs, got %q", output)
	}
}

func writeProtocolMessage(ctx context.Context, connection *ws.Conn, message any) error {
	payload, err := buddywebsocket.Encode(buddywebsocket.EncodingMessagePack, message)
	if err != nil {
		return err
	}

	return connection.Write(ctx, ws.MessageBinary, payload)
}

func readUntilMessage(ctx context.Context, connection *ws.Conn, match func(any) bool) (any, error) {
	for {
		message, err := readProtocolMessage(ctx, connection)
		if err != nil {
			return nil, err
		}

		if match(message) {
			return message, nil
		}
	}
}

func readProtocolMessage(ctx context.Context, connection *ws.Conn) (any, error) {
	_, payload, err := connection.Read(ctx)
	if err != nil {
		return nil, err
	}

	return buddywebsocket.Decode(buddywebsocket.EncodingMessagePack, payload)
}

type integrationSSHServer struct {
	listener      net.Listener
	password      string
	windowChanges chan integrationWindowChange
	closeFunc     context.CancelFunc
}

type integrationWindowChange struct {
	Columns uint32
	Rows    uint32
	Width   uint32
	Height  uint32
}

func newIntegrationSSHServer(password string) (*integrationSSHServer, error) {
	_, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}

	signer, err := gossh.NewSignerFromKey(privateKey)
	if err != nil {
		return nil, err
	}

	serverConfig := &gossh.ServerConfig{
		PasswordCallback: func(metadata gossh.ConnMetadata, presented []byte) (*gossh.Permissions, error) {
			if metadata.User() != "ops" || string(presented) != password {
				return nil, fmt.Errorf("invalid credentials")
			}

			return nil, nil
		},
	}
	serverConfig.AddHostKey(signer)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithCancel(context.Background())
	server := &integrationSSHServer{
		listener:      listener,
		password:      password,
		windowChanges: make(chan integrationWindowChange, 1),
		closeFunc:     cancel,
	}

	go server.serve(ctx, serverConfig)

	return server, nil
}

func (server *integrationSSHServer) serve(ctx context.Context, config *gossh.ServerConfig) {
	for {
		connection, err := server.listener.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				return
			default:
				return
			}
		}

		go server.handleConnection(connection, config)
	}
}

func (server *integrationSSHServer) handleConnection(connection net.Conn, config *gossh.ServerConfig) {
	defer connection.Close()

	_, channels, requests, err := gossh.NewServerConn(connection, config)
	if err != nil {
		return
	}

	go handleGlobalRequests(requests)

	for newChannel := range channels {
		if newChannel.ChannelType() != "session" {
			_ = newChannel.Reject(gossh.UnknownChannelType, "unsupported channel type")
			continue
		}

		channel, requests, err := newChannel.Accept()
		if err != nil {
			continue
		}

		go server.handleSessionChannel(channel, requests)
	}
}

func (server *integrationSSHServer) handleSessionChannel(channel gossh.Channel, requests <-chan *gossh.Request) {
	defer channel.Close()

	for request := range requests {
		switch request.Type {
		case "pty-req":
			_ = request.Reply(true, nil)
		case "window-change":
			var payload integrationWindowChange
			if err := gossh.Unmarshal(request.Payload, &payload); err == nil {
				server.windowChanges <- payload
			}
		case "shell":
			_ = request.Reply(true, nil)
			go func() {
				_, _ = io.WriteString(channel, "shell ready\n")
				_, _ = io.Copy(channel, channel)
			}()
		default:
			if request.WantReply {
				_ = request.Reply(false, nil)
			}
		}
	}
}

func handleGlobalRequests(requests <-chan *gossh.Request) {
	for request := range requests {
		switch request.Type {
		case "keepalive@openssh.com":
			if request.WantReply {
				_ = request.Reply(true, nil)
			}
		default:
			if request.WantReply {
				_ = request.Reply(false, nil)
			}
		}
	}
}

func (server *integrationSSHServer) Address() string {
	return server.listener.Addr().String()
}

func (server *integrationSSHServer) Host() string {
	host, _, _ := net.SplitHostPort(server.Address())
	return host
}

func (server *integrationSSHServer) Port() int {
	_, port, _ := net.SplitHostPort(server.Address())
	value, _ := strconv.Atoi(port)
	return value
}

func (server *integrationSSHServer) Close() error {
	server.closeFunc()
	return server.listener.Close()
}