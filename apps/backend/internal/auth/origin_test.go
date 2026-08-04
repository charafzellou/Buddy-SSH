package auth

import (
	"net/http/httptest"
	"testing"
)

func TestOriginValidatorValidate(t *testing.T) {
	t.Parallel()

	validator := NewOriginValidator([]string{"https://buddy.example"})
	request := httptest.NewRequest("GET", "http://backend.example/ws", nil)
	request.Header.Set("Origin", "https://buddy.example")

	if !validator.Validate(request) {
		t.Fatal("expected configured origin to be allowed")
	}
}

func TestOriginValidatorRejectsDisallowedOrigin(t *testing.T) {
	t.Parallel()

	validator := NewOriginValidator([]string{"https://buddy.example"})
	request := httptest.NewRequest("GET", "http://backend.example/ws", nil)
	request.Header.Set("Origin", "https://evil.example")

	if validator.Validate(request) {
		t.Fatal("expected disallowed origin to be rejected")
	}
}

func TestOriginValidatorRejectsMissingOrigin(t *testing.T) {
	t.Parallel()

	validator := NewOriginValidator([]string{"https://buddy.example"})
	request := httptest.NewRequest("GET", "http://backend.example/ws", nil)

	if validator.Validate(request) {
		t.Fatal("expected missing origin to be rejected")
	}
}

func TestOriginValidatorAllowsLocalhostWhenAllowlistEmpty(t *testing.T) {
	t.Parallel()

	validator := NewOriginValidator(nil)
	request := httptest.NewRequest("GET", "http://backend.example/ws", nil)
	request.Header.Set("Origin", "http://localhost:5173")

	if !validator.Validate(request) {
		t.Fatal("expected localhost origin to be allowed when allowlist is empty")
	}
}
