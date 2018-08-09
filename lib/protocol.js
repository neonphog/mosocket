const EventEmitter = require('events')

const sodium = require('./sodium')
const message = require('./message')

const { SessionProxy } = require('./common')

const Patterns = exports.Patterns = {
  PATTERN_FIRST: 'first',
  PATTERN_NOTIFY_RELIABLE: 'notify-reliable'
}

/**
 * Protocol Stub Class
 */
class Protocol extends EventEmitter {
  /**
   */
  constructor (mosocket, name, version, protoName, intTag) {
    super()
    this._mosocket = mosocket
    this._name = name
    this._version = version
    this._protoName = protoName
    this._intTag = intTag
    this._handlerEntrypoints = new Map()
  }

  // -- marking all functions with $ so they don't clobber hooks -- //

  $getName () {
    return this._name
  }

  $getVersion () {
    return this._version
  }

  $getProtoName () {
    return this._protoName
  }

  $getIntTag () {
    return this._intTag
  }

  async $triggerProtocolMessage (msg) {
    const cb = this._handlerEntrypoints.get(msg.hookName)
    if (!cb) {
      throw new Error('bad entrypoint hook: ' + msg.hookName)
    }
    await cb(msg)
  }
}

exports.Protocol = Protocol

/**
 */
class HandlerFirstInitiator {
  /**
   */
  constructor (protoStub, hookName, hook, resolve, reject) {
    this._protoStub = protoStub
    this._hookName = hookName
    this._hook = hook
    this._resolve = resolve
    this._reject = reject

    this._messageId = protoStub._mosocket.$nextMessageId()

    this._decidedCon = null
    this._registeredProxies = []

    this._state = 'init'
  }

  /**
   */
  async initiate (proxies, args) {
    this._outData = await this._hook.inputTransform(...args)

    const msg = message.newPreauthReq(
      this._protoStub._intTag, this._messageId, this._hookName,
      this._outData.preauthData)

    for (let con of proxies) {
      const session = this._protoStub._mosocket.$resolveProxy(con)
      session.$registerMessageHandler(this._messageId, this)
      this._registeredProxies.push(con)

      session.send(msg)
    }

    this._state = 'await-ack'
  }

  /**
   */
  onMessage (msg) {
    try {
      switch (this._state) {
        case 'await-ack':
          // TODO - actually pay attention to acks...
          // for now wait for Accept / Stop
          if (msg.type === message.MsgType.preauthAck) {
            console.log('got ack')
            // ignore
          } else if (msg.type === message.MsgType.preauthAccept) {
            console.log('got accept')
            this._doAccept(msg)
          } else if (msg.type === message.MsgType.preauthStop) {
            console.log('got stop')
            return this._fail(msg.text)
          } else {
            throw new Error('bad message type: 0x' + msg.type.toString(16))
          }
          break
        case 'await-resp':
          if (msg.type === message.MsgType.resData) {
            this._handleResp(msg)
          } else if (msg.type === message.MsgType.preauthStop) {
            console.log('got stop')
            return this._fail(msg.text)
          } else {
            throw new Error('bad message type: 0x' + msg.type.toString(16))
          }
          break
        default:
          throw new Error('unhandled state: ' + this._state)
      }
    } catch (e) {
      this._fail(e)
    }
  }

  // -- private -- //

  _doAccept (msg) {
    for (let p of this._registeredProxies) {
      if (msg.proxy.toString() !== p.toString()) {
        const session = this._protoStub._mosocket.$resolveProxy(p)
        session.$unregisterMessageHandler(this._messageId)
      }
    }
    this._registeredProxies = []
    this._decidedProxy = msg.proxy

    const session = this._protoStub._mosocket.$resolveProxy(this._decidedProxy)

    const msgs = message.newRequest(this._messageId, this._outData.data)
    msgs.map((msg) => {
      return session.send(msg)
    })

    this._state = 'await-resp'
  }

  async _handleResp (msg) {
    const result = await this._hook.onResponse(msg)
    this._resolve(result)
    this._clean()
  }

  _clean () {
    console.log('CLEANUP msg handler for: ' + this._messageId)

    if (this._decidedProxy) {
      const session = this._protoStub._mosocket.$resolveProxy(this._decidedProxy)
      session.$unregisterMessageHandler(this._messageId)
      this._decidedProxy = null
    }

    for (let p of this._registeredProxies) {
      const session = this._protoStub._mosocket.$resolveProxy(p)
      session.$unregisterMessageHandler(this._messageId)
    }
    this._registeredProxies = null

    this._protoStub = null
    this._hookName = null
    this._hook = null
    this._resolve = null
    this._reject = null

    this._messageId = null
  }

  _fail (e) {
    try {
      this._reject(e)
      this._clean()
    } catch (e) { /* pass */ }
  }
}

/**
 */
class HandlerFirstResponder {
  /**
   */
  constructor (protoStub, hookName, hook) {
    this._protoStub = protoStub
    this._hookName = hookName
    this._hook = hook

    this._state = 'init'
  }

  /**
   */
  async initiate (msg) {
    this._proxy = msg.proxy

    const session = this._protoStub._mosocket.$resolveProxy(msg.proxy)
    this._messageId = msg.msgId
    session.$registerMessageHandler(this._messageId, this)

    try {
      this._preauthMsg = await this._hook.onPreauthReq(msg)
    } catch (e) {
      const stop = message.newPreauthStop(
        this._messageId, e.stack || e.toString())
      session.send(stop)
      this._clean()
      return
    }

    const accept = message.newPreauthAccept(this._messageId)
    session.send(accept)

    this._state = 'await-req'
  }

  /**
   */
  onMessage (msg) {
    try {
      switch (this._state) {
        case 'await-req':
          if (msg.type === message.MsgType.reqData) {
            if (msg.length !== msg.data.byteLength) {
              throw new Error('unimplemented reqDataCont')
            }
            this._handleRequest(msg.data)
          }
          break
        default:
          throw new Error('unhandled state: ' + this._state)
      }
    } catch (e) {
      this._fail(e)
    }
  }

  // -- private -- //

  async _handleRequest (data) {
    const session = this._protoStub._mosocket.$resolveProxy(this._proxy)

    let result = null
    try {
      result = await this._hook.onRequest(
        this._preauthMsg, data)
    } catch (e) {
      const stop = message.newPreauthStop(
        this._messageId, e.stack || e.toString())
      session.send(stop)
      this._clean()
      return
    }

    const msgs = message.newResponse(this._messageId, result)
    msgs.map((msg) => {
      return session.send(msg)
    })

    this._clean()
  }

  _clean () {
    console.log('CLEANUP msg handler for: ' + this._messageId)
    const session = this._protoStub._mosocket.$resolveProxy(this._proxy)
    session.$unregisterMessageHandler(this._messageId)
    this._proxy = null

    this._protoStub = null
    this._hookName = null
    this._hook = null

    this._messageId = null
  }

  _fail (e) {
    this._clean()
    throw e
  }
}

/**
 */
function _installPatternFirst (protoStub, hookName, hook) {
  protoStub[hookName] = (destinations, ...args) => {
    return new Promise((resolve, reject) => {
      try {
        const handler = new HandlerFirstInitiator(
          protoStub, hookName, hook, resolve, reject)
        handler.initiate(destinations, args)
      } catch (e) {
        reject(e)
      }
    })
  }
  protoStub._handlerEntrypoints.set(hookName, async (msg) => {
    const handler = new HandlerFirstResponder(
      protoStub, hookName, hook)
    handler.initiate(msg)
  })
}

/**
 */
function _installPatternNotifyReliable (protoStub, hookName, hook) {
  protoStub[hookName] = async (destinations, ...args) => {
    if (!Array.isArray(destinations)) {
      throw new Error('required `destinations` connection proxy array')
    }
    const data = hook.inputTransform(...args)
    const msg = message.newNoticeReliable(
      protoStub._intTag, hookName, data)
    for (let con of destinations) {
      if (!(con instanceof SessionProxy)) {
        throw new Error('`destinations` array must contain only SessionProxy instances')
      }
      const session = protoStub._mosocket.$resolveProxy(con)
      await session.send(msg)
    }
  }
  protoStub._handlerEntrypoints.set(hookName, hook.onNotifyReliable)
}

/**
 */
exports.create = function protocolCreate (mosocket, def) {
  const protoName = def.name + '/' + def.version
  const intTag = sodium.hash.toInt(sodium.hash.sha256(
    Buffer.from(protoName, 'utf8')))

  const protoStub = new Protocol(
    mosocket, def.name, def.version, protoName, intTag)

  for (let hookName in def.hooks) {
    const hook = def.hooks[hookName]
    switch (hook.pattern) {
      case Patterns.PATTERN_FIRST:
        _installPatternFirst(protoStub, hookName, hook)
        break
      case Patterns.PATTERN_NOTIFY_RELIABLE:
        _installPatternNotifyReliable(protoStub, hookName, hook)
        break
      default:
        throw new Error('unrecognized pattern: ' + hook.pattern)
    }
  }

  return protoStub
}
