/**
 * CSInterface - Lightweight Adobe CEP Bridge for Kinetix
 * Compatible with CEP 11 / 12 and Adobe Premiere Pro 2026 (v26.0+)
 */
(function (root) {
  'use strict';

  function CSInterface() {
    this.hostEnvironment = this._getHostEnvironment();
  }

  CSInterface.prototype._getHostEnvironment = function () {
    try {
      if (window.__adobe_cep__ && typeof window.__adobe_cep__.getHostEnvironment === 'function') {
        return JSON.parse(window.__adobe_cep__.getHostEnvironment());
      }
    } catch (e) {
      // Fallback for standalone browser testing
    }
    return {
      appName: 'PPRO',
      appVersion: '26.0.0',
      appLocale: 'en_US',
      isStandalone: true
    };
  };

  CSInterface.prototype.getHostEnvironment = function () {
    return this.hostEnvironment;
  };

  CSInterface.prototype.isRunningInCEP = function () {
    return Boolean(window.__adobe_cep__);
  };

  CSInterface.prototype.evalScript = function (script, callback) {
    if (window.__adobe_cep__ && typeof window.__adobe_cep__.evalScript === 'function') {
      window.__adobe_cep__.evalScript(script, callback || function () {});
    } else if (typeof callback === 'function') {
      callback(JSON.stringify({ ok: false, standalone: true, error: 'Not running inside Adobe CEP' }));
    }
  };

  CSInterface.prototype.getSystemPath = function (pathType) {
    if (window.__adobe_cep__ && typeof window.__adobe_cep__.getSystemPath === 'function') {
      return window.__adobe_cep__.getSystemPath(pathType);
    }
    return '';
  };

  CSInterface.prototype.addEventListener = function (type, listener, obj) {
    if (window.__adobe_cep__ && typeof window.__adobe_cep__.addEventListener === 'function') {
      window.__adobe_cep__.addEventListener(type, listener, obj);
    }
  };

  CSInterface.prototype.removeEventListener = function (type, listener, obj) {
    if (window.__adobe_cep__ && typeof window.__adobe_cep__.removeEventListener === 'function') {
      window.__adobe_cep__.removeEventListener(type, listener, obj);
    }
  };

  CSInterface.SystemPath = {
    USER_DATA: 'userData',
    COMMON_FILES: 'commonFiles',
    MY_DOCUMENTS: 'myDocuments',
    APPLICATION: 'application',
    EXTENSION: 'extension',
    HOST_APPLICATION: 'hostApplication'
  };

  root.CSInterface = CSInterface;
})(typeof window !== 'undefined' ? window : globalThis);
