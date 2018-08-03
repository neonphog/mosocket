const sodium = require('sodium-native')

exports.hash = {
  /**
   */
  sha256: function sha256 (input) {
    if (!(input instanceof Buffer)) {
      throw new Error('input must be a buffer')
    }
    const output = Buffer.alloc(sodium.crypto_hash_sha256_BYTES)
    sodium.crypto_hash_sha256(output, input)
    return output
  },

  /**
   */
  sha512: function sha512 (input) {
    if (!(input instanceof Buffer)) {
      throw new Error('input must be a buffer')
    }
    const output = Buffer.alloc(sodium.crypto_hash_sha512_BYTES)
    sodium.crypto_hash_sha512(output, input)
    return output
  }
}

exports.random = {
  /**
   */
  bytes: function bytes (count) {
    const output = Buffer.alloc(count)
    sodium.randombytes_buf(output)
    return output
  }
}
