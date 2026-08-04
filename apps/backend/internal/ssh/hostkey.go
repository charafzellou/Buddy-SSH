package ssh

import (
	"fmt"
	"log/slog"
	"net"
	"sync"

	gossh "golang.org/x/crypto/ssh"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/protocol"
)

// PresentedHostKey captures the host key details seen during SSH handshake.
type PresentedHostKey struct {
	Algorithm   string
	Fingerprint string
}

// HostKeyVerifier enforces the Buddy-SSH host-key trust mode for one session.
type HostKeyVerifier struct {
	trust protocol.InitPayloadHostKey
	log   *slog.Logger

	mutex     sync.RWMutex
	presented PresentedHostKey
	verified  bool
}

// NewHostKeyVerifier constructs a verifier for the trust data declared in INIT.
func NewHostKeyVerifier(trust protocol.InitPayloadHostKey, logger *slog.Logger) *HostKeyVerifier {
	if logger == nil {
		logger = slog.Default()
	}

	return &HostKeyVerifier{trust: trust, log: logger}
}

// Callback returns the SSH host-key callback function for this verifier.
func (verifier *HostKeyVerifier) Callback() HostKeyCallback {
	return verifier.Verify
}

// Presented reports the last host key observed by this verifier.
func (verifier *HostKeyVerifier) Presented() (PresentedHostKey, bool) {
	verifier.mutex.RLock()
	defer verifier.mutex.RUnlock()

	return verifier.presented, verifier.verified
}

// Verify checks the remote host key against the INIT trust mode.
func (verifier *HostKeyVerifier) Verify(hostname string, remote net.Addr, key gossh.PublicKey) error {
	presented := PresentedHostKey{
		Algorithm:   key.Type(),
		Fingerprint: gossh.FingerprintSHA256(key),
	}

	verifier.mutex.Lock()
	verifier.presented = presented
	verifier.verified = true
	verifier.mutex.Unlock()

	switch verifier.trust.Mode {
	case "first-use":
		verifier.log.Info(
			"accepting first-use host key",
			slog.String("hostname", hostname),
			slog.String("remote_addr", remote.String()),
			slog.String("algorithm", presented.Algorithm),
			slog.String("fingerprint", presented.Fingerprint),
		)
		return nil
	case "pinned":
		if verifier.trust.Fingerprint == nil || *verifier.trust.Fingerprint == "" {
			return fmt.Errorf("pinned host key mode requires a fingerprint")
		}

		if presented.Fingerprint != *verifier.trust.Fingerprint {
			return fmt.Errorf("host key mismatch for %s: got %s want %s", hostname, presented.Fingerprint, *verifier.trust.Fingerprint)
		}

		return nil
	default:
		return fmt.Errorf("unsupported host key mode %q", verifier.trust.Mode)
	}
}