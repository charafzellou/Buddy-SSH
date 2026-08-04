package ssh

import (
	"fmt"
	"time"

	gossh "golang.org/x/crypto/ssh"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/protocol"
)

// ClientConfig aliases the upstream SSH client configuration type used by the
// Buddy-SSH transport layer.
type ClientConfig = gossh.ClientConfig

// AuthMethod aliases the upstream SSH authentication method interface.
type AuthMethod = gossh.AuthMethod

// HostKeyCallback aliases the upstream SSH host-key verification callback.
type HostKeyCallback = gossh.HostKeyCallback

// AuthSelection describes the concrete auth method chosen for a connection.
type AuthSelection struct {
	Name   string
	Method AuthMethod
}

const dialTimeout = 10 * time.Second

var preferredKeyExchanges = []string{
	"curve25519-sha256",
	"curve25519-sha256@libssh.org",
}

var preferredCiphers = []string{
	"aes128-gcm@openssh.com",
	"aes256-gcm@openssh.com",
	"chacha20-poly1305@openssh.com",
}

var preferredMACs = []string{
	"hmac-sha2-256-etm@openssh.com",
	"hmac-sha2-512-etm@openssh.com",
}

// BuildClientConfig constructs the SSH client configuration for one session.
func BuildClientConfig(init protocol.InitMessage, auth protocol.AuthMessage, hostKeyCallback HostKeyCallback) (*ClientConfig, error) {
	selection, err := SelectAuthMethod(init.Payload.AuthMethod, auth.Payload)
	if err != nil {
		return nil, err
	}

	if hostKeyCallback == nil {
		hostKeyCallback = NewHostKeyVerifier(init.Payload.HostKey, nil).Callback()
	}

	config := &gossh.ClientConfig{
		Config: gossh.Config{
			KeyExchanges: cloneStrings(preferredKeyExchanges),
			Ciphers:      cloneStrings(preferredCiphers),
			MACs:         cloneStrings(preferredMACs),
		},
		User:            init.Payload.Target.Username,
		Auth:            []gossh.AuthMethod{selection.Method},
		HostKeyCallback: hostKeyCallback,
		Timeout:         dialTimeout,
	}

	return config, nil
}

// SelectAuthMethod chooses the SSH auth method that matches the INIT/AUTH pair.
func SelectAuthMethod(authMethod string, payload protocol.AuthPayload) (AuthSelection, error) {
	switch authMethod {
	case "password":
		if payload.Password == nil || *payload.Password == "" {
			return AuthSelection{}, fmt.Errorf("password auth requires payload.password")
		}

		return AuthSelection{
			Name:   authMethod,
			Method: gossh.Password(*payload.Password),
		}, nil
	case "publickey":
		return AuthSelection{}, fmt.Errorf("publickey auth is not implemented yet")
	case "keyboard-interactive":
		return AuthSelection{}, fmt.Errorf("keyboard-interactive auth is not implemented yet")
	default:
		return AuthSelection{}, fmt.Errorf("unsupported auth method %q", authMethod)
	}
}

// SupportedAuthMethods lists the auth modes planned for the first transport
// implementation slice.
func SupportedAuthMethods() []string {
	return []string{"password", "publickey", "keyboard-interactive"}
}

func cloneStrings(values []string) []string {
	return append([]string(nil), values...)
}
