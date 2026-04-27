"""
api.py - API REST Flask complète avec toutes les routes
"""
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager, jwt_required, get_jwt, get_jwt_identity
from datetime import datetime, timedelta
import bcrypt

from app.database import mysql_query, get_mongo
from app.auth import auth_bp
from app.config import JWT_SECRET, API_HOST, API_PORT, COLLECTION_MESURES, MAX_MESURES

app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = JWT_SECRET
JWTManager(app)
CORS(app)
app.register_blueprint(auth_bp)

def serialiser(doc):
    if isinstance(doc, list): return [serialiser(d) for d in doc]
    if isinstance(doc, dict): return {k: serialiser(v) for k,v in doc.items()}
    if isinstance(doc, datetime): return doc.strftime("%Y-%m-%dT%H:%M:%SZ")
    return doc

def uid(): return int(get_jwt_identity())
def claims(): return get_jwt()
def is_admin(): return claims().get('role') == 'admin'

def get_parcelles_user():
    if is_admin():
        rows = mysql_query("SELECT nom FROM parcelles", fetchall=True)
    else:
        rows = mysql_query("SELECT nom FROM parcelles WHERE user_id=%s", (uid(),), fetchall=True)
    return [r['nom'] for r in rows]

def require_admin():
    if not is_admin(): return jsonify({"erreur":"Accès refusé"}), 403
    return None

# ── SANTÉ ──
@app.route("/health", methods=["GET"])
def health(): return jsonify({"status":"ok"}), 200

# ── MESURES ──
@app.route("/mesures", methods=["GET"])
@jwt_required()
def mesures():
    try:
        parcelles = get_parcelles_user()
        db = get_mongo()
        data = list(db[COLLECTION_MESURES].aggregate([
            {"$match":{"parcelle":{"$in":parcelles}}},
            {"$sort":{"timestamp":-1}},{"$limit":MAX_MESURES},{"$project":{"_id":0}}
        ]))
        return jsonify(serialiser(data)), 200
    except Exception as e: return jsonify({"erreur":str(e)}), 500

@app.route("/anomalies", methods=["GET"])
@jwt_required()
def anomalies():
    try:
        parcelles = get_parcelles_user()
        db = get_mongo()
        data = list(db[COLLECTION_MESURES].aggregate([
            {"$match":{"parcelle":{"$in":parcelles},"type":"humidite","valeur":{"$lt":30}}},
            {"$sort":{"timestamp":-1}},{"$limit":MAX_MESURES},{"$project":{"_id":0}}
        ]))
        return jsonify(serialiser(data)), 200
    except Exception as e: return jsonify({"erreur":str(e)}), 500

@app.route("/temperature_moyenne", methods=["GET"])
@jwt_required()
def temperature_moyenne():
    try:
        parcelles = get_parcelles_user()
        db = get_mongo()
        depuis = datetime.utcnow() - timedelta(hours=24)
        data = list(db[COLLECTION_MESURES].aggregate([
            {"$match":{"parcelle":{"$in":parcelles},"type":"temperature","timestamp":{"$gte":depuis}}},
            {"$group":{"_id":"$parcelle","moyenne":{"$avg":"$valeur"},"min":{"$min":"$valeur"},"max":{"$max":"$valeur"},"nb":{"$sum":1}}},
            {"$project":{"_id":0,"parcelle":"$_id","moyenne_temperature":{"$round":["$moyenne",2]},"min_temp":{"$round":["$min",2]},"max_temp":{"$round":["$max",2]},"nb_mesures":"$nb"}}
        ]))
        return jsonify(data), 200
    except Exception as e: return jsonify({"erreur":str(e)}), 500

@app.route("/evolution/<capteur_id>", methods=["GET"])
@jwt_required()
def evolution(capteur_id):
    try:
        parcelles = get_parcelles_user()
        db = get_mongo()
        doc = db[COLLECTION_MESURES].find_one({"capteur_id":capteur_id})
        if doc and doc.get("parcelle") not in parcelles:
            return jsonify({"erreur":"Accès refusé"}), 403
        data = list(db[COLLECTION_MESURES].aggregate([
            {"$match":{"capteur_id":capteur_id}},
            {"$sort":{"timestamp":-1}},{"$limit":200},
            {"$group":{"_id":{"y":{"$year":"$timestamp"},"m":{"$month":"$timestamp"},"d":{"$dayOfMonth":"$timestamp"},"h":{"$hour":"$timestamp"}},
              "moyenne":{"$avg":"$valeur"},"min_valeur":{"$min":"$valeur"},"max_valeur":{"$max":"$valeur"},"nb_mesures":{"$sum":1},"unite":{"$first":"$unite"}}},
            {"$project":{"_id":0,"heure":{"$dateFromParts":{"year":"$_id.y","month":"$_id.m","day":"$_id.d","hour":"$_id.h"}},
              "moyenne":{"$round":["$moyenne",2]},"min_valeur":{"$round":["$min_valeur",2]},"max_valeur":{"$round":["$max_valeur",2]},"nb_mesures":1,"unite":1}},
            {"$sort":{"heure":-1}}
        ]))
        return jsonify(serialiser(data)), 200
    except Exception as e: return jsonify({"erreur":str(e)}), 500

# ── CAPTEURS ──
@app.route("/capteurs", methods=["GET"])
@jwt_required()
def get_capteurs():
    try:
        if is_admin():
            data = mysql_query("SELECT c.*,p.nom as parcelle,u.nom_complet as proprietaire FROM capteurs c JOIN parcelles p ON c.parcelle_id=p.id JOIN users u ON p.user_id=u.id", fetchall=True)
        else:
            data = mysql_query("SELECT c.*,p.nom as parcelle FROM capteurs c JOIN parcelles p ON c.parcelle_id=p.id WHERE p.user_id=%s AND c.actif=1", (uid(),), fetchall=True)
        for d in data:
            if d.get('created_at'): d['created_at']=str(d['created_at'])
        return jsonify(data), 200
    except Exception as e: return jsonify({"erreur":str(e)}), 500

@app.route("/capteurs", methods=["POST"])
@jwt_required()
def add_capteur():
    try:
        data = request.get_json()
        cid  = data.get('capteur_id','').strip().upper()
        typ  = data.get('type','')
        pid  = data.get('parcelle_id')
        if not cid or not typ or not pid:
            return jsonify({"erreur":"Champs manquants"}), 400
        if typ not in ['temperature','humidite','ph_sol']:
            return jsonify({"erreur":"Type invalide"}), 400
        # Vérifier que la parcelle appartient au user
        parc = mysql_query("SELECT id FROM parcelles WHERE id=%s AND user_id=%s", (pid, uid()), fetchone=True)
        if not parc: return jsonify({"erreur":"Parcelle non trouvée"}), 404
        # Vérifier unicité
        existing = mysql_query("SELECT id FROM capteurs WHERE capteur_id=%s", (cid,), fetchone=True)
        if existing: return jsonify({"erreur":"Cet ID capteur existe déjà"}), 409
        new_id = mysql_query("INSERT INTO capteurs (parcelle_id, capteur_id, type) VALUES (%s,%s,%s)", (pid, cid, typ))
        return jsonify({"message":f"Capteur {cid} ajouté","id":new_id}), 201
    except Exception as e: return jsonify({"erreur":str(e)}), 500

@app.route("/capteurs/<int:cap_id>", methods=["DELETE"])
@jwt_required()
def delete_capteur(cap_id):
    try:
        if is_admin():
            mysql_query("DELETE FROM capteurs WHERE id=%s", (cap_id,))
        else:
            cap = mysql_query("SELECT c.id FROM capteurs c JOIN parcelles p ON c.parcelle_id=p.id WHERE c.id=%s AND p.user_id=%s", (cap_id,uid()), fetchone=True)
            if not cap: return jsonify({"erreur":"Non autorisé"}), 403
            mysql_query("DELETE FROM capteurs WHERE id=%s", (cap_id,))
        return jsonify({"message":"Capteur supprimé"}), 200
    except Exception as e: return jsonify({"erreur":str(e)}), 500

# ── PARCELLES ──
@app.route("/parcelles", methods=["GET"])
@jwt_required()
def get_parcelles():
    try:
        if is_admin():
            data = mysql_query("SELECT p.*,u.nom_complet as proprietaire FROM parcelles p JOIN users u ON p.user_id=u.id", fetchall=True)
        else:
            data = mysql_query("SELECT * FROM parcelles WHERE user_id=%s", (uid(),), fetchall=True)
        for d in data:
            if d.get('created_at'): d['created_at']=str(d['created_at'])
        return jsonify(data), 200
    except Exception as e: return jsonify({"erreur":str(e)}), 500

@app.route("/parcelles", methods=["POST"])
@jwt_required()
def add_parcelle():
    try:
        data = request.get_json()
        nom  = data.get('nom','').strip()
        loc  = data.get('localisation','').strip()
        sup  = float(data.get('superficie', 1.0))
        if not nom: return jsonify({"erreur":"Nom requis"}), 400
        new_id = mysql_query("INSERT INTO parcelles (user_id,nom,localisation,superficie) VALUES (%s,%s,%s,%s)", (uid(),nom,loc,sup))
        # Créer 3 capteurs auto
        prefix = f"U{uid()}P{new_id}"
        for t in ['temperature','humidite','ph_sol']:
            cid = f"{prefix}_{t[:4].upper()}"
            mysql_query("INSERT IGNORE INTO capteurs (parcelle_id,capteur_id,type) VALUES (%s,%s,%s)", (new_id,cid,t))
        return jsonify({"message":f"Parcelle '{nom}' créée","id":new_id}), 201
    except Exception as e: return jsonify({"erreur":str(e)}), 500

@app.route("/parcelles/<int:pid>", methods=["DELETE"])
@jwt_required()
def delete_parcelle(pid):
    try:
        if not is_admin():
            p = mysql_query("SELECT id FROM parcelles WHERE id=%s AND user_id=%s", (pid,uid()), fetchone=True)
            if not p: return jsonify({"erreur":"Non autorisé"}), 403
        mysql_query("DELETE FROM parcelles WHERE id=%s", (pid,))
        return jsonify({"message":"Parcelle supprimée"}), 200
    except Exception as e: return jsonify({"erreur":str(e)}), 500

# ── PROFIL ──
@app.route("/profil", methods=["PUT"])
@jwt_required()
def update_profil():
    try:
        data = request.get_json()
        nom  = data.get('nom_complet','').strip()
        pwd  = data.get('password','').strip()
        if not nom: return jsonify({"erreur":"Nom requis"}), 400
        if pwd:
            if len(pwd) < 6: return jsonify({"erreur":"Mot de passe trop court"}), 400
            h = bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()
            mysql_query("UPDATE users SET nom_complet=%s, password_hash=%s WHERE id=%s", (nom,h,uid()))
        else:
            mysql_query("UPDATE users SET nom_complet=%s WHERE id=%s", (nom,uid()))
        return jsonify({"message":"Profil mis à jour"}), 200
    except Exception as e: return jsonify({"erreur":str(e)}), 500

# ── ADMIN ──
@app.route("/admin/stats", methods=["GET"])
@jwt_required()
def admin_stats():
    err = require_admin()
    if err: return err
    try:
        nb_clients  = mysql_query("SELECT COUNT(*) as n FROM users WHERE role='client' AND actif=1", fetchone=True)['n']
        nb_parcelles= mysql_query("SELECT COUNT(*) as n FROM parcelles", fetchone=True)['n']
        nb_capteurs = mysql_query("SELECT COUNT(*) as n FROM capteurs WHERE actif=1", fetchone=True)['n']
        nb_mesures  = get_mongo()[COLLECTION_MESURES].count_documents({})
        return jsonify({"nb_clients":nb_clients,"nb_parcelles":nb_parcelles,"nb_capteurs":nb_capteurs,"nb_mesures":nb_mesures}), 200
    except Exception as e: return jsonify({"erreur":str(e)}), 500

@app.route("/admin/users", methods=["GET"])
@jwt_required()
def admin_users():
    err = require_admin()
    if err: return err
    try:
        data = mysql_query("SELECT id,nom_complet,email,role,actif,created_at FROM users ORDER BY id", fetchall=True)
        for d in data:
            if d.get('created_at'): d['created_at']=str(d['created_at'])
        return jsonify(data), 200
    except Exception as e: return jsonify({"erreur":str(e)}), 500

@app.route("/admin/users", methods=["POST"])
@jwt_required()
def admin_create_user():
    err = require_admin()
    if err: return err
    try:
        data = request.get_json()
        nom  = data.get('nom_complet','').strip()
        email= data.get('email','').strip().lower()
        pwd  = data.get('password','').strip()
        role = data.get('role','client')
        parc = data.get('parcelle_nom', nom+' Parcelle').strip()
        loc  = data.get('localisation','').strip()
        if not nom or not email or not pwd:
            return jsonify({"erreur":"Champs manquants"}), 400
        if mysql_query("SELECT id FROM users WHERE email=%s",(email,),fetchone=True):
            return jsonify({"erreur":"Email déjà utilisé"}), 409
        h = bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()
        new_uid = mysql_query("INSERT INTO users (nom_complet,email,password_hash,role) VALUES (%s,%s,%s,%s)", (nom,email,h,role))
        if role == 'client':
            pid = mysql_query("INSERT INTO parcelles (user_id,nom,localisation,superficie) VALUES (%s,%s,%s,%s)", (new_uid,parc,loc,1.0))
            prefix = f"U{new_uid}"
            for t in ['temperature','humidite','ph_sol']:
                cid = f"{prefix}_{t[:4].upper()}"
                mysql_query("INSERT IGNORE INTO capteurs (parcelle_id,capteur_id,type) VALUES (%s,%s,%s)", (pid,cid,t))
        return jsonify({"message":f"Client {nom} créé","id":new_uid}), 201
    except Exception as e: return jsonify({"erreur":str(e)}), 500

@app.route("/admin/users/<int:uid_>", methods=["DELETE"])
@jwt_required()
def admin_delete_user(uid_):
    err = require_admin()
    if err: return err
    try:
        mysql_query("DELETE FROM users WHERE id=%s",(uid_,))
        return jsonify({"message":"Utilisateur supprimé"}), 200
    except Exception as e: return jsonify({"erreur":str(e)}), 500

@app.route("/admin/users/<int:uid_>/toggle", methods=["PUT"])
@jwt_required()
def admin_toggle_user(uid_):
    err = require_admin()
    if err: return err
    try:
        u = mysql_query("SELECT actif FROM users WHERE id=%s",(uid_,),fetchone=True)
        new = 0 if u['actif'] else 1
        mysql_query("UPDATE users SET actif=%s WHERE id=%s",(new,uid_))
        return jsonify({"message":"Statut mis à jour","actif":new}), 200
    except Exception as e: return jsonify({"erreur":str(e)}), 500

@app.route("/admin/mesures", methods=["GET"])
@jwt_required()
def admin_mesures():
    err = require_admin()
    if err: return err
    try:
        data = list(get_mongo()[COLLECTION_MESURES].find({},{"_id":0}).sort("timestamp",-1).limit(200))
        return jsonify(serialiser(data)), 200
    except Exception as e: return jsonify({"erreur":str(e)}), 500

def run_api():
    app.run(host=API_HOST, port=API_PORT, debug=False)
