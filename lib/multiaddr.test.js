const expect = require('chai').expect
const { MultiAddr } = require('./multiaddr')

describe('multi-address Suite', () => {
  it('should be a function', () => {
    expect(typeof MultiAddr).equals('function')
  })

  it('full loop blank', () => {
    const ma = new MultiAddr('')
    expect(ma.toString()).equals('')
  })

  it('full loop blank (toJSON)', () => {
    const ma = new MultiAddr('')
    expect(ma.toJSON()).equals('')
  })

  it('full loop', () => {
    const ma = new MultiAddr('/ip4/0.0.0.0/tcp/0/udp/0')
    expect(ma.toString()).equals('/ip4/0.0.0.0/tcp/0/udp/0')
  })

  it('full loop v6', () => {
    const ma = new MultiAddr('/ip6/::/tcp/0/udp/0')
    expect(ma.toString()).equals('/ip6/::/tcp/0/udp/0')
  })

  it('should throw on bad type', () => {
    expect(() => { return new MultiAddr('/bad/0.0.0.0') }).throws()
  })
})
