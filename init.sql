-- =============================================
-- AgroStat IoT - Initialisation MySQL
-- Tables fixes : users, parcelles, capteurs
-- =============================================

CREATE DATABASE IF NOT EXISTS agrostat;
USE agrostat;

-- Table des utilisateurs
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom_complet VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','client') DEFAULT 'client',
  actif TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des parcelles
CREATE TABLE IF NOT EXISTS parcelles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  nom VARCHAR(100) NOT NULL,
  localisation VARCHAR(200),
  superficie FLOAT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Table des capteurs
CREATE TABLE IF NOT EXISTS capteurs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parcelle_id INT NOT NULL,
  capteur_id VARCHAR(20) UNIQUE NOT NULL,
  type ENUM('temperature','humidite','ph_sol') NOT NULL,
  actif TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parcelle_id) REFERENCES parcelles(id) ON DELETE CASCADE
);

-- =============================================
-- DONNÉES PAR DÉFAUT
-- =============================================

-- Admin (mot de passe: admin123)
INSERT IGNORE INTO users (nom_complet, email, password_hash, role) VALUES
('Administrateur', 'admin@agrostat.com',
 '$2b$12$dqoqxCskn35cGQWOLF.dR.AiiNBZ1oZBSCKLQMD1yEi3pdDZ1zs6i',
 'admin');

-- Client Mariéme (mot de passe: marieme123)
INSERT IGNORE INTO users (nom_complet, email, password_hash, role) VALUES
('Mariéme DIENG', 'marieme@agrostat.com',
 '$2b$12$eazrwoaaXV2flnoX2ICs/eo9EY7lbWmfQAqKAxPlyUsfArkv4dpJu',
 'client');

-- Client Sophia (mot de passe: sophia123)  
INSERT IGNORE INTO users (nom_complet, email, password_hash, role) VALUES
('Sophia DIOP', 'sophia@agrostat.com',
 '$2b$12$BDePKGNKBdt3ljRNZzPV0OjysfWZifahAvA1Emrs28zG8.K4x4h6u',
 'client');

-- Parcelles Mariéme
INSERT IGNORE INTO parcelles (user_id, nom, localisation, superficie) VALUES
(2, 'Parcelle A', 'Bambey, Sénégal', 2.5);

-- Parcelles Sophia
INSERT IGNORE INTO parcelles (user_id, nom, localisation, superficie) VALUES
(3, 'Parcelle B', 'Thiès, Sénégal', 3.0),
(3, 'Parcelle C', 'Diourbel, Sénégal', 1.8);

-- Capteurs Parcelle A (Mariéme)
INSERT IGNORE INTO capteurs (parcelle_id, capteur_id, type) VALUES
(1, 'C1', 'temperature'),
(1, 'C2', 'humidite'),
(1, 'C3', 'ph_sol');

-- Capteurs Parcelle B (Sophia)
INSERT IGNORE INTO capteurs (parcelle_id, capteur_id, type) VALUES
(2, 'C4', 'temperature'),
(2, 'C5', 'humidite'),
(2, 'C6', 'ph_sol');

-- Capteurs Parcelle C (Sophia)
INSERT IGNORE INTO capteurs (parcelle_id, capteur_id, type) VALUES
(3, 'C7', 'temperature'),
(3, 'C8', 'humidite'),
(3, 'C9', 'ph_sol');
