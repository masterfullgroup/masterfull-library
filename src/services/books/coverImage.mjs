const NON_IMAGE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);

export function resolveCoverImageUrl(value, documentUrl = '') {
  if (typeof value !== 'string' || !value.trim()) return '';

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return '';
  }

  if (url.protocol !== 'https:' || url.username || url.password) return '';
  const host = url.hostname.toLowerCase();
  if ([...NON_IMAGE_HOSTS].some((blockedHost) => host === blockedHost || host.endsWith(`.${blockedHost}`))) return '';
  if (/\.pdf$/i.test(url.pathname) || /\/preview\/?$/i.test(url.pathname)) return '';

  if (documentUrl) {
    try {
      const document = new URL(documentUrl);
      if (url.origin === document.origin && url.pathname === document.pathname) return '';
    } catch {
      // A malformed document link must not invalidate an otherwise valid image URL.
    }
  }

  return url.toString();
}
