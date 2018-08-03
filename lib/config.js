const sodium = require('./sodium')

module.exports = () => ({
  keys: {
    kx: sodium.kx.keypair()
  },
  timeout: {
    newConnection: 1000
  }
})
