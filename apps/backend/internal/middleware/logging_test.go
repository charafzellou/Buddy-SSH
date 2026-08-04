package middleware

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLoggingAddsUniqueRequestIDAndPropagatesContext(t *testing.T) {
	t.Parallel()

	var logBuffer bytes.Buffer
	baseLogger := slog.New(slog.NewJSONHandler(&logBuffer, nil))

	handler := Logging(baseLogger)(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requestID := RequestID(request.Context())
		if requestID == "" {
			t.Fatal("expected request ID in context")
		}

		writer.Header().Set("X-Observed-Request-ID", requestID)
		Logger(request.Context()).Info("handler reached")
		writer.WriteHeader(http.StatusNoContent)
	}))

	requestIDs := make([]string, 0, 2)
	for range 2 {
		request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
		request.RemoteAddr = "127.0.0.1:12345"
		response := httptest.NewRecorder()

		handler.ServeHTTP(response, request)

		requestID := response.Header().Get(RequestIDHeader)
		if requestID == "" {
			t.Fatal("expected response to include request ID")
		}

		if observed := response.Header().Get("X-Observed-Request-ID"); observed != requestID {
			t.Fatalf("handler observed request ID %q, want %q", observed, requestID)
		}

		requestIDs = append(requestIDs, requestID)
	}

	if requestIDs[0] == requestIDs[1] {
		t.Fatalf("expected unique request IDs, got %q and %q", requestIDs[0], requestIDs[1])
	}

	requestLogIDs := logIDsByMessage(t, logBuffer.String(), "http request")
	if len(requestLogIDs) != 2 {
		t.Fatalf("expected 2 request completion logs, got %d", len(requestLogIDs))
	}

	handlerLogIDs := logIDsByMessage(t, logBuffer.String(), "handler reached")
	if len(handlerLogIDs) != 2 {
		t.Fatalf("expected 2 handler logs, got %d", len(handlerLogIDs))
	}

	for _, requestID := range requestIDs {
		if !contains(requestLogIDs, requestID) {
			t.Fatalf("expected request log to contain request ID %q, got %v", requestID, requestLogIDs)
		}

		if !contains(handlerLogIDs, requestID) {
			t.Fatalf("expected handler log to contain request ID %q, got %v", requestID, handlerLogIDs)
		}
	}
}

func TestLoggingPreservesIncomingRequestID(t *testing.T) {
	t.Parallel()

	var logBuffer bytes.Buffer
	handler := Logging(slog.New(slog.NewJSONHandler(&logBuffer, nil)))(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusAccepted)
	}))

	request := httptest.NewRequest(http.MethodPost, "/ws", nil)
	request.Header.Set(RequestIDHeader, "proxy-request-id")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if got := response.Header().Get(RequestIDHeader); got != "proxy-request-id" {
		t.Fatalf("response request ID = %q, want %q", got, "proxy-request-id")
	}

	requestLogIDs := logIDsByMessage(t, logBuffer.String(), "http request")
	if len(requestLogIDs) != 1 || requestLogIDs[0] != "proxy-request-id" {
		t.Fatalf("request log IDs = %v, want [proxy-request-id]", requestLogIDs)
	}
}

func logIDsByMessage(t *testing.T, logs string, message string) []string {
	t.Helper()

	lines := strings.Split(strings.TrimSpace(logs), "\n")
	if len(lines) == 1 && lines[0] == "" {
		return nil
	}

	requestIDs := make([]string, 0, len(lines))
	for _, line := range lines {
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatalf("unmarshal log line %q: %v", line, err)
		}

		if entry["msg"] != message {
			continue
		}

		requestID, ok := entry["request_id"].(string)
		if !ok || requestID == "" {
			t.Fatalf("log entry missing request_id: %v", entry)
		}

		requestIDs = append(requestIDs, requestID)
	}

	return requestIDs
}

func contains(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}

	return false
}
