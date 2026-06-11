'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired, requireRole } = require('../auth');
const { sendError, isNonEmptyString, toPositiveInt, isValidDate } = require('../utils/http');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(authRequired);

router.get('/', wrap(async (req, res) => {
  const filters = {};
  if (req.query.hazardId !== undefined) {
    const hid = toPositiveInt(req.query.hazardId);
    if (hid === null) return sendError(res, 400, '无效的隐患 ID');
    filters.hazardId = hid;
  }
  if (req.query.assigneeId !== undefined) {
    const aid = toPositiveInt(req.query.assigneeId);
    if (aid === null) return sendError(res, 400, '无效的责任人 ID');
    filters.assigneeId = aid;
  }
  if (req.query.status !== undefined) {
    filters.status = req.query.status;
  }
  const list = await store.listRectifications(filters);
  res.json({ data: list, total: list.length });
}));

router.get('/:id', wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的工单 ID');
  const r = await store.getRectification(id);
  if (!r) return sendError(res, 404, '整改工单不存在');
  res.json({ data: r });
}));

router.post('/:id/report', requireRole('ADMIN', 'MANAGER', 'INSPECTOR'), wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的工单 ID');
  const rect = await store.getRectification(id);
  if (!rect) return sendError(res, 404, '整改工单不存在');
  if (rect.status !== 'ASSIGNED' && rect.status !== 'RECTIFYING') {
    return sendError(res, 400, '只有待整改或整改中的工单才能上报整改情况');
  }

  const b = req.body || {};
  if (!isNonEmptyString(b.rectifyAction)) return sendError(res, 400, '整改措施不能为空');

  const now = new Date().toISOString().slice(0, 23).replace('T', ' ');
  const updated = await store.updateRectification(id, {
    status: 'RECTIFIED',
    rectifyAction: b.rectifyAction.trim(),
    rectifyRemark: typeof b.rectifyRemark === 'string' ? b.rectifyRemark : '',
    rectifiedAt: now,
  });

  await store.updateHazard(rect.hazardId, { status: 'PENDING_REINSPECTION' });
  await store.createHazardLog({
    hazardId: rect.hazardId, action: 'RECTIFIED', operatorId: req.user.id,
    detail: `上报整改：${b.rectifyAction.trim()}`,
  });

  res.json({ data: updated });
}));

router.post('/:id/reinspect', requireRole('ADMIN', 'MANAGER', 'INSPECTOR'), wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的工单 ID');
  const rect = await store.getRectification(id);
  if (!rect) return sendError(res, 404, '整改工单不存在');
  if (rect.status !== 'RECTIFIED') return sendError(res, 400, '只有已整改的工单才能复查');

  const hazard = await store.getHazard(rect.hazardId);
  if (!hazard || hazard.status !== 'PENDING_REINSPECTION') {
    return sendError(res, 400, '隐患不在待复查状态，无法复查');
  }

  const b = req.body || {};
  const result = b.result || 'PASS';
  if (result !== 'PASS' && result !== 'FAIL') {
    return sendError(res, 400, '复查结果只能是 PASS / FAIL');
  }

  const ri = await store.createReinspection({
    rectificationId: id,
    inspectorId: req.user.id,
    result,
    remark: typeof b.remark === 'string' ? b.remark : '',
  });

  if (result === 'PASS') {
    await store.updateRectification(id, { status: 'CLOSED' });
    await store.updateHazard(rect.hazardId, { status: 'CLOSED' });
    await store.createHazardLog({
      hazardId: rect.hazardId, action: 'REINSPECTED', operatorId: req.user.id,
      detail: '复查通过，销号关闭',
    });
  } else {
    const bDeadline = b.newDeadline;
    const patch = { status: 'RECTIFYING' };
    if (bDeadline && isValidDate(bDeadline)) {
      patch.deadline = bDeadline;
    }
    await store.updateRectification(id, patch);
    await store.updateHazard(rect.hazardId, { status: 'RECTIFYING' });
    await store.createHazardLog({
      hazardId: rect.hazardId, action: 'REJECTED', operatorId: req.user.id,
      detail: `复查不通过，打回重改${bDeadline ? '，新期限' + bDeadline : ''}`,
    });
  }

  res.json({ data: { reinspection: ri, rectification: await store.getRectification(id), hazard: await store.getHazard(rect.hazardId) } });
}));

router.get('/:id/reinspections', wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的工单 ID');
  if (!(await store.getRectification(id))) return sendError(res, 404, '整改工单不存在');
  const list = await store.listReinspections({ rectificationId: id });
  res.json({ data: list, total: list.length });
}));

module.exports = router;
