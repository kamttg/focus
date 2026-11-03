// Optional at installation, requested once from an explicit activation gesture.
export const WEB_ORIGINS = ['http://*/*', 'https://*/*'];

interface PermissionAPI {
  contains(permissions: { origins: string[] }): Promise<boolean>;
  request(permissions: { origins: string[] }): Promise<boolean>;
  remove(permissions: { origins: string[] }): Promise<boolean>;
}

export function hasAutomaticAccess(api: Pick<PermissionAPI, 'contains'> = chrome.permissions) {
  return api.contains({ origins: [...WEB_ORIGINS] });
}

export async function requestAutomaticAccess(api: Pick<PermissionAPI, 'request'> = chrome.permissions) {
  // Do not await another API before request(): preserve the activation gesture.
  const granted = await api.request({ origins: [...WEB_ORIGINS] });
  if (!granted) throw new Error('O Chrome não concedeu acesso aos sites. A leitura automática continua desativada.');
}

export function removeAutomaticAccess(api: Pick<PermissionAPI, 'remove'> = chrome.permissions) {
  return api.remove({ origins: [...WEB_ORIGINS] });
}
