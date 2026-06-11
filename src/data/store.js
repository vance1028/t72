'use strict';

/**
 * 数据仓储层 - 基于 MySQL（mysql2/promise）。
 * 所有方法 async，返回 camelCase 字段对象。
 */

const { pool } = require('../db');
const { hashPassword } = require('../utils/password');

/* ----------------------------- 映射 ----------------------------- */

function mapUser(r) {
  if (!r) return null;
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    role: r.role,
    department: r.department,
    status: r.status,
    createdAt: r.created_at,
  };
}

// 含密码哈希的内部映射，仅登录校验用，绝不直接返回给前端
function mapUserWithHash(r) {
  if (!r) return null;
  return { ...mapUser(r), passwordHash: r.password_hash };
}

function mapProject(r) {
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    protectionLevel: r.protection_level,
    areaSqm: Number(r.area_sqm),
    address: r.address,
    district: r.district,
    peacetimeUse: r.peacetime_use,
    status: r.status,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapEquipment(r) {
  if (!r) return null;
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    category: r.category,
    model: r.model,
    installDate: r.install_date,
    status: r.status,
    createdAt: r.created_at,
  };
}

function mapInspection(r) {
  if (!r) return null;
  return {
    id: r.id,
    projectId: r.project_id,
    inspectorId: r.inspector_id,
    inspectDate: r.inspect_date,
    type: r.type,
    result: r.result,
    issues: r.issues,
    createdAt: r.created_at,
  };
}

function mapHazard(r) {
  if (!r) return null;
  return {
    id: r.id,
    projectId: r.project_id,
    inspectionId: r.inspection_id,
    description: r.description,
    severity: r.severity,
    status: r.status,
    discovererId: r.discoverer_id,
    discoveredAt: r.discovered_at,
    escalated: !!r.escalated,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapRectification(r) {
  if (!r) return null;
  return {
    id: r.id,
    hazardId: r.hazard_id,
    assigneeId: r.assignee_id,
    deadline: r.deadline,
    description: r.description,
    status: r.status,
    rectifyAction: r.rectify_action,
    rectifyRemark: r.rectify_remark,
    rectifiedAt: r.rectified_at,
    parentId: r.parent_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapReinspection(r) {
  if (!r) return null;
  return {
    id: r.id,
    rectificationId: r.rectification_id,
    inspectorId: r.inspector_id,
    result: r.result,
    remark: r.remark,
    reinspectedAt: r.reinspected_at,
    createdAt: r.created_at,
  };
}

function mapHazardLog(r) {
  if (!r) return null;
  return {
    id: r.id,
    hazardId: r.hazard_id,
    action: r.action,
    operatorId: r.operator_id,
    detail: r.detail,
    createdAt: r.created_at,
  };
}

/* --------------------------- 初始化/重置 --------------------------- */

async function seed() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of ['hazard_logs', 'reinspections', 'rectifications', 'hazards', 'inspections', 'equipments', 'projects', 'users']) {
      await conn.query(`TRUNCATE TABLE ${t}`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // 用户（密码运行时哈希）：admin/admin123, manager/manager123, inspector/inspect123
    await conn.query(
      `INSERT INTO users (id, username, password_hash, name, role, department) VALUES
        (1, 'admin', ?, '系统管理员', 'ADMIN', '人防办信息科'),
        (2, 'manager', ?, '张管理', 'MANAGER', '工程管理科'),
        (3, 'inspector', ?, '李巡检', 'INSPECTOR', '维护管理科'),
        (4, 'worker', ?, '王施工', 'INSPECTOR', '施工班组')`,
      [hashPassword('admin123'), hashPassword('manager123'), hashPassword('inspect123'), hashPassword('worker123')],
    );

    await conn.query(
      `INSERT INTO projects (id, code, name, type, protection_level, area_sqm, address, district, peacetime_use, status, completed_at) VALUES
        (1, 'RF-2024-001', '中心广场地下人防工程', 'COMBINED', '6', 8600.50, '人民中路1号地下', '城关区', '地下停车场', 'NORMAL', '2018-09-01'),
        (2, 'RF-2024-002', '滨江路防空地下室', 'BASEMENT', '6B', 3200.00, '滨江路88号', '江南区', '商业仓储', 'NORMAL', '2020-05-15'),
        (3, 'RF-2024-003', '老城区单建掘开式工程', 'SINGLE', '5', 5400.00, '解放街地下', '城关区', '暂未利用', 'MAINTENANCE', '2010-03-20'),
        (4, 'RF-2024-004', '科技园人员掩蔽所', 'SHELTER', '6', 2100.00, '科技大道12号地下', '高新区', '社区活动中心', 'NORMAL', '2021-11-30')`,
    );

    await conn.query(
      `INSERT INTO equipments (project_id, name, category, model, install_date, status) VALUES
        (1, '1号防护密闭门', 'PROTECTIVE_DOOR', 'HFM2030', '2018-08-01', 'NORMAL'),
        (1, '战时通风机', 'VENTILATION', 'F300', '2018-08-10', 'NORMAL'),
        (1, '柴油发电机组', 'POWER', '50GF', '2018-08-15', 'NORMAL'),
        (2, '防爆波活门', 'PROTECTIVE_DOOR', 'HK600', '2020-04-20', 'NORMAL'),
        (2, '给排水泵', 'WATER', 'WQ15', '2020-05-01', 'FAULT'),
        (3, '滤毒通风设备', 'VENTILATION', 'LD60', '2010-03-01', 'MAINTENANCE')`,
    );

    await conn.query(
      `INSERT INTO inspections (project_id, inspector_id, inspect_date, type, result, issues) VALUES
        (1, 3, '2026-05-10', 'ROUTINE', 'PASS', ''),
        (2, 3, '2026-05-12', 'ROUTINE', 'FAIL', '给排水泵故障，需更换'),
        (3, 3, '2026-04-20', 'SPECIAL', 'FAIL', '滤毒设备老化，建议大修'),
        (1, 3, '2026-06-01', 'ROUTINE', 'PASS', '')`,
    );

    await conn.query(
      `INSERT INTO hazards (id, project_id, inspection_id, description, severity, status, discoverer_id, discovered_at, escalated) VALUES
        (1, 2, 2, '给排水泵故障，需更换', 'NORMAL', 'RECTIFYING', 3, '2026-05-12 10:00:00.000', 0),
        (2, 3, 3, '滤毒设备老化，建议大修', 'MAJOR', 'PENDING_REINSPECTION', 3, '2026-04-20 14:30:00.000', 0),
        (3, 1, NULL, '防护密闭门密封条老化', 'NORMAL', 'PENDING', 3, '2026-06-05 09:00:00.000', 0),
        (4, 3, NULL, '通风管道锈蚀严重', 'CRITICAL', 'RECTIFYING', 3, '2026-05-01 08:00:00.000', 1),
        (5, 2, NULL, '防爆波活门启闭不灵活', 'NORMAL', 'CLOSED', 3, '2026-04-10 11:00:00.000', 0)`,
    );

    await conn.query(
      `INSERT INTO rectifications (id, hazard_id, assignee_id, deadline, description, status, rectify_action, rectify_remark, rectified_at) VALUES
        (1, 1, 4, '2026-06-15', '更换给排水泵', 'RECTIFYING', '', '', NULL),
        (2, 2, 4, '2026-05-30', '大修滤毒通风设备', 'RECTIFIED', '已更换全部滤毒组件并调试完成', '费用约2.3万', '2026-05-28 16:00:00.000'),
        (3, 4, 4, '2026-05-20', '更换锈蚀通风管道', 'RECTIFYING', '', '', NULL),
        (4, 5, 4, '2026-04-25', '检修防爆波活门', 'CLOSED', '已清理锈迹并涂抹防锈脂', '建议定期维护', '2026-04-22 15:00:00.000')`,
    );

    await conn.query(
      `INSERT INTO reinspections (id, rectification_id, inspector_id, result, remark, reinspected_at) VALUES
        (1, 4, 3, 'PASS', '整改到位，可销号', '2026-04-23 10:00:00.000')`,
    );

    await conn.query(
      `INSERT INTO hazard_logs (hazard_id, action, operator_id, detail) VALUES
        (1, 'CREATED', 3, '从检查记录生成隐患'),
        (1, 'ASSIGNED', 2, '派工给王施工，期限2026-06-15'),
        (2, 'CREATED', 3, '从检查记录生成隐患'),
        (2, 'ASSIGNED', 2, '派工给王施工，期限2026-05-30'),
        (2, 'RECTIFIED', 4, '已更换全部滤毒组件并调试完成'),
        (3, 'CREATED', 3, '单独上报隐患'),
        (4, 'CREATED', 3, '单独上报隐患'),
        (4, 'ASSIGNED', 2, '派工给王施工，期限2026-05-20'),
        (4, 'ESCALATED', 2, '重大隐患超期未整改，已通知工程主管'),
        (5, 'CREATED', 3, '单独上报隐患'),
        (5, 'ASSIGNED', 2, '派工给王施工，期限2026-04-25'),
        (5, 'RECTIFIED', 4, '已清理锈迹并涂抹防锈脂'),
        (5, 'REINSPECTED', 3, '复查通过，销号')`,
    );
  } finally {
    conn.release();
  }
}

async function isEmpty() {
  const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
  return rows[0].cnt === 0;
}

/* ----------------------------- 用户 ----------------------------- */

async function findUserByUsername(username) {
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
  return mapUserWithHash(rows[0]);
}

async function getUser(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return mapUser(rows[0]);
}

async function listUsers() {
  const [rows] = await pool.query('SELECT * FROM users ORDER BY id');
  return rows.map(mapUser);
}

async function createUser({ username, password, name = '', role = 'INSPECTOR', department = '' }) {
  const [r] = await pool.query(
    'INSERT INTO users (username, password_hash, name, role, department) VALUES (?, ?, ?, ?, ?)',
    [username, hashPassword(password), name, role, department],
  );
  return getUser(r.insertId);
}

/* ----------------------------- 人防工程 ----------------------------- */

async function listProjects({ status, district, keyword } = {}) {
  const where = [];
  const params = [];
  if (status !== undefined) { where.push('status = ?'); params.push(status); }
  if (district !== undefined) { where.push('district = ?'); params.push(district); }
  if (keyword !== undefined && keyword !== '') {
    where.push('(name LIKE ? OR code LIKE ? OR address LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(`SELECT * FROM projects ${clause} ORDER BY id`, params);
  return rows.map(mapProject);
}

async function getProject(id) {
  const [rows] = await pool.query('SELECT * FROM projects WHERE id = ?', [id]);
  return mapProject(rows[0]);
}

async function findProjectByCode(code) {
  const [rows] = await pool.query('SELECT * FROM projects WHERE code = ?', [code]);
  return mapProject(rows[0]);
}

async function createProject(p) {
  const [r] = await pool.query(
    `INSERT INTO projects (code, name, type, protection_level, area_sqm, address, district, peacetime_use, status, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.code, p.name, p.type || 'COMBINED', p.protectionLevel || '6', p.areaSqm || 0,
     p.address || '', p.district || '', p.peacetimeUse || '', p.status || 'NORMAL', p.completedAt || null],
  );
  return getProject(r.insertId);
}

async function updateProject(id, patch) {
  const map = {
    name: 'name', type: 'type', protectionLevel: 'protection_level', areaSqm: 'area_sqm',
    address: 'address', district: 'district', peacetimeUse: 'peacetime_use',
    status: 'status', completedAt: 'completed_at',
  };
  const sets = [];
  const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) { sets.push(`${col} = ?`); params.push(patch[k]); }
  }
  if (sets.length) {
    sets.push('updated_at = CURRENT_TIMESTAMP(3)');
    params.push(id);
    await pool.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, params);
  }
  return getProject(id);
}

async function deleteProject(id) {
  const [r] = await pool.query('DELETE FROM projects WHERE id = ?', [id]);
  return r.affectedRows > 0;
}

/* ----------------------------- 设备设施 ----------------------------- */

async function listEquipments(projectId) {
  const [rows] = await pool.query(
    'SELECT * FROM equipments WHERE project_id = ? ORDER BY id', [projectId]);
  return rows.map(mapEquipment);
}

async function createEquipment(e) {
  const [r] = await pool.query(
    `INSERT INTO equipments (project_id, name, category, model, install_date, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [e.projectId, e.name, e.category || 'OTHER', e.model || '', e.installDate || null, e.status || 'NORMAL'],
  );
  const [rows] = await pool.query('SELECT * FROM equipments WHERE id = ?', [r.insertId]);
  return mapEquipment(rows[0]);
}

/* ----------------------------- 检查记录 ----------------------------- */

async function listInspections({ projectId } = {}) {
  if (projectId !== undefined) {
    const [rows] = await pool.query(
      'SELECT * FROM inspections WHERE project_id = ? ORDER BY inspect_date DESC, id DESC', [projectId]);
    return rows.map(mapInspection);
  }
  const [rows] = await pool.query('SELECT * FROM inspections ORDER BY inspect_date DESC, id DESC');
  return rows.map(mapInspection);
}

async function createInspection(i) {
  const [r] = await pool.query(
    `INSERT INTO inspections (project_id, inspector_id, inspect_date, type, result, issues)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [i.projectId, i.inspectorId || null, i.inspectDate, i.type || 'ROUTINE', i.result || 'PASS', i.issues || ''],
  );
  const [rows] = await pool.query('SELECT * FROM inspections WHERE id = ?', [r.insertId]);
  return mapInspection(rows[0]);
}

/* ----------------------------- 隐患记录 ----------------------------- */

async function listHazards({ projectId, status, severity } = {}) {
  const where = [];
  const params = [];
  if (projectId !== undefined) { where.push('h.project_id = ?'); params.push(projectId); }
  if (status !== undefined) { where.push('h.status = ?'); params.push(status); }
  if (severity !== undefined) { where.push('h.severity = ?'); params.push(severity); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT h.* FROM hazards h ${clause} ORDER BY h.created_at DESC, h.id DESC`, params);
  return rows.map(mapHazard);
}

async function getHazard(id) {
  const [rows] = await pool.query('SELECT * FROM hazards WHERE id = ?', [id]);
  return mapHazard(rows[0]);
}

async function createHazard(h) {
  const [r] = await pool.query(
    `INSERT INTO hazards (project_id, inspection_id, description, severity, status, discoverer_id, discovered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [h.projectId, h.inspectionId || null, h.description, h.severity || 'NORMAL',
     h.status || 'PENDING', h.discovererId, h.discoveredAt || new Date().toISOString().slice(0, 23).replace('T', ' ')],
  );
  const [rows] = await pool.query('SELECT * FROM hazards WHERE id = ?', [r.insertId]);
  return mapHazard(rows[0]);
}

async function updateHazard(id, patch) {
  const map = {
    status: 'status', severity: 'severity', escalated: 'escalated',
  };
  const sets = [];
  const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) {
      sets.push(`${col} = ?`);
      params.push(k === 'escalated' ? (patch[k] ? 1 : 0) : patch[k]);
    }
  }
  if (sets.length) {
    sets.push('updated_at = CURRENT_TIMESTAMP(3)');
    params.push(id);
    await pool.query(`UPDATE hazards SET ${sets.join(', ')} WHERE id = ?`, params);
  }
  return getHazard(id);
}

/* ----------------------------- 整改工单 ----------------------------- */

async function listRectifications({ hazardId, assigneeId, status } = {}) {
  const where = [];
  const params = [];
  if (hazardId !== undefined) { where.push('r.hazard_id = ?'); params.push(hazardId); }
  if (assigneeId !== undefined) { where.push('r.assignee_id = ?'); params.push(assigneeId); }
  if (status !== undefined) { where.push('r.status = ?'); params.push(status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT r.* FROM rectifications r ${clause} ORDER BY r.created_at DESC, r.id DESC`, params);
  return rows.map(mapRectification);
}

async function getRectification(id) {
  const [rows] = await pool.query('SELECT * FROM rectifications WHERE id = ?', [id]);
  return mapRectification(rows[0]);
}

async function getActiveRectificationByHazard(hazardId) {
  const [rows] = await pool.query(
    'SELECT * FROM rectifications WHERE hazard_id = ? AND status IN (?, ?) ORDER BY id DESC LIMIT 1',
    [hazardId, 'ASSIGNED', 'RECTIFYING'],
  );
  return mapRectification(rows[0]);
}

async function createRectification(rec) {
  const [r] = await pool.query(
    `INSERT INTO rectifications (hazard_id, assignee_id, deadline, description, status, parent_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [rec.hazardId, rec.assigneeId, rec.deadline, rec.description || '', rec.status || 'ASSIGNED', rec.parentId || null],
  );
  const [rows] = await pool.query('SELECT * FROM rectifications WHERE id = ?', [r.insertId]);
  return mapRectification(rows[0]);
}

async function updateRectification(id, patch) {
  const map = {
    status: 'status', rectifyAction: 'rectify_action', rectifyRemark: 'rectify_remark',
    rectifiedAt: 'rectified_at', deadline: 'deadline',
  };
  const sets = [];
  const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) { sets.push(`${col} = ?`); params.push(patch[k]); }
  }
  if (sets.length) {
    sets.push('updated_at = CURRENT_TIMESTAMP(3)');
    params.push(id);
    await pool.query(`UPDATE rectifications SET ${sets.join(', ')} WHERE id = ?`, params);
  }
  return getRectification(id);
}

/* ----------------------------- 复查记录 ----------------------------- */

async function listReinspections({ rectificationId } = {}) {
  if (rectificationId !== undefined) {
    const [rows] = await pool.query(
      'SELECT * FROM reinspections WHERE rectification_id = ? ORDER BY reinspected_at DESC, id DESC', [rectificationId]);
    return rows.map(mapReinspection);
  }
  const [rows] = await pool.query('SELECT * FROM reinspections ORDER BY reinspected_at DESC, id DESC');
  return rows.map(mapReinspection);
}

async function createReinspection(ri) {
  const [r] = await pool.query(
    `INSERT INTO reinspections (rectification_id, inspector_id, result, remark, reinspected_at)
     VALUES (?, ?, ?, ?, ?)`,
    [ri.rectificationId, ri.inspectorId, ri.result || 'PASS', ri.remark || '',
     ri.reinspectedAt || new Date().toISOString().slice(0, 23).replace('T', ' ')],
  );
  const [rows] = await pool.query('SELECT * FROM reinspections WHERE id = ?', [r.insertId]);
  return mapReinspection(rows[0]);
}

/* ----------------------------- 隐患流转日志 ----------------------------- */

async function listHazardLogs(hazardId) {
  const [rows] = await pool.query(
    'SELECT * FROM hazard_logs WHERE hazard_id = ? ORDER BY created_at ASC, id ASC', [hazardId]);
  return rows.map(mapHazardLog);
}

async function createHazardLog(log) {
  const [r] = await pool.query(
    `INSERT INTO hazard_logs (hazard_id, action, operator_id, detail)
     VALUES (?, ?, ?, ?)`,
    [log.hazardId, log.action, log.operatorId, log.detail || ''],
  );
  const [rows] = await pool.query('SELECT * FROM hazard_logs WHERE id = ?', [r.insertId]);
  return mapHazardLog(rows[0]);
}

/* ----------------------------- 统计看板 ----------------------------- */

async function autoEscalateOverdueCritical() {
  const [toEscalate] = await pool.query(
    `SELECT DISTINCT h.id, h.project_id
     FROM hazards h
     JOIN rectifications r ON r.hazard_id = h.id
     WHERE h.severity = 'CRITICAL'
       AND h.status != 'CLOSED'
       AND h.escalated = 0
       AND r.deadline < CURDATE()
       AND r.status IN ('ASSIGNED', 'RECTIFYING')`,
  );

  if (toEscalate.length === 0) return 0;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const h of toEscalate) {
      await conn.query('UPDATE hazards SET escalated = 1, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [h.id]);
      await conn.query(
        `INSERT INTO hazard_logs (hazard_id, action, operator_id, detail)
         VALUES (?, 'ESCALATED', ?, ?)`,
        [h.id, 2, '系统自动升级：重大隐患超期未整改，已通知工程主管'],
      );
    }
    await conn.commit();
    return toEscalate.length;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function getHazardStats() {
  const autoEscalatedCount = await autoEscalateOverdueCritical();

  const [unclosed] = await pool.query(
    `SELECT h.project_id, p.name AS project_name, COUNT(*) AS unclosed_count
     FROM hazards h
     JOIN projects p ON p.id = h.project_id
     WHERE h.status != 'CLOSED'
     GROUP BY h.project_id, p.name
     ORDER BY unclosed_count DESC`,
  );

  const [severityDist] = await pool.query(
    `SELECT severity, COUNT(*) AS count FROM hazards GROUP BY severity`,
  );

  const [timelyStats] = await pool.query(
    `SELECT
       COUNT(*) AS total_closed,
       SUM(CASE
         WHEN h.final_closed_at <= CONCAT(first_r.deadline, ' 23:59:59')
         THEN 1 ELSE 0
       END) AS on_time
     FROM (
       SELECT
         h2.id,
         h2.updated_at AS final_closed_at
       FROM hazards h2
       WHERE h2.status = 'CLOSED'
     ) h
     JOIN (
       SELECT hazard_id, MIN(deadline) AS deadline
       FROM rectifications
       GROUP BY hazard_id
     ) first_r ON first_r.hazard_id = h.id`,
  );

  const [overdue] = await pool.query(
    `SELECT h.*, p.name AS project_name, r.deadline AS current_deadline
     FROM hazards h
     JOIN projects p ON p.id = h.project_id
     JOIN rectifications r ON r.hazard_id = h.id
     WHERE h.status IN ('RECTIFYING', 'PENDING_REINSPECTION')
       AND r.deadline < CURDATE()
       AND r.status IN ('ASSIGNED', 'RECTIFYING')
     GROUP BY h.id, p.name, r.deadline
     ORDER BY h.severity = 'CRITICAL' DESC, h.severity = 'MAJOR' DESC, r.deadline ASC`,
  );

  return {
    autoEscalatedCount,
    unclosedByProject: unclosed.map((r) => ({
      projectId: r.project_id, projectName: r.project_name, unclosedCount: Number(r.unclosed_count),
    })),
    severityDistribution: severityDist.map((r) => ({ severity: r.severity, count: Number(r.count) })),
    timelyRate: {
      totalClosed: Number(timelyStats[0].total_closed) || 0,
      onTime: Number(timelyStats[0].on_time) || 0,
      rate: Number(timelyStats[0].total_closed) > 0
        ? Number(((Number(timelyStats[0].on_time) / Number(timelyStats[0].total_closed)) * 100).toFixed(1))
        : 0,
    },
    overdueList: overdue.map((r) => ({
      ...mapHazard(r),
      projectName: r.project_name,
      currentDeadline: r.current_deadline,
    })),
  };
}

module.exports = {
  seed, isEmpty,
  findUserByUsername, getUser, listUsers, createUser,
  listProjects, getProject, findProjectByCode, createProject, updateProject, deleteProject,
  listEquipments, createEquipment,
  listInspections, createInspection,
  listHazards, getHazard, createHazard, updateHazard,
  listRectifications, getRectification, getActiveRectificationByHazard, createRectification, updateRectification,
  listReinspections, createReinspection,
  listHazardLogs, createHazardLog,
  getHazardStats, autoEscalateOverdueCritical,
};
