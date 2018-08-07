/**
 */
class SessionProxy {
  /**
   */
  constructor (sessionId) {
    this._sessionId = Buffer.from(sessionId)
  }

  /**
   */
  toString () {
    return this._sessionId.toString('base64')
  }

  /**
   */
  toJSON () {
    return this.toString()
  }
}

exports.SessionProxy = SessionProxy
