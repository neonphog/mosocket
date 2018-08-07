const EventEmitter = require('events')

const { Connection: TcpCon } = require('./tcp')
const message = require('./message')

const { SessionProxy } = require('./common')

/**
 */
class Session extends EventEmitter {
  /**
   */
  constructor (mosocket, sessionId) {
    super()

    this._mosocket = mosocket
    this._sessionId = sessionId
    this._tcp = null

    this._messageHandlers = new Map()
  }

  /**
   */
  getProxy () {
    return new SessionProxy(this._sessionId)
  }

  /**
   */
  close () {
    if (this._tcp) {
      this._tcp.close()
    }
    this._tcp = null
    this._sessionId = null
    this.removeAllListeners()
    this.setMaxListeners(0)
  }

  /**
   */
  getAddr () {
    const addr = this._tcp.getAddr()
    // TODO - add udp component
    return addr.toString()
  }

  /**
   */
  send (msg) {
    this._tcp.send(msg)
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
    if (this._tcp) {
      this._tcp.close()
    }
    this._tcp = con
    con.on('error', (err) => {
      this.emit('error', err)
      this.close()
    })
    con.on('close', () => {
      this.emit('close')
      this.close()
    })
    con.on('message', (msg) => {
      this._handleMessage(msg)
    })
  }

  // -- protected -- //

  $registerMessageHandler (msgId, handler) {
    if (this._messageHandlers.has(msgId)) {
      throw new Error('messageid already in use: ' + msgId)
    }
    this._messageHandlers.set(msgId, handler)
  }

  $unregisterMessageHandler (msgId) {
    this._messageHandlers.delete(msgId)
  }

  /*
  $enqueueHandler (fn) {
    this._handlerQueue.push(fn)
  }
  */

  async $triggerProtocolMessage (msg) {
    const handler = this._messageHandlers.get(msg.msgId)
    if (!handler) {
      throw new Error('no handler found for msgId ' + msg.msgId)
    }
    await handler.onMessage(msg)
  }

  // -- private -- //

  _handleMessage (msg) {
    const parsed = message.parse(msg)
    switch (parsed.type) {
      case message.MsgType.noticeReliable:
      case message.MsgType.preauthReq:
      case message.MsgType.preauthAck:
      case message.MsgType.preauthAccept:
      case message.MsgType.preauthStop:
      case message.MsgType.reqData:
      case message.MsgType.resData:
        parsed.proxy = this.getProxy()
        this._mosocket.$triggerProtocolMessage(parsed)
        break
      default:
        throw new Error('unhandled msgtype: 0x' + parsed.type.toString(16))
    }
  }
}

exports.Session = Session
