const EventEmitter = require('events')
const net = require('net')

const sodium = require('./sodium')

/**
 */
function createTcpConnection (ma, timeout) {
  return new Promise((resolve, reject) => {
    try {
      const stack = (new Error('timeout')).stack
      const timer = setTimeout(() => {
        reject(new Error(stack))
      }, timeout)
      const con = new net.Socket()
      con.on('close', reject)
      con.on('error', reject)
      con.connect(ma.tcpPort, ma.ipAddress, () => {
        try {
          clearTimeout(timer)
          con.removeListener('close', reject)
          con.removeListener('error', reject)
          resolve(con)
        } catch (e) {
          reject(e)
        }
      })
    } catch (e) {
      reject(e)
    }
  })
}

/**
 */
function handleClientHandshake (con, timeout, kx) {
  return new Promise((resolve, reject) => {
    try {
      // use raw socket
      con._socket.on('close', reject)
      con._socket.on('error', reject)

      const stack = (new Error('timeout')).stack
      const timer = setTimeout(() => {
        reject(new Error(stack))
      }, timeout)

      let buffer = Buffer.alloc(0)
      const handler = (data) => {
        try {
          buffer = Buffer.concat([buffer, data])

          if (buffer.byteLength >= 68) {
            clearTimeout(timer)
            con._socket.removeListener('close', reject)
            con._socket.removeListener('error', reject)
            con._socket.removeListener('data', handler)

            if (
              buffer.readUInt8(0) !== 42 ||
              buffer.readUInt8(1) !== 42 ||
              buffer.readUInt8(2) !== 42 ||
              buffer.readUInt8(3) !== 0
            ) {
              throw new Error('invalid magic or protocol version')
            }

            buffer = buffer.slice(4)

            const srvSessionId = buffer.slice(0, 32)
            const srvPublicKey = buffer.slice(32, 64)
            con._buffer = buffer.slice(64)

            const { rx, tx } = sodium.kx.clientSession(
              kx.publicKey,
              kx.secretKey,
              srvPublicKey
            )

            con._sessionId = srvSessionId
            con._rx = rx
            con._tx = tx

            con._socket.write(con._sessionId)
            con._socket.write(kx.publicKey)

            resolve()
          }
        } catch (e) {
          reject(e)
        }
      }
      con._socket.on('data', handler)
    } catch (e) {
      reject(e)
    }
  })
}

/**
 */
class Connection extends EventEmitter {
  /**
   */
  static async create (config, ma) {
    const socket = await createTcpConnection(ma, config.timeout.newConnection)
    const con = Connection.fromSocket(config, socket)
    await handleClientHandshake(
      con,
      config.timeout.newConnection,
      config.keys.kx)
    return con
  }

  /**
   */
  static fromSocket (config, socket) {
    const con = new Connection()
    con._config = config
    con._socket = socket
    socket.on('error', (err) => {
      con.emit('error', err)
      con.close()
    })
    socket.on('close', () => {
      con.emit('close')
      con.close()
    })
    return con
  }

  /**
   */
  close () {
    if (this._socket) {
      this._socket.destroy()
    }
    this._config = null
    this._socket = null
    this.removeAllListeners()
    this.setMaxListeners(0)
  }
}

exports.Connection = Connection

/**
 */
function createTcpListener (ma, timeout) {
  return new Promise((resolve, reject) => {
    try {
      const stack = (new Error('timeout')).stack
      const timer = setTimeout(() => {
        reject(new Error(stack))
      }, timeout)
      const srv = net.createServer()
      srv.on('close', reject)
      srv.on('error', reject)
      srv.listen(ma.tcpPort, ma.ipAddress, () => {
        try {
          clearTimeout(timer)
          srv.removeListener('close', reject)
          srv.removeListener('error', reject)
          resolve(srv)
        } catch (e) {
          reject(e)
        }
      })
    } catch (e) {
      reject(e)
    }
  })
}

/**
 */
function handleServerHandshake (con, timeout, kx) {
  return new Promise((resolve, reject) => {
    try {
      // use raw socket
      con._socket.on('close', reject)
      con._socket.on('error', reject)

      // server side generates session
      con._sessionId = sodium.random.bytes(32)

      con._socket.write(Buffer.from([42, 42, 42, 0]))
      con._socket.write(con._sessionId)
      con._socket.write(kx.publicKey)

      const stack = (new Error('timeout')).stack
      const timer = setTimeout(() => {
        reject(new Error(stack))
      }, timeout)

      let buffer = Buffer.alloc(0)
      const handler = (data) => {
        try {
          buffer = Buffer.concat([buffer, data])

          if (buffer.byteLength >= 64) {
            clearTimeout(timer)
            con._socket.removeListener('close', reject)
            con._socket.removeListener('error', reject)
            con._socket.removeListener('data', handler)

            const cliSessionId = buffer.slice(0, 32)
            const cliPublicKey = buffer.slice(32, 64)
            con._buffer = buffer.slice(64)

            const { rx, tx } = sodium.kx.serverSession(
              kx.publicKey,
              kx.secretKey,
              cliPublicKey
            )

            con._sessionId = cliSessionId
            con._rx = rx
            con._tx = tx

            resolve()
          }
        } catch (e) {
          reject(e)
        }
      }
      con._socket.on('data', handler)
    } catch (e) {
      reject(e)
    }
  })
}

/**
 */
class Listener extends EventEmitter {
  /**
   */
  static async create (config, ma) {
    const l = new Listener()
    l._config = config
    const s = l._socket = await createTcpListener(ma, config.timeout.newConnection)
    s.on('error', (err) => {
      l.emit('error', err)
      l.close()
    })
    s.on('close', () => {
      l.emit('close')
      l.close()
    })
    s.on('connection', async (socket) => {
      try {
        const con = Connection.fromSocket(config, socket)
        await handleServerHandshake(
          con,
          config.timeout.newConnection,
          config.keys.kx)
        con.emit('connection', con)
      } catch (e) {
        console.error(e)
        con.emit('error', e)
      }
    })
    return l
  }

  /**
   */
  close () {
    if (this._socket) {
      this._socket.close()
    }
    this._config = null
    this._socket = null
    this.removeAllListeners()
    this.setMaxListeners(0)
  }
}

exports.Listener = Listener
