# Phase 9 — Sequence & State Diagrams

**Document status:** Proposed
**Last updated:** 2026-07-26
**Scope:** Mermaid diagrams for every lifecycle in Buddy-SSH.

This document consolidates the dynamic views: SSH connection lifecycle,
authentication, terminal resize, WebSocket reconnect, host-key verification,
and the secret lifecycle. Static views live in
[`04-frontend-design.md`](./04-frontend-design.md) and
[`05-backend-design.md`](./05-backend-design.md).

---

## 1. SSH connection lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend (SPA)
    participant BE as Backend
    participant T as SSH target
    U->>FE: Open tab / quick connect
    FE->>BE: WSS upgrade (Authorization: Bearer)
    BE-->>FE: 101 Switching Protocols
    FE->>BE: INIT {target, authMethod, hostKey, pty}
    FE->>BE: AUTH {password|publickey|kbdInteractive}
    BE->>T: ssh.Dial (host-key callback)
    T-->>BE: host key presented
    BE->>BE: verify against client trust data
    BE->>T: authenticate
    T-->>BE: auth ok
    BE->>BE: zero credential refs
    FE->>BE: CONNECT {command?}
    BE->>T: RequestPty + Shell
    T-->>BE: PTY granted
    BE-->>FE: CONNECTED {sessionId, hostKey}
    loop terminal session
        U->>FE: keystroke
        FE->>BE: DATA
        BE->>T: stdin
        T-->>BE: stdout/stderr
        BE-->>FE: DATA / STDERR
        FE->>U: render
    end
    FE->>BE: DISCONNECT
    BE->>T: close session
    BE-->>FE: close WS
```

---

## 2. Authentication (all methods)

### 2.1 Password

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend
    participant T as SSH target
    FE->>BE: AUTH {password}
    BE->>BE: build ssh.PasswordAuth
    BE->>T: ssh.Dial
    alt success
        T-->>BE: authenticated
        BE->>BE: drop password ref
        BE-->>FE: (proceed to CONNECT)
    else failure
        T-->>BE: auth failed
        BE-->>FE: ERROR{AUTH_FAILED}
    end
```

### 2.2 Public key (encrypted, in-memory)

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant IDB as IndexedDB
    participant BE as Backend
    participant T as SSH target
    U->>FE: unlock master password
    FE->>IDB: read encryptedKey
    FE->>FE: AES-GCM decrypt → plaintext key (transient)
    FE->>BE: AUTH {publickey:{key, passphrase?}}
    FE->>FE: zeroize plaintext key buffer
    BE->>BE: parse key, build ssh.PublicKeysAuth
    BE->>T: ssh.Dial
    alt success
        T-->>BE: authenticated
        BE->>BE: drop key + passphrase refs
        BE-->>FE: (proceed to CONNECT)
    else failure
        BE-->>FE: ERROR{AUTH_FAILED}
    end
```

### 2.3 Keyboard-interactive

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend
    participant T as SSH target
    FE->>BE: AUTH {kbdInteractive:{challengeId, responses}}
    BE->>T: ssh.Dial (KeyboardInteractive)
    T-->>BE: challenge prompts
    BE-->>FE: STATUS{state:connecting, message: challenge}
    FE->>FE: render prompts to user
    FE->>BE: AUTH {kbdInteractive:{challengeId, responses}}
    BE->>T: submit responses
    alt success
        T-->>BE: authenticated
        BE-->>FE: (proceed to CONNECT)
    else failure
        BE-->>FE: ERROR{AUTH_FAILED}
    end
```

---

## 3. Terminal resize

```mermaid
sequenceDiagram
    participant U as User
    participant Pane as TerminalPane
    participant RO as ResizeObserver
    participant T as useTerminal
    participant TR as Transport
    participant BE as Backend
    participant SSH as ssh.Session
    U->>Pane: resize window / split
    Pane->>RO: fires
    RO->>T: layout change
    T->>T: debounce 50ms
    T->>TR: RESIZE{cols, rows}
    TR->>BE: RESIZE
    BE->>SSH: WindowChange(cols, rows)
    SSH-->>BE: ok
    Note over T: no response expected; best-effort
```

---

## 4. WebSocket reconnect

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend (old)
    participant BE2 as Backend (new)
    FE->>BE: DATA
    Note over BE: process dies / network drops
    BE--xFE: WS close
    FE->>FE: tab state = reconnecting<br/>preserve scrollback
    loop backoff
        FE->>FE: wait min(2^n * 500ms, 30s) + jitter
        FE->>BE2: WSS upgrade + INIT + AUTH
        alt success
            BE2-->>FE: CONNECTED
            FE->>FE: reattach terminal<br/>re-emit last RESIZE
            FE->>BE2: DATA (resume)
        else fail
            BE2-->>FE: ERROR / close
            FE->>FE: n++, retry until cap
        end
    end
    alt cap reached
        FE->>FE: tab state = error<br/>stop retrying
    end
```

**State machine (client tab):**

```mermaid
stateDiagram-v2
    [*] --> connecting
    connecting --> connected: CONNECTED
    connecting --> error: ERROR
    connected --> reconnecting: WS close
    reconnecting --> connected: CONNECTED
    reconnecting --> error: cap reached
    error --> connecting: user retry
    connected --> disconnected: DISCONNECT
    disconnected --> [*]
```

---

## 5. Host-key verification (TOFU)

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant IDB as IndexedDB
    participant BE as Backend
    participant T as SSH target
    FE->>IDB: lookup knownHosts[host:port]
    alt not pinned (first use)
        FE->>BE: INIT{hostKey:{mode:'first-use'}}
        BE->>T: ssh.Dial
        T-->>BE: host key K
        BE-->>FE: CONNECTED{hostKey:{algo, fingerprint:sha256(K)}}
        FE->>U: prompt: "Trust this fingerprint?"
        U->>FE: accept
        FE->>IDB: pin {host, algo, fingerprint} (encrypted)
    else pinned
        FE->>BE: INIT{hostKey:{mode:'pinned', fingerprint:sha256(K)}}
        BE->>T: ssh.Dial
        T-->>BE: host key K'
        BE->>BE: compare sha256(K') to pinned
        alt match
            BE-->>FE: CONNECTED
        else mismatch
            BE-->>FE: ERROR{HOST_KEY_MISMATCH}
            FE->>U: prominent warning with both fingerprints
            U->>FE: explicit re-pin (with friction) or abort
        end
    end
```

---

## 6. Secret lifecycle (end-to-end)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant FE as Frontend
    participant IDB as IndexedDB
    participant WC as Web Crypto / hash-wasm
    participant BE as Backend
    participant T as SSH target
    U->>FE: enter master password
    FE->>WC: Argon2id(password, salt) → 32 raw bytes
    FE->>WC: importKey(raw, extractable=false) → master CryptoKey
    FE->>WC: HKDF(master, 'keys') → keysKey
    FE->>IDB: read encryptedKey record
    FE->>WC: AES-GCM decrypt(keysKey, ciphertext, nonce) → plaintext key
    FE->>BE: WSS AUTH {publickey:{key}} (over TLS)
    FE->>WC: zeroize plaintext key buffer
    BE->>BE: build ssh.PublicKeysAuth (in memory)
    BE->>T: ssh.Dial
    T-->>BE: authenticated
    BE->>BE: drop key reference; zero buffers where practical
    BE-->>FE: CONNECTED
    Note over FE,IDB: master password & derived keys never leave browser
    Note over BE: backend never persists, never logs credentials
```

---

## 7. Graceful shutdown (backend)

```mermaid
sequenceDiagram
    participant OPS as Operator
    participant OS as OS (SIGTERM)
    participant BE as Backend
    participant FE as Frontend (active tabs)
    OPS->>OS: kill -TERM
    OS->>BE: signal
    BE->>BE: stop accepting new connections
    BE->>FE: STATUS{state:disconnected, message:'server shutting down'} (best-effort)
    loop drain window (≤ ShutdownTimeout)
        BE->>BE: wait for active sessions to close
    end
    BE->>BE: force-close remaining
    BE-->>OS: exit 0
    FE->>FE: tabs enter reconnecting (will fail until new instance up)
```

---

## 8. Auto-lock (frontend)

```mermaid
stateDiagram-v2
    [*] --> locked
    locked --> unlocked: unlock(masterPassword)
    unlocked --> locked: explicit lock()
    unlocked --> locked: idle timeout (15m)
    unlocked --> locked: tab close / visibility hidden (configurable)
    note right of unlocked: derived CryptoKey + decrypted material in memory
    note right of locked: all CryptoKeys dropped; buffers zeroized
```
