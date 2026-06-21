import express from 'express';
import { existsSync } from 'fs';
import { verifyStaffToken, requireAdmin } from '../middleware/auth.js';
import {
  getLogDownloadInfo,
  getStayLogFile,
  listAvailableLogCategories,
  listStayLogFiles,
  listLogsForStay,
  listStayLogGroups,
} from '../services/operationalLogs.js';

const router = express.Router();

router.use(verifyStaffToken, requireAdmin);

function buildFilters(query = {}) {
  return {
    search: typeof query.search === 'string' ? query.search : '',
    start: typeof query.start === 'string' ? query.start : '',
    end: typeof query.end === 'string' ? query.end : '',
  };
}

router.get('/stays', (req, res) => {
  const filters = buildFilters(req.query);
  const stays = listStayLogGroups(filters);

  return res.json({
    categories: listAvailableLogCategories(),
    filters,
    stays,
  });
});

router.get('/stays/:stayKey/events', (req, res) => {
  const filters = buildFilters(req.query);
  const events = listLogsForStay(req.params.stayKey, filters);
  const files = listStayLogFiles(req.params.stayKey).map((file) => ({
    name: file.name,
    category: file.category,
    size: file.size,
    content: file.content,
  }));

  return res.json({
    stayKey: req.params.stayKey,
    filters,
    events,
    files,
  });
});

router.get('/stays/:stayKey/files/:fileName/download', (req, res) => {
  const file = getStayLogFile(req.params.stayKey, req.params.fileName);
  if (!file) {
    return res.status(404).json({ error: 'Log file not found' });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
  return res.send(file.content);
});

router.get('/download/:category', (req, res) => {
  const info = getLogDownloadInfo(req.params.category);

  if (!info || !existsSync(info.path)) {
    return res.status(404).json({ error: 'Log file not found' });
  }

  return res.download(info.path, info.filename);
});

export default router;
