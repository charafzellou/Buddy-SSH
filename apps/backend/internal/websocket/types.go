package websocket

import coderws "github.com/coder/websocket"

// SocketConn aliases the upstream websocket connection type used by the gateway.
type SocketConn = coderws.Conn

// SocketMessageType aliases the upstream websocket message type enum.
type SocketMessageType = coderws.MessageType
