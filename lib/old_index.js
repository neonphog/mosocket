const crypto = require('crypto')
const dgram = require('dgram')
const EventEmitter = require('events')
const net = require('net')
const os = require('os')

/**
 * Extremely constrained version of multiaddr
 */
class MA {
  constructor (str) {
    this.ipFamily = 4
    this.ipAddress = '127.0.0.1'
    this.protocol = 'tcp'
    this.port = 0
    if (str) {
      this.parse(str)
    }
  }

  toString () {
    return '/' +
      (this.ipFamily === 6 ? 'ip6' : 'ip4') + '/' +
      this.ipAddress + '/' +
      this.protocol + '/' +
      this.port
  }

  parse (str) {
    const parts = str.split('/')
    if (parts.length !== 5) {
      throw new Error('bad multiaddr: ' + str)
    }

    switch (parts[1]) {
      case 'ip4':
        this.ipFamily = 4
        break
      case 'ip6':
        this.ipFamily = 6
        break
      default:
        throw new Error('bad ip family: ' + parts[1])
    }

    this.ipAddress = parts[2]
    if (net.isIP(this.ipAddress) !== this.ipFamily) {
      throw new Error('ip family mismatch: ' + this.ipFamily + ' vs ' + this.ipAddress)
    }

    this.protocol = parts[3]
    if (this.protocol !== 'tcp' && this.protocol !== 'udp') {
      throw new Error('bad protocol: ' + this.protocol)
    }

    this.port = parseInt(parts[4], 10)
  }
}

function createUdpListener (host, port) {
  return new Promise((resolve, reject) => {
    const stack = (new Error('timeout')).stack
    const timer = setTimeout(() => {
      reject(new Error(stack))
    }, 1000)
    const ver = net.isIP(host)
    let srv
    switch (ver) {
      case 4:
        srv = dgram.createSocket('udp4')
        break
      case 6:
        srv = dgram.createSocket('udp6')
        break
      default:
        return reject(new Error('bad host: ' + host))
    }
    srv.on('close', reject)
    srv.on('error', reject)
    srv.bind(port, host, () => {
      clearTimeout(timer)
      srv.removeListener('close', reject)
      srv.removeListener('error', reject)
      resolve(srv)
    })
  })
}

function createTcpListener (host, port) {
  return new Promise((resolve, reject) => {
    const stack = (new Error('timeout')).stack
    const timer = setTimeout(() => {
      reject(new Error(stack))
    }, 1000)
    const srv = net.createServer()
    srv.on('close', reject)
    srv.on('error', reject)
    srv.listen(port, host, () => {
      clearTimeout(timer)
      srv.removeListener('close', reject)
      srv.removeListener('error', reject)
      resolve(srv)
    })
  })
}

function createTcpConnection (ma) {
  return new Promise((resolve, reject) => {
    const stack = (new Error('timeout')).stack
    const timer = setTimeout(() => {
      reject(new Error(stack))
    }, 1000)
    const con = new net.Socket()
    con.on('close', reject)
    con.on('error', reject)
    con.connect(ma.port, ma.ipAddress, () => {
      clearTimeout(timer)
      con.removeListener('close', reject)
      con.removeListener('error', reject)
      resolve(con)
    })
  })
}

function udpSend (socket, ma, data) {
  return new Promise((resolve, reject) => {
    const stack = (new Error('timeout')).stack
    const timer = setTimeout(() => {
      reject(new Error(stack))
    }, 1000)
    socket.send(data, ma.port, ma.ipAddress, (err) => {
      clearTimeout(timer)
      if (err) return reject(err)
      resolve()
    })
  })
}

const SessionState = {
  INIT: 'init',

  SRV_INIT: 'srvInit',
  CLI_INIT: 'cliInit',

  WAIT_FRAME: 'waitFrame',
  WAIT_DATA: 'waitData'
}

class Session extends EventEmitter {
  constructor () {
    super()

    this._state = SessionState.INIT
    this._sessionId = null
    this._paused = true
    this._tcpConnection = null
    this._buffer = Buffer.alloc(0)
  }

  close () {
    this._tcpConnection.destroy()
    this.removeAllListeners()
    this.setMaxListeners(0)
  }

  takeConnection (con) {
    con.pause()
    this._paused = true

    // TODO hack for now
    con.resume()

    this._tcpConnection = con
    this._tcpConnection.on('data', (data) => {
      this._handleTcpData(data)
    })
  }

  triggerServer () {
    this._state = SessionState.SRV_INIT
    this._sessionId = crypto.randomBytes(32)
    this._tcpConnection.write(Buffer.from([42, 42, 42, 0]))
    this._tcpConnection.write(this._sessionId)
  }

  triggerClient () {
    this._state = SessionState.CLI_INIT
  }

  processUdpData (data) {
    this._handleUdpData(data)
  }

  getSessionString () {
    return this._sessionId.toString('base64')
  }

  getSessionBuffer () {
    return Buffer.from(this._sessionId)
  }

  // -- private -- //

  /**
   * Something improper happened, clean everything up
   */
  _fail (err) {
    console.error(err)
    this.emit('error', err)
    this.close()
  }

  _trim (len) {
    if (this._buffer.byteLength - len <= 0) {
      this._buffer = Buffer.alloc(0)
      return
    }
    this._buffer = this._buffer.slice(len)
  }

  _handleTcpData (data) {
    if (data && data.byteLength > 0) {
      this._buffer = Buffer.concat([this._buffer, data])
    }

    switch (this._state) {
      case SessionState.INIT:
        return this._fail(new Error('cannot receive data in INIT state'))
      case SessionState.CLI_INIT:
        if (this._buffer.byteLength >= 36) {
          if (
            this._buffer.readUInt8(0) !== 42 ||
            this._buffer.readUInt8(1) !== 42 ||
            this._buffer.readUInt8(2) !== 42 ||
            this._buffer.readUInt8(3) !== 0
          ) {
            return this._fail(new Error('invalid magic or protocol version'))
          }
          this._sessionId = this._buffer.slice(4, 36)
          console.log('got session len (' + this._sessionId.byteLength + '): ' + this.getSessionString())
          this._trim(36)

          const bufOut = Buffer.alloc(2)
          bufOut.writeUInt16LE(0, 0)
          this._tcpConnection.write(bufOut)

          this._state = SessionState.WAIT_FRAME
          setImmediate(() => {
            this.emit('connection', this.getSessionBuffer())
          })
          setImmediate(() => {
            this._handleTcpData()
          })
          return
        }
        return
      case SessionState.SRV_INIT:
        if (this._buffer.byteLength >= 2) {
          if (this._buffer.readUInt16LE(0) !== 0) {
            return this._fail(new Error('unsupported cli reply to srv_init'))
          }
          this._trim(2)
          this._state = SessionState.WAIT_FRAME
          setImmediate(() => {
            this.emit('connection', this.getSessionBuffer())
          })
          setImmediate(() => {
            this._handleTcpData()
          })
          return
        }
        return
      case SessionState.WAIT_FRAME:
        if (this._buffer.byteLength >= 2) {
          this._frameSize = this._buffer.readUInt16LE(0)
          this._trim(2)
          this._state = SessionState.WAIT_DATA
          setImmediate(() => {
            this._handleTcpData()
          })
          return
        }
        return
      case SessionState.WAIT_DATA:
        if (this._buffer.byteLength >= this._frameSize) {
          const data = this._buffer.slice(0, this._frameSize)
          this._trim(this._frameSize)
          this._state = SessionState.WAIT_FRAME
          setImmediate(() => {
            this.emit('data', data)
          })
          setImmediate(() => {
            this._handleTcpData()
          })
          return
        }
        return
      default:
        return this._fail(new Error('tcp unimplemented: ' + this._state))
    }
  }

  _handleUdpData (data) {
    return this._fail(new Error('udp unimplemented'))
  }
}

/*
class MoSocketConnectionProxy extends EventEmitter {
  // -- protected -- //

  $takeSession (session) {
    if (this._cleanup) this._cleanup()

    const onData = (data) => {
      this.emit('data', data)
    }

    this._cleanup = () => {
      session.off('data', onData)
      session.off('close', onClose)
      session.off('error', onError)
      this._cleanup = null
    }

    const onClose = () => {
      if (this._cleanup) this._cleanup()
      this.emit('close')
    }

    const onError = (err) => {
      if (this._cleanup) this._cleanup()
      this.emit('error', err)
    }

    session.on('data', onData)
    session.on('close', onClose)
    session.on('error', onError)
  }
}
*/

class MoSocket extends EventEmitter {
  constructor () {
    super()
    this._listeners = []
    this._listenAddrs = new Set()

    this._udp4Send = null
    this._udp6Send = null

    this._connections = []
    this._connectAddrs = new Set()
  }

  async listen (binds) {
    const all = []
    for (let b of binds) {
      all.push(this._createTcpListener(b))
      all.push(this._createUdpListener(b))
    }
    await Promise.all(all)
  }

  async connect (ma) {
    if (!(ma instanceof MA)) {
      ma = new MA(ma)
    }
    const con = await createTcpConnection(ma)
    const session = new Session()
    session.takeConnection(con)
    session.triggerServer()
    this._addConnection(session)
  }

  async message (ma, data) {
    if (!(ma instanceof MA)) {
      ma = new MA(ma)
    }
    if (ma.ipFamily === 4 && this._udp4Send) {
      await udpSend(this._udp4Send, ma, data)
    } else if (ma.ipFamily === 6 && this._udp6Send) {
      await udpSend(this._udp6Send, ma, data)
    } else {
      throw new Error('no available udp iface for ip v ' + ma.ipFamily)
    }
  }

  close () {
    for (let l of this._listeners) {
      l.close()
    }
    this._listeners = []
    this._listenAddrs = new Set()
    this._udp4Send = null
    this._udp6Send = null
    for (let session of this._connections) {
      session.close()
    }
    this._connections = []
    this._connectAddrs = new Set()
  }

  getBindings () {
    return Array.from(this._listenAddrs.keys())
  }

  getConnections () {
    return Array.from(this._connectAddrs.keys())
  }

  // -- private -- //

  async _createTcpListener (bind) {
    const l = await createTcpListener(...bind)
    l.on('connection', (con) => {
      const session = new Session()
      session.takeConnection(con)
      session.triggerClient()
      this._addConnection(session)
    })
    for (let addr of this._txAddr('tcp', l.address())) {
      this._listenAddrs.add(addr)
      this.emit('listening', addr)
    }
    this._listeners.push(l)
  }

  async _createUdpListener (bind) {
    const l = await createUdpListener(...bind)
    l.on('message', (msg, rinfo) => {
      console.log('UDP_RECV', msg.toString(), rinfo)
    })
    for (let addr of this._txAddr('udp', l.address())) {
      if (!this._udp4Send && addr.ipFamily === 4) {
        this._udp4Send = l
      }
      if (!this._udp6Send && addr.ipFamily === 6) {
        this._udp6Send = l
      }
      this._listenAddrs.add(addr)
      this.emit('listening', addr)
    }
    this._listeners.push(l)
  }

  _addConnection (session) {
    session.on('connection', (session) => {
      console.log('session connection ready: ' + session.toString('base64'))
    })
    for (let addr of this._txAddr('tcp', session._tcpConnection.address())) {
      this._connectAddrs.add(addr)
    }
    this._connections.push(session)
  }

  _txAddr (proto, addr) {
    const out = []
    const mk = (a, addr) => {
      let out = new MA()
      out.ipFamily = net.isIP(addr.address)
      out.ipAddress = a
      out.protocol = proto
      out.port = addr.port
      // make sure we generated something parsable
      out = new MA(out.toString())
      return out
    }
    if (
      (addr.family === 'IPv6' && addr.address === '::') ||
      (addr.family === 'IPv4' && addr.address === '0.0.0.0')
    ) {
      const ifaces = os.networkInterfaces()
      for (let key in ifaces) {
        const iface = ifaces[key]
        for (let f of iface) {
          if (f.family === addr.family) {
            out.push(mk(f.address, addr))
          }
        }
      }
    } else {
      out.push(mk(addr.address, addr))
    }
    return out
  }
}

exports.test = async function test () {
  const srv = new MoSocket()
  srv.on('listening', (addr) => {
    console.log('listening', addr.toString())
  })
  srv.on('connected', (addr) => {
    console.log('connected', addr.toString())
  })

  await srv.listen([['::', 11011], ['0.0.0.0', 11012]])

  let tcp = null
  let udp = null
  for (let addr of srv.getBindings()) {
    if (/\/tcp\//.test(addr)) {
      tcp = addr
    } else if (/\/udp\//.test(addr)) {
      udp = addr
    }
  }

  console.log('connecting to', tcp.toString())
  await srv.connect(tcp)

  console.log('messaging', udp.toString())
  await srv.message(udp, 'hello')

  setTimeout(() => {
    srv.close()
  }, 1000)
}
