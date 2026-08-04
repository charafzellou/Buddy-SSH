package ssh

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"log/slog"
	"net"
	"strings"
	"testing"

	gossh "golang.org/x/crypto/ssh"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/protocol"
)

func TestHostKeyVerifierFirstUseAccepts(t *testing.T) {
	t.Parallel()

	key := testPublicKey(t)
	var logBuffer bytes.Buffer
	verifier := NewHostKeyVerifier(protocol.InitPayloadHostKey{Mode: "first-use"}, slog.New(slog.NewJSONHandler(&logBuffer, nil)))

	err := verifier.Verify("example.com", &net.TCPAddr{IP: net.ParseIP("127.0.0.1"), Port: 22}, key)
	if err != nil {
		t.Fatalf("Verify() error = %v", err)
	}

	presented, ok := verifier.Presented()
	if !ok {
		t.Fatal("expected presented host key metadata to be recorded")
	}

	if presented.Algorithm != key.Type() {
		t.Fatalf("algorithm = %q, want %q", presented.Algorithm, key.Type())
	}

	if presented.Fingerprint != gossh.FingerprintSHA256(key) {
		t.Fatalf("fingerprint = %q, want %q", presented.Fingerprint, gossh.FingerprintSHA256(key))
	}

	if !strings.Contains(logBuffer.String(), "accepting first-use host key") {
		t.Fatalf("expected first-use acceptance to be logged, got %q", logBuffer.String())
	}
}

func TestHostKeyVerifierPinnedMatchAccepts(t *testing.T) {
	t.Parallel()

	key := testPublicKey(t)
	fingerprint := gossh.FingerprintSHA256(key)
	verifier := NewHostKeyVerifier(protocol.InitPayloadHostKey{Mode: "pinned", Fingerprint: &fingerprint}, nil)

	if err := verifier.Verify("example.com", &net.TCPAddr{IP: net.ParseIP("127.0.0.1"), Port: 22}, key); err != nil {
		t.Fatalf("Verify() error = %v", err)
	}
}

func TestHostKeyVerifierPinnedMismatchFails(t *testing.T) {
	t.Parallel()

	actualKey := testPublicKey(t)
	mismatchKey := testPublicKey(t)
	fingerprint := gossh.FingerprintSHA256(mismatchKey)
	verifier := NewHostKeyVerifier(protocol.InitPayloadHostKey{Mode: "pinned", Fingerprint: &fingerprint}, nil)

	err := verifier.Verify("example.com", &net.TCPAddr{IP: net.ParseIP("127.0.0.1"), Port: 22}, actualKey)
	if err == nil {
		t.Fatal("expected pinned mismatch to fail")
	}

	if !strings.Contains(err.Error(), "host key mismatch") {
		t.Fatalf("expected mismatch error, got %v", err)
	}
}

func testPublicKey(t *testing.T) gossh.PublicKey {
	t.Helper()

	publicKey, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate ed25519 key: %v", err)
	}

	sshPublicKey, err := gossh.NewPublicKey(publicKey)
	if err != nil {
		t.Fatalf("new public key: %v", err)
	}

	return sshPublicKey
}
