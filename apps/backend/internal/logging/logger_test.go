package logging

import (
	"bytes"
	"io"
	"log/slog"
	"strings"
	"testing"
)

func TestNewRedactsSensitiveFields(t *testing.T) {
	t.Parallel()

	var buffer bytes.Buffer

	logger, err := New("debug", &buffer)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	logger.Info(
		"auth attempt",
		slog.String("password", "hunter2"),
		slog.String("details", "token=very-secret-token-123"),
		slog.Group("ssh", slog.String("privateKey", "-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n-----END OPENSSH PRIVATE KEY-----")),
		slog.String("user", "root"),
	)

	output := buffer.String()
	if !strings.Contains(output, redactedValue) {
		t.Fatalf("expected output to contain %q, got %q", redactedValue, output)
	}

	for _, secret := range []string{
		"hunter2",
		"very-secret-token-123",
		"OPENSSH PRIVATE KEY",
	} {
		if strings.Contains(output, secret) {
			t.Fatalf("expected output not to contain secret %q, got %q", secret, output)
		}
	}

	if !strings.Contains(output, `"user":"root"`) {
		t.Fatalf("expected non-sensitive fields to remain visible, got %q", output)
	}

	if !strings.Contains(output, `"password":"[REDACTED]"`) {
		t.Fatalf("expected password field to be redacted, got %q", output)
	}

	if !strings.Contains(output, `"details":"[REDACTED]"`) {
		t.Fatalf("expected details field to be redacted from its value, got %q", output)
	}

	if !strings.Contains(output, `"privateKey":"[REDACTED]"`) {
		t.Fatalf("expected grouped privateKey field to be redacted, got %q", output)
	}
}

func TestNewAppliesLogLevel(t *testing.T) {
	t.Parallel()

	var buffer bytes.Buffer

	logger, err := New("warn", &buffer)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	logger.Info("skip me")
	logger.Error("keep me")

	output := buffer.String()
	if strings.Contains(output, "skip me") {
		t.Fatalf("expected info log to be filtered out, got %q", output)
	}

	if !strings.Contains(output, "keep me") {
		t.Fatalf("expected error log to be emitted, got %q", output)
	}
}

func TestNewRejectsInvalidLevel(t *testing.T) {
	t.Parallel()

	_, err := New("trace", io.Discard)
	if err == nil {
		t.Fatal("expected invalid log level to fail")
	}
}
