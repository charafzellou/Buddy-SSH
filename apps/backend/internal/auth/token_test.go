package auth

import "testing"

func TestTokenValidatorValidate(t *testing.T) {
	t.Parallel()

	validator := NewTokenValidator("expected-token")

	if !validator.Validate("expected-token") {
		t.Fatal("expected matching token to validate")
	}

	if validator.Validate("wrong-token") {
		t.Fatal("expected wrong token to fail validation")
	}

	if validator.Validate("") {
		t.Fatal("expected empty token to fail validation")
	}
}

func TestTokenValidatorRejectsEmptyConfiguredToken(t *testing.T) {
	t.Parallel()

	validator := NewTokenValidator("   ")
	if validator.Validate("anything") {
		t.Fatal("expected validator with empty configured token to reject all input")
	}
}
