#!/usr/bin/env node
'use strict'

const msgpack = require('msgpack-lite')

const { MoSocket } = require('../lib/mosocket')
const config = require('../lib/config')()

class MyProto {
  onPaperAirplane (style, color) {
    return JSON.stringify({ style, color })
  }

  async onMakeSandwichPreauth (cheese) {
    if (cheese) {
      throw new Error('we have no cheese')
    }
    return { cheese: false }
  }

  async onMakeSandwichData (cheese, filler) {
    if (cheese) {
      throw new Error('how did we request cheese? should have been rejected in preauth')
    }
    if (filler === 'salami') {
      throw new Error('we have no salami')
    }
    return { cheese, filler }
  }

  onMakeSandwichResult (cheese, filler) {
    return { cheese, filler }
  }
}

class MyNode extends MoSocket {
  constructor (config) {
    super(config)

    const $proto$ = new MyProto()

    this.on('bind', (addr) => {
      console.log('node listening at', addr)
    })

    this.myproto = this.installProtocol({
      name: 'MyProto',
      version: '0.0.1',
      hooks: {
        paperAirplane: {
          pattern: MoSocket.PATTERN_NOTIFY_RELIABLE,
          inputTransform: (style, color) => {
            return msgpack.encode({
              style,
              color
            })
          },
          onNotifyReliable: (msg) => {
            msg = msgpack.decode(msg.data)
            console.log('## paperAirplane')
            console.log('<- ' +
              $proto$.onPaperAirplane(msg.style, msg.color))
          }
        },
        makeSandwich: {
          pattern: MoSocket.PATTERN_FIRST,
          inputTransform: (cheese, filler) => {
            return {
              preauthData: msgpack.encode(cheese),
              data: msgpack.encode(filler)
            }
          },
          onPreauthReq: async (msg) => {
            console.log('## makeSandwich onPreauthReq')
            msg = msgpack.decode(msg.data)
            console.log('<- ' + JSON.stringify(msg))
            const result = await $proto$.onMakeSandwichPreauth(msg)
            console.log('-> ' + JSON.stringify(result))
            return result
          },
          onRequest: async (preData, data) => {
            console.log('## makeSandwich onRequest')
            data = msgpack.decode(data)
            console.log('<- ' + JSON.stringify(data))
            const result = await $proto$.onMakeSandwichData(
              preData.cheese, data)
            console.log('-> ' + JSON.stringify(result))
            return msgpack.encode(result)
          },
          onResponse: async (msg) => {
            console.log('## makeSandwich onResponse')
            msg = msgpack.decode(msg.data)
            console.log('<- ' + JSON.stringify(msg))
            const result = $proto$.onMakeSandwichResult(msg.cheese, msg.filler)
            console.log('-> ' + JSON.stringify(result))
            return result
          }
        }
      }
    })
  }
}

async function _main () {
  const node1 = new MyNode(config)
  node1.on('bind', (addr) => {
    console.log('node listening at', addr)
  })
  node1.on('connection', (proxy) => {
    console.log('got connection:', proxy.toString(), node1.getAddr(proxy))
    node1.myproto.paperAirplane([proxy], 'wide', 'green')
  })

  await node1.bind()

  const addr = node1.getListeningAddrs()[0]
  console.log('attempting to connect to', addr)

  const node2 = new MyNode(config)

  const remote = await node2.connect(addr)
  console.log('connected:', remote.toString(), node2.getAddr(remote))

  await node2.myproto.paperAirplane([remote], 'slim', 'yellow')
  let sandwich = await node2.myproto.makeSandwich([remote], false, 'avacado')
  console.log('test got makeSandwich result1:', sandwich)

  let success = false
  try {
    sandwich = await node2.myproto.makeSandwich([remote], true, 'avacado')
  } catch (e) {
    console.log('result2 success - server has no cheese')
    success = true
  }
  if (!success) {
    throw new Error('expected the server to have no cheese')
  }

  success = false
  try {
    sandwich = await node2.myproto.makeSandwich([remote], false, 'salami')
  } catch (e) {
    console.log('result3 success - server has no salami')
    success = true
  }
  if (!success) {
    throw new Error('expected the server to have no salami')
  }

  node1.close()
  node2.close()
}

_main().then(() => {}, (err) => {
  console.error(err.stack || err.toString())
  process.exit(1)
})
