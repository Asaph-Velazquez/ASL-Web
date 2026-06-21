import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const CATEGORY_FILES = ['connections', 'requests', 'errors'];
const SYSTEM_FOLDER = 'system';

function ensureDirectory(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

ensureDirectory(LOG_DIR);

function normalizeText(value, fallback = null) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown error',
  };
}

function normalizeStayContext(input = {}) {
  return {
    stayId: normalizeText(input.stayId),
    roomNumber: normalizeText(input.roomNumber),
    guestName: normalizeText(input.guestName),
    requestId: normalizeText(input.requestId),
    actor: normalizeText(input.actor),
    actorRole: normalizeText(input.actorRole),
    source: normalizeText(input.source),
  };
}

function buildEntry(category, eventType, payload = {}, level = 'info') {
  const context = normalizeStayContext(payload);
  return {
    timestamp: new Date().toISOString(),
    level,
    category,
    eventType,
    message: normalizeText(payload.message, eventType),
    ...context,
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
  };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(value) {
  return String(value)
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function primitiveToXmlTag(tag, value, indent = '  ') {
  if (value === null || value === undefined || value === '') {
    return `${indent}<${tag}></${tag}>`;
  }

  return `${indent}<${tag}>${escapeXml(value)}</${tag}>`;
}

function metadataToXml(metadata, indent = '  ') {
  const lines = [`${indent}<metadata>`];

  for (const [key, value] of Object.entries(metadata || {})) {
    if (value && typeof value === 'object') {
      lines.push(`${indent}  <item key="${escapeXml(key)}">`);
      lines.push(`${indent}    <json>${escapeXml(JSON.stringify(value, null, 2))}</json>`);
      lines.push(`${indent}  </item>`);
      continue;
    }

    lines.push(`${indent}  <item key="${escapeXml(key)}">${escapeXml(value ?? '')}</item>`);
  }

  lines.push(`${indent}</metadata>`);
  return lines.join('\n');
}

function serializeEntry(entry) {
  return [
    '<logEntry>',
    primitiveToXmlTag('timestamp', entry.timestamp),
    primitiveToXmlTag('level', entry.level),
    primitiveToXmlTag('category', entry.category),
    primitiveToXmlTag('eventType', entry.eventType),
    primitiveToXmlTag('message', entry.message),
    primitiveToXmlTag('stayId', entry.stayId),
    primitiveToXmlTag('roomNumber', entry.roomNumber),
    primitiveToXmlTag('guestName', entry.guestName),
    primitiveToXmlTag('requestId', entry.requestId),
    primitiveToXmlTag('actor', entry.actor),
    primitiveToXmlTag('actorRole', entry.actorRole),
    primitiveToXmlTag('source', entry.source),
    metadataToXml(entry.metadata),
    '</logEntry>',
    '',
  ].join('\n');
}

function parseSimpleTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? unescapeXml(match[1]).trim() || null : null;
}

function parseMetadata(block) {
  const metadataBlock = block.match(/<metadata>([\s\S]*?)<\/metadata>/);
  if (!metadataBlock) {
    return {};
  }

  const metadata = {};
  const itemRegex = /<item key="([^"]*)">([\s\S]*?)<\/item>/g;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(metadataBlock[1])) !== null) {
    const key = unescapeXml(itemMatch[1]);
    const inner = itemMatch[2].trim();
    const jsonMatch = inner.match(/^<json>([\s\S]*?)<\/json>$/);

    if (jsonMatch) {
      const rawJson = unescapeXml(jsonMatch[1]);
      try {
        metadata[key] = JSON.parse(rawJson);
      } catch (_error) {
        metadata[key] = rawJson;
      }
      continue;
    }

    metadata[key] = unescapeXml(inner);
  }

  return metadata;
}

function parseXmlEntry(block, category, fileName) {
  return {
    rawEntry: block.trim(),
    fileName,
    category: parseSimpleTag(block, 'category') || category,
    timestamp: parseSimpleTag(block, 'timestamp'),
    level: parseSimpleTag(block, 'level') || 'info',
    eventType: parseSimpleTag(block, 'eventType') || 'UNKNOWN',
    message: parseSimpleTag(block, 'message') || '',
    stayId: parseSimpleTag(block, 'stayId'),
    roomNumber: parseSimpleTag(block, 'roomNumber'),
    guestName: parseSimpleTag(block, 'guestName'),
    requestId: parseSimpleTag(block, 'requestId'),
    actor: parseSimpleTag(block, 'actor'),
    actorRole: parseSimpleTag(block, 'actorRole'),
    source: parseSimpleTag(block, 'source'),
    metadata: parseMetadata(block),
  };
}

function parseLegacyJsonLine(line, category, fileName) {
  try {
    const parsed = JSON.parse(line);
    const entry = {
      timestamp: parsed.timestamp || null,
      level: parsed.level || 'info',
      category: parsed.category || category,
      eventType: parsed.eventType || 'UNKNOWN',
      message: parsed.message || parsed.eventType || '',
      stayId: parsed.stayId || null,
      roomNumber: parsed.roomNumber || null,
      guestName: parsed.guestName || null,
      requestId: parsed.requestId || null,
      actor: parsed.actor || null,
      actorRole: parsed.actorRole || null,
      source: parsed.source || null,
      metadata: parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {},
    };

    return {
      ...entry,
      fileName,
      rawEntry: serializeEntry(entry).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function parseLogContent(content, category, fileName) {
  const entries = [];
  const xmlBlocks = content.match(/<logEntry>[\s\S]*?<\/logEntry>/g) || [];

  for (const block of xmlBlocks) {
    entries.push(parseXmlEntry(block, category, fileName));
  }

  const withoutXmlBlocks = content.replace(/<logEntry>[\s\S]*?<\/logEntry>/g, '');
  const legacyLines = withoutXmlBlocks
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of legacyLines) {
    const legacyEntry = parseLegacyJsonLine(line, category, fileName);
    if (legacyEntry) {
      entries.push(legacyEntry);
    }
  }

  return entries;
}

function getGroupKeyFromContext(context) {
  if (context.stayId) {
    return `stay:${context.stayId}`;
  }

  if (context.roomNumber) {
    return `room:${context.roomNumber}`;
  }

  return SYSTEM_FOLDER;
}

function groupKeyToFolderName(groupKey) {
  return encodeURIComponent(groupKey);
}

function folderNameToGroupKey(folderName) {
  try {
    return decodeURIComponent(folderName);
  } catch (_error) {
    return folderName;
  }
}

function getFolderPathFromGroupKey(groupKey) {
  ensureDirectory(LOG_DIR);
  return path.join(LOG_DIR, groupKeyToFolderName(groupKey));
}

function getCategoryFilePath(groupKey, category) {
  return path.join(getFolderPathFromGroupKey(groupKey), `${category}.log`);
}

function getStayGroupKey(entry) {
  if (entry.stayId) {
    return `stay:${entry.stayId}`;
  }

  if (entry.roomNumber) {
    return `room:${entry.roomNumber}`;
  }

  return null;
}

function readEntriesFromFolder(groupKey) {
  ensureDirectory(LOG_DIR);
  const folderPath = getFolderPathFromGroupKey(groupKey);
  if (!existsSync(folderPath)) {
    return [];
  }

  const entries = [];

  for (const category of CATEGORY_FILES) {
    const fileName = `${category}.log`;
    const filePath = path.join(folderPath, fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, 'utf8');
    entries.push(...parseLogContent(content, category, fileName));
  }

  return entries;
}

function applyFilters(entries, filters = {}) {
  const search = normalizeText(filters.search, '')?.toLowerCase() || '';
  const start = normalizeText(filters.start);
  const end = normalizeText(filters.end);

  return entries.filter((entry) => {
    if (start && entry.timestamp && entry.timestamp < `${start}T00:00:00.000Z`) {
      return false;
    }

    if (end && entry.timestamp && entry.timestamp > `${end}T23:59:59.999Z`) {
      return false;
    }

    if (!search) {
      return true;
    }

    const haystack = [
      entry.stayId,
      entry.roomNumber,
      entry.guestName,
      entry.eventType,
      entry.message,
      entry.requestId,
      entry.actor,
      entry.source,
      entry.fileName,
      JSON.stringify(entry.metadata || {}),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(search);
  });
}

function getAllStayFolders() {
  ensureDirectory(LOG_DIR);
  return readdirSync(LOG_DIR)
    .filter((entry) => {
      const fullPath = path.join(LOG_DIR, entry);
      return statSync(fullPath).isDirectory() && entry !== SYSTEM_FOLDER;
    })
    .map(folderNameToGroupKey);
}

export function logOperationalEvent(category, eventType, payload = {}, level = 'info') {
  if (!CATEGORY_FILES.includes(category)) {
    return;
  }

  ensureDirectory(LOG_DIR);
  const entry = buildEntry(category, eventType, payload, level);
  const groupKey = getGroupKeyFromContext(entry);
  const folderPath = getFolderPathFromGroupKey(groupKey);
  ensureDirectory(folderPath);
  appendFileSync(getCategoryFilePath(groupKey, category), serializeEntry(entry), 'utf8');
}

export function logOperationalError(eventType, error, payload = {}) {
  logOperationalEvent('errors', eventType, {
    ...payload,
    message: payload.message || (error instanceof Error ? error.message : 'Operational error'),
    metadata: {
      ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}),
      error: normalizeError(error),
    },
  }, 'error');
}

export function listStayLogGroups(filters = {}) {
  const groups = [];

  for (const groupKey of getAllStayFolders()) {
    const entries = applyFilters(readEntriesFromFolder(groupKey), filters).filter((entry) => getStayGroupKey(entry));
    if (entries.length === 0) {
      continue;
    }

    const summary = {
      groupKey,
      stayId: null,
      roomNumber: null,
      guestName: null,
      latestTimestamp: null,
      counts: {
        connections: 0,
        requests: 0,
        errors: 0,
        total: 0,
      },
    };

    for (const entry of entries) {
      summary.stayId = summary.stayId || entry.stayId;
      summary.roomNumber = summary.roomNumber || entry.roomNumber;
      summary.guestName = summary.guestName || entry.guestName;
      summary.latestTimestamp = !summary.latestTimestamp || (entry.timestamp && entry.timestamp > summary.latestTimestamp)
        ? entry.timestamp
        : summary.latestTimestamp;
      summary.counts[entry.category] += 1;
      summary.counts.total += 1;
    }

    groups.push(summary);
  }

  return groups.sort((a, b) => {
    const timeCompare = String(b.latestTimestamp || '').localeCompare(String(a.latestTimestamp || ''));
    if (timeCompare !== 0) {
      return timeCompare;
    }

    return String(a.roomNumber || '').localeCompare(String(b.roomNumber || ''), 'en-US', { numeric: true });
  });
}

export function listLogsForStay(stayKey, filters = {}) {
  return applyFilters(readEntriesFromFolder(stayKey), filters).sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
}

export function listStayLogFiles(stayKey) {
  ensureDirectory(LOG_DIR);
  const folderPath = getFolderPathFromGroupKey(stayKey);
  if (!existsSync(folderPath)) {
    return [];
  }

  return CATEGORY_FILES
    .map((category) => {
      const fileName = `${category}.log`;
      const filePath = path.join(folderPath, fileName);
      if (!existsSync(filePath)) {
        return null;
      }

      return {
        name: fileName,
        category,
        size: statSync(filePath).size,
        content: readFileSync(filePath, 'utf8'),
      };
    })
    .filter(Boolean);
}

export function getStayLogFile(stayKey, fileName) {
  ensureDirectory(LOG_DIR);
  if (!/^[a-z-]+\.log$/i.test(fileName)) {
    return null;
  }

  const filePath = path.join(getFolderPathFromGroupKey(stayKey), fileName);
  if (!existsSync(filePath)) {
    return null;
  }

  return {
    name: fileName,
    path: filePath,
    content: readFileSync(filePath, 'utf8'),
  };
}

export function getLogDownloadInfo(category) {
  if (!CATEGORY_FILES.includes(category)) {
    return null;
  }

  const systemPath = getCategoryFilePath(SYSTEM_FOLDER, category);
  if (!existsSync(systemPath)) {
    return null;
  }

  return {
    filename: `${category}.log`,
    path: systemPath,
  };
}

export function listAvailableLogCategories() {
  return [...CATEGORY_FILES];
}
