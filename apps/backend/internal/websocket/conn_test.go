package websocket

import (
	"log/slog"
	"testing"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/protocol"
)

func TestConnAdvanceValidSequence(t *testing.T) {
	t.Parallel()

	conn := NewConn(EncodingMessagePack, slog.Default())

	steps := []struct {
		messageType string
		wantState   State
		wantClose   bool
	}{
		{messageType: "INIT", wantState: StateAuth},
		{messageType: "AUTH", wantState: StateConnect},
		{messageType: "CONNECT", wantState: StateConnected},
		{messageType: "DATA", wantState: StateConnected},
		{messageType: "RESIZE", wantState: StateConnected},
		{messageType: "PING", wantState: StateConnected},
		{messageType: "DISCONNECT", wantState: StateDisconnected, wantClose: true},
	}

	for _, step := range steps {
		result := conn.Advance(protocol.Header{V: 1, Type: step.messageType})
		if result.State != step.wantState {
			t.Fatalf("state after %s = %s, want %s", step.messageType, result.State, step.wantState)
		}

		if result.Close != step.wantClose {
			t.Fatalf("close after %s = %t, want %t", step.messageType, result.Close, step.wantClose)
		}

		if result.Error != nil {
			t.Fatalf("unexpected error after %s: %#v", step.messageType, result.Error)
		}
	}
}

func TestConnAdvanceRejectsOutOfOrderData(t *testing.T) {
	t.Parallel()

	requestID := "req-123"
	conn := NewConn(EncodingMessagePack, slog.Default())

	result := conn.Advance(protocol.Header{V: 1, ID: &requestID, Type: "DATA"})
	if result.State != StateError {
		t.Fatalf("state = %s, want %s", result.State, StateError)
	}

	if !result.Close {
		t.Fatal("expected protocol violation to request connection close")
	}

	if result.Error == nil {
		t.Fatal("expected protocol violation to produce an error message")
	}

	if result.Error.Type != "ERROR" {
		t.Fatalf("error type = %q, want ERROR", result.Error.Type)
	}

	if result.Error.Payload.Code != "PROTOCOL_VIOLATION" {
		t.Fatalf("error code = %q, want PROTOCOL_VIOLATION", result.Error.Payload.Code)
	}

	if result.Error.ID == nil || *result.Error.ID != requestID {
		t.Fatalf("error id = %v, want %q", result.Error.ID, requestID)
	}
}
