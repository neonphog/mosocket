const sodium = require('sodium-native')

/**
 */
class SecBuf {
  /**
   */
  constructor (len) {
    this._ = sodium.sodium_malloc(32)
    sodium.sodium_mlock(this._, 32)
    sodium.sodium_mprotect_noaccess(this._)
  }

  /**
   */
  free () {
    sodium.sodium_mprotect_readwrite(this._)
    sodium.sodium_memzero(this._)
    sodium.sodium_munlock(this._)
    this._ = null
  }

  /**
   */
  randomize () {
    sodium.sodium_mprotect_readwrite(this._)
    sodium.randombytes_buf(this._)
    sodium.sodium_mprotect_noaccess(this._)
  }

  /**
   */
  readable (fn) {
    sodium.sodium_mprotect_readonly(this._)
    try {
      fn(this._)
      sodium.sodium_mprotect_noaccess(this._)
    } catch (e) {
      sodium.sodium_mprotect_noaccess(this._)
      throw e
    }
  }

  /**
   */
  writable (fn) {
    sodium.sodium_mprotect_readwrite(this._)
    try {
      fn(this._)
      sodium.sodium_mprotect_noaccess(this._)
    } catch (e) {
      sodium.sodium_mprotect_noaccess(this._)
      throw e
    }
  }
}

exports.SecBuf = SecBuf

exports.hash = {
  /**
   */
  sha256: function hashSha256 (input) {
    if (!(input instanceof Buffer)) {
      throw new Error('input must be a Buffer')
    }
    const output = Buffer.alloc(sodium.crypto_hash_sha256_BYTES)
    sodium.crypto_hash_sha256(output, input)
    return output
  },

  /**
   */
  sha512: function hashSha512 (input) {
    if (!(input instanceof Buffer)) {
      throw new Error('input must be a Buffer')
    }
    const output = Buffer.alloc(sodium.crypto_hash_sha512_BYTES)
    sodium.crypto_hash_sha512(output, input)
    return output
  }
}

exports.random = {
  /**
   */
  bytes: function randomBytes (count) {
    const output = Buffer.alloc(count)
    sodium.randombytes_buf(output)
    return output
  }
}

exports.kx = {
  /**
   */
  keypair: function kxKeypair () {
    const pk = Buffer.alloc(sodium.crypto_kx_PUBLICKEYBYTES)
    const sk = new SecBuf(sodium.crypto_kx_SECRETKEYBYTES)

    sk.writable((_sk) => {
      sodium.crypto_kx_keypair(pk, _sk)
    })

    return {
      publicKey: pk,
      secretKey: sk
    }
  },

  /**
   */
  clientSession: function kxClientSession (cliPublic, cliSecret, srvPublic) {
    if (!(cliPublic instanceof Buffer)) {
      throw new Error('cliPublic must be a Buffer')
    }
    if (!(srvPublic instanceof Buffer)) {
      throw new Error('srvPublic must be a Buffer')
    }
    if (!(cliSecret instanceof SecBuf)) {
      throw new Error('cliSecret must be a SecBuf')
    }

    const rx = new SecBuf(sodium.crypto_kx_SESSIONKEYBYTES)
    const tx = new SecBuf(sodium.crypto_kx_SESSIONKEYBYTES)

    rx.writable((_rx) => {
      tx.writable((_tx) => {
        cliSecret.readable((_cliSecret) => {
          sodium.crypto_kx_client_session_keys(
            _rx, _tx, cliPublic, _cliSecret, srvPublic)
        })
      })
    })

    return { rx, tx }
  },

  /**
   */
  serverSession: function kxServerSession (srvPublic, srvSecret, cliPublic) {
    if (!(srvPublic instanceof Buffer)) {
      throw new Error('srvPublic must be a Buffer')
    }
    if (!(cliPublic instanceof Buffer)) {
      throw new Error('cliPublic must be a Buffer')
    }
    if (!(srvSecret instanceof SecBuf)) {
      throw new Error('srvSecret must be a SecBuf')
    }

    const rx = new SecBuf(sodium.crypto_kx_SESSIONKEYBYTES)
    const tx = new SecBuf(sodium.crypto_kx_SESSIONKEYBYTES)

    rx.writable((_rx) => {
      tx.writable((_tx) => {
        srvSecret.readable((_srvSecret) => {
          sodium.crypto_kx_server_session_keys(
            _rx, _tx, srvPublic, _srvSecret, cliPublic)
        })
      })
    })

    return { rx, tx }
  }
}

exports.secretBox = {
  /**
   */
  enc: function secretBoxEnc (message, secret) {
    if (!(message instanceof Buffer)) {
      throw new Error('message must be a Buffer')
    }
    if (!(secret instanceof SecBuf)) {
      throw new Error('secret must be a SecBuf')
    }

    const nonce = exports.random.bytes(sodium.crypto_secretbox_NONCEBYTES)

    const cipher = Buffer.alloc(message.byteLength + sodium.crypto_secretbox_MACBYTES)

    secret.readable((_secret) => {
      sodium.crypto_secretbox_easy(cipher, message, nonce, _secret)
    })

    return { nonce, cipher }
  },

  /**
   */
  dec: function secretBoxDec (nonce, cipher, secret) {
    if (!(nonce instanceof Buffer)) {
      throw new Error('nonce must be a Buffer')
    }
    if (!(cipher instanceof Buffer)) {
      throw new Error('cipher must be a Buffer')
    }
    if (!(secret instanceof SecBuf)) {
      throw new Error('secret must be a SecBuf')
    }

    const message = Buffer.alloc(cipher.byteLength - sodium.crypto_secretbox_MACBYTES)

    secret.readable((_secret) => {
      sodium.crypto_secretbox_open_easy(message, cipher, nonce, _secret)
    })

    return message
  }
}
