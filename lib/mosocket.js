const EventEmitter = require('events')

const { Connection: TcpCon, Listener: TcpListener } = require('../lib/tcp')
const { MultiAddr } = require('../lib/multiaddr')

/**
 */
class MoSocket extends EventEmitter {
  /**
   */
  constructor (config) {
    super()
    this._config = config
    this._listeners = []
    this._outgoing = []
    this._incoming = []
  }

  /**
   */
  async bind (ma) {
    if (!ma) {
      ma = new MultiAddr()
    } else if (!(ma instanceof MultiAddr)) {
      ma = new MultiAddr(ma)
    }

    const tcpPort = ma.tcpPort || 0
    const udpPort = ma.udpPort || 0

    const hosts = ma.ipAddress ? [ma.ipAddress] : ['0.0.0.0', '::']

    await Promise.all(hosts.map((h) => {
      return this._bind(h, tcpPort, udpPort)
    }))
  }

  /**
   */
  async connect (ma) {
    if (!(ma instanceof MultiAddr)) {
      ma = new MultiAddr(ma)
    }

    if (!ma.ipAddress || !ma.tcpPort) {
      throw new Error('invalid multiaddr: ' + ma.toString())
    }

    const con = await TcpCon.create(this._config, ma)
    this._outgoing.push(con)
    console.log('connected', con.getAddr().toString())
  }

  /**
   */
  close () {
    for (let l of this._listeners) {
      l.close()
    }
    this._listeners = []
    for (let c of this._outgoing) {
      c.close()
    }
    this._outgoing = []
    for (let c of this._incoming) {
      c.close()
    }
    this._incoming = []
  }

  /**
   */
  getListeningAddrs () {
    const out = []
    for (let l of this._listeners) {
      for (let addr of l.getAddrs()) {
        out.push(addr.toString())
      }
    }
    return out
  }

  // -- private -- //

  /**
   */
  async _bind (host, tcpPort, udpPort) {
    const ma = MultiAddr.fromParts(host, tcpPort, udpPort)
    const listener = await TcpListener.create(this._config, ma)
    listener.on('connection', (con) => {
      this._incoming.push(con)
      console.log('connected', con.getAddr().toString())
    })
    this._listeners.push(listener)

    for (let addr of listener.getAddrs()) {
      this.emit('bind', addr.toString())
    }
  }
}

exports.MoSocket = MoSocket
