import crypto from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { InterpreterReport, Request, Stay } from '../models/index.js';
import { verifyStaffToken, verifyToken } from '../middleware/auth.js';
import { processStayTransitions } from '../services/stayLifecycle.js';
import { logOperationalError, logOperationalEvent } from '../services/operationalLogs.js';

const router = express.Router();
const DEFAULT_CALL_SERVER_PORT = '3101';
const DEFAULT_CALL_SERVER_PATH = '/calls';

function getCallJwtSecret() {
  return process.env.CALL_JWT_SECRET || process.env.JWT_SECRET;
}

function normalizeIsoDate(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function getForwardedProto(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string' && forwardedProto.trim()) {
    return forwardedProto.split(',')[0].trim();
  }

  return req.protocol || 'http';
}

function getForwardedHost(req) {
  const forwardedHost = req.headers['x-forwarded-host'];
  if (typeof forwardedHost === 'string' && forwardedHost.trim()) {
    return forwardedHost.split(',')[0].trim();
  }

  return req.get('host') || '';
}

function isPrivateIpv4(hostname) {
  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) {
    return true;
  }

  const match = hostname.match(/^172\.(\d{1,3})\./);
  if (!match) {
    return false;
  }

  const secondOctet = Number.parseInt(match[1], 10);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isLocalCallHost(hostname) {
  if (!hostname) {
    return false;
  }

  const normalizedHost = hostname.toLowerCase();
  return normalizedHost === 'localhost'
    || normalizedHost === '127.0.0.1'
    || normalizedHost === '::1'
    || normalizedHost === '[::1]'
    || normalizedHost.endsWith('.local')
    || isPrivateIpv4(normalizedHost);
}

function getCallServerUrl(req) {
  // Expose a fully public call URL only when the operator provides it explicitly.
  const configuredUrl = normalizeText(process.env.CALL_SERVER_URL, null);
  if (configuredUrl) {
    return configuredUrl;
  }

  const host = getForwardedHost(req);
  const protocol = getForwardedProto(req) === 'https' ? 'wss' : 'ws';
  // This path must stay aligned with the proxy route configured in index.js.
  const callPath = normalizeText(process.env.CALL_SERVER_PATH, DEFAULT_CALL_SERVER_PATH);
  const normalizedPath = callPath.startsWith('/') ? callPath : `/${callPath}`;
  const serverPort = normalizeText(process.env.CALL_SERVER_PORT, DEFAULT_CALL_SERVER_PORT);

  if (!host) {
    return `${protocol}://127.0.0.1:${serverPort}${normalizedPath}`;
  }

  const baseUrl = new URL(`${protocol}://${host}`);
  if (isLocalCallHost(baseUrl.hostname)) {
    baseUrl.port = serverPort;
  } else {
    baseUrl.port = '';
  }
  baseUrl.pathname = normalizedPath;
  baseUrl.search = '';
  baseUrl.hash = '';
  return baseUrl.toString();
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

function buildInitialRequestHistory(note) {
  return [
    {
      eventType: 'NEW_REQUEST',
      status: 'pending',
      changedBy: 'system',
      actorName: 'Interpreter bridge',
      note,
      timestamp: new Date(),
    },
  ];
}

function buildFollowUpNote(interpreterName, category) {
  return `Follow-up created from interpreter report${interpreterName ? ` by ${interpreterName}` : ''}${category ? ` (${category})` : ''}`;
}

async function resolveCallStayContext(user = {}) {
  const stayId = normalizeText(user.stayId, null);
  if (!stayId) {
    return { error: 'Stay token is missing stayId' };
  }

  const stay = await Stay.findOne({ stayId });
  if (!stay) {
    return { error: 'Stay was not found' };
  }

  const now = new Date();
  if (!stay.active || stay.status !== 'active' || stay.checkIn > now || stay.checkOut <= now) {
    return { error: 'Stay is not active for calls' };
  }

  const tokenRoomNumber = normalizeText(user.roomNumber, null);
  if (tokenRoomNumber && stay.roomNumber !== tokenRoomNumber) {
    return { error: 'Stay room number does not match session token' };
  }

  return { stay };
}

router.post('/session', verifyToken, async (req, res) => {
  try {
    await processStayTransitions();

    const stayContext = await resolveCallStayContext(req.user);
    if (!stayContext.stay) {
      logOperationalEvent('requests', 'CALL_SESSION_REJECTED', {
        stayId: req.user?.stayId,
        roomNumber: req.user?.roomNumber,
        guestName: req.user?.guestName,
        actor: req.user?.guestName,
        actorRole: 'guest',
        source: 'api:calls',
        message: stayContext.error || 'Stay validation failed for call session',
      }, 'warn');
      return res.status(401).json({ error: 'Stay is not active for calls' });
    }

    const stay = stayContext.stay;
    const { roomNumber, guestName } = req.user || {};
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

    logOperationalEvent('requests', 'CALL_SESSION_CREATED', {
      stayId: stay.stayId,
      roomNumber: stay.roomNumber || roomNumber,
      guestName: stay.guestName || guestName,
      actor: stay.guestName || guestName,
      actorRole: 'guest',
      source: 'api:calls',
      message: 'Call session created',
      metadata: {
        callId,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return res.json({
      callId,
      callToken,
      callServerUrl: getCallServerUrl(req),
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
    const requestedStayId = normalizeText(req.body?.stayId, null);
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

    const submittedAt = normalizeIsoDate(req.body?.submittedAt) || new Date();
    const activeStay = requestedStayId
      ? await Stay.findOne({ stayId: requestedStayId }).lean()
      : await Stay.findOne({
          roomNumber,
          active: true,
          status: 'active',
          checkIn: { $lte: submittedAt },
          checkOut: { $gt: submittedAt },
        }).sort({ checkIn: -1 }).lean();

    const stayId = activeStay?.stayId || requestedStayId || null;
    const resolvedGuestName = activeStay?.guestName || guestName;
    const existingReport = await InterpreterReport.findOne({ reportId }).lean();

    const report = await InterpreterReport.findOneAndUpdate(
      { reportId },
      {
        $set: {
          callId,
          stayId,
          roomNumber,
          guestName: resolvedGuestName,
          interpreterId,
          interpreterName,
          summary,
          priority,
          category,
          notes,
          followUpRequired,
          submittedAt,
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
      const existingFollowUp = existingReport?.requestId
        ? await Request.findOne({ requestId: existingReport.requestId }).lean()
        : await Request.findOne({ sourceReportId: reportId }).lean();
      const requestId = existingFollowUp?.requestId || buildRequestId();
      const requestTimestamp = existingFollowUp?.timestamp || submittedAt;
      const note = buildFollowUpNote(interpreterName, category);
      followUpRequest = await Request.findOneAndUpdate(
        { requestId },
        {
          $set: {
            requestId,
            sourceReportId: reportId,
            stayId: stayId || null,
            roomNumber,
            guestName: resolvedGuestName,
            type: 'interpreter-follow-up',
            message: summary,
            priority,
            status: 'pending',
            timestamp: requestTimestamp,
            'details.reportId': reportId,
            'details.callId': callId,
            'details.category': category,
            'details.interpreterNotes': notes,
            'details.interpreterId': interpreterId,
            'details.interpreterName': interpreterName,
          },
          $inc: { mutationVersion: 1 },
          $setOnInsert: {
            history: buildInitialRequestHistory(note),
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      ).lean();

      await InterpreterReport.updateOne({ _id: report._id }, { $set: { requestId: followUpRequest.requestId } });
    } else if (existingReport?.requestId) {
      followUpRequest = await Request.findOneAndUpdate(
        { requestId: existingReport.requestId },
        {
          $set: {
            status: 'cancelled',
            cancelledBy: null,
            cancelledByName: 'Interpreter bridge',
            cancelledAt: submittedAt,
          },
          $inc: { mutationVersion: 1 },
          $push: {
            history: {
              eventType: 'CANCEL_REQUEST',
              status: 'cancelled',
              changedBy: 'system',
              actorName: 'Interpreter bridge',
              note: 'Follow-up cancelled because the latest interpreter report no longer requires it',
              timestamp: submittedAt,
            },
          },
        },
        { new: true }
      ).lean();

      await InterpreterReport.updateOne({ _id: report._id }, { $set: { requestId: null } });
    }

    logOperationalEvent('requests', 'INTERPRETER_REPORT_RECEIVED', {
      stayId,
      roomNumber,
      guestName: resolvedGuestName,
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
        requestAction: followUpRequired
          ? (existingReport?.requestId ? 'updated-existing-follow-up' : 'created-follow-up')
          : (followUpRequest ? 'cancelled-follow-up' : 'report-only'),
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
