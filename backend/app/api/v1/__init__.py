"""API v1 router aggregator."""

from fastapi import APIRouter
from app.api.v1.routes import auth, users, profiles, souls, skills, clients, chat, dashboard, companies


api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(profiles.router)
api_router.include_router(souls.router)
api_router.include_router(skills.router)
api_router.include_router(clients.router)
api_router.include_router(chat.router)
api_router.include_router(companies.router)
api_router.include_router(dashboard.router)
