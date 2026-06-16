"""Chat route — SSE streaming via OpenRouter with SOUL + skills injection."""

from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Profile, Soul, Skill, ProfileSkill, Company, User, Interaction, Client
from app.services.openrouter import stream_chat
from app.services.soul_resolver import resolve_soul_variables

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessage(BaseModel):
    content: str
    client_id: UUID | None = None


@router.post("/{profile_id}")
async def chat(
    profile_id: UUID,
    msg: ChatMessage,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Send a message to a profile's agent. Returns SSE stream.
    
    1. Load profile + soul + skills
    2. Resolve soul variables (company context)
    3. Build skills prompt
    4. Stream via OpenRouter using company's API key
    5. Save interaction
    """
    # Load profile
    result = await db.execute(
        select(Profile).where(Profile.id == profile_id, Profile.user_id == current_user["user_id"])
    )
    profile = result.scalar()
    if not profile:
        raise HTTPException(404, "Profile não encontrado")

    # Load company (for API key + context)
    user_result = await db.execute(select(User).where(User.id == current_user["user_id"]))
    user = user_result.scalar()

    company_result = await db.execute(select(Company).where(Company.id == current_user["company_id"]))
    company = company_result.scalar()

    if not company.openrouter_key:
        raise HTTPException(403, "Empresa sem API key do OpenRouter configurada")

    # Build SOUL content
    if profile.custom_soul:
        soul_content = profile.custom_soul
    elif profile.soul_id:
        soul_result = await db.execute(select(Soul).where(Soul.id == profile.soul_id))
        soul = soul_result.scalar()
        soul_content = soul.content if soul else ""
    else:
        soul_content = "Você é um assistente útil."

    # Resolve variables
    soul_content = await resolve_soul_variables(soul_content, company, user)

    # Build skills prompt
    skill_ids_result = await db.execute(
        select(ProfileSkill).where(ProfileSkill.profile_id == profile_id, ProfileSkill.enabled == True)
    )
    profile_skills = skill_ids_result.scalars().all()

    skills_prompt = ""
    for ps in profile_skills:
        if ps.skill_id:
            skill_result = await db.execute(select(Skill).where(Skill.id == ps.skill_id))
            skill = skill_result.scalar()
            if skill:
                skills_prompt += f"\n### {skill.name}\n{skill.content}\n"

    # Get or create interaction
    interaction_id = request.query_params.get("interaction_id")
    messages = []
    if interaction_id:
        int_result = await db.execute(select(Interaction).where(Interaction.id == UUID(interaction_id)))
        interaction = int_result.scalar()
        if interaction:
            messages = interaction.messages or []

    # Append user message
    messages.append({"role": "user", "content": msg.content, "timestamp": datetime.utcnow().isoformat()})

    # Create/update interaction
    interaction = Interaction(
        company_id=company.id,
        user_id=user.id,
        profile_id=profile.id,
        client_id=msg.client_id,
        messages=messages,
        model_used=profile.model,
    ) if not interaction_id else interaction

    # Stream response
    async def generate():
        full_response = ""
        async for line in stream_chat(
            openrouter_key=company.openrouter_key,
            model=profile.model,
            messages=messages,
            skills_prompt=skills_prompt,
            soul_content=soul_content,
        ):
            yield line + "\n\n"
            # Parse content from SSE for storage
            if line.startswith("data: ") and not line.endswith("[DONE]"):
                import json
                try:
                    chunk = json.loads(line[6:])
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    if "content" in delta:
                        full_response += delta["content"]
                except:
                    pass

        # Save assistant response
        messages.append({"role": "assistant", "content": full_response, "timestamp": datetime.utcnow().isoformat()})
        if interaction_id and interaction:
            interaction.messages = messages
            await db.commit()
        else:
            db.add(interaction)
            await db.commit()

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/{profile_id}/history")
async def get_chat_history(
    profile_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get chat history for a profile."""
    result = await db.execute(
        select(Interaction)
        .where(Interaction.profile_id == profile_id, Interaction.company_id == current_user["company_id"])
        .order_by(Interaction.started_at.desc())
    )
    interactions = result.scalars().all()
    return [{"id": str(i.id), "messages": i.messages, "started_at": i.started_at, "status": i.status} for i in interactions]
