const expect = require('chai').expect
const sodium = require('./sodium')

describe('sodium wrapper Suite', () => {
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

  it('should random bytes', () => {
    expect(sodium.random.bytes(4).length).equals(4)
  })
})
