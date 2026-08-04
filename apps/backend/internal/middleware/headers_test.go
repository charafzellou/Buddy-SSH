package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHeadersAppliesThreatModelPolicies(t *testing.T) {
	t.Parallel()

	handler := Headers(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusNoContent)
	}))

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	assertHeader(t, response, "Content-Security-Policy", contentSecurityPolicy)
	assertHeader(t, response, "Strict-Transport-Security", strictTransport)
	assertHeader(t, response, "X-Frame-Options", "DENY")
	assertHeader(t, response, "Referrer-Policy", "no-referrer")
	assertHeader(t, response, "Permissions-Policy", permissionsPolicy)
	assertHeader(t, response, "Cross-Origin-Opener-Policy", "same-origin")
	assertHeader(t, response, "Cross-Origin-Embedder-Policy", "require-corp")
	assertHeader(t, response, "Cross-Origin-Resource-Policy", "same-origin")
	assertHeader(t, response, "X-Content-Type-Options", "nosniff")
	assertHeader(t, response, "Content-Type", "application/json")
}

func assertHeader(t *testing.T, response *httptest.ResponseRecorder, key string, want string) {
	t.Helper()

	if got := response.Header().Get(key); got != want {
		t.Fatalf("%s = %q, want %q", key, got, want)
	}
}
