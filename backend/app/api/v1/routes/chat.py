"""
Chat route: Option A. Spawns a real Hermes Agent CLI process per profile.

Each profile maps to one tmux session running `hermes chat` with skills +
SOUL.md + config.yaml materialized on disk at::

    ~/.hermes-saas/profiles/<company_id>/<profile_id>/

Flow:
  1. Load profile + SOUL + skills + company context from DB
  2. Materialize profile on disk
  3. Ensure the Hermes CLI subprocess is running
  4. Send message via tmux send-keys; stream response chunks back to client
  5. Persist interaction with full conversation
"""

from uuid import UUID
from datetime import datetime
import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import Profile, Soul, Skill, ProfileSkill, Company, User, Interaction
from app.services.hermes_runner import runner

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessage(BaseModel):
    content: str
    client_id: UUID | None = None


def _build_soul_text(custom_soul: str | None, soul_obj: Soul | None) -> str:
    if custom_soul:
        return custom_soul
    if soul_obj:
        return soul_obj.content
    return "Voce, em portugues brasileiro, e um assistente util e direto."


def _build_hermes_prompt_prefix(
    soul_text: str,
    company_name: str,
    user_name: str,
    knowledge_base: str,
    rules: str,
) -> str:
    """Wrap SOUL.md in a Hermes-friendly framing so it sticks."""
    return (
        f"# Sua missao como agente de {company_name}\n\n"
        f"{soul_text}\n\n"
        f"## Contexto da empresa\n"
        f"- Empresa: {company_name}\n"
        f"- Operador humano atual: {user_name}\n"
        f"- Knowledge Base: {knowledge_base[:1500] if knowledge_base else '(vazia)'}\n"
        f"- Regras da empresa: {rules[:1500] if rules else '(sem regras especificas)'}\n\n"
        f"## Diretrizes de comunicacao\n"
        f"- Sempre responda em portugues do Brasil.\n"
        f"- Seja direto e util.\n"
        f"- Quem te chama e um cliente da empresa, use tom adequado.\n"
    )


@router.post("/{profile_id}")
async def chat(
    profile_id: UUID,
    msg: ChatMessage,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    # 1. Load all required data
    profile = (await db.execute(
        select(Profile).where(Profile.id == profile_id, Profile.user_id == current_user["user_id"])
    )).scalar()
    if not profile:
        raise HTTPException(404, "Profile nao encontrado")

    user = (await db.execute(
        select(User).where(User.id == current_user["user_id"])
    )).scalar()
    company = (await db.execute(
        select(Company).where(Company.id == current_user["company_id"])
    )).scalar()

    if not company.openrouter_key:
        raise HTTPException(403, "Empresa sem OpenRouter key -- admin precisa cadastrar")

    soul_text = _build_soul_text(profile.custom_soul, None)
    if profile.soul_id:
        soul_obj = (await db.execute(select(Soul).where(Soul.id == profile.soul_id))).scalar()
        soul_text = _build_soul_text(profile.custom_soul, soul_obj)

    full_soul = _build_hermes_prompt_prefix(
        soul_text=soul_text,
        company_name=company.name,
        user_name=user.name,
        knowledge_base=company.knowledge_base or "",
        rules=company.rules or "",
    )

    # 2. Load skills for this profile
    skill_rows = (await db.execute(
        select(ProfileSkill, Skill)
        .outerjoin(Skill, ProfileSkill.skill_id == Skill.id)
        .where(ProfileSkill.profile_id == profile_id, ProfileSkill.enabled == True)
    )).all()

    skills_payload = []
    for ps, sk in skill_rows:
        if sk:
            skills_payload.append({"name": sk.name, "content": sk.content})

    # 3. Materialize on disk
    runner.ensure_profile_materialized(
        company_id=str(company.id),
        profile_id=str(profile.id),
        name=profile.name,
        model=profile.model,
        soul_text=full_soul,
        skills=skills_payload,
        openrouter_key=company.openrouter_key,
    )

    # 4. Start the Hermes CLI process if not already running
    if not runner.is_running(str(profile.id)):
        try:
            runner.start(str(company.id), str(profile.id))
        except Exception as e:
            raise HTTPException(500, f"Falha ao iniciar Hermes Agent: {e}")

    # 5. Persist interaction record
    interaction = Interaction(
        company_id=company.id,
        user_id=user.id,
        profile_id=profile.id,
        client_id=msg.client_id,
        messages=[{"role": "user", "content": msg.content, "ts": datetime.utcnow().isoformat()}],
        model_used=profile.model,
        status="active",
    )
    db.add(interaction)
    await db.commit()
    await db.refresh(interaction)

    interaction_id = str(interaction.id)

    # 6. Stream response
    async def event_generator():
        accumulated = ""
        try:
            async for ev in runner.chat_stream(str(profile.id), msg.content):
                if ev["type"] == "chunk":
                    accumulated += ev["text"]
                    payload = json.dumps({"type": "chunk", "text": ev["text"]})
                    yield f"data: {payload}\n\n"
                elif ev["type"] == "done":
                    yield f"data: {json.dumps({'type': 'done', 'interaction_id': interaction_id})}\n\n"
                elif ev["type"] == "error":
                    yield f"data: {json.dumps({'type': 'error', 'message': ev['message']})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            try:
                interaction.messages = (interaction.messages or []) + [
                    {"role": "assistant", "content": accumulated, "ts": datetime.utcnow().isoformat()}
                ]
                interaction.tokens_used = len(accumulated) // 4  # rough estimate
                interaction.ended_at = datetime.utcnow()
                interaction.status = "completed"
                await db.commit()
            except Exception:
                await db.rollback()

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/{profile_id}/status")
async def chat_status(
    profile_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    """Check if the Hermes agent for this profile is alive."""
    pid = str(profile_id)
    running = runner.is_running(pid)
    return {
        "profile_id": pid,
        "running": running,
        "tmux_session": f"hermes-{str(current_user['company_id'])[:8]}-{pid[:8]}" if running else None,
    }


@router.post("/{profile_id}/restart")
async def chat_restart(
    profile_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Force-restart the Hermes agent process for this profile (e.g. SOUL changed)."""
    profile = (await db.execute(
        select(Profile).where(Profile.id == profile_id, Profile.user_id == current_user["user_id"])
    )).scalar()
    if not profile:
        raise HTTPException(404, "Profile nao encontrado")

    runner.stop(str(profile.id))
    try:
        runner.start(current_user["company_id"], str(profile.id))
    except Exception as e:
        raise HTTPException(500, f"Falha ao reiniciar: {e}")
    return {"restarted": True}


@router.post("/{profile_id}/stop")
async def chat_stop(
    profile_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    """Stop the Hermes agent (frees memory between bursts)."""
    stopped = runner.stop(str(profile_id))
    return {"stopped": stopped}


@router.get("/{profile_id}/history")
async def get_chat_history(
    profile_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Interaction)
        .where(Interaction.profile_id == profile_id, Interaction.company_id == current_user["company_id"])
        .order_by(Interaction.started_at.desc())
    )
    interactions = result.scalars().all()
    return [
        {
            "id": str(i.id),
            "messages": i.messages,
            "started_at": i.started_at.isoformat() if i.started_at else None,
            "ended_at": i.ended_at.isoformat() if i.ended_at else None,
            "status": i.status,
            "tokens_used": i.tokens_used,
        }
        for i in interactions
    ]
