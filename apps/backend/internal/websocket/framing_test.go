package websocket

import (
	"reflect"
	"testing"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/protocol"
)

func TestEncodeDecodeRoundTripAllMessages(t *testing.T) {
	t.Parallel()

	for _, enc := range []Encoding{EncodingMessagePack, EncodingJSON} {
		enc := enc
		t.Run(string(enc), func(t *testing.T) {
			t.Parallel()

			for _, message := range framingFixtures() {
				encoded, err := Encode(enc, message)
				if err != nil {
					t.Fatalf("encode %T: %v", message, err)
				}

				decoded, err := Decode(enc, encoded)
				if err != nil {
					t.Fatalf("decode %T: %v", message, err)
				}

				if !reflect.DeepEqual(decoded, message) {
					t.Fatalf("decoded %T = %#v, want %#v", decoded, decoded, message)
				}
			}
		})
	}
}

func TestDecodeRejectsMalformedPayload(t *testing.T) {
	t.Parallel()

	for _, enc := range []Encoding{EncodingMessagePack, EncodingJSON} {
		enc := enc
		t.Run(string(enc), func(t *testing.T) {
			t.Parallel()

			malformed := protocol.InitMessage{
				V:    1,
				Type: "INIT",
				Payload: protocol.InitPayload{
					AuthMethod: "password",
					HostKey:    protocol.InitPayloadHostKey{Mode: "first-use"},
					PTY:        protocol.InitPayloadPTY{Term: "xterm-256color", Cols: 0, Rows: 24},
					Target:     protocol.InitPayloadTarget{Host: "", Port: 22, Username: "ops"},
				},
			}

			encoded, err := Encode(enc, malformed)
			if err != nil {
				t.Fatalf("encode malformed init: %v", err)
			}

			if _, err := Decode(enc, encoded); err == nil {
				t.Fatal("expected malformed payload to fail validation")
			}
		})
	}
}

func framingFixtures() []any {
	requestID := "req-123"
	fingerprint := "SHA256:hostkey"
	algorithm := "ssh-ed25519"
	password := "super-secret"
	command := "uptime"
	pixelWidth := 1280
	pixelHeight := 720
	statusMessage := "ready"
	errorReason := "protocol mismatch"
	disconnectReason := "client_close"
	passphrase := "key-secret"

	return []any{
		protocol.InitMessage{
			V:    1,
			ID:   &requestID,
			Type: "INIT",
			Payload: protocol.InitPayload{
				AuthMethod: "password",
				Client:     &protocol.InitPayloadClient{Version: "0.1.0"},
				HostKey: protocol.InitPayloadHostKey{
					Mode:        "pinned",
					Fingerprint: &fingerprint,
					Algorithm:   &algorithm,
				},
				PTY:    protocol.InitPayloadPTY{Term: "xterm-256color", Cols: 80, Rows: 24},
				Target: protocol.InitPayloadTarget{Host: "example.com", Port: 22, Username: "ops"},
			},
		},
		protocol.AuthMessage{
			V:    1,
			ID:   &requestID,
			Type: "AUTH",
			Payload: protocol.AuthPayload{
				Password: &password,
				Publickey: &protocol.AuthPayloadPublickey{
					Key:        "-----BEGIN OPENSSH PRIVATE KEY-----",
					Passphrase: &passphrase,
				},
				KbdInteractive: &protocol.AuthPayloadKbdInteractive{
					ChallengeID: "challenge-1",
					Responses:   []string{"otp"},
				},
			},
		},
		protocol.ConnectMessage{
			V:    1,
			ID:   &requestID,
			Type: "CONNECT",
			Payload: protocol.ConnectPayload{
				Command: &command,
				Env:     map[string]string{"LANG": "en_US.UTF-8"},
			},
		},
		protocol.ConnectedMessage{
			V:    1,
			ID:   &requestID,
			Type: "CONNECTED",
			Payload: protocol.ConnectedPayload{
				SessionID: "session-1",
				ServerID:  "server-1",
				HostKey: protocol.ConnectedPayloadHostKey{
					Algorithm:   algorithm,
					Fingerprint: fingerprint,
				},
			},
		},
		protocol.DataMessage{V: 1, ID: &requestID, Type: "DATA", Payload: protocol.DataPayload{Data: []byte{1, 2, 3}}},
		protocol.StderrMessage{V: 1, ID: &requestID, Type: "STDERR", Payload: protocol.StderrPayload{Data: []byte{4, 5, 6}}},
		protocol.ResizeMessage{
			V:    1,
			ID:   &requestID,
			Type: "RESIZE",
			Payload: protocol.ResizePayload{
				Cols:        120,
				Rows:        40,
				PixelWidth:  &pixelWidth,
				PixelHeight: &pixelHeight,
			},
		},
		protocol.PingMessage{V: 1, ID: &requestID, Type: "PING", Payload: protocol.PingPayload{Timestamp: 12345}},
		protocol.PongMessage{V: 1, ID: &requestID, Type: "PONG", Payload: protocol.PongPayload{Timestamp: 12345, ServerTime: 12346}},
		protocol.KeepaliveMessage{V: 1, ID: &requestID, Type: "KEEPALIVE", Payload: protocol.KeepalivePayload{}},
		protocol.StatusMessage{V: 1, ID: &requestID, Type: "STATUS", Payload: protocol.StatusPayload{State: "connected", Message: &statusMessage}},
		protocol.ErrorMessage{V: 1, ID: &requestID, Type: "ERROR", Payload: protocol.ErrorPayload{Code: "INTERNAL", Message: errorReason}},
		protocol.DisconnectMessage{V: 1, ID: &requestID, Type: "DISCONNECT", Payload: protocol.DisconnectPayload{Reason: &disconnectReason}},
	}
}
