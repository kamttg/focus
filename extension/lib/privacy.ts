export const sensitiveHosts = /(^|\.)(gmail\.com|mail\.google\.com|outlook\.(com|live\.com)|proton\.me|protonmail\.com|web\.whatsapp\.com|messenger\.com|discord\.com|slack\.com|teams\.microsoft\.com|docs\.google\.com|drive\.google\.com|notion\.so|notion\.site|dropbox\.com|1password\.com|bitwarden\.com|lastpass\.com|paypal\.com|stripe\.com|nubank\.com\.br|itau\.com\.br|bb\.com\.br|bradesco\.com\.br|santander\.com\.br|chase\.com|bankofamerica\.com|mychart\.com|health\.google|accounts\.google\.com|login\.microsoftonline\.com)$/i;
export function allowedPage(raw: string, exclusions: string[] = []): boolean {
  try {
    const u = new URL(raw);
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password &&
      !sensitiveHosts.test(u.hostname) &&
      !/(^|[./_-])(bank|banking|banco|health|saude|patient|medical|webmail|mail|login|signin|sign-in|checkout|payment|password|account|auth|inbox|messages|direct|chat)([./_-]|$)/i.test(u.hostname + u.pathname) &&
      !exclusions.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch { return false; }
}
export const originPattern = (url: string) => new URL(url).origin + '/*';
export function validEndpoint(raw: string) {
  try {
    const u = new URL(raw);
    return !u.username && !u.password && !u.search && !u.hash &&
      (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)));
  } catch { return false; }
}
