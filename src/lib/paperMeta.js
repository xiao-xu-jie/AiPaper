export const READING_STATUS_OPTIONS = [
  { id: 'unread', label: '待读' },
  { id: 'skimming', label: '粗读' },
  { id: 'deep', label: '精读' },
  { id: 'reviewed', label: '已读' },
  { id: 'archived', label: '已归档' },
];

export const PRIORITY_OPTIONS = [
  { id: 'low', label: '低' },
  { id: 'normal', label: '普通' },
  { id: 'high', label: '高' },
];

const READING_STATUS_IDS = new Set(READING_STATUS_OPTIONS.map((item) => item.id));
const PRIORITY_IDS = new Set(PRIORITY_OPTIONS.map((item) => item.id));

export function readingStatusLabel(id) {
  return READING_STATUS_OPTIONS.find((item) => item.id === id)?.label || '待读';
}

export function priorityLabel(id) {
  return PRIORITY_OPTIONS.find((item) => item.id === id)?.label || '普通';
}

function clampText(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function stripMarkdown(value) {
  return String(value || '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[`*_~>#|]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizeRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(5, Math.max(0, Math.round(n)));
}

function normalizeKeywords(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || '').split(/[,，;；、\n]/);
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const item = clampText(raw, 32);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 12) break;
  }
  return out;
}

export function defaultWorkflowFields() {
  return {
    readingStatus: 'unread',
    priority: 'normal',
    rating: 0,
    readingPurpose: '',
    deadline: '',
    reproduced: false,
    inSurvey: false,
  };
}

export function normalizeWorkflowFields(paper = {}) {
  const defaults = defaultWorkflowFields();
  return {
    readingStatus: READING_STATUS_IDS.has(paper.readingStatus) ? paper.readingStatus : defaults.readingStatus,
    priority: PRIORITY_IDS.has(paper.priority) ? paper.priority : defaults.priority,
    rating: normalizeRating(paper.rating),
    readingPurpose: clampText(paper.readingPurpose, 300),
    deadline: normalizeDate(paper.deadline),
    reproduced: Boolean(paper.reproduced),
    inSurvey: Boolean(paper.inSurvey),
  };
}

export function normalizeMetadata(metadata = {}, fallbackTitle = '') {
  const year = String(metadata.year || '').match(/\b(19|20)\d{2}\b/)?.[0] || '';
  return {
    title: clampText(metadata.title || fallbackTitle, 240),
    authors: clampText(metadata.authors, 500),
    institutions: clampText(metadata.institutions, 500),
    year,
    venue: clampText(metadata.venue, 180),
    doi: clampText(metadata.doi, 160),
    arxivId: clampText(metadata.arxivId, 80),
    keywords: normalizeKeywords(metadata.keywords),
    abstract: clampText(metadata.abstract, 3000),
    codeUrl: clampText(metadata.codeUrl, 300),
    extractedAt: Number(metadata.extractedAt) || null,
  };
}

export function normalizePaperRecord(paper = {}) {
  const workflow = normalizeWorkflowFields(paper);
  const metadata = normalizeMetadata(paper.metadata || {}, paper.title || paper.fileName || '');
  return {
    ...paper,
    ...workflow,
    metadata,
  };
}

function firstUsefulLines(markdown, limit = 80) {
  return String(markdown || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^[-=]{3,}$/.test(line) && !/^!\[/.test(line))
    .slice(0, limit);
}

function extractTitle(markdown, fallbackTitle) {
  const heading = String(markdown || '').match(/^#\s+(.+)$/m)?.[1];
  if (heading) return stripMarkdown(heading).slice(0, 240);
  const line = firstUsefulLines(markdown, 20)
    .map(stripMarkdown)
    .find((item) => item.length >= 6 && item.length <= 240 && !/^abstract\b/i.test(item));
  return line || fallbackTitle || '';
}

function extractSection(markdown, names, maxLength = 3000) {
  const namePattern = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const headingPattern = new RegExp(`^#{1,6}\\s*(?:${namePattern})\\s*$`, 'im');
  const heading = headingPattern.exec(markdown);
  if (heading) {
    const start = heading.index + heading[0].length;
    const rest = markdown.slice(start);
    const end = rest.search(/\n#{1,6}\s+\S/);
    return stripMarkdown((end >= 0 ? rest.slice(0, end) : rest)).slice(0, maxLength);
  }

  const inlinePattern = new RegExp(`(?:^|\\n)\\s*(?:\\*\\*)?(?:${namePattern})(?:\\*\\*)?\\s*[:：]\\s*([\\s\\S]{20,${maxLength}}?)(?=\\n\\s*(?:#{1,6}\\s|keywords?|关键词|introduction|引言|1\\.?\\s))`, 'i');
  return stripMarkdown(inlinePattern.exec(markdown)?.[1] || '').slice(0, maxLength);
}

function extractAuthorsAndInstitutions(markdown, title) {
  const lines = firstUsefulLines(markdown, 30).map(stripMarkdown);
  const titleKey = stripMarkdown(title).toLowerCase();
  const start = Math.max(0, lines.findIndex((line) => line.toLowerCase() === titleKey) + 1);
  const candidates = lines.slice(start, start + 10)
    .filter((line) => !/^(abstract|摘要|keywords?|关键词)\b/i.test(line))
    .filter((line) => !/(doi|arxiv|http|www\.|@)/i.test(line));

  const authors = candidates.find((line) => {
    if (line.length < 3 || line.length > 220) return false;
    if (/(university|institute|department|school|college|laboratory|academy|大学|学院|研究所|实验室)/i.test(line)) return false;
    return /[,，;；、]|\band\b|\d$/.test(line);
  }) || '';

  const institutions = candidates.find((line) =>
    line !== authors && /(university|institute|department|school|college|laboratory|academy|大学|学院|研究所|实验室)/i.test(line)
  ) || '';

  return { authors, institutions };
}

function extractVenue(lines) {
  const venuePattern = /(proceedings|journal|conference|transactions|cvpr|iccv|eccv|neurips|icml|iclr|acl|emnlp|siggraph|aaai|ijcai|kdd|www|chi|会议|期刊|学报)/i;
  return lines.map(stripMarkdown).find((line) =>
    line.length <= 180 && venuePattern.test(line) && !/doi|arxiv|http/i.test(line)
  ) || '';
}

function extractYear(markdown, venue) {
  const fromVenue = String(venue || '').match(/\b(19|20)\d{2}\b/)?.[0];
  if (fromVenue) return fromVenue;
  const fromArxiv = String(markdown || '').match(/arxiv\s*[:：]?\s*((\d{2})\d{2}\.\d{4,5})/i)?.[2];
  if (fromArxiv) return String(Number(fromArxiv) > 50 ? `19${fromArxiv}` : `20${fromArxiv}`);
  return String(markdown || '').slice(0, 5000).match(/\b(19|20)\d{2}\b/)?.[0] || '';
}

export function extractMetadataFromMarkdown(markdown, fallbackTitle = '') {
  const text = String(markdown || '');
  const lines = firstUsefulLines(text, 80);
  const title = extractTitle(text, fallbackTitle);
  const { authors, institutions } = extractAuthorsAndInstitutions(text, title);
  const abstract = extractSection(text, ['Abstract', '摘要']);
  const keywordText = extractSection(text, ['Keywords', 'Keyword', '关键词'], 800);
  const doi = text.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i)?.[0] || '';
  const arxivId = text.match(/arxiv\s*[:：]?\s*([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)/i)?.[1] || '';
  const codeUrl = text.match(/https?:\/\/(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)\/[^\s)）]+/i)?.[0] || '';
  const venue = extractVenue(lines);

  return normalizeMetadata({
    title,
    authors,
    institutions,
    year: extractYear(text, venue),
    venue,
    doi,
    arxivId,
    keywords: keywordText,
    abstract,
    codeUrl,
    extractedAt: Date.now(),
  }, fallbackTitle);
}
