package ssh

import (
	"reflect"
	"testing"

	"github.com/charafzellou/buddy-ssh/apps/backend/internal/protocol"
)

func TestBuildClientConfigPassword(t *testing.T) {
	t.Parallel()

	password := "top-secret"
	initMessage := protocol.InitMessage{
		V:    1,
		Type: "INIT",
		Payload: protocol.InitPayload{
			AuthMethod: "password",
			Target: protocol.InitPayloadTarget{Host: "example.com", Port: 22, Username: "ops"},
		},
	}
	authMessage := protocol.AuthMessage{
		V:    1,
		Type: "AUTH",
		Payload: protocol.AuthPayload{
			Password: &password,
		},
	}

	config, err := BuildClientConfig(initMessage, authMessage, nil, nil)
	if err != nil {
		t.Fatalf("BuildClientConfig() error = %v", err)
	}

	if config.User != "ops" {
		t.Fatalf("config.User = %q, want %q", config.User, "ops")
	}

	if config.Timeout != dialTimeout {
		t.Fatalf("config.Timeout = %s, want %s", config.Timeout, dialTimeout)
	}

	if config.HostKeyCallback == nil {
		t.Fatal("expected HostKeyCallback to be set")
	}

	if len(config.Auth) != 1 {
		t.Fatalf("len(config.Auth) = %d, want 1", len(config.Auth))
	}

	if !reflect.DeepEqual(config.KeyExchanges, preferredKeyExchanges) {
		t.Fatalf("config.KeyExchanges = %v, want %v", config.KeyExchanges, preferredKeyExchanges)
	}

	if !reflect.DeepEqual(config.Ciphers, preferredCiphers) {
		t.Fatalf("config.Ciphers = %v, want %v", config.Ciphers, preferredCiphers)
	}

	if !reflect.DeepEqual(config.MACs, preferredMACs) {
		t.Fatalf("config.MACs = %v, want %v", config.MACs, preferredMACs)
	}
}

func TestSelectAuthMethodPassword(t *testing.T) {
	t.Parallel()

	password := "top-secret"
	selection, err := SelectAuthMethod("password", protocol.AuthPayload{Password: &password}, nil)
	if err != nil {
		t.Fatalf("SelectAuthMethod() error = %v", err)
	}

	if selection.Name != "password" {
		t.Fatalf("selection.Name = %q, want password", selection.Name)
	}

	if selection.Method == nil {
		t.Fatal("expected password auth method to be configured")
	}
}

const testUnencryptedEd25519Key = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACCeY037NnCMOuG04ZVbdnMRMnT2pE7diP31sF71nunIiAAAAJjJ2tDqydrQ
6gAAAAtzc2gtZWQyNTUxOQAAACCeY037NnCMOuG04ZVbdnMRMnT2pE7diP31sF71nunIiA
AAAEC4IxC9x+sNwmJcHuxbVBsOt4IU+KZSatwLxwBLt7U/pp5jTfs2cIw64bThlVt2cxEy
dPakTt2I/fWwXvWe6ciIAAAADnRlc3RAYnVkZHktc3NoAQIDBAUGBw==
-----END OPENSSH PRIVATE KEY-----`

const testEncryptedEd25519Key = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAACmFlczI1Ni1jdHIAAAAGYmNyeXB0AAAAGAAAABCY27Hb3K
5f6z2mYL0BlhfxAAAAGAAAAAEAAAAzAAAAC3NzaC1lZDI1NTE5AAAAII0nFjJLxyqyZEhC
D7giQHwNkUZaFgK0fw9XqNiYJx1SAAAAoFxdj/ZGTXxsCwR5/TX/jujOwzyykjITFMo83C
gmuxZSbsxFz6dhk3iqxi9oL1MHnSt+lmbE6blFqJpmrUGxfjXcm2PyZL1NIjoKE+iAyj1e
hRuyAatSR7Bz+5m95UlpYUmfkvGiCTn3RU0aIa2GJJrW8IQ54YGK7yDqqaesCf2AKCIBVU
GQwY1Qp6gdlLuWiYz0g/qtwfmlTly6ObmQ4E8=
-----END OPENSSH PRIVATE KEY-----`

func TestSelectAuthMethodPublicKeyUnencrypted(t *testing.T) {
	t.Parallel()

	key := testUnencryptedEd25519Key
	selection, err := SelectAuthMethod("publickey", protocol.AuthPayload{
		Publickey: &protocol.AuthPayloadPublickey{Key: key},
	}, nil)
	if err != nil {
		t.Fatalf("SelectAuthMethod() error = %v", err)
	}

	if selection.Name != "publickey" {
		t.Fatalf("selection.Name = %q, want publickey", selection.Name)
	}
	if selection.Method == nil {
		t.Fatal("expected publickey auth method to be configured")
	}
}

func TestSelectAuthMethodPublicKeyEncryptedCorrectPassphrase(t *testing.T) {
	t.Parallel()

	key := testEncryptedEd25519Key
	passphrase := "correct horse"
	selection, err := SelectAuthMethod("publickey", protocol.AuthPayload{
		Publickey: &protocol.AuthPayloadPublickey{Key: key, Passphrase: &passphrase},
	}, nil)
	if err != nil {
		t.Fatalf("SelectAuthMethod() error = %v", err)
	}
	if selection.Method == nil {
		t.Fatal("expected publickey auth method to be configured")
	}
}

func TestSelectAuthMethodPublicKeyEncryptedWrongPassphrase(t *testing.T) {
	t.Parallel()

	key := testEncryptedEd25519Key
	passphrase := "wrong-passphrase"
	_, err := SelectAuthMethod("publickey", protocol.AuthPayload{
		Publickey: &protocol.AuthPayloadPublickey{Key: key, Passphrase: &passphrase},
	}, nil)
	if err == nil {
		t.Fatal("expected wrong passphrase to fail")
	}
}

func TestSelectAuthMethodPublicKeyEncryptedMissingPassphrase(t *testing.T) {
	t.Parallel()

	key := testEncryptedEd25519Key
	_, err := SelectAuthMethod("publickey", protocol.AuthPayload{
		Publickey: &protocol.AuthPayloadPublickey{Key: key},
	}, nil)
	if err == nil {
		t.Fatal("expected missing passphrase on an encrypted key to fail")
	}
}

func TestSelectAuthMethodPublicKeyMissingKey(t *testing.T) {
	t.Parallel()

	_, err := SelectAuthMethod("publickey", protocol.AuthPayload{}, nil)
	if err == nil {
		t.Fatal("expected missing key to fail")
	}
}

func TestSelectAuthMethodPublicKeyGarbage(t *testing.T) {
	t.Parallel()

	_, err := SelectAuthMethod("publickey", protocol.AuthPayload{
		Publickey: &protocol.AuthPayloadPublickey{Key: "not a real key"},
	}, nil)
	if err == nil {
		t.Fatal("expected garbage key to fail")
	}
}

func TestBuildClientConfigRejectsMissingPassword(t *testing.T) {
	t.Parallel()

	initMessage := protocol.InitMessage{
		V:    1,
		Type: "INIT",
		Payload: protocol.InitPayload{
			AuthMethod: "password",
			Target: protocol.InitPayloadTarget{Host: "example.com", Port: 22, Username: "ops"},
		},
	}

	_, err := BuildClientConfig(initMessage, protocol.AuthMessage{V: 1, Type: "AUTH"}, nil, nil)
	if err == nil {
		t.Fatal("expected missing password to fail")
	}
}