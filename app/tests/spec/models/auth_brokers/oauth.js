/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define([
  'chai',
  'sinon',
  'lib/session',
  'lib/promise',
  'lib/constants',
  'lib/oauth-client',
  'lib/assertion',
  'lib/auth-errors',
  'lib/oauth-errors',
  'models/reliers/relier',
  'models/user',
  'models/auth_brokers/oauth'
],
function (chai, sinon, Session, p, Constants, OAuthClient, Assertion, AuthErrors,
      OAuthErrors, Relier, User, OAuthAuthenticationBroker) {
  'use strict';

  var assert = chai.assert;

  var HEX_CHARSET = '0123456789abcdef';
  function generateOAuthCode() {
    var code = '';

    for (var i = 0; i < 64; ++i) {
      code += HEX_CHARSET.charAt(Math.floor(Math.random() * 16));
    }

    return code;
  }

  var VALID_OAUTH_CODE = generateOAuthCode();
  var VALID_OAUTH_CODE_REDIRECT_URL = 'https://127.0.0.1:8080?state=state&code=' + VALID_OAUTH_CODE;
  var INVALID_OAUTH_CODE_REDIRECT_URL = 'https://127.0.0.1:8080?code=code&state=state';

  describe('models/auth_brokers/oauth', function () {
    var broker;
    var oAuthClient;
    var assertionLibrary;
    var relier;
    var user;
    var account;

    beforeEach(function () {
      oAuthClient = new OAuthClient();
      sinon.stub(oAuthClient, 'getCode', function () {
        return p({
          redirect: VALID_OAUTH_CODE_REDIRECT_URL
        });
      });

      assertionLibrary = new Assertion({});
      sinon.stub(assertionLibrary, 'generate', function () {
        return p('assertion');
      });

      relier = new Relier();
      relier.set({
        webChannelId: 'webChannelId',
        clientId: 'clientId',
        state: 'state',
        scope: 'scope',
        action: 'action'
      });

      user = new User();

      account = user.initAccount({
        sessionToken: 'abc123'
      });

      broker = new OAuthAuthenticationBroker({
        session: Session,
        assertionLibrary: assertionLibrary,
        oAuthClient: oAuthClient,
        relier: relier
      });

      sinon.spy(broker, 'finishOAuthFlow');
    });

    describe('sendOAuthResultToRelier', function () {
      it('must be overridden', function () {
        return broker.sendOAuthResultToRelier()
          .then(assert.fail, function (err) {
            assert.ok(err);
          });
      });
    });

    describe('afterSignIn', function () {
      it('calls sendOAuthResultToRelier with the correct options', function () {
        sinon.stub(broker, 'sendOAuthResultToRelier', function () {
          return p();
        });

        return broker.afterSignIn(account)
          .then(function () {
            assert.isTrue(broker.finishOAuthFlow.calledWith(account, {
              action: Constants.OAUTH_ACTION_SIGNIN
            }));
            assert.isTrue(broker.sendOAuthResultToRelier.calledWith({
              redirect:  VALID_OAUTH_CODE_REDIRECT_URL,
              action: Constants.OAUTH_ACTION_SIGNIN,
              state: 'state',
              code: VALID_OAUTH_CODE
            }));
          });
      });

      it('returns any errors returned by getOAuthResult', function () {
        sinon.stub(broker, 'getOAuthResult', function () {
          return p.reject(new Error('uh oh'));
        });

        return broker.afterSignIn(account)
          .then(assert.fail, function (err) {
            assert.equal(err.message, 'uh oh');
          });
      });
    });

    describe('persist', function () {
      it('saves OAuth params to session', function () {
        return broker.persist()
          .then(function () {
            assert.ok(!! Session.oauth);
          });
      });
    });

    describe('afterSignUpConfirmationPoll', function () {
      it('calls sendOAuthResultToRelier with the correct options', function () {
        sinon.stub(broker, 'sendOAuthResultToRelier', function () {
          return p();
        });

        return broker.afterSignUpConfirmationPoll(account)
          .then(function () {
            assert.isTrue(broker.finishOAuthFlow.calledWith(account, {
              action: Constants.OAUTH_ACTION_SIGNUP
            }));
            assert.isTrue(broker.sendOAuthResultToRelier.calledWith({
              redirect:  VALID_OAUTH_CODE_REDIRECT_URL,
              action: Constants.OAUTH_ACTION_SIGNUP,
              state: 'state',
              code: VALID_OAUTH_CODE
            }));
          });
      });
    });

    describe('afterResetPasswordConfirmationPoll', function () {
      it('calls sendOAuthResultToRelier with the expected options', function () {
        sinon.stub(broker, 'sendOAuthResultToRelier', function () {
          return p();
        });

        return broker.afterResetPasswordConfirmationPoll(account)
          .then(function () {
            assert.isTrue(broker.finishOAuthFlow.calledWith(account, {
              action: Constants.OAUTH_ACTION_SIGNIN
            }));
            assert.isTrue(broker.sendOAuthResultToRelier.calledWith({
              redirect:  VALID_OAUTH_CODE_REDIRECT_URL,
              action: Constants.OAUTH_ACTION_SIGNIN,
              state: 'state',
              code: VALID_OAUTH_CODE
            }));
          });
      });
    });

    describe('getOAuthResult', function () {
      it('gets an object with the OAuth login information', function () {
        return broker.getOAuthResult(account)
          .then(function (result) {
            assert.isTrue(assertionLibrary.generate.calledWith(account.get('sessionToken')));
            assert.equal(result.redirect, VALID_OAUTH_CODE_REDIRECT_URL);
            assert.equal(result.state, 'state');
            assert.equal(result.code, VALID_OAUTH_CODE);
          });
      });

      it('passes on errors from assertion generation', function () {
        assertionLibrary.generate.restore();
        sinon.stub(assertionLibrary, 'generate', function () {
          return p.reject(new Error('uh oh'));
        });

        return broker.getOAuthResult(account)
          .then(assert.fail, function (err) {
            assert.equal(err.message, 'uh oh');
          });
      });

      it('passes on errors from oAuthClient.getCode', function () {
        oAuthClient.getCode.restore();
        sinon.stub(oAuthClient, 'getCode', function () {
          return p.reject(new Error('uh oh'));
        });

        return broker.getOAuthResult(account)
          .then(assert.fail, function (err) {
            assert.equal(err.message, 'uh oh');
          });
      });

      it('throws an error if oAuthClient.getCode returns nothing', function () {
        oAuthClient.getCode.restore();
        sinon.stub(oAuthClient, 'getCode', function () {
          return;
        });

        return broker.getOAuthResult(account)
          .then(assert.fail, function (err) {
            assert.isTrue(OAuthErrors.is(err, 'INVALID_RESULT'));
          });
      });

      it('throws an error if oAuthClient.getCode returns an empty object', function () {
        oAuthClient.getCode.restore();
        sinon.stub(oAuthClient, 'getCode', function () {
          return {};
        });

        return broker.getOAuthResult(account)
          .then(assert.fail, function (err) {
            assert.isTrue(OAuthErrors.is(err, 'INVALID_RESULT_REDIRECT'));
          });
      });

      it('throws an error if oAuthClient.getCode returns an invalid code', function () {
        oAuthClient.getCode.restore();
        sinon.stub(oAuthClient, 'getCode', function () {
          return {
            redirect: INVALID_OAUTH_CODE_REDIRECT_URL
          };
        });

        return broker.getOAuthResult(account)
          .then(assert.fail, function (err) {
            assert.isTrue(OAuthErrors.is(err, 'INVALID_RESULT_CODE'));
          });
      });

      it('throws an error if accountData is missing', function () {
        return broker.getOAuthResult()
          .then(assert.fail, function (err) {
            assert.isTrue(AuthErrors.is(err, 'INVALID_TOKEN'));
          });
      });

      it('throws an error if accountData is missing a sessionToken', function () {
        return broker.getOAuthResult(user.initAccount())
          .then(assert.fail, function (err) {
            assert.isTrue(AuthErrors.is(err, 'INVALID_TOKEN'));
          });
      });
    });

    describe('transformLink', function () {
      it('prepends `/oauth` to the link', function () {
        var transformed = broker.transformLink('/signin');
        assert.equal(transformed, '/oauth/signin');
      });
    });

  });
});


