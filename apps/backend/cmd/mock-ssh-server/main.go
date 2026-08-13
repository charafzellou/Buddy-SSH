package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/signal"
	"sync"
	"syscall"

	gossh "golang.org/x/crypto/ssh"
)

type serverConfig struct {
	address       string
	password      string
	username      string
	authorizedKey string
	kbdCode       string
}

func main() {
	config := serverConfig{}
	flag.StringVar(&config.address, "addr", "127.0.0.1:2222", "listen address")
	flag.StringVar(&config.username, "user", "ops", "accepted ssh username")
	flag.StringVar(&config.password, "password", "top-secret", "accepted ssh password")
	flag.StringVar(&config.authorizedKey, "authorized-key", "", "authorized_keys-format public key accepted for publickey auth (optional)")
	flag.StringVar(&config.kbdCode, "kbd-code", "", "when set, enables keyboard-interactive auth requiring this verification code")
	flag.Parse()

	if err := run(config); err != nil {
		log.Fatal(err)
	}
}

func run(config serverConfig) error {
	signer, err := newHostKeySigner()
	if err != nil {
		return err
	}

	var authorizedKey gossh.PublicKey
	if config.authorizedKey != "" {
		authorizedKey, _, _, _, err = gossh.ParseAuthorizedKey([]byte(config.authorizedKey))
		if err != nil {
			return fmt.Errorf("parse authorized key: %w", err)
		}
	}

	sshConfig := &gossh.ServerConfig{
		PasswordCallback: func(metadata gossh.ConnMetadata, presented []byte) (*gossh.Permissions, error) {
			if metadata.User() != config.username || string(presented) != config.password {
				return nil, fmt.Errorf("invalid credentials")
			}

			return nil, nil
		},
	}
	if authorizedKey != nil {
		sshConfig.PublicKeyCallback = func(metadata gossh.ConnMetadata, presented gossh.PublicKey) (*gossh.Permissions, error) {
			if metadata.User() != config.username || !bytes.Equal(presented.Marshal(), authorizedKey.Marshal()) {
				return nil, fmt.Errorf("unauthorized key")
			}

			return nil, nil
		}
	}
	if config.kbdCode != "" {
		sshConfig.KeyboardInteractiveCallback = func(metadata gossh.ConnMetadata, client gossh.KeyboardInteractiveChallenge) (*gossh.Permissions, error) {
			if metadata.User() != config.username {
				return nil, fmt.Errorf("invalid user")
			}

			answers, err := client("Two-factor", "Enter your verification code", []string{"Verification code:"}, []bool{true})
			if err != nil {
				return nil, err
			}
			if len(answers) != 1 || answers[0] != config.kbdCode {
				return nil, fmt.Errorf("invalid verification code")
			}

			return nil, nil
		}
	}
	sshConfig.AddHostKey(signer)

	listener, err := net.Listen("tcp", config.address)
	if err != nil {
		return err
	}
	defer listener.Close()

	log.Printf("mock ssh server listening on %s for %s", config.address, config.username)

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	var waitGroup sync.WaitGroup
	go func() {
		<-ctx.Done()
		_ = listener.Close()
	}()

	for {
		connection, err := listener.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				waitGroup.Wait()
				return nil
			default:
				return err
			}
		}

		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			handleConnection(connection, sshConfig)
		}()
	}
}

func newHostKeySigner() (gossh.Signer, error) {
	_, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}

	return gossh.NewSignerFromKey(privateKey)
}

func handleConnection(connection net.Conn, config *gossh.ServerConfig) {
	defer connection.Close()

	serverConnection, channels, requests, err := gossh.NewServerConn(connection, config)
	if err != nil {
		return
	}
	defer serverConnection.Close()

	log.Printf("ssh client connected from %s as %s", serverConnection.RemoteAddr(), serverConnection.User())

	go handleGlobalRequests(requests)

	for newChannel := range channels {
		if newChannel.ChannelType() != "session" {
			_ = newChannel.Reject(gossh.UnknownChannelType, "unsupported channel type")
			continue
		}

		channel, requests, err := newChannel.Accept()
		if err != nil {
			continue
		}

		go handleSession(channel, requests)
	}
}

func handleSession(channel gossh.Channel, requests <-chan *gossh.Request) {
	defer channel.Close()

	echoDone := make(chan struct{})
	echoStarted := false

	for request := range requests {
		switch request.Type {
		case "pty-req":
			var payload ptyRequest
			if err := gossh.Unmarshal(request.Payload, &payload); err == nil {
				log.Printf("pty request term=%s rows=%d cols=%d", payload.Term, payload.Rows, payload.Columns)
			}
			_ = request.Reply(true, nil)
		case "window-change":
			var payload windowChange
			if err := gossh.Unmarshal(request.Payload, &payload); err == nil {
				log.Printf("window change rows=%d cols=%d", payload.Rows, payload.Columns)
			}
		case "shell":
			_ = request.Reply(true, nil)
			if echoStarted {
				continue
			}

			echoStarted = true
			go func() {
				defer close(echoDone)
				_, _ = io.WriteString(channel, "shell ready\n")
				echoInput(channel)
			}()
		default:
			if request.WantReply {
				_ = request.Reply(false, nil)
			}
		}
	}

	if echoStarted {
		<-echoDone
	}
}

func handleGlobalRequests(requests <-chan *gossh.Request) {
	for request := range requests {
		switch request.Type {
		case "keepalive@openssh.com":
			log.Print("keepalive request")
			if request.WantReply {
				_ = request.Reply(true, nil)
			}
		default:
			if request.WantReply {
				_ = request.Reply(false, nil)
			}
		}
	}
}


func echoInput(channel gossh.Channel) {
	buffer := make([]byte, 4096)
	for {
		bytesRead, err := channel.Read(buffer)
		if bytesRead > 0 {
			payload := append([]byte(nil), buffer[:bytesRead]...)
			log.Printf("stdin %q", string(payload))
			if _, writeErr := channel.Write(payload); writeErr != nil {
				return
			}
		}

		if err != nil {
			return
		}
	}
}

type ptyRequest struct {
	Term     string
	Columns  uint32
	Rows     uint32
	Width    uint32
	Height   uint32
	Modelist string
}

type windowChange struct {
	Columns uint32
	Rows    uint32
	Width   uint32
	Height  uint32
}