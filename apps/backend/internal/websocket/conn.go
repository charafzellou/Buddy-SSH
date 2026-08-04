package websocket

import (
	"fmt"
	"log/slog"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/protocol"
)

// Encoding identifies the negotiated websocket payload format.
type Encoding string

const (
	EncodingMessagePack Encoding = "msgpack"
	EncodingJSON        Encoding = "json"
)

// State tracks the current position in the Buddy-SSH client protocol flow.
type State string

const (
	StateInit         State = "INIT"
	StateAuth         State = "AUTH"
	StateConnect      State = "CONNECT"
	StateConnected    State = "CONNECTED"
	StateError        State = "ERROR"
	StateDisconnected State = "DISCONNECT"
)

// Conn is the local protocol state machine for one websocket session.
type Conn struct {
	enc   Encoding
	log   *slog.Logger
	state State
}

// TransitionResult captures the outcome of advancing the state machine.
type TransitionResult struct {
	State State
	Close bool
	Error *protocol.ErrorMessage
}

// NewConn constructs a connection state machine for one websocket session.
func NewConn(enc Encoding, logger *slog.Logger) *Conn {
	if enc == "" {
		enc = EncodingMessagePack
	}

	if logger == nil {
		logger = slog.Default()
	}

	return &Conn{enc: enc, log: logger, state: StateInit}
}

// State returns the current protocol state.
func (conn *Conn) State() State {
	return conn.state
}

// Advance processes one decoded client message header.
func (conn *Conn) Advance(header protocol.Header) TransitionResult {
	switch conn.state {
	case StateInit:
		if header.Type != "INIT" {
			return conn.protocolViolation(header, "expected INIT before session setup")
		}
		conn.state = StateAuth
	case StateAuth:
		if header.Type != "AUTH" {
			return conn.protocolViolation(header, "expected AUTH before requesting a shell")
		}
		conn.state = StateConnect
	case StateConnect:
		if header.Type != "CONNECT" {
			return conn.protocolViolation(header, "expected CONNECT after authentication")
		}
		conn.state = StateConnected
	case StateConnected:
		switch header.Type {
		case "DATA", "RESIZE", "PING":
			// Remain in CONNECTED for steady-state client traffic.
		case "DISCONNECT":
			conn.state = StateDisconnected
			return TransitionResult{State: conn.state, Close: true}
		default:
			return conn.protocolViolation(header, fmt.Sprintf("message type %s is not valid while the session is connected", header.Type))
		}
	case StateError, StateDisconnected:
		return TransitionResult{State: conn.state, Close: true}
	default:
		return conn.protocolViolation(header, fmt.Sprintf("unknown connection state %s", conn.state))
	}

	return TransitionResult{State: conn.state}
}

func (conn *Conn) protocolViolation(header protocol.Header, message string) TransitionResult {
	conn.state = StateError
	conn.log.Warn("protocol violation", "state", conn.state, "message_type", header.Type)

	return TransitionResult{
		State: conn.state,
		Close: true,
		Error: &protocol.ErrorMessage{
			V:    1,
			ID:   header.ID,
			Type: "ERROR",
			Payload: protocol.ErrorPayload{
				Code:    "PROTOCOL_VIOLATION",
				Message: message,
			},
		},
	}
}
