import os

# MySQL
MYSQL_HOST     = os.getenv("MYSQL_HOST", "mysql")
MYSQL_PORT     = int(os.getenv("MYSQL_PORT", 3306))
MYSQL_USER     = os.getenv("MYSQL_USER", "agrouser")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "agropass2026")
MYSQL_DB       = os.getenv("MYSQL_DB", "agrostat")

# MongoDB
MONGO_URI      = os.getenv("MONGO_URI", "mongodb://agrostat_mongodb:27017")
MONGO_DB       = "agrostat_mesures"
COLLECTION_MESURES = "mesures"

# JWT
JWT_SECRET     = os.getenv("JWT_SECRET", "agrostat-jwt-secret-2026")

# API
API_HOST       = "0.0.0.0"
API_PORT       = 5000

# Simulation
SIMULATION_INTERVAL = 30  # secondes

# Limites
MAX_MESURES = 100
