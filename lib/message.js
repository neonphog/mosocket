const msgpack = require('msgpack-lite')

const MsgType = {
  keepAlive: 0x00,

  noticeReliable: 0x10,
  noticeUnreliable: 0x11,

  preauthReq: 0x20,
  preauthAck: 0x21,
  preauthAccept: 0x22,
  preauthStop: 0x23,

  reqData: 0x30,
  reqDataCont: 0x31,

  resData: 0x40,
  resDataCont: 0x41
}

exports.newNoticeReliable = function newNoticeReliable (protoHash, hookName, data) {
  return Buffer.concat([
    Buffer.from([MsgType.noticeReliable]),
    msgpack.encode([protoHash, hookName, data])
  ])
}

exports.parse = function parse (buffer) {
  const msgType = buffer.readUInt8(0)
  switch (msgType) {
    case MsgType.noticeReliable:
      const data = msgpack.decode(buffer.slice(1))
      return {
        type: msgType,
        protoHash: data[0],
        hookName: data[1],
        data: data[2]
      }
    default:
      throw new Error('unhandled msgtype: ' + msgType)
  }
}
