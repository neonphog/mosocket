const EventEmitter = require('events')

const { Connection: TcpCon } = require('./tcp')

/**
 */
class Session extends EventEmitter {
  /**
   */
  constructor (sessionId) {
    super()

    this._sessionId = sessionId
    this._con = null
  }

  /**
   */
  close () {
    if (this._con) {
      this._con.close()
    }
    this._con = null
    this._sessionId = null
    this.removeAllListeners()
    this.setMaxListeners(0)
  }

  /**
   */
  assumeTcpConnection (con) {
    if (!(con instanceof TcpCon)) {
      throw new Error('session can only assume tcp connections')
    }
    if (this._sessionId !== con._sessionId) {
      throw new Error('session id mismatch')
    }
    if (this._con) {
      this._con.close()
    }
    this._con = con
    con.on('error', (err) => {
      if (this._con) {
        this._con.close()
      }
      this._con = null
      this.emit('error', err)
    })
    con.on('close', () => {
      if (this._con) {
        this._con.close()
      }
      this._con = null
      this.emit('close')
    })
  }
}

exports.Session = Session
