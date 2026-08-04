package middleware

import (
	"fmt"
	"log/slog"
	"net/http"
)

// Recovery converts handler panics into logged 500 responses.
func Recovery(base *slog.Logger) func(http.Handler) http.Handler {
	if base == nil {
		base = slog.Default()
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			defer func() {
				recovered := recover()
				if recovered == nil {
					return
				}

				logger := base.With(
					slog.String("remote_addr", request.RemoteAddr),
					slog.String("method", request.Method),
					slog.String("path", request.URL.Path),
				)

				if requestID := writer.Header().Get(RequestIDHeader); requestID != "" {
					logger = logger.With(slog.String("request_id", requestID))
				}

				logger.Error("panic recovered", slog.String("panic", fmt.Sprint(recovered)))
				http.Error(writer, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			}()

			next.ServeHTTP(writer, request)
		})
	}
}
