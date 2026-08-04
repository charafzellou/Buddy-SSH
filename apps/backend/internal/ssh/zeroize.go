package ssh

import gossh "golang.org/x/crypto/ssh"

// DialFunc allows tests to stub the SSH dial step while verifying cleanup.
type DialFunc func(network string, addr string, config *ClientConfig) (*gossh.Client, error)

// DialWithCleanup wraps ssh.Dial and zeroes any mutable credential buffers once
// the dial attempt completes. This is best-effort only; immutable Go strings
// are handled separately by the runtime.
func DialWithCleanup(network string, addr string, config *ClientConfig, dial DialFunc, buffers ...[]byte) (*gossh.Client, error) {
	if dial == nil {
		dial = gossh.Dial
	}

	client, err := dial(network, addr, config)
	Zeroize(buffers...)

	return client, err
}

// Zeroize overwrites mutable credential buffers in place.
func Zeroize(buffers ...[]byte) {
	for _, buffer := range buffers {
		for index := range buffer {
			buffer[index] = 0
		}
	}
}
