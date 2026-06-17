"""
Company routes -- super admin manages all companies,
company_admin manages their own company settings (OpenRouter key, etc).
"""

from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Company

router = APIRouter(prefix="/companies", tags=["companies"])


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    tone: Optional[str] = None
    knowledge_base: Optional[str] = None
    rules: Optional[str] = None
    openrouter_key: Optional[str] = None
    openrouter_budget_usd: Optional[float] = None


class CompanyOut(BaseModel):
    id: str
    name: str
    slug: str
    plan_id: Optional[str]
    tone: str
    knowledge_base: str
    rules: str
    has_openrouter_key: bool
    openrouter_budget_usd: Optional[float]
    is_active: bool

    class Config:
        from_attributes = True


def _serialize(company: Company) -> CompanyOut:
    return CompanyOut(
        id=str(company.id),
        name=company.name,
        slug=company.slug,
        plan_id=str(company.plan_id) if company.plan_id else None,
        tone=company.tone or "profissional",
        knowledge_base=company.knowledge_base or "",
        rules=company.rules or "",
        has_openrouter_key=bool(company.openrouter_key),
        openrouter_budget_usd=float(company.openrouter_budget_usd) if company.openrouter_budget_usd else None,
        is_active=company.is_active,
    )


@router.get("/me")
async def my_company(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get the current user's company details."""
    if current_user["role"] == "super_admin":
        raise HTTPException(400, "Super admin tem visao de todas as empresas em /dashboard/companies")

    company = (await db.execute(
        select(Company).where(Company.id == current_user["company_id"])
    )).scalar()
    if not company:
        raise HTTPException(404, "Empresa nao encontrada")
    return _serialize(company)


@router.patch("/me")
async def update_my_company(
    data: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Update current company settings (admin only)."""
    if current_user["role"] not in ("company_admin", "super_admin"):
        raise HTTPException(403, "Apenas admin da empresa pode editar")

    company = (await db.execute(
        select(Company).where(Company.id == current_user["company_id"])
    )).scalar()
    if not company:
        raise HTTPException(404, "Empresa nao encontrada")

    if data.name is not None:
        company.name = data.name
    if data.tone is not None:
        company.tone = data.tone
    if data.knowledge_base is not None:
        company.knowledge_base = data.knowledge_base
    if data.rules is not None:
        company.rules = data.rules
    if data.openrouter_key is not None and data.openrouter_key.strip():
        company.openrouter_key = data.openrouter_key.strip()
    if data.openrouter_budget_usd is not None:
        company.openrouter_budget_usd = data.openrouter_budget_usd

    await db.commit()
    await db.refresh(company)
    return _serialize(company)
