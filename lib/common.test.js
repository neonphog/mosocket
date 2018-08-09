const expect = require('chai').expect
const { SessionProxy } = require('./common')

describe('common Suite', () => {
  describe('SessionProxy Suite', () => {
    it('should be a function', () => {
      expect(typeof SessionProxy).equals('function')
    })

    it('should base64', () => {
      expect(new SessionProxy(Buffer.from([1, 2])).toString()).equals(
        'AQI=')
    })

    it('should base64 toJSON', () => {
      expect(new SessionProxy(Buffer.from([1, 2])).toJSON()).equals(
        'AQI=')
    })
  })
})
