# MoSocket - Multi-Connection Protocol

MoSocket is a hybrid TCP/UDP communication protocol taking inspiration from ZeroMQ, libp2p, and making extensive use of NACL.

It is opinionated.

Design goals:

- Secure, Distributed Peer Communication
- Efficiency (TODO - replace msgpack with flatbuffer or something... msgpack just gets us off the ground quickly)
- DDoS Resiliency
- Message Prioritization

## 1 - Usage Teaser

```javascript
const node = await MoSocket.create()

const shared = {
  val: 0
}

const myProto = node.installProtocol('MyProto', '0.0.1', {
  incrBy: {
    pattern: MoSocket.PATTERN_FIRST,
    preauth: async (peer, predata) => {
      return {
        priority: 5
      }
    },
    handler: async (peer, predata, data) => {
      shared.val += JSON.parse(data)
      return shared.val
    }
  }
})

node.bind('/ip4/0.0.0.0', 0)

const remote = await node.connect(
    '/ip4/192.168.0.100/tcp/3366/udp/3367')

console.log(
    await myProto.incrBy([remote], null, JSON.stringify(3))
)
// outputs 3, 6, 9, etc...
```

## 2 - The Hybrid Approach

Using both TCP and UDP affords us some advantages:

- We can try UDP for speed, and fall back to TCP if our messages aren't making it.
- If we don't need a specific peer to handle our request, we can "broadcast" (really multiple unicast, unless we're on a LAN) with udp, and use the first responce we get.
- We can "sleep" connections by dropping the tcp side, and keep track of UDP keep-alives, then re-initiate if we need to send data.

## 3 - Message Prioritization

MoSockets use requestor-initiated preauth-based prioritization. Basically, before making a request of a peer, you must first gain a preauth. The protocol determines the data you need to send for the preauth. The "requestee" then has the option to accept immediately, defer acceptance, or reject outright.

Node implementors assign priorities to individual protocol elements, allowing the node to first process quick or essential elements.

## 4 - DDoS

- IP-based temporary and permanent blacklist
- Hook system for external firewall implementation of IP blacklisting
- Fail-fast connection dropping on protocol errors
- System is fully-functional without the UDP portion, so we can close the UDP listener if getting flooded

## 5 - Encryption

MoSocket always uses NACL/libsodium for encryption. It uses the default key exchange algorithm for peers to obtain shared symmetric keys for secret communication.

## 6 - Usage Abstraction

Taking a page from ZeroMQ, MoSocket abstracts the low-level connection maintenance, and messaging details. MoSocket provides several "PATTERNS" for api functions that make it easy to work with

### 6.1 - `PATTERN_FIRST`

This is the recommended default pattern. Use this unless you have explicit need of something else. All the following mechanics are handled under the hood, you only have to worry about processing the actual request.

```
title "PATTERN_FIRST"

entity "client / initiator" as c
entity "server / responder" as s
c->s: UDP preauth-req(msg-id)
s->c: UDP preauth-ack(msg-id)
note right of s: if client receives ack,\nskip to:\nwait on priority queue
note left of c: wait 50ms
c->s: UDP preauth-req(msg-id)
s->c: UDP preauth-ack(msg-id)
note left of c: wait 150ms
c->s: TCP preauth-req(msg-id)
s->c: TCP preauth-ack(msg-id)
note right of s: wait on priority queue
s->c: TCP preauth-accept(msg-id)
c->s: TCP req(msg-id)
s->c: TCP res(msg-id)
```

```
                               "PATTERN_FIRST"

       ┌──────────────────┐          ┌──────────────────┐
       │client / initiator│          │server / responder│
       └──────────────────┘          └──────────────────┘
                │   UDP preauth-req(msg-id)   │
                │ ────────────────────────────>
                │                             │
                │   UDP preauth-ack(msg-id)   │
                │ <────────────────────────────
                │                             │
                │                             │  ╔═════════════════════════╗
                │                             │  ║if client receives ack, ░║
                │                             │  ║skip to:                 ║
                │                             │  ║wait on priority queue   ║
                │                             │  ╚═════════════════════════╝
   ╔═══════════╗│                             │
   ║wait 50ms ░║│                             │
   ╚═══════════╝│                             │
                │   UDP preauth-req(msg-id)   │
                │ ────────────────────────────>
                │                             │
                │   UDP preauth-ack(msg-id)   │
                │ <────────────────────────────
                │                             │
  ╔════════════╗│                             │
  ║wait 150ms ░║│                             │
  ╚════════════╝│                             │
                │   TCP preauth-req(msg-id)   │
                │ ────────────────────────────>
                │                             │
                │   TCP preauth-ack(msg-id)   │
                │ <────────────────────────────
                │                             │
                │                             │  ╔════════════════════════╗
                │                             │  ║wait on priority queue ░║
                │                             │  ╚════════════════════════╝
                │  TCP preauth-accept(msg-id) │
                │ <────────────────────────────
                │                             │
                │       TCP req(msg-id)       │
                │ ────────────────────────────>
                │                             │
                │       TCP res(msg-id)       │
                │ <────────────────────────────
       ┌──────────────────┐          ┌──────────────────┐
       │client / initiator│          │server / responder│
       └──────────────────┘          └──────────────────┘
```

This pattern is designated `FIRST` because the initiator api allows specifying an array of peers. MoSocket will follow this pattern for ALL specified peers, until it receives the FIRST `preauth-accept` message. At that point, it will drop communication with all other peers, and forward the actual `req` to the chosen peer. The initiator is free to specify only a single peer.

### 6.2 - `PATTERN_SMALL`

This is like a short-circuited `PATTERN_FIRST`. The responder will never send a `preauth-accept` message, but instead will send `preauth-stop` with the content results from executing the request. This means both the request data and the response data must individually fit within single frames.

### 6.3 - `PATTERN_NOTIFY_UNRELIABLE`

This pattern does not expect a response from the remote peer. The message will be transmitted via UDP if available, otherwise via TCP.

### 6.4 - `PATTERN_NOTIFY_RELIABLE`

This pattern does not expect a response from the remote peer. The message will be transmitted via TCP.

## 7 - Wire Protocol

This is a WIP - subject to massive changes.
Also protocol version 0 is unstable. Two nodes reporting version 0 may not be able to speak to each other unless they are using identical codebases.

Considerations:

- Framing at the encryption level like this is incredibly convenient, but adds some overhead to small messages. We could potentially disconnect them, but that would add complexity overhead. We could also potentially include multiple messages within a single encryption frame, but again, complexity.

### 7.1 - Initial Handshake

The initial handshake must be performed over TCP.

server (listening socket):
```
[0x42 0x42 0x42 0x00] - magic && proto version
[32 bytes] - random session Id
[32 bytes] - nacl kx public key
```

client (connecting socket):
```
[32 bytes] - repeated session Id (or previous if attempting re-connect)
[32 bytes] - nacl kx public key
```

From now, all communications will be encrypted.

### 7.2 - TCP Envelope

All messages from either peer will be wrapped:

```
[uint16-le] - frame-size (<= 24 nonce bytes + 4096 msg)
[24 bytes] - nonce
[frame-size less 24 bytes] - encrypted data
```

### 7.3 - UDP Envelope

All messages from either peer will be wrapped:

```
[0x42 0x42 0x42 0x00] - magic && proto version
[uint16-le] - frame-size (<= 32 session bytes + 24 nonce bytes + 4096 msg)
[32 bytes] - session Id
[24 bytes] - nonce
[frame-size less 32 less 24 bytes] - encrypted data
```

#### 7.3.1 - UDP Message Types

A sub-set of the message types can optionally be sent over UDP. UDP messages must fit within a single frame.

- `keep-alive/noop`

It is recommended to send keepalives over udp. If you receive a peer keepalive that indicates it is not getting your keepalives, send one over tcp instead.

- `notice-unreliable`

This fire-and-forget message type will only be sent over TCP if UDP has been disabled on the connection.

- `preauth-req`

Initial preauthorizations are recommended to be sent over udp. Perhaps send one, then a copy at 50 ms, then if you haven't received a response after 150ms, send a copy over TCP.

This is especially useful if you don't need a specific peer to handle the request, you can blast off a bunch of `preauth-req`s and make use of the first one that responds.

- `preauth-ack`

If the `preauth-req` was received over UDP, the `preauth-ack` response will be sent over UDP.

---

All other message types will use the TCP transport exclusively.

### 7.4 - Message Types (within the encrypted data)

```
[1 byte] - type marker
   - 0x00 - keep-alive/noop
   - 0x10 - notice-reliable
   - 0x11 - notice-unreliable
   - 0x20 - preauth-req
   - 0x21 - preauth-ack
   - 0x22 - preauth-accept
   - 0x23 - preauth-stop
   - 0x30 - req-data
   - 0x31 - req-data-cont
   - 0x40 - res-data
   - 0x41 - res-data-cont
```

thoughts for additional type markers that might be useful

```
   - 0xE0 - peer info
   - 0xE1 - peer warning
   - 0xE2 - peer error
   - 0xF0 - sleep (dropping tcp, will maintain udp keep-alives)
   - 0xF1 - closing
   - 0xFF - fatal, all is borked
```

some definitions for below:

- `proto-hash` - the protocol + '/' + protocol-version -> sha256 -> mod into int - this is a unique identifier hash for a protocol. If you try to install two protocols that have a collision, you'll need to rename one of them
- `msg-id` - int client incremented message id (close/open the connection if your message id wraps)
- `handler-name` - utf8 protocol function name
- `data` - binary data packaged at the high-level protocol's discression
- `data-length` - for `req-data` and `res-data`, specifies the TOTAL data size to wait for when expecting subsequent `req-data-cont` / `res-data-cont` messages.

#### 7.4.1 - `keep-alive/noop`

Keepalives help the other end know the process hasn't hung with the socket open.

```
[msgpack] - [int millis since last peer message]
```

#### 7.4.2 - `notice-reliable`

This message type does not expect a response, and does not require preauth, or expect a response. It always uses the TCP transport.

```
[msgpack] - [proto-hash, msg-id, handler-name, data]
```

#### 7.4.3 - `unreliable-notice`

This unreliable message type may not be received by the remote end, does not expect a response, does not require preauth, or expect a response. It always uses the UDP transport.

```
[msgpack] - [proto-hash, msg-id, handler-name, data]
```

#### 7.4.4 - `preauth-req`

If a protocol handler wants to participate in prioritization, it will need to require preauthorization.

```
[msgpack] - [proto-hash, msg-id, handler-name, data]
```

#### 7.4.5 - `preauth-req-again`

We were previously sent a `preauth-wait`, we have waited our timeout, try again.

```
[msgpack] - [msgid (same one as before)]
```

#### 7.4.6 - `preauth-accept`

Hey, we are good to send the `req-data`/`req-data-cont` messages.

```
[msgpack] - [msg-id]
```

#### 7.4.7 - `preauth-stop`

Server has decided to stop this message sequence. In the case of a `PATTERN_FIRST`, this indicates the server is refusing to accept the request. In the case of a `PATTERN_SMALL`, this message will contain the response from processing the actual request.

```
[msgpack] - [msg-id, data]
```

#### 7.4.8 - `req-data`

Make the actuall request. This can include large amounts of data, or no data at all if our preauth contained all the arguments we care about.

```
[msgpack] - [msg-id, data-length, data]
```

#### 7.4.9 - `req-data-cont`

If the actuall request requires more than ~4096 bytes frame-size of data, we will need to include additional messages that are concatonated together. If you find prioritization is breaking in your network and are sending a lot of `req-data-cont` message types, you may want to break your data up at a higher level, and peform the preauth dance for each chunk.

```
[msgpack] - [msg-id, data-cont]
```

#### 7.4.10 - `res-data`

Server was able to process the request, this is its response. Similar to `req-data-cont`, can include response data larger than the max frame size by using `res-data-cont`.

```
[msgpack] - [msg-id, data-length, data]
```

#### 7.4.11 - `res-data-cont`

Large response to an api request. See the note in `req-data-cont` about breaking things up at a higher level if this is breaking your prioritization.

```
[msgpack] - [msg-id, data]
```

