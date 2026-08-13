package ssh

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"fmt"
	"io"
	"net"
	"testing"
	"time"

	gossh "golang.org/x/crypto/ssh"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/protocol"
)

func TestSessionRequestPTYAndWindowChange(t *testing.T) {
	t.Parallel()

	server, err := newTestSSHServer()
	if err != nil {
		t.Fatalf("newTestSSHServer() error = %v", err)
	}
	defer server.Close()

	password := "top-secret"
	initMessage := protocol.InitMessage{
		V:    1,
		Type: "INIT",
		Payload: protocol.InitPayload{
			AuthMethod: "password",
			HostKey:    protocol.InitPayloadHostKey{Mode: "first-use"},
			Target: protocol.InitPayloadTarget{
				Host:     server.Host(),
				Port:     server.Port(),
				Username: "ops",
			},
		},
	}
	authMessage := protocol.AuthMessage{
		V:    1,
		Type: "AUTH",
		Payload: protocol.AuthPayload{
			Password: &password,
		},
	}

	clientConfig, err := BuildClientConfig(initMessage, authMessage, nil, nil)
	if err != nil {
		t.Fatalf("BuildClientConfig() error = %v", err)
	}

	client, err := gossh.Dial("tcp", server.Address(), clientConfig)
	if err != nil {
		t.Fatalf("gossh.Dial() error = %v", err)
	}
	defer client.Close()

	session, err := NewSession(client)
	if err != nil {
		t.Fatalf("NewSession() error = %v", err)
	}
	defer session.Close()

	if err := session.RequestPTY("xterm-256color", 24, 80, gossh.TerminalModes{}); err != nil {
		t.Fatalf("RequestPTY() error = %v", err)
	}

	if err := session.WindowChange(40, 120); err != nil {
		t.Fatalf("WindowChange() error = %v", err)
	}

	select {
	case ptyRequest := <-server.ptyRequests:
		if ptyRequest.Term != "xterm-256color" {
			t.Fatalf("pty term = %q, want xterm-256color", ptyRequest.Term)
		}
		if ptyRequest.Rows != 24 || ptyRequest.Columns != 80 {
			t.Fatalf("pty size = %dx%d, want 24x80", ptyRequest.Rows, ptyRequest.Columns)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for pty request")
	}

	select {
	case resize := <-server.windowChanges:
		if resize.Rows != 40 || resize.Columns != 120 {
			t.Fatalf("window change = %dx%d, want 40x120", resize.Rows, resize.Columns)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for window-change request")
	}

	if session.Stdin == nil || session.Stdout == nil || session.Stderr == nil {
		t.Fatal("expected session pipes to be initialized")
	}
}

type testSSHServer struct {
	listener          net.Listener
	keepaliveRequests chan string
	ptyRequests       chan ptyRequestMessage
	windowChanges     chan windowChangeMessage
	closeFunc         context.CancelFunc
}

func newTestSSHServer() (*testSSHServer, error) {
	_, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}

	signer, err := gossh.NewSignerFromKey(privateKey)
	if err != nil {
		return nil, err
	}

	serverConfig := &gossh.ServerConfig{
		PasswordCallback: func(metadata gossh.ConnMetadata, password []byte) (*gossh.Permissions, error) {
			if metadata.User() != "ops" || string(password) != "top-secret" {
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
	server := &testSSHServer{
		listener:          listener,
		keepaliveRequests: make(chan string, 4),
		ptyRequests:       make(chan ptyRequestMessage, 1),
		windowChanges:     make(chan windowChangeMessage, 1),
		closeFunc:         cancel,
	}

	go server.serve(ctx, serverConfig)

	return server, nil
}

func (server *testSSHServer) serve(ctx context.Context, config *gossh.ServerConfig) {
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

func (server *testSSHServer) handleConnection(connection net.Conn, config *gossh.ServerConfig) {
	defer connection.Close()

	_, channels, requests, err := gossh.NewServerConn(connection, config)
	if err != nil {
		return
	}
	defer func() {
		_ = connection.Close()
	}()

	go server.handleGlobalRequests(requests)

	for newChannel := range channels {
		if newChannel.ChannelType() != "session" {
			_ = newChannel.Reject(gossh.UnknownChannelType, "unsupported channel type")
			continue
		}

		channel, requests, err := newChannel.Accept()
		if err != nil {
			continue
		}
		defer channel.Close()

		for request := range requests {
			switch request.Type {
			case "pty-req":
				var payload ptyRequestMessage
				if err := gossh.Unmarshal(request.Payload, &payload); err == nil {
					server.ptyRequests <- payload
				}
				_ = request.Reply(true, nil)
			case "window-change":
				var payload windowChangeMessage
				if err := gossh.Unmarshal(request.Payload, &payload); err == nil {
					server.windowChanges <- payload
				}
			case "shell":
				_ = request.Reply(true, nil)
				_, _ = io.WriteString(channel, "shell ready\n")
			default:
				if request.WantReply {
					_ = request.Reply(false, nil)
				}
			}
		}
	}
}

func (server *testSSHServer) Address() string {
	return server.listener.Addr().String()
}

func (server *testSSHServer) Host() string {
	host, _, _ := net.SplitHostPort(server.Address())
	return host
}

func (server *testSSHServer) Port() int {
	_, port, _ := net.SplitHostPort(server.Address())
	value, _ := net.LookupPort("tcp", port)
	return value
}

func (server *testSSHServer) Close() error {
	server.closeFunc()
	return server.listener.Close()
}

type ptyRequestMessage struct {
	Term     string
	Columns  uint32
	Rows     uint32
	Width    uint32
	Height   uint32
	Modelist string
}

type windowChangeMessage struct {
	Columns uint32
	Rows    uint32
	Width   uint32
	Height  uint32
}

func (server *testSSHServer) handleGlobalRequests(requests <-chan *gossh.Request) {
	for request := range requests {
		switch request.Type {
		case "keepalive@openssh.com":
			server.keepaliveRequests <- request.Type
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
