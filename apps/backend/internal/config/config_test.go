package config

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestLoadDefaults(t *testing.T) {
	t.Setenv("BUDDY_SSH_TOKEN", "dev-token")

	config, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if config.Port != defaultPort {
		t.Fatalf("port = %d, want %d", config.Port, defaultPort)
	}

	if config.LogLevel != defaultLogLevel {
		t.Fatalf("log level = %q, want %q", config.LogLevel, defaultLogLevel)
	}

	if config.IdleTimeout != defaultIdleTimeout {
		t.Fatalf("idle timeout = %v, want %v", config.IdleTimeout, defaultIdleTimeout)
	}

	if config.Keepalive != defaultKeepalive {
		t.Fatalf("keepalive = %v, want %v", config.Keepalive, defaultKeepalive)
	}

	if config.MaxConnections != defaultMaxConnections {
		t.Fatalf("max connections = %d, want %d", config.MaxConnections, defaultMaxConnections)
	}

	if config.ReadLimit != defaultReadLimit {
		t.Fatalf("read limit = %d, want %d", config.ReadLimit, defaultReadLimit)
	}

	if config.ShutdownTimeout != defaultShutdownTimeout {
		t.Fatalf("shutdown timeout = %v, want %v", config.ShutdownTimeout, defaultShutdownTimeout)
	}

	if config.MetricsEnabled {
		t.Fatal("metrics enabled = true, want false")
	}

	if config.Token != "dev-token" {
		t.Fatalf("token = %q, want dev-token", config.Token)
	}
}

func TestLoadOverridesFromEnv(t *testing.T) {
	t.Setenv("BUDDY_SSH_TOKEN", "override-token")
	t.Setenv("BUDDY_SSH_PORT", "9443")
	t.Setenv("BUDDY_SSH_ALLOWED_ORIGINS", "https://one.example, https://two.example")
	t.Setenv("BUDDY_SSH_LOG_LEVEL", "DEBUG")
	t.Setenv("BUDDY_SSH_IDLE_TIMEOUT", "2m")
	t.Setenv("BUDDY_SSH_KEEPALIVE", "45s")
	t.Setenv("BUDDY_SSH_MAX_CONNECTIONS", "512")
	t.Setenv("BUDDY_SSH_READ_LIMIT", "2048")
	t.Setenv("BUDDY_SSH_SHUTDOWN_TIMEOUT", "1m")
	t.Setenv("BUDDY_SSH_TLS_CERT", "/tmp/cert.pem")
	t.Setenv("BUDDY_SSH_TLS_KEY", "/tmp/key.pem")
	t.Setenv("BUDDY_SSH_METRICS_ENABLED", "true")

	config, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if config.Port != 9443 {
		t.Fatalf("port = %d, want 9443", config.Port)
	}

	expectedOrigins := []string{"https://one.example", "https://two.example"}
	if !reflect.DeepEqual(config.AllowedOrigins, expectedOrigins) {
		t.Fatalf("allowed origins = %#v, want %#v", config.AllowedOrigins, expectedOrigins)
	}

	if config.LogLevel != "debug" {
		t.Fatalf("log level = %q, want debug", config.LogLevel)
	}

	if config.IdleTimeout != 2*time.Minute {
		t.Fatalf("idle timeout = %v, want 2m", config.IdleTimeout)
	}

	if config.Keepalive != 45*time.Second {
		t.Fatalf("keepalive = %v, want 45s", config.Keepalive)
	}

	if config.MaxConnections != 512 {
		t.Fatalf("max connections = %d, want 512", config.MaxConnections)
	}

	if config.ReadLimit != 2048 {
		t.Fatalf("read limit = %d, want 2048", config.ReadLimit)
	}

	if config.ShutdownTimeout != time.Minute {
		t.Fatalf("shutdown timeout = %v, want 1m", config.ShutdownTimeout)
	}

	if config.TLSCert != "/tmp/cert.pem" || config.TLSKey != "/tmp/key.pem" {
		t.Fatalf("tls paths = %q / %q, want /tmp/cert.pem / /tmp/key.pem", config.TLSCert, config.TLSKey)
	}

	if !config.MetricsEnabled {
		t.Fatal("metrics enabled = false, want true")
	}
}

func TestLoadFailsWhenTokenMissing(t *testing.T) {
	_, err := Load()
	if err == nil {
		t.Fatal("expected missing token error")
	}

	if !strings.Contains(err.Error(), "BUDDY_SSH_TOKEN") {
		t.Fatalf("error = %q, want token reference", err)
	}
}
