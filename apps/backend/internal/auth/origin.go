package auth

import (
	"net/http"
	"net/url"
	"slices"
	"strings"
)

var localhostHosts = []string{"localhost", "127.0.0.1", "::1"}

// OriginValidator validates websocket upgrade Origin headers against an
// explicit allowlist or a localhost-only development fallback.
type OriginValidator struct {
	allowed []string
}

// NewOriginValidator creates a validator from the configured allowlist.
func NewOriginValidator(allowed []string) OriginValidator {
	normalized := make([]string, 0, len(allowed))
	for _, origin := range allowed {
		trimmed := strings.TrimSpace(origin)
		if trimmed == "" {
			continue
		}
		normalized = append(normalized, trimmed)
	}

	return OriginValidator{allowed: normalized}
}

// Validate reports whether the request Origin header is allowed.
func (validator OriginValidator) Validate(request *http.Request) bool {
	origin := strings.TrimSpace(request.Header.Get("Origin"))
	if origin == "" {
		return false
	}

	if len(validator.allowed) == 0 {
		return isLocalOrigin(origin)
	}

	return slices.Contains(validator.allowed, origin)
}

func isLocalOrigin(origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}

	return slices.Contains(localhostHosts, parsed.Hostname())
}
