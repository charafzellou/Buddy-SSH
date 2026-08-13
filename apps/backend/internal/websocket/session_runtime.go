package websocket

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	ws "github.com/coder/websocket"
	gossh "golang.org/x/crypto/ssh"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/protocol"
	backendssh "github.com/charafzellou/buddy-ssh/apps/backend/internal/ssh"
)

const (
	disconnectReasonClientClose  = "client_close"
	disconnectReasonError        = "error"
	disconnectReasonIdleTimeout  = "idle_timeout"
	statusStateConnected        = "connected"
	statusStateConnecting       = "connecting"
	statusStateDisconnected     = "disconnected"
	statusStateError            = "error"
	statusCodeAuthFailed        = "AUTH_FAILED"
	statusCodeHostKeyMismatch   = "HOST_KEY_MISMATCH"
	statusCodeInternal          = "INTERNAL"
	statusCodeProtocolViolation = "PROTOCOL_VIOLATION"
	statusCodeTargetUnreachable = "TARGET_UNREACHABLE"
	statusCodeTimeout           = "TIMEOUT"
)

type gatewaySession struct {
	clock             func() time.Time
	connection        *ws.Conn
	dialSSH           backendssh.DialFunc
	encoding          Encoding
	idleTimeout       time.Duration
	keepaliveInterval time.Duration
	logger            *slog.Logger
	messageType       ws.MessageType
	protocolConn      *Conn
	requestID         string
	writeMutex        sync.Mutex
}

type incomingFrame struct {
	payload []byte
	err     error
}

type activeSSHSession struct {
	activityTracker *backendssh.ActivityTracker
	client          *gossh.Client
	keepalive       <-chan error
	relayErrors     chan error
	session         *backendssh.Session
	verifier        *backendssh.HostKeyVerifier
	wait            <-chan error
}

// connectOutcome carries the result of a connectSSH call run in a goroutine
// (only needed for keyboard-interactive, where the dial blocks on
// challenge/response round-trips over the same websocket the main loop is
// reading from, so it can't run synchronously in that loop).
type connectOutcome struct {
	session   *activeSSHSession
	err       error
	requestID *string
}

func newGatewaySession(gateway *Gateway, connection *ws.Conn, logger *slog.Logger, requestID string) *gatewaySession {
	encoding := negotiatedEncoding(connection.Subprotocol())

	if logger == nil {
		logger = slog.Default()
	}

	return &gatewaySession{
		clock:             time.Now,
		connection:        connection,
		dialSSH:           gateway.DialSSH,
		encoding:          encoding,
		idleTimeout:       gateway.IdleTimeout,
		keepaliveInterval: gateway.KeepaliveInterval,
		logger:            logger,
		messageType:       websocketMessageType(encoding),
		protocolConn:      NewConn(encoding, logger),
		requestID:         requestID,
	}
}

func (session *gatewaySession) Run(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	frames := make(chan incomingFrame, 1)
	go session.readLoop(ctx, frames)

	var (
		haveAuth     bool
		haveInit     bool
		initMessage  protocol.InitMessage
		authMessage  protocol.AuthMessage
		sshState     *activeSSHSession
		kbdResponses chan []string
		kbdResult    chan connectOutcome
	)

	defer closeActiveSSHSession(sshState)

	for {
		var keepaliveResults <-chan error
		var sessionWait <-chan error
		var relayErrors <-chan error
		if sshState != nil {
			keepaliveResults = sshState.keepalive
			sessionWait = sshState.wait
			relayErrors = sshState.relayErrors
		}

		var kbdConnectResult <-chan connectOutcome
		if kbdResult != nil {
			kbdConnectResult = kbdResult
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case frame, ok := <-frames:
			if !ok {
				return nil
			}
			if frame.err != nil {
				if isExpectedClose(frame.err) {
					return nil
				}
				return frame.err
			}

			header, err := decodeHeader(session.encoding, frame.payload)
			if err != nil {
				return session.writeProtocolError(ctx, nil, fmt.Sprintf("decode header: %v", err))
			}

			message, err := Decode(session.encoding, frame.payload)
			if err != nil {
				return session.writeProtocolError(ctx, header.ID, err.Error())
			}

			transition := session.protocolConn.Advance(header)
			if transition.Error != nil {
				if writeErr := session.writeMessage(ctx, transition.Error); writeErr != nil {
					return writeErr
				}
				_ = session.connection.Close(ws.StatusPolicyViolation, transition.Error.Payload.Message)
				return nil
			}

			switch typed := message.(type) {
			case protocol.InitMessage:
				initMessage = typed
				haveInit = true
			case protocol.AuthMessage:
				if !haveInit {
					return session.writeProtocolError(ctx, header.ID, "AUTH requires a preceding INIT message")
				}

				if haveAuth {
					// Only valid as a keyboard-interactive challenge
					// response; the first AUTH already latched authMessage.
					if kbdResponses == nil {
						return session.writeProtocolError(ctx, header.ID, "unexpected AUTH: no keyboard-interactive challenge is pending")
					}
					if typed.Payload.KbdInteractive == nil {
						return session.writeProtocolError(ctx, header.ID, "expected AUTH.kbdInteractive for a challenge response")
					}

					select {
					case kbdResponses <- typed.Payload.KbdInteractive.Responses:
					default:
						return session.writeProtocolError(ctx, header.ID, "no keyboard-interactive challenge is currently awaiting a response")
					}

					continue
				}

				authMessage = typed
				haveAuth = true
			case protocol.ConnectMessage:
				if !haveInit || !haveAuth {
					return session.writeProtocolError(ctx, header.ID, "CONNECT requires INIT and AUTH first")
				}

				if writeErr := session.writeStatus(ctx, header.ID, statusStateConnecting, nil); writeErr != nil {
					return writeErr
				}

				if initMessage.Payload.AuthMethod == "keyboard-interactive" {
					// ssh.Dial blocks on challenge/response round-trips for
					// this auth method, and those round-trips happen over
					// this same websocket connection — running it inline
					// here would deadlock the read loop that needs to
					// relay the client's responses back to it. Run it in a
					// goroutine and keep reading frames; the result arrives
					// via kbdConnectResult below.
					responses := make(chan []string)
					result := make(chan connectOutcome, 1)
					kbdResponses = responses
					kbdResult = result
					requestID := header.ID
					connectInit, connectAuth, connectMsg := initMessage, authMessage, typed
					go func() {
						active, connectErr := session.connectSSH(ctx, connectInit, connectAuth, connectMsg, session.keyboardInteractiveChallenge(ctx, responses))
						result <- connectOutcome{session: active, err: connectErr, requestID: requestID}
					}()
					continue
				}

				active, connectErr := session.connectSSH(ctx, initMessage, authMessage, typed, nil)
				if connectErr != nil {
					mapped := mapSessionError(connectErr)
					_ = session.writeStatus(ctx, header.ID, statusStateError, &mapped.message)
					return session.writeCloseError(ctx, header.ID, mapped.code, mapped.message, ws.StatusInternalError)
				}

				sshState = active
				if err := session.emitConnected(ctx, header.ID, initMessage, active); err != nil {
					return err
				}
			case protocol.DataMessage:
				if sshState == nil || sshState.session == nil {
					return session.writeProtocolError(ctx, header.ID, "DATA requires an active SSH session")
				}

				sshState.activityTracker.Touch()
				if _, err := sshState.session.Stdin.Write(typed.Payload.Data); err != nil {
					return session.writeCloseError(ctx, header.ID, statusCodeInternal, fmt.Sprintf("write ssh stdin: %v", err), ws.StatusInternalError)
				}
			case protocol.ResizeMessage:
				if sshState == nil || sshState.session == nil {
					return session.writeProtocolError(ctx, header.ID, "RESIZE requires an active SSH session")
				}

				if err := sshState.session.WindowChange(typed.Payload.Rows, typed.Payload.Cols); err != nil {
					return session.writeCloseError(ctx, header.ID, statusCodeInternal, fmt.Sprintf("resize ssh pty: %v", err), ws.StatusInternalError)
				}
			case protocol.PingMessage:
				pong := protocol.PongMessage{
					V:    1,
					ID:   header.ID,
					Type: "PONG",
					Payload: protocol.PongPayload{
						Timestamp:  typed.Payload.Timestamp,
						ServerTime: float64(session.clock().UnixMilli()),
					},
				}
				if err := session.writeMessage(ctx, pong); err != nil {
					return err
				}
			case protocol.DisconnectMessage:
				if err := session.writeDisconnect(ctx, header.ID, disconnectReasonClientClose); err != nil {
					return err
				}
				if err := session.writeStatus(ctx, header.ID, statusStateDisconnected, nil); err != nil {
					return err
				}
				_ = session.connection.Close(ws.StatusNormalClosure, disconnectReasonClientClose)
				return nil
			}
		case outcome := <-kbdConnectResult:
			kbdResponses = nil
			kbdResult = nil

			if outcome.err != nil {
				mapped := mapSessionError(outcome.err)
				_ = session.writeStatus(ctx, outcome.requestID, statusStateError, &mapped.message)
				return session.writeCloseError(ctx, outcome.requestID, mapped.code, mapped.message, ws.StatusInternalError)
			}

			sshState = outcome.session
			if err := session.emitConnected(ctx, outcome.requestID, initMessage, outcome.session); err != nil {
				return err
			}
		case err := <-relayErrors:
			if err == nil {
				continue
			}
			return session.writeCloseError(ctx, nil, statusCodeInternal, fmt.Sprintf("relay ssh stream: %v", err), ws.StatusInternalError)
		case err, ok := <-keepaliveResults:
			if !ok {
				if sshState != nil {
					sshState.keepalive = nil
				}
				continue
			}
			if errors.Is(err, backendssh.ErrIdleTimeout) {
				if writeErr := session.writeDisconnect(ctx, nil, disconnectReasonIdleTimeout); writeErr != nil {
					return writeErr
				}
				if writeErr := session.writeStatus(ctx, nil, statusStateDisconnected, nil); writeErr != nil {
					return writeErr
				}
				_ = session.connection.Close(ws.StatusNormalClosure, disconnectReasonIdleTimeout)
				return nil
			}
			if err != nil {
				return session.writeCloseError(ctx, nil, statusCodeInternal, fmt.Sprintf("ssh keepalive failed: %v", err), ws.StatusInternalError)
			}
		case err, ok := <-sessionWait:
			if !ok {
				if sshState != nil {
					sshState.wait = nil
				}
				continue
			}
			if err != nil && !errors.Is(err, io.EOF) {
				session.logger.Info("ssh session finished", "error", err)
			}
			if writeErr := session.writeDisconnect(ctx, nil, ""); writeErr != nil {
				return writeErr
			}
			if writeErr := session.writeStatus(ctx, nil, statusStateDisconnected, nil); writeErr != nil {
				return writeErr
			}
			_ = session.connection.Close(ws.StatusNormalClosure, "ssh session ended")
			return nil
		}
	}
}

func (session *gatewaySession) emitConnected(
	ctx context.Context,
	id *string,
	initMessage protocol.InitMessage,
	active *activeSSHSession,
) error {
	presented, ok := active.verifier.Presented()
	if !ok {
		return session.writeCloseError(ctx, id, statusCodeInternal, "ssh handshake completed without host key metadata", ws.StatusInternalError)
	}

	connected := protocol.ConnectedMessage{
		V:    1,
		ID:   id,
		Type: "CONNECTED",
		Payload: protocol.ConnectedPayload{
			HostKey: protocol.ConnectedPayloadHostKey{
				Algorithm:   presented.Algorithm,
				Fingerprint: presented.Fingerprint,
			},
			ServerID:  targetServerID(initMessage),
			SessionID: session.sessionID(),
		},
	}
	if err := session.writeMessage(ctx, connected); err != nil {
		return err
	}

	return session.writeStatus(ctx, id, statusStateConnected, nil)
}

// keyboardInteractiveChallenge relays one SSH keyboard-interactive challenge
// round-trip over the websocket: it writes a STATUS{challenge} to the
// client and blocks until the main read loop forwards a matching AUTH's
// responses over the responses channel (see the AuthMessage case in Run).
// Runs on connectSSH's goroutine, not the main loop — session.writeMessage
// is mutex-guarded so this is safe to call concurrently with the loop.
func (session *gatewaySession) keyboardInteractiveChallenge(ctx context.Context, responses <-chan []string) backendssh.KeyboardInteractiveChallenge {
	return func(name, instruction string, questions []string, echos []bool) ([]string, error) {
		prompts := make([]protocol.StatusPayloadChallengePromptsItem, len(questions))
		for index, question := range questions {
			echo := false
			if index < len(echos) {
				echo = echos[index]
			}
			prompts[index] = protocol.StatusPayloadChallengePromptsItem{Text: question, Echo: echo}
		}

		challenge := &protocol.StatusPayloadChallenge{Prompts: prompts}
		if name != "" {
			challenge.Name = &name
		}
		if instruction != "" {
			challenge.Instructions = &instruction
		}

		status := protocol.StatusMessage{
			V:    1,
			Type: "STATUS",
			Payload: protocol.StatusPayload{
				State:     statusStateConnecting,
				Challenge: challenge,
			},
		}
		if err := session.writeMessage(ctx, status); err != nil {
			return nil, err
		}

		select {
		case answers := <-responses:
			return answers, nil
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
}

func (session *gatewaySession) connectSSH(
	ctx context.Context,
	initMessage protocol.InitMessage,
	authMessage protocol.AuthMessage,
	connectMessage protocol.ConnectMessage,
	kbdChallenge backendssh.KeyboardInteractiveChallenge,
) (*activeSSHSession, error) {
	verifier := backendssh.NewHostKeyVerifier(initMessage.Payload.HostKey, session.logger)
	clientConfig, err := backendssh.BuildClientConfig(initMessage, authMessage, verifier.Callback(), kbdChallenge)
	if err != nil {
		return nil, err
	}

	address := net.JoinHostPort(initMessage.Payload.Target.Host, strconv.Itoa(initMessage.Payload.Target.Port))
	client, err := backendssh.DialWithCleanup("tcp", address, clientConfig, session.dialSSH, credentialBuffers(authMessage.Payload)...)
	if err != nil {
		return nil, err
	}

	sshSession, err := backendssh.NewSession(client)
	if err != nil {
		_ = client.Close()
		return nil, err
	}

	if err := sshSession.RequestPTY(
		initMessage.Payload.PTY.Term,
		initMessage.Payload.PTY.Rows,
		initMessage.Payload.PTY.Cols,
		gossh.TerminalModes{},
	); err != nil {
		_ = sshSession.Close()
		_ = client.Close()
		return nil, err
	}

	command := ""
	if connectMessage.Payload.Command != nil {
		command = strings.TrimSpace(*connectMessage.Payload.Command)
	}

	if command == "" {
		if err := sshSession.Shell(); err != nil {
			_ = sshSession.Close()
			_ = client.Close()
			return nil, err
		}
	} else if err := sshSession.Start(command); err != nil {
		_ = sshSession.Close()
		_ = client.Close()
		return nil, err
	}

	activityTracker := backendssh.NewActivityTracker(nil)
	relayErrors := make(chan error, 2)
	go session.pipeStream(ctx, relayErrors, nil, sshSession.Stdout, func(data []byte) any {
		return protocol.DataMessage{
			V:    1,
			Type: "DATA",
			Payload: protocol.DataPayload{
				Data: append([]byte(nil), data...),
			},
		}
	})
	go session.pipeStream(ctx, relayErrors, nil, sshSession.Stderr, func(data []byte) any {
		return protocol.StderrMessage{
			V:    1,
			Type: "STDERR",
			Payload: protocol.StderrPayload{
				Data: append([]byte(nil), data...),
			},
		}
	})

	waitResults := make(chan error, 1)
	go func() {
		defer close(waitResults)
		waitResults <- sshSession.Wait()
	}()

	var keepaliveResults <-chan error
	if session.keepaliveInterval > 0 {
		keepaliveResults = backendssh.StartKeepalive(ctx, client, session.keepaliveInterval, session.idleTimeout, activityTracker, nil)
	}

	return &activeSSHSession{
		activityTracker: activityTracker,
		client:          client,
		keepalive:       keepaliveResults,
		relayErrors:     relayErrors,
		session:         sshSession,
		verifier:        verifier,
		wait:            waitResults,
	}, nil
}

func (session *gatewaySession) pipeStream(ctx context.Context, results chan<- error, id *string, reader io.Reader, build func([]byte) any) {
	buffer := make([]byte, 4096)
	for {
		bytesRead, err := reader.Read(buffer)
		if bytesRead > 0 {
			message := build(buffer[:bytesRead])
			if writeErr := session.writeMessage(ctx, message); writeErr != nil {
				select {
				case results <- writeErr:
				default:
				}
				return
			}
		}

		if err != nil {
			if !errors.Is(err, io.EOF) && !errors.Is(err, net.ErrClosed) {
				select {
				case results <- err:
				default:
				}
			}
			return
		}
	}
}

func (session *gatewaySession) readLoop(ctx context.Context, frames chan<- incomingFrame) {
	defer close(frames)

	for {
		_, payload, err := session.connection.Read(ctx)
		if err != nil {
			frames <- incomingFrame{err: err}
			return
		}

		frames <- incomingFrame{payload: payload}
	}
}

func (session *gatewaySession) writeMessage(ctx context.Context, message any) error {
	payload, err := Encode(session.encoding, message)
	if err != nil {
		return err
	}

	session.writeMutex.Lock()
	defer session.writeMutex.Unlock()

	return session.connection.Write(ctx, session.messageType, payload)
}

func (session *gatewaySession) writeCloseError(ctx context.Context, id *string, code string, message string, status ws.StatusCode) error {
	if err := session.writeError(ctx, id, code, message); err != nil {
		return err
	}

	_ = session.connection.Close(status, message)

	return nil
}

func (session *gatewaySession) writeProtocolError(ctx context.Context, id *string, message string) error {
	return session.writeCloseError(ctx, id, statusCodeProtocolViolation, message, ws.StatusPolicyViolation)
}

func (session *gatewaySession) writeError(ctx context.Context, id *string, code string, message string) error {
	errorMessage := protocol.ErrorMessage{
		V:    1,
		ID:   id,
		Type: "ERROR",
		Payload: protocol.ErrorPayload{
			Code:    code,
			Message: message,
		},
	}

	return session.writeMessage(ctx, errorMessage)
}

func (session *gatewaySession) writeDisconnect(ctx context.Context, id *string, reason string) error {
	message := protocol.DisconnectMessage{
		V:    1,
		ID:   id,
		Type: "DISCONNECT",
	}

	if reason != "" {
		message.Payload.Reason = &reason
	}

	return session.writeMessage(ctx, message)
}

func (session *gatewaySession) writeStatus(ctx context.Context, id *string, state string, message *string) error {
	status := protocol.StatusMessage{
		V:    1,
		ID:   id,
		Type: "STATUS",
		Payload: protocol.StatusPayload{
			State:   state,
			Message: message,
		},
	}

	return session.writeMessage(ctx, status)
}

func (session *gatewaySession) sessionID() string {
	if strings.TrimSpace(session.requestID) != "" {
		return session.requestID
	}

	return fmt.Sprintf("session-%d", session.clock().UnixNano())
}

func targetServerID(message protocol.InitMessage) string {
	return net.JoinHostPort(message.Payload.Target.Host, strconv.Itoa(message.Payload.Target.Port))
}

func negotiatedEncoding(subprotocol string) Encoding {
	if subprotocol == SubprotocolJSON {
		return EncodingJSON
	}

	return EncodingMessagePack
}

func websocketMessageType(encoding Encoding) ws.MessageType {
	if encoding == EncodingJSON {
		return ws.MessageText
	}

	return ws.MessageBinary
}

func credentialBuffers(payload protocol.AuthPayload) [][]byte {
	buffers := make([][]byte, 0, 3)
	if payload.Password != nil && *payload.Password != "" {
		buffers = append(buffers, []byte(*payload.Password))
	}
	if payload.Publickey != nil {
		if payload.Publickey.Key != "" {
			buffers = append(buffers, []byte(payload.Publickey.Key))
		}
		if payload.Publickey.Passphrase != nil && *payload.Publickey.Passphrase != "" {
			buffers = append(buffers, []byte(*payload.Publickey.Passphrase))
		}
	}

	return buffers
}

func closeActiveSSHSession(state *activeSSHSession) {
	if state == nil {
		return
	}

	if state.session != nil {
		_ = state.session.Close()
	}
	if state.client != nil {
		_ = state.client.Close()
	}
}

type mappedSessionError struct {
	code    string
	message string
}

func mapSessionError(err error) mappedSessionError {
	if err == nil {
		return mappedSessionError{code: statusCodeInternal, message: "unknown session error"}
	}

	message := err.Error()

	var netError net.Error
	if errors.As(err, &netError) && netError.Timeout() {
		return mappedSessionError{code: statusCodeTimeout, message: message}
	}

	lowerMessage := strings.ToLower(message)
	switch {
	case strings.Contains(lowerMessage, "host key mismatch"):
		return mappedSessionError{code: statusCodeHostKeyMismatch, message: message}
	case strings.Contains(lowerMessage, "authenticate") || strings.Contains(lowerMessage, "invalid credentials"):
		return mappedSessionError{code: statusCodeAuthFailed, message: message}
	case strings.Contains(lowerMessage, "dial tcp") || strings.Contains(lowerMessage, "connection refused") || strings.Contains(lowerMessage, "no such host"):
		return mappedSessionError{code: statusCodeTargetUnreachable, message: message}
	default:
		return mappedSessionError{code: statusCodeInternal, message: message}
	}
}