-- Transaction indexer tables for NextVibe
-- Run against the same MySQL database used by Django.

CREATE TABLE IF NOT EXISTS transactions (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  signature   VARCHAR(128) NOT NULL,
  address     VARCHAR(64)  NOT NULL,
  slot        BIGINT,
  block_time  DATETIME,
  fee         BIGINT,
  status      ENUM('success', 'failed') DEFAULT 'success',
  raw_data    JSON,
  source      ENUM('fetch', 'webhook') DEFAULT 'fetch',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_signature (signature),
  INDEX idx_address_time (address, block_time DESC),
  INDEX idx_address_sig  (address, signature)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS sync_cursors (
  address         VARCHAR(64) PRIMARY KEY,
  last_signature  VARCHAR(128),
  total_fetched   INT DEFAULT 0,
  status          ENUM('idle', 'syncing', 'error', 'done') DEFAULT 'idle',
  error_message   VARCHAR(512),
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Recommended MySQL user for the indexer:
-- CREATE USER 'indexer'@'%' IDENTIFIED BY 'strong_password';
-- GRANT SELECT ON yourdb.user_user TO 'indexer'@'%';
-- GRANT ALL PRIVILEGES ON yourdb.transactions TO 'indexer'@'%';
-- GRANT ALL PRIVILEGES ON yourdb.sync_cursors TO 'indexer'@'%';
-- FLUSH PRIVILEGES;
