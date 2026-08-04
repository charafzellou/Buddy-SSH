package ssh

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/creack/pty"
	gossh "golang.org/x/crypto/ssh"
)

// LocalPTYStarter abstracts PTY startup for future tests and local process
// helpers. The remote SSH path will use window-change requests instead.
type LocalPTYStarter func(command *exec.Cmd) (*os.File, error)

// DefaultLocalPTYStarter is the package default PTY launcher.
var DefaultLocalPTYStarter LocalPTYStarter = pty.Start

// RequestPTY asks the remote SSH session for an interactive terminal.
func (session *Session) RequestPTY(term string, rows int, cols int, modes gossh.TerminalModes) error {
	if session == nil || session.raw == nil {
		return fmt.Errorf("ssh session is not initialized")
	}

	return session.raw.RequestPty(term, rows, cols, modes)
}

// WindowChange forwards terminal resize notifications to the remote SSH session.
func (session *Session) WindowChange(rows int, cols int) error {
	if session == nil || session.raw == nil {
		return fmt.Errorf("ssh session is not initialized")
	}

	return session.raw.WindowChange(rows, cols)
}
