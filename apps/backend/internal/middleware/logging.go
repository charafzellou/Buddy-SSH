package middleware

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"
)

const RequestIDHeader = "X-Request-ID"

type contextKey string

const (
	loggerContextKey    contextKey = "logger"
	requestIDContextKey contextKey = "request-id"
)

// Logging attaches a request ID and request-scoped logger to every request,
// then emits a structured completion log when the handler returns.
func Logging(base *slog.Logger) func(http.Handler) http.Handler {
	if base == nil {
		base = slog.Default()
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			requestID := requestIDFromHeader(request.Header.Get(RequestIDHeader))
			requestLogger := base.With(
				slog.String("request_id", requestID),
				slog.String("remote_addr", request.RemoteAddr),
			)

			contextWithRequest := context.WithValue(request.Context(), requestIDContextKey, requestID)
			contextWithRequest = context.WithValue(contextWithRequest, loggerContextKey, requestLogger)
			request = request.WithContext(contextWithRequest)

			recorder := newResponseRecorder(writer)
			recorder.Header().Set(RequestIDHeader, requestID)

			startedAt := time.Now()
			next.ServeHTTP(recorder, request)

			requestLogger.Info(
				"http request",
				slog.String("method", request.Method),
				slog.String("path", request.URL.Path),
				slog.Int("status", recorder.StatusCode()),
				slog.Int64("bytes_written", recorder.BytesWritten()),
				slog.Duration("duration", time.Since(startedAt)),
			)
		})
	}
}

// RequestID returns the request ID propagated by Logging.
func RequestID(ctx context.Context) string {
	requestID, ok := ctx.Value(requestIDContextKey).(string)
	if !ok {
		return ""
	}

	return requestID
}

// Logger returns the request-scoped logger propagated by Logging.
func Logger(ctx context.Context) *slog.Logger {
	logger, ok := ctx.Value(loggerContextKey).(*slog.Logger)
	if !ok || logger == nil {
		return slog.Default()
	}

	return logger
}

func requestIDFromHeader(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed != "" {
		return trimmed
	}

	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return strings.ReplaceAll(time.Now().UTC().Format("20060102150405.000000000"), ".", "")
	}

	return hex.EncodeToString(buffer)
}

type responseRecorder struct {
	http.ResponseWriter
	statusCode   int
	bytesWritten int64
	wroteHeader  bool
}

func newResponseRecorder(writer http.ResponseWriter) *responseRecorder {
	return &responseRecorder{ResponseWriter: writer}
}

func (recorder *responseRecorder) WriteHeader(statusCode int) {
	if recorder.wroteHeader {
		return
	}

	recorder.statusCode = statusCode
	recorder.wroteHeader = true
	recorder.ResponseWriter.WriteHeader(statusCode)
}

func (recorder *responseRecorder) Write(body []byte) (int, error) {
	if !recorder.wroteHeader {
		recorder.WriteHeader(http.StatusOK)
	}

	bytesWritten, err := recorder.ResponseWriter.Write(body)
	recorder.bytesWritten += int64(bytesWritten)

	return bytesWritten, err
}

func (recorder *responseRecorder) ReadFrom(reader io.Reader) (int64, error) {
	if readerFrom, ok := recorder.ResponseWriter.(io.ReaderFrom); ok {
		if !recorder.wroteHeader {
			recorder.WriteHeader(http.StatusOK)
		}

		bytesWritten, err := readerFrom.ReadFrom(reader)
		recorder.bytesWritten += bytesWritten

		return bytesWritten, err
	}

	return io.Copy(recorder, reader)
}

func (recorder *responseRecorder) Flush() {
	if flusher, ok := recorder.ResponseWriter.(http.Flusher); ok {
		if !recorder.wroteHeader {
			recorder.WriteHeader(http.StatusOK)
		}

		flusher.Flush()
	}
}

func (recorder *responseRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := recorder.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, http.ErrNotSupported
	}

	return hijacker.Hijack()
}

func (recorder *responseRecorder) Push(target string, options *http.PushOptions) error {
	pusher, ok := recorder.ResponseWriter.(http.Pusher)
	if !ok {
		return http.ErrNotSupported
	}

	return pusher.Push(target, options)
}

func (recorder *responseRecorder) Unwrap() http.ResponseWriter {
	return recorder.ResponseWriter
}

func (recorder *responseRecorder) StatusCode() int {
	if !recorder.wroteHeader {
		return http.StatusOK
	}

	return recorder.statusCode
}

func (recorder *responseRecorder) BytesWritten() int64 {
	return recorder.bytesWritten
}
