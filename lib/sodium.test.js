const expect = require('chai').expect
const sodium = require('./sodium')

function unsecret (secbuf, free) {
  let out = ''
  secbuf.readable((_secbuf) => {
    out = _secbuf.toString('base64')
  })
  if (free) {
    secbuf.free()
  }
  return out
}

describe('sodium wrapper Suite', () => {
  describe('hash Suite', () => {
    it('should throw on bad sha256 input', () => {
      expect(() => sodium.hash.sha256('yo')).throws()
    })

    it('should sha256', () => {
      expect(sodium.hash.sha256(Buffer.from('yo')).toString('base64'))
        .equals('6QWKsZj2kI9wIRGwwPtbNvmdAFVFIYhsQOKJGzSdx6E=')
    })

    it('should throw on bad sha512 input', () => {
      expect(() => sodium.hash.sha512('yo')).throws()
    })

    it('should sha512', () => {
      expect(sodium.hash.sha512(Buffer.from('yo')).toString('base64'))
        .equals('dMR97MZP2SEplWf19kZ4YNyRec4ucjBIwYT98v1qMpNkcOzD1jm2lH6Z+cQnNe0gVSvhT9okCErXlicZWso/sQ==')
    })

    it('should toInt a 256 bit hash', () => {
      expect(sodium.hash.toInt(Buffer.from('6QWKsZj2kI9wIRGwwPtbNvmdAFVFIYhsQOKJGzSdx6E=', 'base64'))).equals(999746057)
    })

    it('should toInt a 512 bit hash', () => {
      expect(sodium.hash.toInt(Buffer.from('dMR97MZP2SEplWf19kZ4YNyRec4ucjBIwYT98v1qMpNkcOzD1jm2lH6Z+cQnNe0gVSvhT9okCErXlicZWso/sQ==', 'base64'))).equals(-1585257654)
    })
  })

  describe('SecBuf Suite', () => {
    it('readable should propagate throw', () => {
      const sb = new sodium.SecBuf(1)
      expect(() => {
        sb.readable(() => { throw new Error('e') })
      }).throws()
      sb.free()
    })

    it('writable should propagate throw', () => {
      const sb = new sodium.SecBuf(1)
      expect(() => {
        sb.writable(() => { throw new Error('e') })
      }).throws()
      sb.free()
    })
  })

  describe('random Suite', () => {
    it('should random bytes', () => {
      expect(sodium.random.bytes(4).length).equals(4)
    })
  })

  describe('kx Suite', () => {
    it('should generate keypair', () => {
      const { publicKey, secretKey } = sodium.kx.keypair()
      expect(publicKey.byteLength).equals(32)
      expect(secretKey._.byteLength).equals(32)
      secretKey.free()
    })

    it('should keyexchange', () => {
      const { publicKey: cliPub, secretKey: cliSec } =
        sodium.kx.keypair()
      const { publicKey: srvPub, secretKey: srvSec } =
        sodium.kx.keypair()

      let { rx: cliRx, tx: cliTx } =
        sodium.kx.clientSession(cliPub, cliSec, srvPub)
      let { rx: srvRx, tx: srvTx } =
        sodium.kx.serverSession(srvPub, srvSec, cliPub)

      cliSec.free()
      srvSec.free()

      cliRx = unsecret(cliRx, true)
      cliTx = unsecret(cliTx, true)
      srvRx = unsecret(srvRx, true)
      srvTx = unsecret(srvTx, true)

      expect(cliRx).equals(srvTx)
      expect(cliTx).equals(srvRx)
    })
  })

  describe('secretBox Suite', () => {
    it('should encrypt and decrypt', () => {
      const secret = new sodium.SecBuf(32)
      secret.randomize()

      const { nonce, cipher } = sodium.secretBox.enc(
        Buffer.from('hello'), secret)

      const message = sodium.secretBox.dec(nonce, cipher, secret).toString()

      secret.free()

      expect(message).equals('hello')
    })
  })
})
