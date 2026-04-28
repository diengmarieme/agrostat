
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

# ── HOME ──
@app.route("/")
def home():
    return "AgroStat API fonctionne 🚀"

# ── SANTÉ ──
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status":"ok"}), 200

# ── MESURES ──
@app.route("/mesures", methods=["GET"])
@jwt_required()
def mesures():
    try:
        parcelles = get_parcelles_user()
        db = get_mongo()
        data = list(db[COLLECTION_MESURES].aggregate([
            {"$match":{"parcelle":{"$in":parcelles}}},
            {"$sort":{"timestamp":-1}},
            {"$limit":MAX_MESURES},
            {"$project":{"_id":0}}
        ]))
        return jsonify(serialiser(data)), 200
    except Exception as e:
        return jsonify({"erreur":str(e)}), 500

@app.route("/anomalies", methods=["GET"])
@jwt_required()
def anomalies():
    try:
        parcelles = get_parcelles_user()
        db = get_mongo()
        data = list(db[COLLECTION_MESURES].aggregate([
            {"$match":{"parcelle":{"$in":parcelles},"type":"humidite","valeur":{"$lt":30}}},
            {"$sort":{"timestamp":-1}},
            {"$limit":MAX_MESURES},
            {"$project":{"_id":0}}
        ]))
        return jsonify(serialiser(data)), 200
    except Exception as e:
        return jsonify({"erreur":str(e)}), 500

# ✅ CORRECTION ICI
@app.route("/temperature_moyenne", methods=["GET"])
@jwt_required()
def temperature_moyenne():
    try:
        parcelles = get_parcelles_user()
        db = get_mongo()
        depuis = datetime.utcnow() - timedelta(hours=24)
        data = list(db[COLLECTION_MESURES].aggregate([
            {"$match":{"parcelle":{"$in":parcelles},"type":"temperature","timestamp":{"$gte":depuis}}},
            {"$group":{
                "_id":"$parcelle",
                "moyenne":{"$avg":"$valeur"},
                "min":{"$min":"$valeur"},
                "max":{"$max":"$valeur"},
                "nb":{"$sum":1}
            }},
            {"$project":{
                "_id":0,
                "parcelle":"$_id",
                "moyenne_temperature":{"$round":["$moyenne",2]},
                "min_temp":{"$round":["$min",2]},
                "max_temp":{"$round":["$max",2]},
                "nb_mesures":"$nb"
            }}
        ]))
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"erreur":str(e)}), 500

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
            {"$sort":{"timestamp":-1}},
            {"$limit":200},
            {"$group":{
                "_id":{
                    "y":{"$year":"$timestamp"},
                    "m":{"$month":"$timestamp"},
                    "d":{"$dayOfMonth":"$timestamp"},
                    "h":{"$hour":"$timestamp"}
                },
                "moyenne":{"$avg":"$valeur"},
                "min_valeur":{"$min":"$valeur"},
                "max_valeur":{"$max":"$valeur"},
                "nb_mesures":{"$sum":1},
                "unite":{"$first":"$unite"}
            }},
            {"$project":{
                "_id":0,
                "heure":{
                    "$dateFromParts":{
                        "year":"$_id.y",
                        "month":"$_id.m",
                        "day":"$_id.d",
                        "hour":"$_id.h"
                    }
                },
                "moyenne":{"$round":["$moyenne",2]},
                "min_valeur":{"$round":["$min_valeur",2]},
                "max_valeur":{"$round":["$max_valeur",2]},
                "nb_mesures":1,
                "unite":1
            }},
            {"$sort":{"heure":-1}}
        ]))
        return jsonify(serialiser(data)), 200
    except Exception as e:
        return jsonify({"erreur":str(e)}), 500

# ── LANCEMENT ──
def run_api():
    app.run(host=API_HOST, port=API_PORT, debug=False)

