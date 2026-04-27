"""
auth.py - Authentification JWT
Inscription, connexion, gestion des rôles
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt
from datetime import timedelta
import bcrypt
from app.database import mysql_query

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')


def hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password, hashed):
    return bcrypt.checkpw(password.encode(), hashed.encode())


# ─────────────────────────────────────────────
# INSCRIPTION
# ─────────────────────────────────────────────
@auth_bp.route('/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        nom     = data.get('nom_complet', '').strip()
        email   = data.get('email', '').strip().lower()
        pwd     = data.get('password', '').strip()
        parcelle_nom = data.get('parcelle_nom', 'Ma Parcelle').strip()
        localisation = data.get('localisation', '').strip()

        if not nom or not email or not pwd:
            return jsonify({"erreur": "Tous les champs sont obligatoires"}), 400
        if len(pwd) < 6:
            return jsonify({"erreur": "Mot de passe trop court (min 6 caractères)"}), 400

        # Vérifier email unique
        existing = mysql_query("SELECT id FROM users WHERE email=%s", (email,), fetchone=True)
        if existing:
            return jsonify({"erreur": "Cet email est déjà utilisé"}), 409

        # Créer l'utilisateur
        pwd_hash = hash_password(pwd)
        user_id = mysql_query(
            "INSERT INTO users (nom_complet, email, password_hash, role) VALUES (%s,%s,%s,'client')",
            (nom, email, pwd_hash)
        )

        # Créer une parcelle par défaut
        parcelle_id = mysql_query(
            "INSERT INTO parcelles (user_id, nom, localisation, superficie) VALUES (%s,%s,%s,%s)",
            (user_id, parcelle_nom, localisation, 1.0)
        )

        # Créer 3 capteurs par défaut
        prefix = f"U{user_id}"
        for t in ['temperature', 'humidite', 'ph_sol']:
            cid = f"{prefix}_{t[:4].upper()}"
            mysql_query(
                "INSERT IGNORE INTO capteurs (parcelle_id, capteur_id, type) VALUES (%s,%s,%s)",
                (parcelle_id, cid, t)
            )

        return jsonify({"message": f"Compte créé avec succès ! Bienvenue {nom}"}), 201

    except Exception as e:
        return jsonify({"erreur": str(e)}), 500


# ─────────────────────────────────────────────
# CONNEXION
# ─────────────────────────────────────────────
@auth_bp.route('/login', methods=['POST'])
def login():
    try:
        data  = request.get_json()
        email = data.get('email', '').strip().lower()
        pwd   = data.get('password', '').strip()

        if not email or not pwd:
            return jsonify({"erreur": "Email et mot de passe requis"}), 400

        user = mysql_query("SELECT * FROM users WHERE email=%s AND actif=1", (email,), fetchone=True)

        if not user or not verify_password(pwd, user['password_hash']):
            return jsonify({"erreur": "Email ou mot de passe incorrect"}), 401

        # Récupérer les parcelles de l'utilisateur
        if user['role'] == 'admin':
            parcelles = mysql_query("SELECT * FROM parcelles", fetchall=True)
        else:
            parcelles = mysql_query(
                "SELECT * FROM parcelles WHERE user_id=%s", (user['id'],), fetchall=True
            )

        token = create_access_token(
            identity=str(user['id']),
            additional_claims={
                "email": user['email'],
                "nom_complet": user['nom_complet'],
                "role": user['role'],
                "parcelles": [p['nom'] for p in parcelles]
            },
            expires_delta=timedelta(hours=12)
        )

        return jsonify({
            "token": token,
            "user": {
                "id": user['id'],
                "nom_complet": user['nom_complet'],
                "email": user['email'],
                "role": user['role'],
                "parcelles": [p['nom'] for p in parcelles]
            }
        }), 200

    except Exception as e:
        return jsonify({"erreur": str(e)}), 500


# ─────────────────────────────────────────────
# PROFIL UTILISATEUR CONNECTÉ
# ─────────────────────────────────────────────
@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    try:
        claims = get_jwt()
        user_id = int(get_jwt()['sub'])
        user = mysql_query("SELECT id, nom_complet, email, role, created_at FROM users WHERE id=%s",
                           (user_id,), fetchone=True)
        if user and user.get('created_at'):
            user['created_at'] = str(user['created_at'])
        return jsonify(user), 200
    except Exception as e:
        return jsonify({"erreur": str(e)}), 500
