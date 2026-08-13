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

// KeyboardInteractiveChallenge aliases the upstream keyboard-interactive
// challenge callback: it is invoked once per challenge round the SSH server
// issues, and must return one answer per question.
type KeyboardInteractiveChallenge = gossh.KeyboardInteractiveChallenge

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
// kbdChallenge is only consulted when init.Payload.AuthMethod is
// "keyboard-interactive"; pass nil for the other auth methods.
func BuildClientConfig(init protocol.InitMessage, auth protocol.AuthMessage, hostKeyCallback HostKeyCallback, kbdChallenge KeyboardInteractiveChallenge) (*ClientConfig, error) {
	selection, err := SelectAuthMethod(init.Payload.AuthMethod, auth.Payload, kbdChallenge)
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
// kbdChallenge is only consulted for "keyboard-interactive"; pass nil for
// the other auth methods.
func SelectAuthMethod(authMethod string, payload protocol.AuthPayload, kbdChallenge KeyboardInteractiveChallenge) (AuthSelection, error) {
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
		if payload.Publickey == nil || payload.Publickey.Key == "" {
			return AuthSelection{}, fmt.Errorf("publickey auth requires payload.publickey.key")
		}

		signer, err := parsePrivateKeySigner(payload.Publickey.Key, payload.Publickey.Passphrase)
		if err != nil {
			return AuthSelection{}, fmt.Errorf("parse private key: %w", err)
		}

		return AuthSelection{
			Name:   authMethod,
			Method: gossh.PublicKeys(signer),
		}, nil
	case "keyboard-interactive":
		if kbdChallenge == nil {
			return AuthSelection{}, fmt.Errorf("keyboard-interactive auth requires a challenge callback")
		}

		return AuthSelection{
			Name:   authMethod,
			Method: gossh.KeyboardInteractive(kbdChallenge),
		}, nil
	default:
		return AuthSelection{}, fmt.Errorf("unsupported auth method %q", authMethod)
	}
}

// SupportedAuthMethods lists the auth modes planned for the first transport
// implementation slice.
func SupportedAuthMethods() []string {
	return []string{"password", "publickey", "keyboard-interactive"}
}

// parsePrivateKeySigner parses an OpenSSH or PEM formatted private key,
// decrypting it with passphrase when the key is encrypted.
func parsePrivateKeySigner(key string, passphrase *string) (gossh.Signer, error) {
	if passphrase != nil && *passphrase != "" {
		return gossh.ParsePrivateKeyWithPassphrase([]byte(key), []byte(*passphrase))
	}

	return gossh.ParsePrivateKey([]byte(key))
}

func cloneStrings(values []string) []string {
	return append([]string(nil), values...)
}
