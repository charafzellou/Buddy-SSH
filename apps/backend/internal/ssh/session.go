package ssh

import (
	"fmt"
	"io"

	gossh "golang.org/x/crypto/ssh"
)

// Session wraps an SSH session with the streams needed by the websocket transport.
type Session struct {
	raw    *gossh.Session
	Stdin  io.WriteCloser
	Stdout io.Reader
	Stderr io.Reader
}

// NewSession opens an SSH session and captures its terminal streams.
func NewSession(client *gossh.Client) (*Session, error) {
	if client == nil {
		return nil, fmt.Errorf("ssh client is required")
	}

	rawSession, err := client.NewSession()
	if err != nil {
		return nil, err
	}

	stdin, err := rawSession.StdinPipe()
	if err != nil {
		_ = rawSession.Close()
		return nil, err
	}

	stdout, err := rawSession.StdoutPipe()
	if err != nil {
		_ = rawSession.Close()
		return nil, err
	}

	stderr, err := rawSession.StderrPipe()
	if err != nil {
		_ = rawSession.Close()
		return nil, err
	}

	return &Session{
		raw:    rawSession,
		Stdin:  stdin,
		Stdout: stdout,
		Stderr: stderr,
	}, nil
}

// Shell requests the remote user's default shell.
func (session *Session) Shell() error {
	if session == nil || session.raw == nil {
		return fmt.Errorf("ssh session is not initialized")
	}

	return session.raw.Shell()
}

// Start begins running an explicit remote command.
func (session *Session) Start(command string) error {
	if session == nil || session.raw == nil {
		return fmt.Errorf("ssh session is not initialized")
	}

	return session.raw.Start(command)
}

// Wait blocks until the remote session exits.
func (session *Session) Wait() error {
	if session == nil || session.raw == nil {
		return fmt.Errorf("ssh session is not initialized")
	}

	return session.raw.Wait()
}

// Close tears down the remote SSH session.
func (session *Session) Close() error {
	if session == nil || session.raw == nil {
		return nil
	}

	return session.raw.Close()
}