package ssh

import (
	"errors"
	"testing"

	gossh "golang.org/x/crypto/ssh"
)

func TestDialWithCleanupZeroesCredentialBuffers(t *testing.T) {
	t.Parallel()

	password := []byte("top-secret")
	passphrase := []byte("key-secret")
	called := false

	_, err := DialWithCleanup("tcp", "example.com:22", &ClientConfig{}, func(network string, addr string, config *ClientConfig) (*gossh.Client, error) {
		called = true
		return nil, errors.New("dial failed")
	}, password, passphrase)
	if err == nil {
		t.Fatal("expected dial error to be returned")
	}

	if !called {
		t.Fatal("expected custom dial function to be invoked")
	}

	assertZeroed(t, password)
	assertZeroed(t, passphrase)
}

func TestZeroizeHandlesEmptyBuffers(t *testing.T) {
	t.Parallel()

	Zeroize(nil, []byte{})
}

func assertZeroed(t *testing.T, buffer []byte) {
	t.Helper()

	for index, value := range buffer {
		if value != 0 {
			t.Fatalf("buffer[%d] = %d, want 0", index, value)
		}
	}
}
