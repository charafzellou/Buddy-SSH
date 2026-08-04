package protocol

import "github.com/vmihailenco/msgpack/v5"

// Header carries the protocol fields needed to inspect an encoded message
// before decoding it into a concrete generated type.
type Header struct {
	V    int     `json:"v" msgpack:"v"`
	ID   *string `json:"id,omitempty" msgpack:"id,omitempty"`
	Type string  `json:"type" msgpack:"type"`
}

// Marshal encodes a generated protocol message into MessagePack.
func Marshal[T any](message T) ([]byte, error) {
	return msgpack.Marshal(message)
}

// Unmarshal decodes a MessagePack payload into the target generated type.
func Unmarshal[T any](payload []byte, target *T) error {
	return msgpack.Unmarshal(payload, target)
}

// DecodeHeader decodes just the common envelope header fields.
func DecodeHeader(payload []byte) (Header, error) {
	var header Header
	if err := msgpack.Unmarshal(payload, &header); err != nil {
		return Header{}, err
	}

	return header, nil
}
