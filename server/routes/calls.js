import crypto from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { InterpreterReport, Request, Stay } from '../models/index.js';
import { verifyStaffToken, verifyToken } from '../middleware/auth.js';
import { processStayTransitions } from '../services/stayLifecycle.js';
import { logOperationalError, logOperationalEvent } from '../services/operationalLogs.js';

const router = express.Router();

function getCallJwtSecret() {
  return process.env.CALL_JWT_SECRET || process.env.JWT_SECRET;
}

function getCallServerUrl() {
  return process.env.CALL_SERVER_URL || 'ws://localhost:3101/calls';
}

function buildRequestId() {
  return `report-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function normalizeText(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeBool(value, fallback = true) {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
}

router.post('/session', verifyToken, async (req, res) => {
  try {
    await processStayTransitions();

    const { stayId, roomNumber, guestName } = req.user || {};
    const stay = await Stay.findOne({ stayId });

    if (!stay || !stay.active || stay.checkOut <= new Date()) {
      return res.status(401).json({ error: 'Stay is not active for calls' });
    }

    const callId = `call-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const callToken = jwt.sign(
      {
        scope: 'call',
        clientType: 'guest',
        callId,
        stayId: stay.stayId,
        roomNumber: stay.roomNumber || roomNumber,
        guestName: stay.guestName || guestName || 'Guest',
      },
      getCallJwtSecret(),
      { expiresIn: '15m' }
    );

    return res.json({
      callId,
      callToken,
      callServerUrl: getCallServerUrl(),
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    logOperationalError('CALL_SESSION_CREATE_FAILED', error, {
      stayId: req.user?.stayId,
      roomNumber: req.user?.roomNumber,
      guestName: req.user?.guestName,
      actor: req.user?.guestName,
      actorRole: 'guest',
      source: 'api:calls',
    });
    return res.status(500).json({ error: 'Unable to create call session' });
  }
});

router.post('/internal/interpreter-reports', async (req, res) => {
  const internalToken = req.headers['x-internal-token'];
  if (!process.env.CALL_INTERNAL_TOKEN || internalToken !== process.env.CALL_INTERNAL_TOKEN) {
    return res.status(401).json({ error: 'Invalid internal token' });
  }

  try {
    const reportId = normalizeText(req.body?.reportId, `ir-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    const callId = normalizeText(req.body?.callId);
    const stayId = normalizeText(req.body?.stayId, null);
    const roomNumber = normalizeText(req.body?.roomNumber);
    const guestName = normalizeText(req.body?.guestName, 'Guest');
    const interpreterId = normalizeText(req.body?.interpreterId);
    const interpreterName = normalizeText(req.body?.interpreterName);
    const summary = normalizeText(req.body?.summary);
    const priority = normalizeText(req.body?.priority, 'medium');
    const category = normalizeText(req.body?.category);
    const notes = normalizeText(req.body?.notes, '');
    const followUpRequired = normalizeBool(req.body?.followUpRequired, true);

    if (!callId || !roomNumber || !interpreterId || !interpreterName || !summary || !category) {
      return res.status(400).json({ error: 'Missing required report fields' });
    }

    const report = await InterpreterReport.findOneAndUpdate(
      { reportId },
      {
        $set: {
          callId,
          stayId,
          roomNumber,
          guestName,
          interpreterId,
          interpreterName,
          summary,
          priority,
          category,
          notes,
          followUpRequired,
          submittedAt: req.body?.submittedAt ? new Date(req.body.submittedAt) : new Date(),
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    let followUpRequest = null;
    if (followUpRequired) {
      const requestId = buildRequestId();
      followUpRequest = await Request.findOneAndUpdate(
        { requestId },
        {
          $set: {
            requestId,
            stayId: stayId || null,
            roomNumber,
            guestName,
            type: 'interpreter-follow-up',
            message: summary,
            priority,
            status: 'pending',
            timestamp: new Date(),
            details: {
              reportId,
              callId,
              category,
              interpreterNotes: notes,
              interpreterId,
              interpreterName,
            },
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      ).lean();

      await InterpreterReport.updateOne({ _id: report._id }, { $set: { requestId: followUpRequest.requestId } });
    }

    logOperationalEvent('requests', 'INTERPRETER_REPORT_RECEIVED', {
      stayId,
      roomNumber,
      guestName,
      requestId: followUpRequest?.requestId || null,
      actor: interpreterName,
      actorRole: 'interpreter',
      source: 'api:calls',
      message: summary,
      metadata: {
        reportId,
        callId,
        category,
        priority,
        followUpRequired,
      },
    });

    return res.status(201).json({
      report: report.toObject(),
      request: followUpRequest,
    });
  } catch (error) {
    logOperationalError('INTERPRETER_REPORT_CREATE_FAILED', error, {
      stayId: req.body?.stayId,
      roomNumber: req.body?.roomNumber,
      guestName: req.body?.guestName,
      actor: req.body?.interpreterName,
      actorRole: 'interpreter',
      source: 'api:calls',
    });
    return res.status(500).json({ error: 'Unable to persist interpreter report' });
  }
});

router.get('/interpreter-reports', verifyStaffToken, async (_req, res) => {
  try {
    const reports = await InterpreterReport.find().sort({ submittedAt: -1 }).limit(200).lean();
    return res.json({ reports });
  } catch (_error) {
    return res.status(500).json({ error: 'Unable to fetch interpreter reports' });
  }
});

router.get('/interpreter-reports/:reportId', verifyStaffToken, async (req, res) => {
  try {
    const report = await InterpreterReport.findOne({ reportId: req.params.reportId }).lean();
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    return res.json({ report });
  } catch (_error) {
    return res.status(500).json({ error: 'Unable to fetch interpreter report' });
  }
});

export default router;
