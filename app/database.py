"""
database.py - Gestion des connexions MySQL et MongoDB
MySQL  : données fixes (users, parcelles, capteurs)
MongoDB: données temps réel (mesures)
"""

import mysql.connector
from pymongo import MongoClient
from app.config import (
    MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB,
    MONGO_URI, MONGO_DB
)


def get_mysql():
    """Retourne une connexion MySQL."""
    return mysql.connector.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DB,
        autocommit=True
    )


def get_mongo():
    """Retourne la base MongoDB."""
    client = MongoClient(MONGO_URI)
    return client[MONGO_DB]


def mysql_query(sql, params=None, fetchone=False, fetchall=False):
    """Exécute une requête MySQL et retourne les résultats."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(sql, params or ())
        if fetchone:
            return cursor.fetchone()
        if fetchall:
            return cursor.fetchall()
        conn.commit()
        return cursor.lastrowid
    finally:
        cursor.close()
        conn.close()
