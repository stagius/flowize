import { AppSettings } from '../types';

export const getBridgeBaseUrl = (endpoint: string): string => {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/run') ? trimmed.slice(0, -4) : trimmed;
};

export const getBridgeCandidates = (endpoint: string): string[] => {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  const withRun = trimmed.endsWith('/run') ? trimmed : `${trimmed}/run`;
  const withoutRun = trimmed.endsWith('/run') ? trimmed.slice(0, -4) : trimmed;
  const browserHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const browserProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';

  const browserHostVariants = browserHost
    ? [withRun, withoutRun].flatMap((value) => {
      try {
        const url = new URL(value.startsWith('http') ? value : `http://${value}`);
        return [`${browserProtocol}//${browserHost}${url.port ? `:${url.port}` : ''}${url.pathname}`];
      } catch {
        return [];
      }
    })
    : [];

  const alternates = [...browserHostVariants, withRun, withoutRun]
    .flatMap((value) => {
      const hostAlternates = [value];
      if (value.includes('127.0.0.1')) {
        hostAlternates.push(value.replace('127.0.0.1', 'localhost'));
      }
      if (value.includes('localhost')) {
        hostAlternates.push(value.replace('localhost', '127.0.0.1'));
      }
      if (browserHost && !value.includes(browserHost)) {
        hostAlternates.push(value.replace('127.0.0.1', browserHost));
        hostAlternates.push(value.replace('localhost', browserHost));
      }
      return hostAlternates;
    })
    .filter((value) => value.length > 0);

  return Array.from(new Set(alternates));
};

export const getBridgeHealthUrls = (endpoint: string): string[] => {
  return getBridgeCandidates(endpoint)
    .map((candidate) => `${getBridgeBaseUrl(candidate)}/health`)
    .filter((value, index, arr) => arr.indexOf(value) === index);
};

export const getBridgeAuthToken = (settings?: AppSettings): string => {
  return typeof settings?.bridgeAuthToken === 'string' ? settings.bridgeAuthToken.trim() : '';
};

export const getBridgeRequestHeaders = (token?: string, headers: Record<string, string> = {}): Record<string, string> => {
  const authToken = token?.trim() || '';
  return {
    ...headers,
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
  };
};
