#!/usr/bin/env node
'use strict'

/*
const mosocket = require('../lib/index')

mosocket.test().then(() => {}, (err) => {
  console.error(err)
  process.exit(1)
})
*/

const { MultiAddr } = require('../lib/multiaddr')
const config = require('../lib/config')()
const tcp = require('../lib/tcp')

async function _main () {
  const ma = new MultiAddr('/ip4/127.0.0.1/tcp/11011/udp/11012')

  const srv = await tcp.Listener.create(config, ma)

  const cli = await tcp.Connection.create(config, ma)

  console.log('connected!')
  cli.close()
  srv.close()
}

_main().then(() => {}, (err) => {
  console.error(err)
  process.exit(1)
})
