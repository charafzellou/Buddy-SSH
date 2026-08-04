package ssh

import (
	"reflect"
	"testing"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/protocol"
)

func TestBuildClientConfigPassword(t *testing.T) {
	t.Parallel()

	password := "top-secret"
	initMessage := protocol.InitMessage{
		V:    1,
		Type: "INIT",
		Payload: protocol.InitPayload{
			AuthMethod: "password",
			Target: protocol.InitPayloadTarget{Host: "example.com", Port: 22, Username: "ops"},
		},
	}
	authMessage := protocol.AuthMessage{
		V:    1,
		Type: "AUTH",
		Payload: protocol.AuthPayload{
			Password: &password,
		},
	}

	config, err := BuildClientConfig(initMessage, authMessage, nil)
	if err != nil {
		t.Fatalf("BuildClientConfig() error = %v", err)
	}

	if config.User != "ops" {
		t.Fatalf("config.User = %q, want %q", config.User, "ops")
	}

	if config.Timeout != dialTimeout {
		t.Fatalf("config.Timeout = %s, want %s", config.Timeout, dialTimeout)
	}

	if config.HostKeyCallback == nil {
		t.Fatal("expected HostKeyCallback to be set")
	}

	if len(config.Auth) != 1 {
		t.Fatalf("len(config.Auth) = %d, want 1", len(config.Auth))
	}

	if !reflect.DeepEqual(config.KeyExchanges, preferredKeyExchanges) {
		t.Fatalf("config.KeyExchanges = %v, want %v", config.KeyExchanges, preferredKeyExchanges)
	}

	if !reflect.DeepEqual(config.Ciphers, preferredCiphers) {
		t.Fatalf("config.Ciphers = %v, want %v", config.Ciphers, preferredCiphers)
	}

	if !reflect.DeepEqual(config.MACs, preferredMACs) {
		t.Fatalf("config.MACs = %v, want %v", config.MACs, preferredMACs)
	}
}

func TestSelectAuthMethodPassword(t *testing.T) {
	t.Parallel()

	password := "top-secret"
	selection, err := SelectAuthMethod("password", protocol.AuthPayload{Password: &password})
	if err != nil {
		t.Fatalf("SelectAuthMethod() error = %v", err)
	}

	if selection.Name != "password" {
		t.Fatalf("selection.Name = %q, want password", selection.Name)
	}

	if selection.Method == nil {
		t.Fatal("expected password auth method to be configured")
	}
}

func TestBuildClientConfigRejectsMissingPassword(t *testing.T) {
	t.Parallel()

	initMessage := protocol.InitMessage{
		V:    1,
		Type: "INIT",
		Payload: protocol.InitPayload{
			AuthMethod: "password",
			Target: protocol.InitPayloadTarget{Host: "example.com", Port: 22, Username: "ops"},
		},
	}

	_, err := BuildClientConfig(initMessage, protocol.AuthMessage{V: 1, Type: "AUTH"}, nil)
	if err == nil {
		t.Fatal("expected missing password to fail")
	}
}