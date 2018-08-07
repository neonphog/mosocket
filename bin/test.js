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
          onNotifyReliable: (msg, con) => {
            msg = msgpack.decode(msg)
            $proto$.onPaperAirplane(msg.style, msg.color)
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

  await node1.bind()

  const addr = node1.getListeningAddrs()[0]
  console.log('attempting to connect to', addr)

  const node2 = new MyNode(config)

  await node2.connect(addr)

  await node2.myproto.paperAirplane('slim', 'yellow')

  setTimeout(() => {
    node1.close()
    node2.close()
  }, 1000)

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
