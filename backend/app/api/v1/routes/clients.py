"""Clients routes — CRM for each company."""

from uuid import uuid4, UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Client

router = APIRouter(prefix="/clients", tags=["clients"])


class ClientCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    metadata: dict = {}

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    metadata: Optional[dict] = None

class ClientOut(BaseModel):
    id: UUID
    name: str
    email: Optional[str]
    phone: Optional[str]
    metadata: dict

    class Config:
        from_attributes = True


@router.get("", response_model=list[ClientOut])
async def list_clients(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Client).where(Client.company_id == current_user["company_id"])
    )
    return result.scalars().all()


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
async def create_client(
    data: ClientCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    client = Client(
        id=uuid4(),
        company_id=current_user["company_id"],
        name=data.name,
        email=data.email,
        phone=data.phone,
        metadata_=data.metadata,
    )
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return client


@router.get("/{client_id}", response_model=ClientOut)
async def get_client(
    client_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.company_id == current_user["company_id"])
    )
    client = result.scalar()
    if not client:
        raise HTTPException(404, "Cliente não encontrado")
    return client


@router.patch("/{client_id}", response_model=ClientOut)
async def update_client(
    client_id: UUID,
    data: ClientUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.company_id == current_user["company_id"])
    )
    client = result.scalar()
    if not client:
        raise HTTPException(404, "Cliente não encontrado")

    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "metadata":
            client.metadata_ = value
        elif value is not None:
            setattr(client, field, value)

    await db.commit()
    await db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.company_id == current_user["company_id"])
    )
    client = result.scalar()
    if not client:
        raise HTTPException(404, "Cliente não encontrado")
    await db.delete(client)
    await db.commit()
