// Small, testable origin boundary. Do not trust string prefix comparisons on URLs.
function isAppOrigin(url, appUrl) {
  try {
    return new URL(url).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
function allowedMediaRequest(webContents, requestingOrigin, permission, appUrl) {
  return (
    permission === 'media' &&
    Boolean(webContents) &&
    isAppOrigin(webContents.getURL(), appUrl) &&
    isAppOrigin(requestingOrigin, appUrl)
  );
}
function safeExternalUrl(url) {
  try {
    return ['https:', 'http:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
function configuredAppUrl(remote, port) {
  if (!remote) return `http://127.0.0.1:${port}`;
  const url = new URL(remote);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('ERP_SERVER_URL must be an HTTPS origin without credentials or a path.');
  return url.origin;
}
module.exports = { isAppOrigin, allowedMediaRequest, safeExternalUrl, configuredAppUrl };
