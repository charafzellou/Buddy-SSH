package websocket

import (
	"encoding/json"
	"fmt"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/protocol"
)

var (
	allowedAuthMethods = map[string]struct{}{
		"password":             {},
		"publickey":            {},
		"keyboard-interactive": {},
	}
	allowedHostKeyModes = map[string]struct{}{
		"first-use": {},
		"pinned":    {},
	}
	allowedStatusStates = map[string]struct{}{
		"connecting":   {},
		"connected":    {},
		"reconnecting": {},
		"disconnected": {},
		"error":        {},
	}
	allowedErrorCodes = map[string]struct{}{
		"PROTOCOL_VERSION":   {},
		"PROTOCOL_VIOLATION": {},
		"AUTH_FAILED":        {},
		"AUTH_REQUIRED":      {},
		"HOST_KEY_MISMATCH":  {},
		"TARGET_UNREACHABLE": {},
		"TIMEOUT":            {},
		"RATE_LIMITED":       {},
		"INTERNAL":           {},
		"READ_LIMIT":         {},
	}
	allowedDisconnectReasons = map[string]struct{}{
		"client_close":    {},
		"server_shutdown": {},
		"idle_timeout":    {},
		"error":           {},
	}
)

// Encode serializes a generated websocket protocol message using the
// negotiated wire encoding.
func Encode(enc Encoding, message any) ([]byte, error) {
	switch enc {
	case EncodingMessagePack:
		return protocol.Marshal(message)
	case EncodingJSON:
		return json.Marshal(message)
	default:
		return nil, fmt.Errorf("unsupported encoding %q", enc)
	}
}

// Decode deserializes and validates one websocket protocol message.
func Decode(enc Encoding, payload []byte) (any, error) {
	header, err := decodeHeader(enc, payload)
	if err != nil {
		return nil, err
	}

	if header.V != 1 {
		return nil, fmt.Errorf("unsupported protocol version %d", header.V)
	}

	switch header.Type {
	case "INIT":
		return decodeAndValidate[protocol.InitMessage](enc, payload, validateInitMessage)
	case "AUTH":
		return decodeAndValidate[protocol.AuthMessage](enc, payload, validateAuthMessage)
	case "CONNECT":
		return decodeAndValidate[protocol.ConnectMessage](enc, payload, validateConnectMessage)
	case "CONNECTED":
		return decodeAndValidate[protocol.ConnectedMessage](enc, payload, validateConnectedMessage)
	case "DATA":
		return decodeAndValidate[protocol.DataMessage](enc, payload, validateDataMessage)
	case "STDERR":
		return decodeAndValidate[protocol.StderrMessage](enc, payload, validateStderrMessage)
	case "RESIZE":
		return decodeAndValidate[protocol.ResizeMessage](enc, payload, validateResizeMessage)
	case "PING":
		return decodeAndValidate[protocol.PingMessage](enc, payload, validatePingMessage)
	case "PONG":
		return decodeAndValidate[protocol.PongMessage](enc, payload, validatePongMessage)
	case "KEEPALIVE":
		return decodeAndValidate[protocol.KeepaliveMessage](enc, payload, validateKeepaliveMessage)
	case "STATUS":
		return decodeAndValidate[protocol.StatusMessage](enc, payload, validateStatusMessage)
	case "ERROR":
		return decodeAndValidate[protocol.ErrorMessage](enc, payload, validateErrorMessage)
	case "DISCONNECT":
		return decodeAndValidate[protocol.DisconnectMessage](enc, payload, validateDisconnectMessage)
	default:
		return nil, fmt.Errorf("unsupported message type %q", header.Type)
	}
}

func decodeHeader(enc Encoding, payload []byte) (protocol.Header, error) {
	switch enc {
	case EncodingMessagePack:
		return protocol.DecodeHeader(payload)
	case EncodingJSON:
		var header protocol.Header
		if err := json.Unmarshal(payload, &header); err != nil {
			return protocol.Header{}, err
		}
		return header, nil
	default:
		return protocol.Header{}, fmt.Errorf("unsupported encoding %q", enc)
	}
}

func decodeAndValidate[T any](enc Encoding, payload []byte, validator func(T) error) (T, error) {
	var message T

	if err := unmarshal(enc, payload, &message); err != nil {
		return message, err
	}

	if err := validator(message); err != nil {
		return message, err
	}

	return message, nil
}

func unmarshal[T any](enc Encoding, payload []byte, target *T) error {
	switch enc {
	case EncodingMessagePack:
		return protocol.Unmarshal(payload, target)
	case EncodingJSON:
		return json.Unmarshal(payload, target)
	default:
		return fmt.Errorf("unsupported encoding %q", enc)
	}
}

func validateInitMessage(message protocol.InitMessage) error {
	if err := validateEnvelope(message.V, message.Type, message.ID, "INIT"); err != nil {
		return err
	}

	if err := requireOneOf(message.Payload.AuthMethod, allowedAuthMethods, "payload.authMethod"); err != nil {
		return err
	}
	if err := requireNonEmpty(message.Payload.Target.Host, "payload.target.host"); err != nil {
		return err
	}
	if message.Payload.Target.Port < 1 || message.Payload.Target.Port > 65535 {
		return fmt.Errorf("payload.target.port must be between 1 and 65535")
	}
	if err := requireNonEmpty(message.Payload.Target.Username, "payload.target.username"); err != nil {
		return err
	}
	if err := requireOneOf(message.Payload.HostKey.Mode, allowedHostKeyModes, "payload.hostKey.mode"); err != nil {
		return err
	}
	if err := requireOptionalString(message.Payload.HostKey.Fingerprint, "payload.hostKey.fingerprint"); err != nil {
		return err
	}
	if err := requireOptionalString(message.Payload.HostKey.Algorithm, "payload.hostKey.algorithm"); err != nil {
		return err
	}
	if err := requireNonEmpty(message.Payload.PTY.Term, "payload.pty.term"); err != nil {
		return err
	}
	if message.Payload.PTY.Cols <= 0 {
		return fmt.Errorf("payload.pty.cols must be positive")
	}
	if message.Payload.PTY.Rows <= 0 {
		return fmt.Errorf("payload.pty.rows must be positive")
	}
	if message.Payload.Client != nil {
		if err := requireNonEmpty(message.Payload.Client.Version, "payload.client.version"); err != nil {
			return err
		}
	}

	return nil
}

func validateAuthMessage(message protocol.AuthMessage) error {
	if err := validateEnvelope(message.V, message.Type, message.ID, "AUTH"); err != nil {
		return err
	}
	if err := requireOptionalString(message.Payload.Password, "payload.password"); err != nil {
		return err
	}
	if message.Payload.Publickey != nil {
		if err := requireNonEmpty(message.Payload.Publickey.Key, "payload.publickey.key"); err != nil {
			return err
		}
		if err := requireOptionalString(message.Payload.Publickey.Passphrase, "payload.publickey.passphrase"); err != nil {
			return err
		}
	}
	if message.Payload.KbdInteractive != nil {
		if err := requireNonEmpty(message.Payload.KbdInteractive.ChallengeID, "payload.kbdInteractive.challengeId"); err != nil {
			return err
		}
	}

	return nil
}

func validateConnectMessage(message protocol.ConnectMessage) error {
	if err := validateEnvelope(message.V, message.Type, message.ID, "CONNECT"); err != nil {
		return err
	}
	if err := requireOptionalString(message.Payload.Command, "payload.command"); err != nil {
		return err
	}

	return nil
}

func validateConnectedMessage(message protocol.ConnectedMessage) error {
	if err := validateEnvelope(message.V, message.Type, message.ID, "CONNECTED"); err != nil {
		return err
	}
	if err := requireNonEmpty(message.Payload.SessionID, "payload.sessionId"); err != nil {
		return err
	}
	if err := requireNonEmpty(message.Payload.ServerID, "payload.serverId"); err != nil {
		return err
	}
	if err := requireNonEmpty(message.Payload.HostKey.Algorithm, "payload.hostKey.algorithm"); err != nil {
		return err
	}
	if err := requireNonEmpty(message.Payload.HostKey.Fingerprint, "payload.hostKey.fingerprint"); err != nil {
		return err
	}

	return nil
}

func validateDataMessage(message protocol.DataMessage) error {
	return validateEnvelope(message.V, message.Type, message.ID, "DATA")
}

func validateStderrMessage(message protocol.StderrMessage) error {
	return validateEnvelope(message.V, message.Type, message.ID, "STDERR")
}

func validateResizeMessage(message protocol.ResizeMessage) error {
	if err := validateEnvelope(message.V, message.Type, message.ID, "RESIZE"); err != nil {
		return err
	}
	if message.Payload.Cols <= 0 {
		return fmt.Errorf("payload.cols must be positive")
	}
	if message.Payload.Rows <= 0 {
		return fmt.Errorf("payload.rows must be positive")
	}
	if err := requireOptionalPositiveInt(message.Payload.PixelWidth, "payload.pixelWidth"); err != nil {
		return err
	}
	if err := requireOptionalPositiveInt(message.Payload.PixelHeight, "payload.pixelHeight"); err != nil {
		return err
	}

	return nil
}

func validatePingMessage(message protocol.PingMessage) error {
	return validateEnvelope(message.V, message.Type, message.ID, "PING")
}

func validatePongMessage(message protocol.PongMessage) error {
	return validateEnvelope(message.V, message.Type, message.ID, "PONG")
}

func validateKeepaliveMessage(message protocol.KeepaliveMessage) error {
	return validateEnvelope(message.V, message.Type, message.ID, "KEEPALIVE")
}

func validateStatusMessage(message protocol.StatusMessage) error {
	if err := validateEnvelope(message.V, message.Type, message.ID, "STATUS"); err != nil {
		return err
	}
	if err := requireOneOf(message.Payload.State, allowedStatusStates, "payload.state"); err != nil {
		return err
	}
	if err := requireOptionalString(message.Payload.Message, "payload.message"); err != nil {
		return err
	}

	return nil
}

func validateErrorMessage(message protocol.ErrorMessage) error {
	if err := validateEnvelope(message.V, message.Type, message.ID, "ERROR"); err != nil {
		return err
	}
	if err := requireOneOf(message.Payload.Code, allowedErrorCodes, "payload.code"); err != nil {
		return err
	}
	if err := requireNonEmpty(message.Payload.Message, "payload.message"); err != nil {
		return err
	}

	return nil
}

func validateDisconnectMessage(message protocol.DisconnectMessage) error {
	if err := validateEnvelope(message.V, message.Type, message.ID, "DISCONNECT"); err != nil {
		return err
	}
	if message.Payload.Reason != nil {
		if err := requireOneOf(*message.Payload.Reason, allowedDisconnectReasons, "payload.reason"); err != nil {
			return err
		}
	}

	return nil
}

func validateEnvelope(version int, messageType string, id *string, expectedType string) error {
	if version != 1 {
		return fmt.Errorf("message version must be 1")
	}
	if messageType != expectedType {
		return fmt.Errorf("message type %q does not match expected %q", messageType, expectedType)
	}
	if err := requireOptionalString(id, "id"); err != nil {
		return err
	}

	return nil
}

func requireNonEmpty(value string, field string) error {
	if value == "" {
		return fmt.Errorf("%s must not be empty", field)
	}

	return nil
}

func requireOptionalString(value *string, field string) error {
	if value == nil {
		return nil
	}

	return requireNonEmpty(*value, field)
}

func requireOptionalPositiveInt(value *int, field string) error {
	if value == nil {
		return nil
	}

	if *value <= 0 {
		return fmt.Errorf("%s must be positive", field)
	}

	return nil
}

func requireOneOf(value string, allowed map[string]struct{}, field string) error {
	if _, ok := allowed[value]; !ok {
		return fmt.Errorf("%s has unsupported value %q", field, value)
	}

	return nil
}
