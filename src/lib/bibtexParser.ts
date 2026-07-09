import { Publication, PublicationGroup, PublicationType, ResearchArea } from '@/types/publication';
import { getConfig } from './config';
import { getRuntimeI18nConfig } from './i18n/config';
import { parseBibTeXInline } from './bibtexInline';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bibtexParse = require('bibtex-parse-js');

const typeMapping: Record<string, PublicationType> = {
  article: 'journal',
  inproceedings: 'conference',
  conference: 'conference',
  incollection: 'book-chapter',
  book: 'book',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  techreport: 'technical-report',
  unpublished: 'preprint',
  misc: 'preprint',
};

const monthMapping: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9, sept: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export function parseBibTeX(bibtexContent: string, locale?: string): Publication[] {
  const highlightNames = getHighlightNames(locale);
  const entries = bibtexParse.toJSON(bibtexContent);

  return entries.map((entry: { entryType: string; citationKey: string; entryTags: Record<string, string> }, index: number) => {
    const tags = entry.entryTags;
    const authors = parseAuthors(tags.author || '', highlightNames);
    const year = parseInt(tags.year) || new Date().getFullYear();
    const monthStr = tags.month?.toLowerCase() || '';
    const month = monthMapping[monthStr] || (parseInt(monthStr) || undefined);
    const type = typeMapping[entry.entryType.toLowerCase()] || 'journal';
    const keywords = tags.keywords?.split(',').map((k: string) => k.trim()) || [];
    const selected = tags.selected === 'true' || tags.selected === 'yes';
    const preview = tags.preview?.replace(/[{}]/g, '');
    const title = parseBibTeXInline(tags.title || 'Untitled');
    const publicationGroup = parsePublicationGroup(
      tags.category || tags.group || tags.publication_group,
      authors
    );

    const publication: Publication = {
      id: entry.citationKey || tags.id || `pub-${Date.now()}-${index}`,
      title: title.plainText || 'Untitled',
      titleNodes: title.nodes,
      authors,
      year,
      month: monthMapping[tags.month?.toLowerCase()] ? String(month) : tags.month,
      type,
      status: 'published',
      tags: keywords,
      keywords,
      researchArea: detectResearchArea(tags.title, keywords),
      journal: cleanBibTeXString(tags.journal),
      conference: cleanBibTeXString(tags.booktitle),
      volume: tags.volume,
      issue: tags.number,
      pages: tags.pages,
      doi: tags.doi,
      url: tags.url,
      code: tags.code,
      abstract: cleanBibTeXString(tags.abstract),
      description: cleanBibTeXString(tags.description || tags.note),
      selected,
      preview,
      publicationGroup,
      bibtex: reconstructBibTeX(entry, ['selected', 'preview', 'description', 'keywords', 'code', 'category', 'group', 'publication_group']),
    };

    Object.keys(publication).forEach(key => {
      if (publication[key as keyof Publication] === undefined) {
        delete publication[key as keyof Publication];
      }
    });

    return publication;
  }).sort((a: Publication, b: Publication) => {
    if (b.year !== a.year) return b.year - a.year;

    const monthA = typeof a.month === 'string'
      ? (monthMapping[a.month.toLowerCase()] || parseInt(a.month) || 1)
      : (a.month || 1);
    const monthB = typeof b.month === 'string'
      ? (monthMapping[b.month.toLowerCase()] || parseInt(b.month) || 1)
      : (b.month || 1);

    return monthB - monthA;
  });
}

function getHighlightNames(locale?: string): string[] {
  const names = new Set<string>();
  const baseConfig = getConfig();
  const runtimeI18n = getRuntimeI18nConfig(baseConfig.i18n);

  const addName = (name?: string) => {
    const cleaned = cleanBibTeXString(name).trim();
    if (cleaned) {
      names.add(cleaned);
    }
  };

  addName(baseConfig.author.name);

  if (runtimeI18n.enabled) {
    runtimeI18n.locales.forEach((localeCode) => {
      const localizedConfig = getConfig(localeCode);
      addName(localizedConfig.author.name);
    });
  }

  if (locale) {
    const currentLocaleConfig = getConfig(locale);
    addName(currentLocaleConfig.author.name);
  }

  return Array.from(names);
}

function normalizePersonNameForMatch(name: string): string {
  return name.toLowerCase().replace(/[\s.,'"()\-_/]/g, '');
}

function buildNameVariants(name: string): Set<string> {
  const variants = new Set<string>();
  const cleaned = cleanBibTeXString(name).toLowerCase().trim();

  if (!cleaned) {
    return variants;
  }

  variants.add(cleaned);

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 2) {
    variants.add(`${parts[1]} ${parts[0]}`);
  }

  return variants;
}

function parseAuthors(
  authorsStr: string,
  highlightNames: string[]
): Array<{ name: string; isHighlighted?: boolean; isCorresponding?: boolean; isCoAuthor?: boolean }> {
  if (!authorsStr) return [];

  const highlightTextCandidates = new Set<string>();
  const highlightNormalizedCandidates = new Set<string>();

  highlightNames.forEach((name) => {
    const variants = buildNameVariants(name);
    variants.forEach((variant) => {
      highlightTextCandidates.add(variant);
      highlightNormalizedCandidates.add(normalizePersonNameForMatch(variant));
    });
  });

  const highlightTextList = Array.from(highlightTextCandidates);
  const highlightNormalizedList = Array.from(highlightNormalizedCandidates);

  return authorsStr
    .split(/\sand\s/)
    .map(author => {
      let name = author.trim();
      const isCorresponding = name.includes('*');
      const isCoAuthor = name.includes('#');

      name = name.replace(/[*#]/g, '');

      if (name.includes(',')) {
        const parts = name.split(',').map(p => p.trim());
        name = `${parts[1]} ${parts[0]}`;
      }

      name = cleanBibTeXString(name);

      const lowerName = name.toLowerCase();
      const normalizedName = normalizePersonNameForMatch(lowerName);
      const isHighlighted =
        highlightTextList.some((candidate) => lowerName.includes(candidate)) ||
        highlightNormalizedList.some((candidate) => normalizedName.includes(candidate));

      return {
        name,
        isHighlighted,
        isCorresponding,
        isCoAuthor,
      };
    })
    .filter(author => author.name);
}

function cleanBibTeXString(str?: string): string {
  if (!str) return '';
  return parseBibTeXInline(str).plainText;
}

function parsePublicationGroup(
  rawGroup: string | undefined,
  authors: Array<{ isHighlighted?: boolean }>
): PublicationGroup {
  const normalized = rawGroup?.trim().toLowerCase().replace(/[\s_]/g, '-');

  if (normalized === 'first-author' || normalized === 'first') {
    return 'first-author';
  }

  if (
    normalized === 'participating' ||
    normalized === 'participant' ||
    normalized === 'co-authored' ||
    normalized === 'coauthored' ||
    normalized === 'collaboration'
  ) {
    return 'participating';
  }

  return authors[0]?.isHighlighted ? 'first-author' : 'participating';
}

function detectResearchArea(title: string, keywords: string[]): ResearchArea {
  const text = (title + ' ' + keywords.join(' ')).toLowerCase();

  if (text.includes('healthcare') || text.includes('medical') || text.includes('health')) {
    return 'ai-healthcare';
  }
  if (text.includes('signal') || text.includes('processing')) {
    return 'signal-processing';
  }
  if (text.includes('reliability') || text.includes('fault') || text.includes('diagnosis')) {
    return 'reliability-engineering';
  }
  if (text.includes('quantum')) {
    return 'quantum-computing';
  }
  if (text.includes('neural') || text.includes('spiking')) {
    return 'neural-networks';
  }
  if (text.includes('transformer') || text.includes('attention')) {
    return 'transformer-architectures';
  }

  return 'machine-learning';
}

function reconstructBibTeX(
  entry: { entryType: string; citationKey: string; entryTags: Record<string, string> },
  excludeFields: string[] = []
): string {
  const { entryType, citationKey, entryTags } = entry;

  let bibtex = `@${entryType}{${citationKey},\n`;

  Object.entries(entryTags).forEach(([key, value]) => {
    if (!excludeFields.includes(key.toLowerCase())) {
      let cleanValue = value;

      if (key.toLowerCase() === 'author') {
        cleanValue = value.replace(/[#*]/g, '');
      }

      bibtex += `  ${key} = {${cleanValue}},\n`;
    }
  });

  bibtex = bibtex.slice(0, -2) + '\n';
  bibtex += '}';

  return bibtex;
}
