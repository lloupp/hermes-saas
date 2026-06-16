"""Multi-tenant middleware — sets RLS context for every request."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from sqlalchemy import text
from app.core.database import async_session


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Extract from JWT if available (set by auth dependency)
        company_id = getattr(request.state, "company_id", None)
        user_id = getattr(request.state, "user_id", None)

        if company_id:
            async with async_session() as session:
                await session.execute(text("SET LOCAL app.company_id = :cid"), {"cid": str(company_id)})
                if user_id:
                    await session.execute(text("SET LOCAL app.user_id = :uid"), {"uid": str(user_id)})
                await session.commit()

        response = await call_next(request)
        return response
