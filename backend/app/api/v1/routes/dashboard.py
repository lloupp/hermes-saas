"""Dashboard routes — only accessible by super_admin."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Company, User, Profile, Client, Interaction, BudgetUsage

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


async def _require_super_admin(current_user: dict):
    if current_user["role"] != "super_admin":
        raise HTTPException(403, "Acesso restrito ao admin global")


@router.get("/overview")
async def overview(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Global stats."""
    await _require_super_admin(current_user)

    companies_count = (await db.execute(select(func.count(Company.id)))).scalar()
    users_count = (await db.execute(select(func.count(User.id)))).scalar()
    profiles_count = (await db.execute(select(func.count(Profile.id)))).scalar()
    clients_count = (await db.execute(select(func.count(Client.id)))).scalar()
    interactions_count = (await db.execute(select(func.count(Interaction.id)))).scalar()

    return {
        "companies": companies_count,
        "users": users_count,
        "profiles": profiles_count,
        "clients": clients_count,
        "interactions": interactions_count,
    }


@router.get("/companies")
async def list_all_companies(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all registered companies."""
    await _require_super_admin(current_user)

    result = await db.execute(
        select(
            Company,
            func.count(User.id).label("user_count"),
            func.count(Profile.id).label("profile_count"),
            func.count(Client.id).label("client_count"),
        )
        .outerjoin(User, User.company_id == Company.id)
        .outerjoin(Profile, Profile.user_id == User.id)
        .outerjoin(Client, Client.company_id == Company.id)
        .group_by(Company.id)
    )

    return [
        {
            "id": str(c.Company.id),
            "name": c.Company.name,
            "slug": c.Company.slug,
            "is_active": c.Company.is_active,
            "openrouter_budget_usd": float(c.Company.openrouter_budget_usd or 0),
            "users": c.user_count,
            "profiles": c.profile_count,
            "clients": c.client_count,
            "created_at": c.Company.created_at,
        }
        for c in result.all()
    ]


@router.get("/companies/{company_id}/detail")
async def company_detail(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Full detail of one company (admin view)."""
    await _require_super_admin(current_user)

    company = (await db.execute(select(Company).where(Company.id == company_id))).scalar()
    if not company:
        raise HTTPException(404, "Empresa não encontrada")

    users = (await db.execute(select(User).where(User.company_id == company_id))).scalars().all()
    clients = (await db.execute(select(Client).where(Client.company_id == company_id))).scalars().all()

    return {
        "company": {
            "id": str(company.id),
            "name": company.name,
            "slug": company.slug,
            "is_active": company.is_active,
            "tone": company.tone,
            "knowledge_base": company.knowledge_base[:500] + "..." if len(company.knowledge_base or "") > 500 else company.knowledge_base,
            "openrouter_budget_usd": float(company.openrouter_budget_usd or 0),
        },
        "users": [
            {"id": str(u.id), "email": u.email, "name": u.name, "role": u.role.value, "is_active": u.is_active}
            for u in users
        ],
        "clients": [
            {"id": str(c.id), "name": c.name, "email": c.email, "phone": c.phone}
            for c in clients
        ],
    }


@router.get("/budget")
async def budget_summary(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Budget usage per company (current month)."""
    await _require_super_admin(current_user)

    result = await db.execute(
        select(BudgetUsage, Company)
        .join(Company, Company.id == BudgetUsage.company_id)
        .order_by(BudgetUsage.month.desc())
    )

    return [
        {
            "company_id": str(b.Company.id),
            "company_name": b.Company.name,
            "month": b.BudgetUsage.month,
            "tokens_in": b.BudgetUsage.tokens_in,
            "tokens_out": b.BudgetUsage.tokens_out,
            "cost_usd": float(b.BudgetUsage.cost_usd),
            "budget_usd": float(b.BudgetUsage.budget_usd),
            "usage_pct": float(b.BudgetUsage.cost_usd / b.BudgetUsage.budget_usd * 100) if b.BudgetUsage.budget_usd else 0,
        }
        for b in result.all()
    ]
