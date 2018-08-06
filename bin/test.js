#!/usr/bin/env node
'use strict'

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

async function _main () {
  const node1 = new MoSocket(config)
  node1.on('bind', (addr) => {
    console.log('node listening at', addr)
  })

  await node1.bind()

  const addr = node1.getListeningAddrs()[0]
  console.log('attempting to connect to', addr)

  const node2 = new MoSocket(config)

  await node2.connect(addr)

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
