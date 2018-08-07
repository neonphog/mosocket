const EventEmitter = require('events')

const sodium = require('./sodium')
const message = require('./message')

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
  constructor (name, version, protoName, intTag) {
    super()
    this._name = name
    this._version = version
    this._protoName = protoName
    this._intTag = intTag
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
}

const HookCmd = {
  next: 'next',
  wait: 'wait',
  complete: 'complete'
}

/**
 */
/*
function _installPatternFirst (protoStub, hookName, hook) {
  protoStub[hookName] = (destinations, preData, data) => {
    const cbPreData = typeof preData === 'function' ? preData : () => preData
    const cbData = typeof data === 'function' ? data : () => data
    const msgId = this.$getMsgId()
    this.$enqueueCall([
      (cons) => {
        // send the preauth-req
        for (let con of cons) {
          con.send(Message.newPreauthReq(
            protoStub._intTag, msgId, hookName, cbPreData()))
        }
        return { cmd: HookCmd.next }
      },
      (cons) => {
        // await the preauth-ack
        return { cmd: HookCmd.wait }
      },
      (cons) => {
        // await the preauth-accept
        return { cmd: HookCmd.wait }
      },
      (cons) => {
        // send the data
        for (let con of cons) {
          con.send(Message.newReqData(
            msgId, cbData()))
        }
        return { cmd: HookCmd.next }
      },
      (cons) => {
        // await the response
        return { cmd: HookCmd.complete, data: Buffer.from('test') }
      }
    ])
  }
}
*/

/**
 */
function _installPatternNotifyReliable (protoStub, hookName, hook) {
  protoStub[hookName] = (destinations, data) => {
    const cbData = typeof data === 'function' ? data : () => data
    protoStub.$enqueueCall([
      (cons) => {
        const msg = message.newNotifyReliable(
          protoStub._intTag, hookName, cbData())
        for (let con of cons) {
          con.send(msg)
        }
        return { cmd: HookCmd.complete }
      }
    ])
    protoStub.$onUnsolicited([
      (msg, con) => {
        protoStub.$invokeHookCb(hook.onNotifyReliable, msg, con)
      }
    ])
  }
}

/**
 */
exports.create = function protocolCreate (def) {
  const protoName = def.name + '/' + def.version
  const intTag = sodium.hash.toInt(sodium.hash.sha256(
    Buffer.from(protoName, 'utf8')))

  const protoStub = new Protocol(def.name, def.version, protoName, intTag)

  for (let hookName in def.hooks) {
    const hook = def.hooks[hookName]
    switch (hook.pattern) {
      // case Patterns.PATTERN_FIRST:
      //    _installPatternFirst(protoStub, hookName, hook)
      //    break
      case Patterns.PATTERN_NOTIFY_RELIABLE:
        _installPatternNotifyReliable(protoStub, hookName, hook)
        break
      default:
        throw new Error('unrecognized pattern: ' + hook.pattern)
    }
  }

  return protoStub
}
