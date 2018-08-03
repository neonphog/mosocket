/**
 */
class MultiAddr {
  /**
   */
  constructor (str) {
    this.parse(str || '')
  }

  /**
   */
  clear () {
    this.ipFamily = null // 4 or 6
    this.ipAddress = null
    this.tcpPort = null
    this.udpPort = null
  }

  /**
   */
  parse (str) {
    this.clear()
    const parts = str.split('/')
    for (let i = 1; i < parts.length; ++i) {
      switch (parts[i]) {
        case 'ip4':
          this.ipFamily = 4
          this.ipAddress = parts[++i]
          break
        case 'ip6':
          this.ipFamily = 6
          this.ipAddress = parts[++i]
          break
        case 'tcp':
          this.tcpPort = parseInt(parts[++i], 10)
          break
        case 'udp':
          this.udpPort = parseInt(parts[++i], 10)
          break
        default:
          throw new Error('unhandled multiaddr type: ' + parts[i])
      }
    }
  }

  /**
   */
  toString () {
    let out = ''
    if (this.ipFamily && this.ipAddress) {
      out += '/' + (this.ipFamily === 6 ? 'ip6' : 'ip4') +
        '/' + this.ipAddress
    }
    if (typeof this.tcpPort === 'number') {
      out += '/tcp/' + this.tcpPort
    }
    if (typeof this.udpPort === 'number') {
      out += '/udp/' + this.udpPort
    }
    return out
  }

  /**
   */
  toJSON () {
    return this.toString()
  }
}

exports.MultiAddr = MultiAddr
