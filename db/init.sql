-- 容器首次初始化：仅建表。
-- 种子数据（含用户密码哈希）由应用启动时运行时播种，避免把哈希硬编码进 SQL。

CREATE TABLE IF NOT EXISTS users (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    username      VARCHAR(64)  NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name          VARCHAR(64)  NOT NULL DEFAULT '',
    role          VARCHAR(16)  NOT NULL DEFAULT 'INSPECTOR',
    department    VARCHAR(128) NOT NULL DEFAULT '',
    status        VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    code            VARCHAR(48)  NOT NULL,
    name            VARCHAR(128) NOT NULL,
    type            VARCHAR(32)  NOT NULL DEFAULT 'COMBINED',
    protection_level VARCHAR(16) NOT NULL DEFAULT '6',
    area_sqm        DECIMAL(12,2) NOT NULL DEFAULT 0,
    address         VARCHAR(255) NOT NULL DEFAULT '',
    district        VARCHAR(64)  NOT NULL DEFAULT '',
    peacetime_use   VARCHAR(128) NOT NULL DEFAULT '',
    status          VARCHAR(16)  NOT NULL DEFAULT 'NORMAL',
    completed_at    DATE         NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_projects_code (code),
    KEY idx_projects_status (status),
    KEY idx_projects_district (district)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS equipments (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    project_id  BIGINT       NOT NULL,
    name        VARCHAR(128) NOT NULL,
    category    VARCHAR(32)  NOT NULL DEFAULT 'OTHER',
    model       VARCHAR(64)  NOT NULL DEFAULT '',
    install_date DATE        NULL,
    status      VARCHAR(16)  NOT NULL DEFAULT 'NORMAL',
    created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_equip_project (project_id),
    CONSTRAINT fk_equip_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inspections (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    project_id   BIGINT       NOT NULL,
    inspector_id BIGINT       NULL,
    inspect_date DATE         NOT NULL,
    type         VARCHAR(16)  NOT NULL DEFAULT 'ROUTINE',
    result       VARCHAR(16)  NOT NULL DEFAULT 'PASS',
    issues       VARCHAR(1000) NOT NULL DEFAULT '',
    created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_insp_project (project_id),
    KEY idx_insp_date (inspect_date),
    CONSTRAINT fk_insp_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_insp_user FOREIGN KEY (inspector_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hazards (
    id              BIGINT        NOT NULL AUTO_INCREMENT,
    project_id      BIGINT        NOT NULL,
    inspection_id   BIGINT        NULL,
    description     VARCHAR(2000) NOT NULL,
    severity        VARCHAR(16)   NOT NULL DEFAULT 'NORMAL',
    status          VARCHAR(24)   NOT NULL DEFAULT 'PENDING',
    discoverer_id   BIGINT        NOT NULL,
    discovered_at   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    escalated       TINYINT(1)    NOT NULL DEFAULT 0,
    created_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_hazard_project (project_id),
    KEY idx_hazard_status (status),
    KEY idx_hazard_severity (severity),
    CONSTRAINT fk_hazard_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_hazard_inspection FOREIGN KEY (inspection_id) REFERENCES inspections (id) ON DELETE SET NULL,
    CONSTRAINT fk_hazard_discoverer FOREIGN KEY (discoverer_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rectifications (
    id              BIGINT        NOT NULL AUTO_INCREMENT,
    hazard_id       BIGINT        NOT NULL,
    assignee_id     BIGINT        NOT NULL,
    deadline        DATE          NOT NULL,
    description     VARCHAR(2000) NOT NULL DEFAULT '',
    status          VARCHAR(16)   NOT NULL DEFAULT 'ASSIGNED',
    rectify_action  VARCHAR(2000) NOT NULL DEFAULT '',
    rectify_remark  VARCHAR(1000) NOT NULL DEFAULT '',
    rectified_at    DATETIME(3)   NULL,
    created_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_rect_hazard (hazard_id),
    KEY idx_rect_assignee (assignee_id),
    KEY idx_rect_status (status),
    CONSTRAINT fk_rect_hazard FOREIGN KEY (hazard_id) REFERENCES hazards (id) ON DELETE CASCADE,
    CONSTRAINT fk_rect_assignee FOREIGN KEY (assignee_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reinspections (
    id                 BIGINT        NOT NULL AUTO_INCREMENT,
    rectification_id   BIGINT        NOT NULL,
    inspector_id       BIGINT        NOT NULL,
    result             VARCHAR(16)   NOT NULL DEFAULT 'PASS',
    remark             VARCHAR(1000) NOT NULL DEFAULT '',
    reinspected_at     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    created_at         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_reinspect_rect (rectification_id),
    CONSTRAINT fk_reinspect_rect FOREIGN KEY (rectification_id) REFERENCES rectifications (id) ON DELETE CASCADE,
    CONSTRAINT fk_reinspect_user FOREIGN KEY (inspector_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hazard_logs (
    id           BIGINT        NOT NULL AUTO_INCREMENT,
    hazard_id    BIGINT        NOT NULL,
    action       VARCHAR(32)   NOT NULL,
    operator_id  BIGINT        NOT NULL,
    detail       VARCHAR(1000) NOT NULL DEFAULT '',
    created_at   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_log_hazard (hazard_id),
    CONSTRAINT fk_log_hazard FOREIGN KEY (hazard_id) REFERENCES hazards (id) ON DELETE CASCADE,
    CONSTRAINT fk_log_operator FOREIGN KEY (operator_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
