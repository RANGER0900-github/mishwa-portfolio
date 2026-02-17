export function setMeta({ title, description, image, url }) {
  if (title) {
    document.title = title;
    const ogTitle = document.querySelector('meta[property="og:title"]') || document.createElement('meta');
    ogTitle.setAttribute('property', 'og:title');
    ogTitle.setAttribute('content', title);
    document.head.appendChild(ogTitle);

    const twTitle = document.querySelector('meta[name="twitter:title"]') || document.createElement('meta');
    twTitle.setAttribute('name', 'twitter:title');
    twTitle.setAttribute('content', title);
    document.head.appendChild(twTitle);
  }
  if (description) {
    const desc = document.querySelector('meta[name="description"]') || document.createElement('meta');
    desc.setAttribute('name', 'description');
    desc.setAttribute('content', description);
    document.head.appendChild(desc);

    const ogDesc = document.querySelector('meta[property="og:description"]') || document.createElement('meta');
    ogDesc.setAttribute('property', 'og:description');
    ogDesc.setAttribute('content', description);
    document.head.appendChild(ogDesc);

    const twDesc = document.querySelector('meta[name="twitter:description"]') || document.createElement('meta');
    twDesc.setAttribute('name', 'twitter:description');
    twDesc.setAttribute('content', description);
    document.head.appendChild(twDesc);
  }
  if (image) {
    const ogImage = document.querySelector('meta[property="og:image"]') || document.createElement('meta');
    ogImage.setAttribute('property', 'og:image');
    ogImage.setAttribute('content', image);
    document.head.appendChild(ogImage);

    const twImage = document.querySelector('meta[name="twitter:image"]') || document.createElement('meta');
    twImage.setAttribute('name', 'twitter:image');
    twImage.setAttribute('content', image);
    document.head.appendChild(twImage);
  }
  if (url) {
    const canonical = document.querySelector('link[rel="canonical"]') || document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    canonical.setAttribute('href', url);
    document.head.appendChild(canonical);

    const ogUrl = document.querySelector('meta[property="og:url"]') || document.createElement('meta');
    ogUrl.setAttribute('property', 'og:url');
    ogUrl.setAttribute('content', url);
    document.head.appendChild(ogUrl);
  }
}
