'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired, requireRole } = require('../auth');
const { sendError, isNonEmptyString, toPositiveInt, isValidDate } = require('../utils/http');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const VALID_SEVERITY = ['NORMAL', 'MAJOR', 'CRITICAL'];
const VALID_STATUS = ['PENDING', 'RECTIFYING', 'PENDING_REINSPECTION', 'CLOSED'];

router.use(authRequired);

router.get('/', wrap(async (req, res) => {
  const filters = {};
  if (req.query.projectId !== undefined) {
    const pid = toPositiveInt(req.query.projectId);
    if (pid === null) return sendError(res, 400, '无效的工程 ID');
    filters.projectId = pid;
  }
  if (req.query.status !== undefined) {
    if (!VALID_STATUS.includes(req.query.status)) return sendError(res, 400, `状态只能是 ${VALID_STATUS.join(' / ')}`);
    filters.status = req.query.status;
  }
  if (req.query.severity !== undefined) {
    if (!VALID_SEVERITY.includes(req.query.severity)) return sendError(res, 400, `严重等级只能是 ${VALID_SEVERITY.join(' / ')}`);
    filters.severity = req.query.severity;
  }
  const list = await store.listHazards(filters);
  res.json({ data: list, total: list.length });
}));

router.get('/:id', wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的隐患 ID');
  const h = await store.getHazard(id);
  if (!h) return sendError(res, 404, '隐患不存在');
  res.json({ data: h });
}));

router.post('/', requireRole('ADMIN', 'MANAGER', 'INSPECTOR'), wrap(async (req, res) => {
  const b = req.body || {};
  const pid = toPositiveInt(b.projectId);
  if (pid === null) return sendError(res, 400, '必须指定有效的工程 ID');
  if (!(await store.getProject(pid))) return sendError(res, 400, '人防工程不存在');
  if (!isNonEmptyString(b.description)) return sendError(res, 400, '隐患描述不能为空');
  if (b.severity !== undefined && !VALID_SEVERITY.includes(b.severity)) {
    return sendError(res, 400, `严重等级只能是 ${VALID_SEVERITY.join(' / ')}`);
  }
  let inspectionId = null;
  if (b.inspectionId !== undefined) {
    inspectionId = toPositiveInt(b.inspectionId);
    if (inspectionId === null) return sendError(res, 400, '无效的检查记录 ID');
  }
  const hazard = await store.createHazard({
    projectId: pid,
    inspectionId,
    description: b.description.trim(),
    severity: b.severity || 'NORMAL',
    discovererId: req.user.id,
  });
  await store.createHazardLog({
    hazardId: hazard.id, action: 'CREATED', operatorId: req.user.id,
    detail: inspectionId ? '从检查记录生成隐患' : '单独上报隐患',
  });
  res.status(201).json({ data: hazard });
}));

router.post('/:id/assign', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的隐患 ID');
  const hazard = await store.getHazard(id);
  if (!hazard) return sendError(res, 404, '隐患不存在');
  if (hazard.status !== 'PENDING') return sendError(res, 400, '只有待派工状态的隐患才能派工');

  const b = req.body || {};
  const assigneeId = toPositiveInt(b.assigneeId);
  if (assigneeId === null) return sendError(res, 400, '必须指定整改责任人');
  if (!(await store.getUser(assigneeId))) return sendError(res, 400, '责任人用户不存在');
  if (!isValidDate(b.deadline)) return sendError(res, 400, '整改期限格式必须为 YYYY-MM-DD');

  const rect = await store.createRectification({
    hazardId: id,
    assigneeId,
    deadline: b.deadline,
    description: typeof b.description === 'string' ? b.description : '',
  });

  await store.updateHazard(id, { status: 'RECTIFYING' });
  await store.createHazardLog({
    hazardId: id, action: 'ASSIGNED', operatorId: req.user.id,
    detail: `派工给用户${assigneeId}，期限${b.deadline}`,
  });

  const updated = await store.getHazard(id);
  res.json({ data: { hazard: updated, rectification: rect } });
}));

router.get('/:id/logs', wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的隐患 ID');
  if (!(await store.getHazard(id))) return sendError(res, 404, '隐患不存在');
  const logs = await store.listHazardLogs(id);
  res.json({ data: logs, total: logs.length });
}));

router.get('/:id/rectifications', wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的隐患 ID');
  if (!(await store.getHazard(id))) return sendError(res, 404, '隐患不存在');
  const list = await store.listRectifications({ hazardId: id });
  res.json({ data: list, total: list.length });
}));

router.post('/:id/escalate', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的隐患 ID');
  const hazard = await store.getHazard(id);
  if (!hazard) return sendError(res, 404, '隐患不存在');
  if (hazard.escalated) return sendError(res, 400, '该隐患已升级');
  if (hazard.status === 'CLOSED') return sendError(res, 400, '已销号的隐患不能升级');

  await store.updateHazard(id, { escalated: true });
  await store.createHazardLog({
    hazardId: id, action: 'ESCALATED', operatorId: req.user.id,
    detail: '隐患已升级，已通知工程主管',
  });

  const updated = await store.getHazard(id);
  res.json({ data: updated });
}));

module.exports = router;
