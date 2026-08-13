package ssh

import (
	"context"
	"errors"
	"testing"
	"time"

	gossh "golang.org/x/crypto/ssh"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/protocol"
)

func TestStartKeepaliveTriggersIdleTimeout(t *testing.T) {
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

	tracker := NewActivityTracker(nil)
	idleTriggered := make(chan struct{}, 1)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	results := StartKeepalive(ctx, client, 10*time.Millisecond, 30*time.Millisecond, tracker, func() {
		idleTriggered <- struct{}{}
	})

	select {
	case requestType := <-server.keepaliveRequests:
		if requestType != "keepalive@openssh.com" {
			t.Fatalf("keepalive request type = %q, want keepalive@openssh.com", requestType)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for keepalive request")
	}

	select {
	case <-idleTriggered:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for idle timeout callback")
	}

	select {
	case err := <-results:
		if !errors.Is(err, ErrIdleTimeout) {
			t.Fatalf("keepalive result = %v, want %v", err, ErrIdleTimeout)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for keepalive loop to stop")
	}
}
