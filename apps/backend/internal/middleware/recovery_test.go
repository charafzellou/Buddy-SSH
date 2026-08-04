package middleware

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRecoveryHandlesPanicsAndReturnsGeneric500(t *testing.T) {
	t.Parallel()

	var logBuffer bytes.Buffer
	baseLogger := slog.New(slog.NewJSONHandler(&logBuffer, nil))

	handler := Recovery(baseLogger)(Logging(baseLogger)(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		panic("boom")
	})))

	request := httptest.NewRequest(http.MethodGet, "/ws", nil)
	request.RemoteAddr = "127.0.0.1:54321"
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusInternalServerError)
	}

	if body := response.Body.String(); !strings.Contains(body, http.StatusText(http.StatusInternalServerError)) {
		t.Fatalf("expected generic 500 body, got %q", body)
	}

	if strings.Contains(response.Body.String(), "boom") {
		t.Fatalf("expected panic value to stay out of response body, got %q", response.Body.String())
	}

	output := logBuffer.String()
	if !strings.Contains(output, "panic recovered") {
		t.Fatalf("expected recovery log entry, got %q", output)
	}

	if !strings.Contains(output, "\"request_id\":") {
		t.Fatalf("expected recovery log to include request_id, got %q", output)
	}

	if !strings.Contains(output, "\"path\":\"/ws\"") {
		t.Fatalf("expected recovery log to include request path, got %q", output)
	}
	if !strings.Contains(output, "\"panic\":\"boom\"") {
		t.Fatalf("expected recovery log to include panic value, got %q", output)
	}
}
