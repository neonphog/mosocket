#!/usr/bin/env node
'use strict'

const msgpack = require('msgpack-lite')

/*
const mosocket = require('../lib/index')

mosocket.test().then(() => {}, (err) => {
  console.error(err)
  process.exit(1)
})
*/

const { MoSocket } = require('../lib/mosocket')
// const { MultiAddr } = require('../lib/multiaddr')
const config = require('../lib/config')()
// const tcp = require('../lib/tcp')

class MyProto {
  onPaperAirplane (style, color) {
    console.log('got paper airplane, style: ' + style + ', color: ' + color)
  }

  async onMakeSandwichPreauth (cheese) {
    console.log('makeSandwichPreauth', 'cheese:', cheese)
    if (cheese) {
      throw new Error('we have no cheese')
    }
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
    console.log('got makeSandwich result, cheese: ' + cheese + ', filler: ' + filler)
  }
}

class MyNode extends MoSocket {
  constructor (...args) {
    super(...args)
    this.on('bind', (addr) => {
      console.log('node listening at', addr)
    })

    const $proto$ = new MyProto()

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
            $proto$.onPaperAirplane(msg.style, msg.color)
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
            msg = msgpack.decode(msg.data)
            try {
              await $proto$.onMakeSandwichPreauth(msg)
              return {
                preauth: true,
                data: null
              }
            } catch (e) {
              return {
                preauth: false,
                data: msgpack.encode(e.stack)
              }
            }
          },
          onRequest: async (msg, data) => {
            msg = msgpack.decode(msg.data)
            data = msgpack.decode(data)
            try {
              const result = await $proto$.onMakeSandwichData(msg, data)
              return {
                success: true,
                data: msgpack.encode(data)
              }
            } catch (e) {
              return {
                success: false,
                data: msgpack.encode(e.stack)
              }
            }
          },
          onResponse: async (msg) => {
            msg = msgpack.decode(msg.data)
            onMakeSandwichResult(msg.cheese, msg.filler)
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
  await node2.myproto.makeSandwich([remote], false, 'avacado')

  setTimeout(() => {
    node1.close()
    node2.close()
  }, 3000)

  /*
  const ma = new MultiAddr('/ip4/127.0.0.1/tcp/11011/udp/11012')

  const srv = await tcp.Listener.create(config, ma)
  srv.on('connection', (con) => {
    con.on('message', (msg) => {
      console.log('msg:', msg.toString())
    })
    con.send(Buffer.from('test back'))
  })

  const cli = await tcp.Connection.create(config, ma)
  cli.on('message', (msg) => {
    console.log('msg back:', msg.toString())
  })

  cli.send(Buffer.from('hello'))

  setTimeout(() => {
    cli.close()
    srv.close()
  }, 1000)
  */
}

_main().then(() => {}, (err) => {
  console.error(err)
  process.exit(1)
})
