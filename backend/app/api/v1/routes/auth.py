"""Auth routes — register company, login, refresh."""

from datetime import timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.core.config import settings
from app.models.models import Company, User, Plan

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Schemas ──────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    company_name: str
    company_slug: str
    admin_name: str
    admin_email: EmailStr
    password: str
    plan: str = "basic"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Routes ───────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new company + its admin user."""
    # Check slug uniqueness
    existing = await db.execute(select(Company).where(Company.slug == req.company_slug))
    if existing.scalar():
        raise HTTPException(400, "Slug de empresa já existe")

    # Get plan
    plan_result = await db.execute(select(Plan).where(Plan.name == req.plan))
    plan = plan_result.scalar()
    if not plan:
        raise HTTPException(400, f"Plano '{req.plan}' não encontrado")

    # Create company
    company = Company(
        id=uuid4(),
        name=req.company_name,
        slug=req.company_slug,
        plan_id=plan.id,
        openrouter_budget_usd=plan.budget_usd,
    )
    db.add(company)
    await db.flush()

    # Create admin user
    user = User(
        id=uuid4(),
        company_id=company.id,
        email=req.admin_email,
        name=req.admin_name,
        role="company_admin",
        password_hash=hash_password(req.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Generate token
    token = create_access_token({
        "sub": str(user.id),
        "company_id": str(company.id),
        "role": user.role.value,
    })
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login with email + password."""
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, "Email ou senha inválidos")

    if not user.is_active:
        raise HTTPException(403, "Conta desativada")

    token = create_access_token({
        "sub": str(user.id),
        "company_id": str(user.company_id),
        "role": user.role.value,
    })
    return TokenResponse(access_token=token)
