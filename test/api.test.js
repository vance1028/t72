'use strict';

const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { createApp } = require('../src/app');
const { waitForDb, close } = require('../src/db');
const store = require('../src/data/store');

const app = createApp();

async function login(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res;
}

async function tokenOf(username, password) {
  const res = await login(username, password);
  return res.body.data.token;
}

before(async () => {
  await waitForDb();
});

beforeEach(async () => {
  await store.seed();
});

after(async () => {
  await close();
});

test('GET /api/health 返回 ok', async () => {
  const res = await request(app).get('/api/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
});

/* ---------- 登录 ---------- */

test('登录成功返回 token 和用户信息', async () => {
  const res = await login('admin', 'admin123');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.token);
  assert.strictEqual(res.body.data.user.role, 'ADMIN');
});

test('密码错误返回 401', async () => {
  const res = await login('admin', 'wrongpass');
  assert.strictEqual(res.status, 401);
});

test('用户名不存在返回 401', async () => {
  const res = await login('nobody', 'x');
  assert.strictEqual(res.status, 401);
});

test('空用户名/密码返回 400', async () => {
  const res = await login('', '');
  assert.strictEqual(res.status, 400);
});

test('GET /api/auth/me 带 token 返回当前用户', async () => {
  const token = await tokenOf('manager', 'manager123');
  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.username, 'manager');
});

/* ---------- 鉴权拦截 ---------- */

test('未带 token 访问工程列表返回 401', async () => {
  const res = await request(app).get('/api/projects');
  assert.strictEqual(res.status, 401);
});

test('无效 token 返回 401', async () => {
  const res = await request(app).get('/api/projects').set('Authorization', 'Bearer not.a.token');
  assert.strictEqual(res.status, 401);
});

/* ---------- 工程查询 ---------- */

test('登录后能列出种子工程', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.total, 4);
});

test('工程列表支持按状态筛选', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/projects?status=MAINTENANCE').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.every((p) => p.status === 'MAINTENANCE'));
});

test('工程列表支持关键词搜索', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/projects?keyword=滨江').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.length, 1);
});

test('工程详情含设备子资源接口', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/projects/1/equipments').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.length >= 1);
});

/* ---------- 角色权限 ---------- */

test('管理员能新建工程', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app).post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'RF-NEW-1', name: '新增测试工程', district: '城关区' });
  assert.strictEqual(res.status, 201);
});

test('巡检员新建工程被拒 403', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'RF-NEW-2', name: 'x' });
  assert.strictEqual(res.status, 403);
});

test('工程编号重复返回 409', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app).post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'RF-2024-001', name: '重复编号' });
  assert.strictEqual(res.status, 409);
});

test('仅管理员能删除工程；管理员删除成功 204', async () => {
  const mgr = await tokenOf('manager', 'manager123');
  const denied = await request(app).delete('/api/projects/4').set('Authorization', `Bearer ${mgr}`);
  assert.strictEqual(denied.status, 403);

  const admin = await tokenOf('admin', 'admin123');
  const ok = await request(app).delete('/api/projects/4').set('Authorization', `Bearer ${admin}`);
  assert.strictEqual(ok.status, 204);
});

/* ---------- 检查记录 ---------- */

test('巡检员能登记检查记录', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).post('/api/inspections')
    .set('Authorization', `Bearer ${token}`)
    .send({ projectId: 1, inspectDate: '2026-06-05', type: 'ROUTINE', result: 'PASS' });
  assert.strictEqual(res.status, 201);
});

test('检查记录非法日期返回 400', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).post('/api/inspections')
    .set('Authorization', `Bearer ${token}`)
    .send({ projectId: 1, inspectDate: '2026/6/5' });
  assert.strictEqual(res.status, 400);
});

test('检查记录可按工程筛选', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/inspections?projectId=1').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.every((i) => i.projectId === 1));
});

test('未知接口返回 404', async () => {
  const res = await request(app).get('/api/unknown');
  assert.strictEqual(res.status, 404);
});

/* ---------- 隐患闭环流程 ---------- */

test('隐患列表能返回种子数据', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/hazards').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.total >= 5);
});

test('隐患能按工程和状态筛选', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/hazards?projectId=2&status=RECTIFYING').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.every((h) => h.projectId === 2 && h.status === 'RECTIFYING'));
});

test('获取单条隐患详情', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/hazards/1').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.id, 1);
  assert.strictEqual(res.body.data.description, '给排水泵故障，需更换');
});

test('巡检员能创建隐患（单独上报）', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).post('/api/hazards')
    .set('Authorization', `Bearer ${token}`)
    .send({ projectId: 1, description: '通风管道有裂缝', severity: 'MAJOR' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.status, 'PENDING');
  assert.strictEqual(res.body.data.severity, 'MAJOR');
  assert.strictEqual(res.body.data.discovererId, 3);
});

test('创建隐患时缺少描述返回 400', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).post('/api/hazards')
    .set('Authorization', `Bearer ${token}`)
    .send({ projectId: 1, severity: 'NORMAL' });
  assert.strictEqual(res.status, 400);
});

test('创建隐患时可关联检查记录', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).post('/api/hazards')
    .set('Authorization', `Bearer ${token}`)
    .send({ projectId: 2, inspectionId: 2, description: '隐患来自检查记录', severity: 'NORMAL' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.inspectionId, 2);
});

test('管理员能对 PENDING 隐患派工', async () => {
  const token = await tokenOf('manager', 'manager123');
  const res = await request(app).post('/api/hazards/3/assign')
    .set('Authorization', `Bearer ${token}`)
    .send({ assigneeId: 4, deadline: '2026-07-01' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.hazard.status, 'RECTIFYING');
  assert.strictEqual(res.body.data.rectification.assigneeId, 4);
});

test('不能对非 PENDING 状态的隐患派工', async () => {
  const token = await tokenOf('manager', 'manager123');
  const res = await request(app).post('/api/hazards/1/assign')
    .set('Authorization', `Bearer ${token}`)
    .send({ assigneeId: 4, deadline: '2026-07-01' });
  assert.strictEqual(res.status, 400);
});

test('隐患流转日志可查询', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/hazards/1/logs').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.length >= 1);
  assert.strictEqual(res.body.data[0].action, 'CREATED');
});

test('创建隐患后日志记录 CREATED 操作', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  await request(app).post('/api/hazards')
    .set('Authorization', `Bearer ${token}`)
    .send({ projectId: 1, description: '测试日志', severity: 'NORMAL' });

  const list = await request(app).get('/api/hazards?status=PENDING').set('Authorization', `Bearer ${token}`);
  const newHazard = list.body.data[0];
  const logs = await request(app).get(`/api/hazards/${newHazard.id}/logs`).set('Authorization', `Bearer ${token}`);
  assert.ok(logs.body.data.some((l) => l.action === 'CREATED'));
});

/* ---------- 整改工单闭环 ---------- */

test('整改责任人能上报整改情况', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).post('/api/rectifications/1/report')
    .set('Authorization', `Bearer ${token}`)
    .send({ rectifyAction: '已更换给排水泵并试运行正常', rectifyRemark: '费用约1.2万' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.status, 'RECTIFIED');

  const hazard = await request(app).get('/api/hazards/1').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(hazard.body.data.status, 'PENDING_REINSPECTION');
});

test('不能对非整改中的工单上报', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).post('/api/rectifications/2/report')
    .set('Authorization', `Bearer ${token}`)
    .send({ rectifyAction: '重复上报' });
  assert.strictEqual(res.status, 400);
});

test('复查通过后隐患销号关闭', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).post('/api/rectifications/2/reinspect')
    .set('Authorization', `Bearer ${token}`)
    .send({ result: 'PASS', remark: '整改到位' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.rectification.status, 'CLOSED');
  assert.strictEqual(res.body.data.hazard.status, 'CLOSED');
});

test('复查不通过打回重改', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).post('/api/rectifications/2/reinspect')
    .set('Authorization', `Bearer ${token}`)
    .send({ result: 'FAIL', remark: '整改不到位', newDeadline: '2026-07-15' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.rectification.status, 'RECTIFYING');
  assert.strictEqual(res.body.data.hazard.status, 'RECTIFYING');
  assert.strictEqual(res.body.data.rectification.deadline, '2026-07-15');
});

test('不能跳过复查直接销号', async () => {
  const mgr = await tokenOf('manager', 'manager123');
  const insp = await tokenOf('inspector', 'inspect123');

  await request(app).post('/api/hazards')
    .set('Authorization', `Bearer ${insp}`)
    .send({ projectId: 1, description: '不能跳过复查', severity: 'NORMAL' });

  const list = await request(app).get('/api/hazards?status=PENDING').set('Authorization', `Bearer ${insp}`);
  const h = list.body.data[0];

  await request(app).post(`/api/hazards/${h.id}/assign`)
    .set('Authorization', `Bearer ${mgr}`)
    .send({ assigneeId: 4, deadline: '2026-08-01' });

  const rects = await request(app).get(`/api/hazards/${h.id}/rectifications`).set('Authorization', `Bearer ${insp}`);
  const rectId = rects.body.data[0].id;

  await request(app).post(`/api/rectifications/${rectId}/report`)
    .set('Authorization', `Bearer ${insp}`)
    .send({ rectifyAction: '已整改' });

  const reinspectRes = await request(app).post(`/api/rectifications/${rectId}/reinspect`)
    .set('Authorization', `Bearer ${insp}`)
    .send({ result: 'FAIL', remark: '不通过' });
  assert.strictEqual(reinspectRes.status, 200);
  assert.strictEqual(reinspectRes.body.data.hazard.status, 'RECTIFYING');

  const hazard = await request(app).get(`/api/hazards/${h.id}`).set('Authorization', `Bearer ${insp}`);
  assert.notStrictEqual(hazard.body.data.status, 'CLOSED');
});

test('打回重改后之前的整改记录保留', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).post('/api/rectifications/2/reinspect')
    .set('Authorization', `Bearer ${token}`)
    .send({ result: 'FAIL', remark: '不通过' });
  assert.strictEqual(res.status, 200);

  const rect = await request(app).get('/api/rectifications/2').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(rect.body.data.rectifyAction, '已更换全部滤毒组件并调试完成');
  assert.strictEqual(rect.body.data.status, 'RECTIFYING');
});

test('整改工单可按隐患和责任人筛选', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/rectifications?hazardId=1').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.every((r) => r.hazardId === 1));
});

test('复查记录可查询', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/rectifications/4/reinspections').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.length >= 1);
});

/* ---------- 隐患升级机制 ---------- */

test('管理员能升级隐患', async () => {
  const token = await tokenOf('manager', 'manager123');
  const res = await request(app).post('/api/hazards/1/escalate')
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.escalated, true);
});

test('已升级的隐患不能重复升级', async () => {
  const token = await tokenOf('manager', 'manager123');
  await request(app).post('/api/hazards/4/escalate')
    .set('Authorization', `Bearer ${token}`);
  const res = await request(app).post('/api/hazards/4/escalate')
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 400);
});

test('已销号的隐患不能升级', async () => {
  const token = await tokenOf('manager', 'manager123');
  const res = await request(app).post('/api/hazards/5/escalate')
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 400);
});

/* ---------- 统计看板 ---------- */

test('统计看板返回各工程未销号隐患数', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/stats/hazards').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.data.unclosedByProject));
  assert.ok(res.body.data.unclosedByProject.length >= 1);
});

test('统计看板返回严重等级分布', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/stats/hazards').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.data.severityDistribution));
  assert.ok(res.body.data.severityDistribution.length >= 1);
});

test('统计看板返回整改及时率', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/stats/hazards').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(typeof res.body.data.timelyRate.rate === 'number');
});

test('统计看板返回超期未整改清单', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/stats/hazards').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.data.overdueList));
});
