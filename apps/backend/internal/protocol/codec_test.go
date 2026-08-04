package protocol

import (
	"testing"
)

func TestMarshalUnmarshalInitMessage(t *testing.T) {
	t.Parallel()

	fingerprint := "SHA256:example"
	algorithm := "ssh-ed25519"
	requestID := "req-123"

	message := InitMessage{
		V:    1,
		ID:   &requestID,
		Type: "INIT",
		Payload: InitPayload{
			AuthMethod: "password",
			HostKey: InitPayloadHostKey{
				Algorithm:   &algorithm,
				Fingerprint: &fingerprint,
				Mode:        "pinned",
			},
			PTY: InitPayloadPTY{
				Cols: 80,
				Rows: 24,
				Term: "xterm-256color",
			},
			Target: InitPayloadTarget{
				Host:     "example.com",
				Port:     22,
				Username: "ops",
			},
		},
	}

	encoded, err := Marshal(message)
	if err != nil {
		t.Fatalf("marshal init message: %v", err)
	}

	header, err := DecodeHeader(encoded)
	if err != nil {
		t.Fatalf("decode header: %v", err)
	}

	if header.V != 1 {
		t.Fatalf("header version = %d, want 1", header.V)
	}

	if header.Type != "INIT" {
		t.Fatalf("header type = %q, want INIT", header.Type)
	}

	if header.ID == nil || *header.ID != requestID {
		t.Fatalf("header id = %v, want %q", header.ID, requestID)
	}

	var decoded InitMessage
	if err := Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal init message: %v", err)
	}

	if decoded.Type != message.Type {
		t.Fatalf("decoded type = %q, want %q", decoded.Type, message.Type)
	}

	if decoded.Payload.Target != message.Payload.Target {
		t.Fatalf("decoded target = %#v, want %#v", decoded.Payload.Target, message.Payload.Target)
	}

	if decoded.Payload.PTY != message.Payload.PTY {
		t.Fatalf("decoded pty = %#v, want %#v", decoded.Payload.PTY, message.Payload.PTY)
	}

	if decoded.Payload.HostKey.Mode != message.Payload.HostKey.Mode {
		t.Fatalf("decoded host key mode = %q, want %q", decoded.Payload.HostKey.Mode, message.Payload.HostKey.Mode)
	}

	if decoded.Payload.HostKey.Fingerprint == nil || *decoded.Payload.HostKey.Fingerprint != fingerprint {
		t.Fatalf("decoded fingerprint = %v, want %q", decoded.Payload.HostKey.Fingerprint, fingerprint)
	}
}
