package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultPort                  = 8443
	defaultLogLevel              = "info"
	defaultIdleTimeout           = 5 * time.Minute
	defaultKeepalive             = 30 * time.Second
	defaultMaxConnections        = 256
	defaultReadLimit       int64 = 1 << 20
	defaultShutdownTimeout       = 30 * time.Second
)

// Config contains the runtime configuration for the Buddy-SSH backend.
type Config struct {
	Port            int
	Token           string
	AllowedOrigins  []string
	LogLevel        string
	IdleTimeout     time.Duration
	Keepalive       time.Duration
	MaxConnections  int
	ReadLimit       int64
	ShutdownTimeout time.Duration
	TLSCert         string
	TLSKey          string
	MetricsEnabled  bool
}

// Load reads configuration from environment variables, applies defaults, and
// validates the resulting configuration.
func Load() (Config, error) {
	config := Config{
		Port:            defaultPort,
		Token:           strings.TrimSpace(os.Getenv("BUDDY_SSH_TOKEN")),
		AllowedOrigins:  splitCSV(os.Getenv("BUDDY_SSH_ALLOWED_ORIGINS")),
		LogLevel:        defaultLogLevel,
		IdleTimeout:     defaultIdleTimeout,
		Keepalive:       defaultKeepalive,
		MaxConnections:  defaultMaxConnections,
		ReadLimit:       defaultReadLimit,
		ShutdownTimeout: defaultShutdownTimeout,
		TLSCert:         strings.TrimSpace(os.Getenv("BUDDY_SSH_TLS_CERT")),
		TLSKey:          strings.TrimSpace(os.Getenv("BUDDY_SSH_TLS_KEY")),
		MetricsEnabled:  false,
	}

	if value := strings.TrimSpace(os.Getenv("BUDDY_SSH_PORT")); value != "" {
		port, err := strconv.Atoi(value)
		if err != nil {
			return Config{}, fmt.Errorf("parse BUDDY_SSH_PORT: %w", err)
		}
		config.Port = port
	}

	if value := strings.TrimSpace(os.Getenv("BUDDY_SSH_LOG_LEVEL")); value != "" {
		config.LogLevel = strings.ToLower(value)
	}

	if value := strings.TrimSpace(os.Getenv("BUDDY_SSH_IDLE_TIMEOUT")); value != "" {
		duration, err := time.ParseDuration(value)
		if err != nil {
			return Config{}, fmt.Errorf("parse BUDDY_SSH_IDLE_TIMEOUT: %w", err)
		}
		config.IdleTimeout = duration
	}

	if value := strings.TrimSpace(os.Getenv("BUDDY_SSH_KEEPALIVE")); value != "" {
		duration, err := time.ParseDuration(value)
		if err != nil {
			return Config{}, fmt.Errorf("parse BUDDY_SSH_KEEPALIVE: %w", err)
		}
		config.Keepalive = duration
	}

	if value := strings.TrimSpace(os.Getenv("BUDDY_SSH_MAX_CONNECTIONS")); value != "" {
		maxConnections, err := strconv.Atoi(value)
		if err != nil {
			return Config{}, fmt.Errorf("parse BUDDY_SSH_MAX_CONNECTIONS: %w", err)
		}
		config.MaxConnections = maxConnections
	}

	if value := strings.TrimSpace(os.Getenv("BUDDY_SSH_READ_LIMIT")); value != "" {
		readLimit, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			return Config{}, fmt.Errorf("parse BUDDY_SSH_READ_LIMIT: %w", err)
		}
		config.ReadLimit = readLimit
	}

	if value := strings.TrimSpace(os.Getenv("BUDDY_SSH_SHUTDOWN_TIMEOUT")); value != "" {
		duration, err := time.ParseDuration(value)
		if err != nil {
			return Config{}, fmt.Errorf("parse BUDDY_SSH_SHUTDOWN_TIMEOUT: %w", err)
		}
		config.ShutdownTimeout = duration
	}

	if value := strings.TrimSpace(os.Getenv("BUDDY_SSH_METRICS_ENABLED")); value != "" {
		metricsEnabled, err := strconv.ParseBool(value)
		if err != nil {
			return Config{}, fmt.Errorf("parse BUDDY_SSH_METRICS_ENABLED: %w", err)
		}
		config.MetricsEnabled = metricsEnabled
	}

	if err := config.Validate(); err != nil {
		return Config{}, err
	}

	return config, nil
}

// Validate checks for inconsistent or unsafe configuration values.
func (config Config) Validate() error {
	if config.Token == "" {
		return fmt.Errorf("BUDDY_SSH_TOKEN is required")
	}

	if config.Port < 1 || config.Port > 65535 {
		return fmt.Errorf("BUDDY_SSH_PORT must be between 1 and 65535")
	}

	if config.IdleTimeout <= 0 {
		return fmt.Errorf("BUDDY_SSH_IDLE_TIMEOUT must be positive")
	}

	if config.Keepalive <= 0 {
		return fmt.Errorf("BUDDY_SSH_KEEPALIVE must be positive")
	}

	if config.MaxConnections <= 0 {
		return fmt.Errorf("BUDDY_SSH_MAX_CONNECTIONS must be positive")
	}

	if config.ReadLimit <= 0 {
		return fmt.Errorf("BUDDY_SSH_READ_LIMIT must be positive")
	}

	if config.ShutdownTimeout <= 0 {
		return fmt.Errorf("BUDDY_SSH_SHUTDOWN_TIMEOUT must be positive")
	}

	switch config.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		return fmt.Errorf("BUDDY_SSH_LOG_LEVEL must be one of debug, info, warn, error")
	}

	if (config.TLSCert == "") != (config.TLSKey == "") {
		return fmt.Errorf("BUDDY_SSH_TLS_CERT and BUDDY_SSH_TLS_KEY must be set together")
	}

	return nil
}

func splitCSV(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}

	parts := strings.Split(value, ",")
	origins := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		origins = append(origins, trimmed)
	}

	if len(origins) == 0 {
		return nil
	}

	return origins
}
