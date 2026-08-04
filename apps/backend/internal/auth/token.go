package auth

import (
	"crypto/subtle"
	"strings"
)

// TokenValidator performs constant-time comparison against the configured
// backend bearer token.
type TokenValidator struct {
	expected string
}

// NewTokenValidator creates a validator for the configured backend token.
func NewTokenValidator(expected string) TokenValidator {
	return TokenValidator{expected: strings.TrimSpace(expected)}
}

// Validate reports whether the provided token matches the configured token.
func (validator TokenValidator) Validate(token string) bool {
	if validator.expected == "" || token == "" {
		return false
	}

	return subtle.ConstantTimeCompare([]byte(validator.expected), []byte(token)) == 1
}
