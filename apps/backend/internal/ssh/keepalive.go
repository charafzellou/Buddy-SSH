package ssh

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	gossh "golang.org/x/crypto/ssh"
)

// ErrIdleTimeout reports that the SSH session exceeded its allowed idle time.
var ErrIdleTimeout = errors.New("ssh session idle timeout")

// ActivityTracker records the last observed user activity for an SSH session.
type ActivityTracker struct {
	mutex        sync.RWMutex
	lastActivity time.Time
	now          func() time.Time
}

// NewActivityTracker constructs a tracker seeded with the current time.
func NewActivityTracker(now func() time.Time) *ActivityTracker {
	if now == nil {
		now = time.Now
	}

	return &ActivityTracker{
		lastActivity: now(),
		now:          now,
	}
}

// Touch records fresh user activity.
func (tracker *ActivityTracker) Touch() {
	tracker.mutex.Lock()
	defer tracker.mutex.Unlock()

	tracker.lastActivity = tracker.now()
}

// IdleFor reports how long the session has been idle.
func (tracker *ActivityTracker) IdleFor() time.Duration {
	tracker.mutex.RLock()
	defer tracker.mutex.RUnlock()

	return tracker.now().Sub(tracker.lastActivity)
}

// StartKeepalive begins periodically sending SSH keepalive requests until the
// context is canceled, the request fails, or the idle timeout is exceeded.
func StartKeepalive(
	ctx context.Context,
	client *gossh.Client,
	interval time.Duration,
	idleTimeout time.Duration,
	tracker *ActivityTracker,
	onIdle func(),
) <-chan error {
	results := make(chan error, 1)

	if client == nil {
		results <- fmt.Errorf("ssh client is required")
		close(results)
		return results
	}
	if interval <= 0 {
		results <- fmt.Errorf("keepalive interval must be positive")
		close(results)
		return results
	}
	if tracker == nil {
		tracker = NewActivityTracker(nil)
	}

	go func() {
		defer close(results)

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if idleTimeout > 0 && tracker.IdleFor() >= idleTimeout {
					if onIdle != nil {
						onIdle()
					}
					results <- ErrIdleTimeout
					return
				}

				ok, _, err := client.SendRequest("keepalive@openssh.com", true, nil)
				if err != nil {
					results <- err
					return
				}
				if !ok {
					results <- fmt.Errorf("ssh keepalive request rejected")
					return
				}
			}
		}
	}()

	return results
}
