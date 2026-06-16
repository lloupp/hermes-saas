"""Users management (within a company)."""

from uuid import uuid4, UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import hash_password
from app.models.models import User

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    email: str
    name: str
    password: str
    role: str = "user"

class UserUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[str] = None

class UserOut(BaseModel):
    id: UUID
    email: str
    name: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


@router.get("", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List users in current company."""
    if current_user["role"] not in ("company_admin", "super_admin"):
        raise HTTPException(403, "Apenas admins")
    result = await db.execute(
        select(User).where(User.company_id == current_user["company_id"])
    )
    return result.scalars().all()


@router.post("", response_model=UserOut)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Add a new user to current company."""
    if current_user["role"] not in ("company_admin", "super_admin"):
        raise HTTPException(403, "Apenas admins da empresa")

    if data.role not in ("user", "company_admin"):
        raise HTTPException(400, "Role inválido")

    # Check email uniqueness within company
    existing = (await db.execute(
        select(User).where(User.company_id == current_user["company_id"], User.email == data.email)
    )).scalar()
    if existing:
        raise HTTPException(400, "Email já cadastrado nesta empresa")

    user = User(
        id=uuid4(),
        company_id=current_user["company_id"],
        email=data.email,
        name=data.name,
        role=data.role,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: UUID,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] not in ("company_admin", "super_admin"):
        raise HTTPException(403, "Apenas admins")

    result = await db.execute(
        select(User).where(User.id == user_id, User.company_id == current_user["company_id"])
    )
    user = result.scalar()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")

    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/{user_id}")
async def delete_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] not in ("company_admin", "super_admin"):
        raise HTTPException(403, "Apenas admins")

    if str(user_id) == current_user["user_id"]:
        raise HTTPException(400, "Não pode deletar a si mesmo")

    result = await db.execute(
        select(User).where(User.id == user_id, User.company_id == current_user["company_id"])
    )
    user = result.scalar()
    if not user:
        raise HTTPException(404, "Usuário não encontrado")

    await db.delete(user)
    await db.commit()
    return {"deleted": True}
