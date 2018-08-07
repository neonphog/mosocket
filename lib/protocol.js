const EventEmitter = require('events')

const sodium = require('./sodium')
const message = require('./message')

const { HookCmd, SessionProxy } = require('./common')

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
function _installPatternFirst (protoStub, hookName, hook) {
  protoStub[hookName] = async (destinations, ...args) => {
    if (!Array.isArray(destinations)) {
      throw new Error('required `destinations` connection proxy array')
    }
    const data = hook.inputTransform(...args)

    for (let con of destinations) {
      if (!(con instanceof SessionProxy)) {
        throw new Error('`destinations` array must contain only SessionProxy instances')
      }
      const session = protoStub._mosocket.$resolveProxy(con)
      const messageId = session.$nextMessageId()

      const msg = message.newPreauthReq(
        protoStub._intTag, messageId, hookName, data.preauthData)
      await session.send(msg)

      session.$enqueueHandler((msg) => {
        if (msg.type !== message.MsgType.preauthAck) {
          throw new Error('unexpected msgtype: 0x' + msg.type.toString(16))
        }
        if (msg.msgId !== messageId) {
          throw new Error('messageid mismatch, got ' + msg.msgId + ', expected: ' + messageId)
        }
        console.log('received preauth ack')
        return { cmd: HookCmd.next }
      })

      session.$enqueueHandler(async (msg) => {
        if (msg.type === message.MsgType.preauthAck) {
          return { cmd: HookCmd.wait }
        } else if (msg.type === message.MsgType.preauthAccept) {
          if (msg.msgId !== messageId) {
            throw new Error('messageid mismatch, got ' + msg.msgId + ', expected: ' + messageId)
          }
          console.log('got accept', msg)
          const msgs = message.newRequest(messageId, data.data)
          await Promise.all(msgs.map((msg) => {
            return session.send(msg)
          }))

          session.$enqueueHandler(async (msg) => {
            if (msg.type !== message.MsgType.resData) {
              throw new Error('unexpected msgtype: 0x' + msg.type.toString(16))
            }
            if (msg.msgId !== messageId) {
              throw new Error('messageid mismatch, got ' + msg.msgId + ', expected: ' + messageId)
            }
            console.log('GOT RESPONSE', msg)

            return { cmd: HookCmd.next }
          })

          return { cmd: HookCmd.next }
        } else if (msg.type === message.MsgType.preauthStop) {
          if (msg.msgId !== messageId) {
            throw new Error('messageid mismatch, got ' + msg.msgId + ', expected: ' + messageId)
          }
          console.log('got stop', msg)
          return { cmd: HookCmd.next }
        }
        throw new Error('unexpected msgtype: 0x' + msg.type.toString(16))
      })
    }
  }
  protoStub._handlerEntrypoints.set(hookName, async (msg) => {
    const session = protoStub._mosocket.$resolveProxy(msg.proxy)
    const messageId = msg.msgId

    const ack = message.newPreauthAck(messageId)
    await session.send(ack)

    const result = await hook.onPreauthReq(msg)
    if (result.preauth) {
      console.log('preauth-accept', result.data)
      const accept = message.newPreauthAccept(messageId)
      await session.send(accept)

      const invokeDataHook = async (fullData) => {
        console.log('got full data', fullData.byteLength)
        const result = await hook.onRequest(msg, fullData)
        console.log('got result from onRequest', result)
        const msgs = message.newResponse(messageId, result.data)
        await Promise.all(msgs.map((msg) => {
          return session.send(msg)
        }))
      }

      session.$enqueueHandler(async (msg) => {
        if (msg.type !== message.MsgType.reqData) {
          throw new Error('unexpected msgtype: 0x' + msg.type.toString(16))
        }

        let fullData = msg.data
        const waitLength = msg.length

        if (fullData.byteLength === waitLength) {
          invokeDataHook(fullData)
        } else {
          console.log('waiting for more', waitLength)
          session.$enqueueHandler(async (msg) => {
            if (msg.type !== message.MsgType.reqDataCont) {
              throw new Error('unexpected msgtype: 0x', + msg.type.toString(16))
            }

            fullData = Buffer.concat([fullData, msg.data])

            if (fullData.byteLength === waitLength) {
              invokeDataHook(fullData)
              return { cmd: HookCmd.next }
            } else {
              console.log('waiting for more', waitLength)
              return { cmd: HookCmd.wait }
            }
          })
        }

        return { cmd: HookCmd.next }
      })
    } else {
      console.log('preauth-stop', result.data)
    }
  })
}

/**
 */
function _installPatternNotifyReliable (protoStub, hookName, hook) {
  protoStub[hookName] = async (destinations, ...args) => {
    if (!Array.isArray(destinations)) {
      throw new Error('required `destinations` connection proxy array')
    }
    const data = hook.inputTransform ?
      hook.inputTransform(...args) :
      msgpack.encode(args)
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
