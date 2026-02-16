const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/-{2,}/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 90);

export const SEO_HUB_CONFIG = Object.freeze({
  services: {
    key: 'services',
    label: 'Services',
    singular: 'Service',
    path: '/services',
    description: 'Retention-first video editing services for creators and brands.'
  },
  caseStudies: {
    key: 'caseStudies',
    label: 'Case Studies',
    singular: 'Case Study',
    path: '/case-studies',
    description: 'Project breakdowns with strategy, edits, and measurable outcomes.'
  },
  guides: {
    key: 'guides',
    label: 'Guides',
    singular: 'Guide',
    path: '/guides',
    description: 'Practical video editing guides for hooks, pacing, retention, and storytelling.'
  }
});

const normalizeFaqs = (faqs) => {
  if (!Array.isArray(faqs)) return [];
  return faqs
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const q = String(item.q || item.question || '').trim();
      const a = String(item.a || item.answer || '').trim();
      if (!q || !a) return null;
      return { q, a };
    })
    .filter(Boolean);
};

const normalizeSections = (sections) => {
  if (!Array.isArray(sections)) return [];
  return sections
    .map((section) => {
      if (!section || typeof section !== 'object') return null;
      const heading = String(section.heading || '').trim();
      const body = String(section.body || '').trim();
      if (!heading || !body) return null;
      return { heading, body };
    })
    .filter(Boolean);
};

const normalizeEntry = (entry, type, index = 0) => {
  const safe = entry && typeof entry === 'object' ? entry : {};
  const title = String(safe.title || `${SEO_HUB_CONFIG[type].singular} ${index + 1}`).trim();
  const slug = String(safe.slug || slugify(title || `${type}-${index + 1}`)).trim();
  return {
    id: String(safe.id || `${type}-${slug || index + 1}`),
    slug,
    title,
    excerpt: String(safe.excerpt || '').trim(),
    primaryKeyword: String(safe.primaryKeyword || '').trim(),
    secondaryKeywords: Array.isArray(safe.secondaryKeywords)
      ? safe.secondaryKeywords.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    intro: String(safe.intro || '').trim(),
    sections: normalizeSections(safe.sections),
    faqs: normalizeFaqs(safe.faqs),
    relatedProjectSlugs: Array.isArray(safe.relatedProjectSlugs)
      ? safe.relatedProjectSlugs.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    heroImage: String(safe.heroImage || '').trim(),
    publishedAt: String(safe.publishedAt || '').trim(),
    updatedAt: String(safe.updatedAt || '').trim(),
    indexable: safe.indexable !== false
  };
};

export const getSeoHubEntries = (content, type) => {
  if (!SEO_HUB_CONFIG[type]) return [];
  const source = content?.seo?.[type];
  if (!Array.isArray(source)) return [];
  return source
    .map((entry, index) => normalizeEntry(entry, type, index))
    .filter((entry) => entry.slug)
    .filter((entry) => entry.indexable !== false);
};

export const getSeoHubEntryBySlug = (content, type, slug) => {
  const normalizedSlug = String(slug || '').trim().toLowerCase();
  if (!normalizedSlug) return null;
  return getSeoHubEntries(content, type).find((entry) => entry.slug.toLowerCase() === normalizedSlug) || null;
};

export const getSeoHubSummary = (content) => {
  return Object.keys(SEO_HUB_CONFIG).map((type) => ({
    type,
    ...SEO_HUB_CONFIG[type],
    entries: getSeoHubEntries(content, type)
  }));
};

export const getAllSeoHubEntries = (content) => {
  return getSeoHubSummary(content).flatMap((group) =>
    group.entries.map((entry) => ({ ...entry, type: group.type, path: `${group.path}/${entry.slug}` }))
  );
};

export const normalizeSeoHubForEditing = (seo) => {
  const safe = seo && typeof seo === 'object' ? seo : {};
  return {
    services: Array.isArray(safe.services) ? safe.services : [],
    caseStudies: Array.isArray(safe.caseStudies) ? safe.caseStudies : [],
    guides: Array.isArray(safe.guides) ? safe.guides : [],
    faqs: Array.isArray(safe.faqs) ? safe.faqs : []
  };
};
