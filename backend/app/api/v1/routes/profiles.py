"""Profile routes — CRUD for agent profiles (SOUL + skills + model)."""

from uuid import uuid4, UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Profile, Soul, Skill, ProfileSkill, Plan, Company, User

router = APIRouter(prefix="/profiles", tags=["profiles"])


# ── Schemas ──────────────────────────────────────────────────

class ProfileCreate(BaseModel):
    name: str
    model: str = "openai/gpt-4o-mini"
    soul_id: Optional[UUID] = None
    custom_soul: Optional[str] = None
    skill_ids: list[UUID] = []
    skill_template_ids: list[UUID] = []

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    soul_id: Optional[UUID] = None
    custom_soul: Optional[str] = None
    skill_ids: Optional[list[UUID]] = None

class ProfileOut(BaseModel):
    id: UUID
    name: str
    model: str
    soul_id: Optional[UUID]
    custom_soul: Optional[str]
    is_default: bool

    class Config:
        from_attributes = True


# ── Routes ───────────────────────────────────────────────────

@router.post("", response_model=ProfileOut, status_code=status.HTTP_201_CREATED)
async def create_profile(
    data: ProfileCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a new agent profile for the current user."""
    user_id = current_user["user_id"]
    company_id = current_user["company_id"]

    # Check plan limits
    company = (await db.execute(select(Company).where(Company.id == company_id))).scalar()
    plan = (await db.execute(select(Plan).where(Plan.id == company.plan_id))).scalar()

    if plan.max_profiles > 0:
        count = await db.execute(
            select(Profile).join(User).where(User.company_id == company_id)
        )
        existing = count.scalars().all()
        if len(existing) >= plan.max_profiles:
            raise HTTPException(403, f"Limite de {plan.max_profiles} profiles atingido. Upgrade seu plano!")

    # Check model allowed
    if plan.allowed_models and data.model not in plan.allowed_models:
        raise HTTPException(403, f"Modelo '{data.model}' não disponível no plano {plan.name.value}")

    profile = Profile(
        id=uuid4(),
        user_id=user_id,
        name=data.name,
        model=data.model,
        soul_id=data.soul_id,
        custom_soul=data.custom_soul,
    )
    db.add(profile)
    await db.flush()

    # Attach skills
    for sid in data.skill_ids:
        db.add(ProfileSkill(profile_id=profile.id, skill_id=sid))

    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("", response_model=list[ProfileOut])
async def list_profiles(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List current user's profiles."""
    result = await db.execute(
        select(Profile).where(Profile.user_id == current_user["user_id"])
    )
    return result.scalars().all()


@router.get("/{profile_id}", response_model=ProfileOut)
async def get_profile(
    profile_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get profile detail."""
    result = await db.execute(
        select(Profile).where(Profile.id == profile_id, Profile.user_id == current_user["user_id"])
    )
    profile = result.scalar()
    if not profile:
        raise HTTPException(404, "Profile não encontrado")
    return profile


@router.patch("/{profile_id}", response_model=ProfileOut)
async def update_profile(
    profile_id: UUID,
    data: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Update profile (SOUL, model, skills)."""
    result = await db.execute(
        select(Profile).where(Profile.id == profile_id, Profile.user_id == current_user["user_id"])
    )
    profile = result.scalar()
    if not profile:
        raise HTTPException(404, "Profile não encontrado")

    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "skill_ids" and value is not None:
            # Re-attach skills
            await db.execute(
                ProfileSkill.__table__.delete().where(ProfileSkill.profile_id == profile_id)
            )
            for sid in value:
                db.add(ProfileSkill(profile_id=profile_id, skill_id=sid))
        elif value is not None:
            setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    profile_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Profile).where(Profile.id == profile_id, Profile.user_id == current_user["user_id"])
    )
    profile = result.scalar()
    if not profile:
        raise HTTPException(404, "Profile não encontrado")
    await db.delete(profile)
    await db.commit()
