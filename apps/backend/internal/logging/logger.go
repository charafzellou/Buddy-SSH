package logging

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"
	"unicode"
)

const redactedValue = "[REDACTED]"

var sensitiveTerms = map[string]struct{}{
	"credential":  {},
	"credentials": {},
	"key":         {},
	"passphrase":  {},
	"password":    {},
	"secret":      {},
	"token":       {},
}

// New constructs a JSON slog logger with Buddy-SSH redaction rules applied.
func New(level string, writer io.Writer) (*slog.Logger, error) {
	parsedLevel, err := parseLevel(level)
	if err != nil {
		return nil, err
	}

	if writer == nil {
		writer = os.Stdout
	}

	handler := slog.NewJSONHandler(writer, &slog.HandlerOptions{
		Level:       parsedLevel,
		ReplaceAttr: replaceAttr,
	})

	return slog.New(handler), nil
}

func parseLevel(level string) (slog.Level, error) {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		return slog.LevelDebug, nil
	case "info", "":
		return slog.LevelInfo, nil
	case "warn":
		return slog.LevelWarn, nil
	case "error":
		return slog.LevelError, nil
	default:
		return 0, fmt.Errorf("invalid log level %q", level)
	}
}

func replaceAttr(_ []string, attr slog.Attr) slog.Attr {
	if shouldRedactKey(attr.Key) || shouldRedactValue(attr.Value) {
		return slog.String(attr.Key, redactedValue)
	}

	return attr
}

func shouldRedactKey(key string) bool {
	for _, token := range tokenizeKey(key) {
		if _, ok := sensitiveTerms[token]; ok {
			return true
		}
	}

	return false
}

func tokenizeKey(key string) []string {
	if key == "" {
		return nil
	}

	var builder strings.Builder
	builder.Grow(len(key) * 2)

	var previous rune
	for index, current := range key {
		if unicode.IsUpper(current) && index > 0 && (unicode.IsLower(previous) || unicode.IsDigit(previous)) {
			builder.WriteByte(' ')
		}

		if unicode.IsLetter(current) || unicode.IsDigit(current) {
			builder.WriteRune(unicode.ToLower(current))
		} else {
			builder.WriteByte(' ')
		}

		previous = current
	}

	return strings.Fields(builder.String())
}

func shouldRedactValue(value slog.Value) bool {
	text, ok := stringify(value.Resolve())
	if !ok {
		return false
	}

	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}

	lowerText := strings.ToLower(text)
	if strings.Contains(lowerText, "bearer ") || strings.Contains(lowerText, "private key") {
		return true
	}

	for term := range sensitiveTerms {
		if containsSecretAssignment(lowerText, term) {
			return true
		}
	}

	return false
}

func containsSecretAssignment(text string, term string) bool {
	index := strings.Index(text, term)
	for index >= 0 {
		if hasWordBoundary(text, index-1) && hasWordBoundary(text, index+len(term)) {
			remainder := strings.TrimLeft(text[index+len(term):], " \t")
			if strings.HasPrefix(remainder, ":") || strings.HasPrefix(remainder, "=") {
				remainder = strings.TrimLeft(remainder[1:], " \t")
				if remainder != "" {
					return true
				}
			}
		}

		nextOffset := index + len(term)
		if nextOffset >= len(text) {
			break
		}

		nextIndex := strings.Index(text[nextOffset:], term)
		if nextIndex < 0 {
			break
		}
		index = nextOffset + nextIndex
	}

	return false
}

func hasWordBoundary(text string, index int) bool {
	if index < 0 || index >= len(text) {
		return true
	}

	character := rune(text[index])
	return !unicode.IsLetter(character) && !unicode.IsDigit(character)
}

func stringify(value slog.Value) (string, bool) {
	switch value.Kind() {
	case slog.KindString:
		return value.String(), true
	case slog.KindAny:
		switch typed := value.Any().(type) {
		case []byte:
			return string(typed), true
		case fmt.Stringer:
			return typed.String(), true
		case error:
			return typed.Error(), true
		default:
			return fmt.Sprint(typed), true
		}
	default:
		return "", false
	}
}
