#!/usr/bin/env node
'use strict'

const mosocket = require('../lib/index')

mosocket.test().then(() => {}, (err) => {
  console.error(err)
  process.exit(1)
})
