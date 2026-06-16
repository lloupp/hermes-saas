"""SOUL routes — templates globais, da empresa, pessoais."""

from uuid import uuid4, UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Soul, SoulTemplate

router = APIRouter(prefix="/souls", tags=["souls"])


class SoulCreate(BaseModel):
    name: str
    content: str
    scope: str = "personal"  # 'personal' or 'company'


class SoulOut(BaseModel):
    id: UUID
    name: str
    content: str
    scope: str

    class Config:
        from_attributes = True


@router.get("/templates", response_model=list[SoulOut])
async def list_templates(db: AsyncSession = Depends(get_db)):
    """Global SOUL templates."""
    result = await db.execute(select(SoulTemplate))
    templates = result.scalars().all()
    return [
        SoulOut(id=t.id, name=t.name, content=t.content, scope="global")
        for t in templates
    ]


@router.get("/company", response_model=list[SoulOut])
async def list_company_souls(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Soul).where(Soul.company_id == current_user["company_id"], Soul.scope == "company")
    )
    return result.scalars().all()


@router.get("/mine", response_model=list[SoulOut])
async def list_my_souls(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Soul).where(Soul.user_id == current_user["user_id"], Soul.scope == "personal")
    )
    return result.scalars().all()


@router.post("", response_model=SoulOut, status_code=status.HTTP_201_CREATED)
async def create_soul(
    data: SoulCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    scope = data.scope
    if scope == "company" and current_user["role"] not in ("company_admin", "super_admin"):
        raise HTTPException(403, "Apenas admins da empresa podem criar SOULs de empresa")

    soul = Soul(
        id=uuid4(),
        company_id=current_user["company_id"] if scope in ("company", "personal") else None,
        user_id=current_user["user_id"] if scope == "personal" else None,
        name=data.name,
        content=data.content,
        scope=scope,
    )
    db.add(soul)
    await db.commit()
    await db.refresh(soul)
    return soul


@router.patch("/{soul_id}", response_model=SoulOut)
async def update_soul(
    soul_id: UUID,
    data: SoulCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Soul).where(Soul.id == soul_id))
    soul = result.scalar()
    if not soul:
        raise HTTPException(404, "SOUL não encontrado")

    if soul.scope == "personal" and str(soul.user_id) != current_user["user_id"]:
        raise HTTPException(403, "Sem permissão")
    if soul.scope == "company" and current_user["role"] not in ("company_admin", "super_admin"):
        raise HTTPException(403, "Sem permissão")

    soul.name = data.name
    soul.content = data.content
    await db.commit()
    await db.refresh(soul)
    return soul


@router.delete("/{soul_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_soul(
    soul_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Soul).where(Soul.id == soul_id))
    soul = result.scalar()
    if not soul:
        raise HTTPException(404, "SOUL não encontrado")

    if soul.scope == "personal" and str(soul.user_id) != current_user["user_id"]:
        raise HTTPException(403, "Sem permissão")
    if soul.scope == "company" and current_user["role"] not in ("company_admin", "super_admin"):
        raise HTTPException(403, "Sem permissão")

    await db.delete(soul)
    await db.commit()
