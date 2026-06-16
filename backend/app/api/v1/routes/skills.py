"""Skills routes — CRUD for skills (global, company, personal)."""

from uuid import uuid4, UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.models import Skill, SkillTemplate, Company

router = APIRouter(prefix="/skills", tags=["skills"])


class SkillCreate(BaseModel):
    name: str
    description: Optional[str] = None
    content: str
    scope: str = "personal"  # company_admin can set "company"

class SkillOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    content: str
    scope: str
    enabled: bool

    class Config:
        from_attributes = True


@router.get("/templates", response_model=list[SkillOut])
async def list_skill_templates(db: AsyncSession = Depends(get_db)):
    """List global skill templates (platform-provided)."""
    result = await db.execute(select(SkillTemplate))
    templates = result.scalars().all()
    return [
        SkillOut(id=t.id, name=t.name, description=t.description, content=t.content, scope="global", enabled=True)
        for t in templates
    ]


@router.get("/company", response_model=list[SkillOut])
async def list_company_skills(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List company-level skills."""
    result = await db.execute(
        select(Skill).where(Skill.company_id == current_user["company_id"], Skill.scope == "company")
    )
    return result.scalars().all()


@router.get("/mine", response_model=list[SkillOut])
async def list_my_skills(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List current user's personal skills."""
    result = await db.execute(
        select(Skill).where(Skill.user_id == current_user["user_id"], Skill.scope == "personal")
    )
    return result.scalars().all()


@router.post("", response_model=SkillOut, status_code=status.HTTP_201_CREATED)
async def create_skill(
    data: SkillCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a new skill. Scope 'company' requires company_admin role."""
    scope = data.scope
    if scope == "company" and current_user["role"] not in ("company_admin", "super_admin"):
        raise HTTPException(403, "Apenas admins da empresa podem criar skills de empresa")

    skill = Skill(
        id=uuid4(),
        company_id=current_user["company_id"] if scope in ("company", "personal") else None,
        user_id=current_user["user_id"] if scope == "personal" else None,
        name=data.name,
        description=data.description,
        content=data.content,
        scope=scope,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill


@router.patch("/{skill_id}", response_model=SkillOut)
async def update_skill(
    skill_id: UUID,
    data: SkillCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar()
    if not skill:
        raise HTTPException(404, "Skill não encontrada")

    # Only owner or company_admin can edit
    if skill.scope == "personal" and str(skill.user_id) != current_user["user_id"]:
        raise HTTPException(403, "Sem permissão")
    if skill.scope == "company" and current_user["role"] != "company_admin":
        raise HTTPException(403, "Sem permissão")

    skill.name = data.name
    skill.description = data.description
    skill.content = data.content
    await db.commit()
    await db.refresh(skill)
    return skill


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill(
    skill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Skill).where(Skill.id == skill_id))
    skill = result.scalar()
    if not skill:
        raise HTTPException(404, "Skill não encontrada")

    if skill.scope == "personal" and str(skill.user_id) != current_user["user_id"]:
        raise HTTPException(403, "Sem permissão")
    if skill.scope == "company" and current_user["role"] not in ("company_admin", "super_admin"):
        raise HTTPException(403, "Sem permissão")

    await db.delete(skill)
    await db.commit()
