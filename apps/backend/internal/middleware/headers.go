package middleware

import "net/http"

const (
	contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss:; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; require-trusted-types-for 'script'"
	permissionsPolicy     = "clipboard-read=(self), clipboard-write=(self), geolocation=(), microphone=(), camera=()"
	strictTransport       = "max-age=63072000; includeSubDomains; preload"
)

// Headers applies the backend's baseline browser security policy to responses.
func Headers(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		headers := writer.Header()
		headers.Set("Content-Security-Policy", contentSecurityPolicy)
		headers.Set("Strict-Transport-Security", strictTransport)
		headers.Set("X-Frame-Options", "DENY")
		headers.Set("Referrer-Policy", "no-referrer")
		headers.Set("Permissions-Policy", permissionsPolicy)
		headers.Set("Cross-Origin-Opener-Policy", "same-origin")
		headers.Set("Cross-Origin-Embedder-Policy", "require-corp")
		headers.Set("Cross-Origin-Resource-Policy", "same-origin")
		headers.Set("X-Content-Type-Options", "nosniff")

		next.ServeHTTP(writer, request)
	})
}
